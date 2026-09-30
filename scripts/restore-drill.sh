#!/usr/bin/env bash
# Ensayo de restauración: carga un dump en un MySQL DESECHABLE (contenedor, volumen y red
# interna propios, sin puertos ni salida a internet), cuenta las filas y las compara con las que
# anotó backup.sh en counts.log. No toca la base de producción, y al terminar borra todo lo que
# creó, salga bien o mal. Una vez al mes (docs/04-backups.md, «Ensayo mensual»).
#
# Uso:
#   bash scripts/restore-drill.sh                   # el dump más reciente de BACKUP_DIR/db
#   bash scripts/restore-drill.sh <db_*.sql.gz>     # un dump concreto
#   bash scripts/restore-drill.sh --from-offsite    # baja la última instantánea de restic y ensaya con su dump
#   bash scripts/restore-drill.sh --dir <carpeta>   # otra carpeta de respaldos (p. ej. una copia en el PC)
#
# Sale con 0 si los conteos coinciden (OK) y con 1 si no (FALLÓ).
CALLER_PWD="$PWD" # lib.sh se mueve a la raíz del repo: las rutas relativas son de quien llama
. "$(dirname "$0")/lib.sh"
. "$ROOT_DIR/scripts/lib-offsite.sh"

DUMP=""
FROM_OFFSITE=0
DIR_ARG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --from-offsite) FROM_OFFSITE=1 ;;
    --dir)
      DIR_ARG="${2:-}"
      [ -n "$DIR_ARG" ] || die "--dir necesita una carpeta"
      shift
      ;;
    -h | --help)
      sed -n '7,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*) die "Opción desconocida: $1" ;;
    *)
      [ -z "$DUMP" ] || die "Sobra el argumento: $1"
      DUMP="$1"
      ;;
  esac
  shift
done
[ "$FROM_OFFSITE" -eq 0 ] || [ -z "$DUMP$DIR_ARG" ] || die "--from-offsite no se combina con un dump ni con --dir."

require_cmd docker gzip openssl
umask 077

