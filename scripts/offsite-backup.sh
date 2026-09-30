#!/usr/bin/env bash
# Copia cifrada e incremental de BACKUP_DIR (dumps de la BD, semanales, instantáneas de medios
# y counts.log) a un repositorio restic fuera del VPS: Backblaze B2 o Google Drive (rclone).
# Corre en el cron 30 min después del respaldo nocturno. Guía: docs/04-backups.md.
#
# Uso:
#   bash scripts/offsite-backup.sh nightly       # cron: copia + retención (+ check semanal) + ping
#   bash scripts/offsite-backup.sh manual        # a mano (la primera vez, para probar)
#   bash scripts/offsite-backup.sh check         # revisa el repositorio y lee el 10 % de los datos
#   bash scripts/offsite-backup.sh snapshots     # lista las instantáneas (solo lee)
#   bash scripts/offsite-backup.sh restore <latest|id> <carpeta_vacía> [--db-only]
#
# Sin OFFSITE_RESTIC_REPOSITORY en .env avisa "no configurada" y sale con 0 (el cron no molesta).
# Sin OFFSITE_RESTIC_PASSWORD las copias NO se pueden leer: guárdala en tu gestor de contraseñas.
CALLER_PWD="$PWD" # lib.sh se mueve a la raíz del repo: las rutas relativas son de quien llama
. "$(dirname "$0")/lib.sh"
. "$ROOT_DIR/scripts/lib-offsite.sh"

usage() { sed -n '6,11p' "$0" | sed 's/^# \{0,1\}//'; }

MODE="${1:-}"
case "$MODE" in
  nightly | manual | check | snapshots | restore) ;;
  -h | --help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

require_cmd docker curl
require_env_file
# Todo lo que se crea (estado, caché, restauraciones) solo lo lee el usuario deploy.
umask 077

if ! offsite_configured; then
  log "Copia externa no configurada (OFFSITE_RESTIC_REPOSITORY vacío en .env): no se hace nada. Guía: docs/04-backups.md"
  exit 0
fi
offsite_prepare

BACKUP_DIR="$(backup_dir)"
# Retención del repositorio externo. La política de privacidad (§8) promete que un dato borrado
# sale de todos los respaldos en 8 semanas: aquí viajan solo los dumps nocturnos (14 días en el
# VPS) y los manuales (20 días), y cada instantánea se guarda como mucho 35 días (una por día los
# últimos 14 y una por semana hasta los 35, contados desde la más reciente): 20 + 35 < 56 días.
# Por tiempo y no por cantidad: si faltan copias unos días, no se guardan otras más viejas en su
# lugar. Los semanales (8 semanas en el VPS) y los previos a un despliegue o a una restauración NO
# salen. Si alargas algo de esto, cambia antes la §8 de la política
# (web/src/public/legal/content/privacidad.ts).
KEEP_DAILY=14d
KEEP_WEEKLY=35d
# El check lee de verdad una parte de los datos (detecta archivos dañados en el destino).
CHECK_SUBSET="10%"
CHECK_EVERY_S=$((7 * 86400 - 3600))

# ------------------------------------------------------------------ solo lectura / restaurar
if [ "$MODE" = snapshots ]; then
  restic_run snapshots --host "$RESTIC_HOST" --compact
  exit 0
fi

