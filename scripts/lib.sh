# shellcheck shell=bash
# Las variables de este archivo las usan los scripts que lo cargan (shellcheck lo ve solo).
# shellcheck disable=SC2034
# Funciones comunes de los scripts del VPS. Se carga con:  . "$(dirname "$0")/lib.sh"
# Deja el directorio de trabajo en la raíz del repo.

set -Eeuo pipefail
# Con set -e un fallo corta el script sin decir nada: esto al menos indica dónde.
# shellcheck disable=SC2154  # fersua_rc se asigna dentro del mismo trap
trap 'fersua_rc=$?; printf "[%s] ERROR: falló un comando en %s:%s (código %s)\n" "$(date "+%F %T")" "${BASH_SOURCE[0]##*/}" "$LINENO" "$fersua_rc" >&2' ERR

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC2034  # las usan los demás scripts
COMPOSE_FILE_PATH="$ROOT_DIR/docker-compose.prod.yml"
# FERSUA_PROJECT_NAME, FERSUA_COMPOSE_EXTRA, FERSUA_MEDIA_VOLUME, FERSUA_SKIP_BUILDER_PRUNE,
# FERSUA_ENV_FILE: solo para probar los scripts en local contra un stack desechable (o con un
# .env de prueba fuera del repo). En el VPS no se usan.
PROJECT_NAME="${FERSUA_PROJECT_NAME:-fersua-booking}"
DOTENV_FILE="${FERSUA_ENV_FILE:-$ROOT_DIR/.env}"
API_IMAGE="fersua-booking-api"
EDGE_IMAGE="fersua-booking-edge"
STAGE_IMAGE="fersua-booking-stage"
BACKUP_IMAGE="fersua-booking-backup:1"
MEDIA_VOLUME="${FERSUA_MEDIA_VOLUME:-fersua_booking_media}"
DEPLOY_DIR="$ROOT_DIR/.deploy"

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
warn() { printf '[%s] AVISO: %s\n' "$(date '+%F %T')" "$*" >&2; }
die() {
  printf '[%s] ERROR: %s\n' "$(date '+%F %T')" "$*" >&2
  exit 1
}

require_cmd() {
  local c
  for c in "$@"; do
    command -v "$c" >/dev/null 2>&1 || die "Falta el comando '$c'."
  done
}

require_env_file() {
  [ -f "$DOTENV_FILE" ] || die "No existe .env. Créalo con: bash scripts/init-env.sh"
}

# Lee una clave de un archivo .env SIN ejecutarlo (source correría lo que haya dentro).
# Uso: env_get CLAVE [valor_por_defecto] [archivo]
env_get() {
  local key="$1" default="${2-}" file="${3:-$DOTENV_FILE}" line val
  line="$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n 1 || true)"
  val="${line#*=}"
  if [ "${#val}" -ge 2 ]; then
    case "$val" in
      \'*\') val="${val:1:${#val}-2}" ;;
      \"*\") val="${val:1:${#val}-2}" ;;
    esac
  fi
  if [ -n "$val" ]; then printf '%s' "$val"; else printf '%s' "$default"; fi
}

# docker compose siempre con el archivo y el proyecto de producción, aunque la shell tenga
# otras variables COMPOSE_*. El .env de la raíz se usa para interpolar.
# DC_CMD es la misma línea como arreglo, para usarla con `timeout` (que no ejecuta funciones).
DC_CMD=(docker compose --project-directory "$ROOT_DIR" -f "$COMPOSE_FILE_PATH")
[ -z "${FERSUA_COMPOSE_EXTRA:-}" ] || DC_CMD+=(-f "$FERSUA_COMPOSE_EXTRA")
[ -z "${FERSUA_ENV_FILE:-}" ] || DC_CMD+=(--env-file "$FERSUA_ENV_FILE")
DC_CMD+=(-p "$PROJECT_NAME")
dc() { "${DC_CMD[@]}" "$@"; }

edge_port() { env_get EDGE_PORT 8090; }

# Estado de salud de un servicio: healthy | unhealthy | starting | running | exited | missing
service_health() {
  local id
  id="$(dc ps -q "$1" 2>/dev/null | head -n 1 || true)"
  if [ -z "$id" ]; then
    echo missing
    return
  fi
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo missing
}

# Espera a que los servicios indicados estén healthy. Uso: wait_healthy <segundos> svc...
wait_healthy() {
  local timeout="$1"
  shift
  local deadline=$((SECONDS + timeout)) svc all_ok
  while [ "$SECONDS" -lt "$deadline" ]; do
    all_ok=1
    for svc in "$@"; do
      [ "$(service_health "$svc")" = healthy ] || all_ok=0
    done
    [ "$all_ok" -eq 1 ] && return 0
    sleep 3
  done
  for svc in "$@"; do
    warn "$svc: $(service_health "$svc")"
  done
  return 1
}

# Versión que reporta el api a través del edge (la misma ruta que usa un visitante).
health_version() {
  curl -fsS -m 5 "http://127.0.0.1:$(edge_port)/api/health" 2>/dev/null |
    sed -n 's/.*"version":"\([^"]*\)".*/\1/p'
}

# Imagen mínima con rsync para respaldar y restaurar el volumen de medios. Se construye una
# sola vez en el VPS (necesita internet solo esa vez).
ensure_backup_image() {
  if ! docker image inspect "$BACKUP_IMAGE" >/dev/null 2>&1; then
    log "Construyendo la imagen auxiliar $BACKUP_IMAGE (una sola vez)..."
    printf 'FROM alpine:3.22\nRUN apk add --no-cache rsync\n' | docker build -q -t "$BACKUP_IMAGE" - >/dev/null
  fi
}

# Ejecuta SQL como root dentro del contenedor db. La clave nunca sale del contenedor ni
# aparece en la línea de comandos: se escribe en un archivo temporal que se borra al final.
# Uso: echo "SELECT 1" | db_sql [opciones de mysql]
db_sql() {
  dc exec -T db sh -c 'umask 077; f=$(mktemp); printf "[client]\nuser=root\npassword=%s\n" "$MYSQL_ROOT_PASSWORD" > "$f"; mysql --defaults-extra-file="$f" "$@"; rc=$?; rm -f "$f"; exit $rc' sh "$@"
}

# Conteo de filas de las tablas principales (para comparar un respaldo con su restauración).
# restore-drill.sh reutiliza la consulta y las etiquetas (el orden de las dos debe coincidir).
# shellcheck disable=SC2016  # los backticks son de SQL
DB_COUNTS_SQL='SELECT (SELECT COUNT(*) FROM `User`), (SELECT COUNT(*) FROM DjProfile), (SELECT COUNT(*) FROM `Event`), (SELECT COUNT(*) FROM BookingRequest), (SELECT COUNT(*) FROM MediaAsset), (SELECT COUNT(*) FROM Ticket);'
# shellcheck disable=SC2034  # la usa restore-drill.sh
DB_COUNTS_LABELS='User DjProfile Event BookingRequest MediaAsset Ticket'
db_counts() {
  printf '%s\n' "$DB_COUNTS_SQL" | db_sql -N -B "$1" | tr '\t' ' '
}