MYSQL_IMAGE="mysql:8.4"
DRILL_ID="fersua-drill-$(date -u +%Y%m%d%H%M%S)-$$"
WORK=""
cleanup() {
  # Siempre, pase lo que pase: el contenedor, su volumen, la red y lo restaurado de restic.
  docker rm -f "$DRILL_ID" >/dev/null 2>&1 || true
  docker volume rm -f "$DRILL_ID" >/dev/null 2>&1 || true
  docker network rm "$DRILL_ID" >/dev/null 2>&1 || true
  [ -z "$WORK" ] || rm -rf "$WORK"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# ------------------------------------------------------------------ qué dump
if [ "$FROM_OFFSITE" -eq 1 ]; then
  require_env_file
  offsite_configured || die "La copia externa no está configurada (OFFSITE_RESTIC_REPOSITORY en .env)."
  offsite_prepare
  WORK="$(mktemp -d)"
  chmod 700 "$WORK"
  RESTIC_MOUNTS+=(-v "$(docker_host_path "$WORK"):/restore")
  log "Bajando los dumps de la última instantánea de $(offsite_repo_label)..."
  restic_run restore latest --host "$RESTIC_HOST" --target /restore \
    --include "$RESTIC_SOURCE/db" --include "$RESTIC_SOURCE/counts.log" >/dev/null
  SRC_DIR="$WORK$RESTIC_SOURCE"
elif [ -n "$DIR_ARG" ]; then
  [[ "$DIR_ARG" = /* ]] || DIR_ARG="$CALLER_PWD/$DIR_ARG"
  [ -d "$DIR_ARG" ] || die "No existe la carpeta $DIR_ARG"
  SRC_DIR="$(cd "$DIR_ARG" && pwd)"
else
  SRC_DIR="$(backup_dir)"
fi

if [ -z "$DUMP" ]; then
  # El más reciente por fecha de modificación (restic la conserva al restaurar).
  DUMP="$(find "$SRC_DIR/db" -maxdepth 1 -name 'db_*.sql.gz' -printf '%T@ %p\n' 2>/dev/null | sort -n | tail -n 1 | cut -d' ' -f2- || true)"
  [ -n "$DUMP" ] || die "No hay dumps en $SRC_DIR/db"
fi
[[ "$DUMP" = /* ]] || DUMP="$CALLER_PWD/$DUMP"
[ -f "$DUMP" ] || die "No existe $DUMP"
DUMP_NAME="$(basename "$DUMP")"
COUNTS_LOG="$(dirname "$DUMP")/../counts.log"
[ -f "$COUNTS_LOG" ] || COUNTS_LOG="$SRC_DIR/counts.log"

log "Ensayo con $DUMP_NAME ($(du -h "$DUMP" | cut -f1))"
gzip -t "$DUMP" || die "El dump está corrupto (gzip -t)."
gzip -dc "$DUMP" | tail -n 1 | grep -q 'Dump completed' || die "El dump está incompleto (no termina en 'Dump completed')."

# Conteos que anotó backup.sh al hacer ese dump.
expected="$(grep -F " $DUMP_NAME " "$COUNTS_LOG" 2>/dev/null | tail -n 1 | sed 's/.*: //' || true)"
[[ "$expected" =~ ^[0-9]+( [0-9]+)*$ ]] || expected=""

# La base que recrea el dump (se hizo con --databases).
# shellcheck disable=SC2016  # los backticks son del dump
DB_NAME="$(gzip -dc "$DUMP" 2>/dev/null | sed -n '/^-- Current Database: /{s/^-- Current Database: `\(.*\)`.*/\1/p;q;}' || true)"
[[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]] || die "No se encontró el nombre de la base en el dump."

# ------------------------------------------------------------------ MySQL desechable
log "Levantando un MySQL desechable ($DRILL_ID)..."
docker network create --internal --label fersua.drill=1 "$DRILL_ID" >/dev/null
docker volume create --label fersua.drill=1 "$DRILL_ID" >/dev/null
# Clave root de un solo uso: viaja en el entorno del proceso docker, no en la línea de comandos.
# Poca memoria a propósito: en el VPS convive con la base de producción.
MSYS_NO_PATHCONV=1 MYSQL_ROOT_PASSWORD="$(openssl rand -hex 24)" docker run -d --name "$DRILL_ID" --label fersua.drill=1 \
  --network "$DRILL_ID" -v "$DRILL_ID:/var/lib/mysql" -e MYSQL_ROOT_PASSWORD \
  --memory 768m --cpus 0.5 --security-opt no-new-privileges \
  "$MYSQL_IMAGE" --performance-schema=OFF --innodb-buffer-pool-size=64M --skip-log-bin --skip-name-resolve >/dev/null

# Listo cuando responde por TCP (durante la inicialización MySQL corre sin red).
deadline=$((SECONDS + 240))
until docker exec "$DRILL_ID" mysqladmin ping -h 127.0.0.1 --silent >/dev/null 2>&1; do
  [ "$(docker inspect -f '{{.State.Running}}' "$DRILL_ID" 2>/dev/null)" = true ] ||
    die "El MySQL desechable se detuvo: $(docker logs --tail 5 "$DRILL_ID" 2>&1 | tr '\n' ' ')"
  [ "$SECONDS" -lt "$deadline" ] || die "El MySQL desechable no arrancó en 4 minutos."
  sleep 3
done

# SQL como root dentro del contenedor desechable (misma técnica que db_sql: la clave no sale).
drill_sql() {
  docker exec -i "$DRILL_ID" sh -c 'umask 077; f=$(mktemp); printf "[client]\nuser=root\npassword=%s\n" "$MYSQL_ROOT_PASSWORD" > "$f"; mysql --defaults-extra-file="$f" "$@"; rc=$?; rm -f "$f"; exit $rc' sh "$@"
}

log "Cargando el dump..."
started=$SECONDS
gzip -dc "$DUMP" | drill_sql
log "Cargado en $((SECONDS - started)) s."

actual="$(printf '%s\n' "$DB_COUNTS_SQL" | drill_sql -N -B "$DB_NAME" | tr '\t' ' ')"
migration="$(printf '%s\n' 'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC, migration_name DESC LIMIT 1;' |
  drill_sql -N -B "$DB_NAME" 2>/dev/null || echo '?')"

# ------------------------------------------------------------------ resultado
printf '\n%-16s %10s %10s\n' "Tabla" "Respaldo" "Restaurado"
read -r -a labels <<<"$DB_COUNTS_LABELS"
read -r -a got <<<"$actual"
want=()
[ -z "$expected" ] || read -r -a want <<<"$expected"
ok=1
for i in "${!labels[@]}"; do
  w="${want[$i]:-?}"
  g="${got[$i]:-?}"
  mark=""
  [ "$w" = "$g" ] || {
    mark="  <- no coincide"
    ok=0
  }
  printf '%-16s %10s %10s%s\n' "${labels[$i]}" "$w" "$g" "$mark"
done
printf 'Última migración en el dump: %s\n\n' "$migration"

if [ -z "$expected" ]; then
  ok=0
  warn "No hay conteos de $DUMP_NAME en counts.log: no se puede comprobar el ensayo."
fi

if [ "$ok" -eq 1 ]; then
  result=OK
  log "RESULTADO: OK. El dump se restaura completo y los conteos coinciden."
else
  result=FALLÓ
  log "RESULTADO: FALLÓ. Revisa docs/04-backups.md, «Si el ensayo falla»."
  log "(Una diferencia pequeña en BookingRequest puede ser una solicitud que llegó entre el dump y el conteo: repite con otro dump.)"
fi

# Registro de ensayos (status.sh muestra el último). Sin datos personales.
if [ "$FROM_OFFSITE" -eq 1 ] || [ -z "$DIR_ARG" ]; then
  bdir="$(backup_dir)"
  if [ -d "$bdir" ] && [ -w "$bdir" ]; then
    printf '%s %s %s %s\n' "$(date -u '+%Y%m%dT%H%M%SZ')" "$result" "$([ "$FROM_OFFSITE" -eq 1 ] && echo offsite || echo local)" "$DUMP_NAME" >>"$bdir/drill.log"
  fi
fi
[ "$ok" -eq 1 ] || exit 1