if [ "$MODE" = restore ]; then
  SNAP="${2:-}"
  DEST="${3:-}"
  DB_ONLY=0
  case "${4:-}" in
    '') ;;
    --db-only) DB_ONLY=1 ;;
    *) die "Opción desconocida: $4 (solo --db-only)" ;;
  esac
  [[ "$SNAP" =~ ^(latest|[0-9a-f]{8,64})$ ]] || die "Uso: offsite-backup.sh restore <latest|id> <carpeta_vacía> [--db-only]"
  [ -n "$DEST" ] || die "Falta la carpeta de destino."
  [[ "$DEST" = /* ]] || DEST="$CALLER_PWD/$DEST"
  # Se revisa antes de crearla y otra vez con la ruta real (por si trae "..").
  dest_allowed() {
    case "$1/" in
      "$BACKUP_DIR"/*) die "Restaura en una carpeta aparte, no dentro de $BACKUP_DIR." ;;
      "$ROOT_DIR"/*) die "Restaura fuera del repo: lo restaurado tiene datos personales." ;;
    esac
  }
  dest_allowed "$DEST"
  mkdir -p "$DEST"
  DEST="$(cd "$DEST" && pwd)"
  dest_allowed "$DEST"
  [ -z "$(ls -A "$DEST")" ] || die "La carpeta $DEST no está vacía."
  chmod 700 "$DEST"
  RESTIC_MOUNTS+=(-v "$(docker_host_path "$DEST"):/restore")
  includes=()
  [ "$DB_ONLY" -eq 1 ] && includes=(--include "$RESTIC_SOURCE/db" --include "$RESTIC_SOURCE/counts.log")
  log "Restaurando la instantánea $SNAP de $(offsite_repo_label) en $DEST ..."
  restic_run restore "$SNAP" --host "$RESTIC_HOST" --target /restore "${includes[@]}"
  log "Listo: los archivos quedaron en $DEST$RESTIC_SOURCE (tienen datos personales: bórralos al terminar)."
  log "Siguiente paso: bash scripts/restore.sh $DEST$RESTIC_SOURCE/db/<dump>.sql.gz [$DEST$RESTIC_SOURCE/media/<fecha>]"
  exit 0
fi

# ------------------------------------------------------------------ copia (nightly, manual, check)
# Una sola copia a la vez (restic también bloquea el repositorio, pero así el cron no se apila).
mkdir -p "$BACKUP_DIR"
if command -v flock >/dev/null 2>&1; then
  exec 8>"$BACKUP_DIR/.offsite.lock"
  flock -n 8 || die "Ya hay una copia externa en curso."
fi

HC_OWN="$(env_get OFFSITE_HEALTHCHECK_URL '')"
HC_SHARED="$(env_get BACKUP_HEALTHCHECK_URL '')"
# Solo el nocturno avisa. Con OFFSITE_HEALTHCHECK_URL: inicio, éxito y fallo en su propio check.
# Sin él, los fallos van al check del nocturno (/fail), pero nunca un éxito: taparía un nocturno
# que falló.
ping_hc() {
  [ "$MODE" = nightly ] || return 0
  local url=""
  if [ -n "$HC_OWN" ]; then
    url="$HC_OWN$1"
  elif [ "$1" = /fail ] && [ -n "$HC_SHARED" ]; then
    url="$HC_SHARED/fail"
  fi
  [ -n "$url" ] || return 0
  curl -fsS -m 10 --retry 3 "$url" >/dev/null 2>&1 || warn "No se pudo avisar a healthchecks.io"
}

FAIL_KEY=last_fail
[ "$MODE" = check ] && FAIL_KEY=last_check_fail
on_exit() {
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    offsite_state_set "$FAIL_KEY" "$(date +%s)" 2>/dev/null || true
    ping_hc /fail
  fi
}
trap on_exit EXIT

# Crea el repositorio si no existe. restic sale con 10 si no existe y con 12 si la clave no abre.
ensure_repo() {
  local rc=0 err
  err="$(restic_run cat config 2>&1 >/dev/null)" || rc=$?
  case "$rc" in
    0) return 0 ;;
    10)
      log "El repositorio no existe todavía: creándolo..."
      restic_run init >/dev/null
      log "Repositorio creado. Guarda OFFSITE_RESTIC_PASSWORD en tu gestor de contraseñas: sin ella las copias no se pueden leer."
      ;;
    12) die "OFFSITE_RESTIC_PASSWORD no abre el repositorio (¿la cambiaste? usa la original del gestor de contraseñas)." ;;
    *)
      printf '%s\n' "$err" | tail -n 5 >&2
      die "No se pudo abrir el repositorio $(offsite_repo_label) (código $rc)."
      ;;
  esac
}

run_check() {
  log "Revisando el repositorio (restic check, lee el $CHECK_SUBSET de los datos)..."
  local rc=0 out
  out="$(restic_run check --read-data-subset="$CHECK_SUBSET" 2>&1)" || rc=$?
  printf '%s\n' "$out" | tail -n 5
  [ "$rc" -eq 0 ] || die "restic check encontró problemas (código $rc). Revisa docs/04-backups.md, «Si el check falla»."
  offsite_state_set last_check "$(date +%s)"
  log "Check OK."
}

ping_hc /start
ensure_repo
# Quita solo candados viejos de una corrida que murió (restic no toca los de otra que sigue viva).
restic_run unlock >/dev/null 2>&1 || true

if [ "$MODE" = check ]; then
  run_check
  exit 0
fi

[ -d "$BACKUP_DIR/db" ] || die "No existe $BACKUP_DIR/db: primero bash scripts/backup.sh manual"

newest="$(find "$BACKUP_DIR/db" -maxdepth 1 -name 'db_nightly_*.sql.gz' -printf '%T@\n' 2>/dev/null | sort -n | tail -n 1)"
if [ -z "$newest" ] || [ $(($(date +%s) - ${newest%.*})) -gt $((26 * 3600)) ]; then
  warn "No hay un respaldo nocturno de las últimas 26 h: se copia lo que hay. Revisa backup.log."
fi

log "Copia externa -> $(offsite_repo_label)"
rc=0
out="$(restic_run backup "$RESTIC_SOURCE" --host "$RESTIC_HOST" --tag fersua-booking --tag "$MODE" \
  --exclude "$RESTIC_SOURCE/weekly" --exclude "$RESTIC_SOURCE/db/db_pre-*" \
  --exclude "$RESTIC_SOURCE/backup.log" --exclude "$RESTIC_SOURCE/offsite.log" --exclude "$RESTIC_SOURCE/drill-cron.log" \
  --exclude "$RESTIC_SOURCE/offsite-state*" --exclude "$RESTIC_SOURCE/.offsite.lock" \
  --exclude '*.tmp' --exclude '*.partial' 2>&1)" || rc=$?
# Solo el resumen: la salida completa tiene una línea por cada archivo que no se pudo leer.
printf '%s\n' "$out" | tail -n 12
[ "$rc" -eq 0 ] || die "restic backup falló (código $rc; 3 = hubo archivos que no se pudieron leer)."
snap="$(printf '%s\n' "$out" | sed -n 's/^snapshot \([0-9a-f]\{1,\}\) saved$/\1/p' | tail -n 1)"
offsite_state_set last_ok "$(date +%s)"
offsite_state_set last_snapshot "${snap:-?}"

log "Retención: una diaria por $KEEP_DAILY y una semanal por $KEEP_WEEKLY..."
rc=0
# --max-unused 0: prune reescribe también los paquetes a medio usar, así los datos de las
# instantáneas olvidadas no se quedan en el destino (el repositorio es pequeño: cuesta poco).
out="$(restic_run forget --host "$RESTIC_HOST" --tag fersua-booking \
  --keep-within-daily "$KEEP_DAILY" --keep-within-weekly "$KEEP_WEEKLY" --prune --max-unused 0 2>&1)" || rc=$?
printf '%s\n' "$out" | grep -E 'snapshots|remove|freed|total prune|done' | tail -n 6 || true
[ "$rc" -eq 0 ] || {
  printf '%s\n' "$out" | tail -n 5 >&2
  die "restic forget/prune falló (código $rc). La copia de hoy sí quedó guardada."
}

last_check="$(offsite_state_get last_check)"
[[ "$last_check" =~ ^[0-9]+$ ]] || last_check=0
if [ $(($(date +%s) - last_check)) -ge "$CHECK_EVERY_S" ]; then
  run_check
fi

ping_hc ''
log "Copia externa '$MODE' terminada (instantánea ${snap:-?})."
