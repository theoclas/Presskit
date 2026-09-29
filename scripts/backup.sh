#!/usr/bin/env bash
# Respaldo de la base de datos (mysqldump verificado) y de los medios (instantánea
# incremental con enlaces duros: solo ocupa lo que cambió desde la anterior).
#
# Uso:
#   bash scripts/backup.sh nightly            # cron: BD + medios + rotación + ping
#   bash scripts/backup.sh manual             # a mano, cuando quieras
#   bash scripts/backup.sh pre-deploy-<sha> --db-only   # lo llama deploy.sh
#
# Los respaldos tienen datos personales (Ley 1581): carpeta 700, archivos 600, y nunca
# incluyen el .env.
. "$(dirname "$0")/lib.sh"

LABEL="${1:-}"
DB_ONLY=0
[ "${2:-}" = --db-only ] && DB_ONLY=1
[[ "$LABEL" =~ ^[a-z0-9][a-z0-9._-]{0,60}$ ]] || die "Uso: backup.sh <etiqueta> [--db-only]   (ej. nightly, manual)"

require_cmd docker gzip
require_env_file

BACKUP_DIR="$(env_get BACKUP_DIR "$HOME/backups/fersua-booking")"
RETENTION_DAYS="$(env_get BACKUP_RETENTION_DAYS 14)"
MEDIA_KEEP="$(env_get BACKUP_MEDIA_KEEP 7)"
HC_URL="$(env_get BACKUP_HEALTHCHECK_URL '')"
STAMP="$(date -u '+%Y%m%dT%H%M%SZ')"

umask 077
mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/weekly" "$BACKUP_DIR/media"
chmod 700 "$BACKUP_DIR"

ping_hc() {
  # Solo el nocturno avisa a healthchecks.io (si falta un nocturno, te llega un correo).
  [ -n "$HC_URL" ] && [ "$LABEL" = nightly ] || return 0
  curl -fsS -m 10 --retry 3 "$HC_URL$1" >/dev/null 2>&1 || warn "No se pudo avisar a healthchecks.io"
}

DB_FILE="$BACKUP_DIR/db/db_${LABEL}_${STAMP}.sql.gz"
on_exit() {
  local rc=$?
  rm -f "$DB_FILE.tmp"
  rm -rf "$BACKUP_DIR/media/$STAMP.partial"
  [ "$rc" -eq 0 ] || ping_hc /fail
}
trap on_exit EXIT

[ "$(service_health db)" = healthy ] || die "El contenedor db no está healthy."

# ------------------------------------------------------------------ base de datos
log "Dump de la base de datos -> $DB_FILE"
# La clave root se lee dentro del contenedor; nunca pasa por la línea de comandos del host.
dc exec -T db sh -c '
  umask 077
  f=$(mktemp)
  printf "[client]\nuser=root\npassword=%s\n" "$MYSQL_ROOT_PASSWORD" > "$f"
  mysqldump --defaults-extra-file="$f" --single-transaction --quick --routines --triggers \
    --hex-blob --no-tablespaces --default-character-set=utf8mb4 --databases "$MYSQL_DATABASE"
  rc=$?
  rm -f "$f"
  exit $rc' | gzip -6 >"$DB_FILE.tmp"

gzip -t "$DB_FILE.tmp" || die "El dump quedó corrupto (gzip -t)."
gzip -dc "$DB_FILE.tmp" | tail -n 1 | grep -q 'Dump completed' || die "El dump no terminó con 'Dump completed'."
mv "$DB_FILE.tmp" "$DB_FILE"
log "Dump OK ($(du -h "$DB_FILE" | cut -f1))."

# Conteos para comparar después de una restauración.
DB_NAME="$(env_get DB_NAME fersua_booking)"
counts="$(db_counts "$DB_NAME" 2>/dev/null || echo '?')"
printf '%s %s User/DjProfile/Event/BookingRequest/MediaAsset/Ticket: %s\n' "$STAMP" "$(basename "$DB_FILE")" "$counts" >>"$BACKUP_DIR/counts.log"

# Domingo: copia semanal (se guardan 8 semanas).
if [ "$LABEL" = nightly ] && [ "$(date -u +%u)" = 7 ]; then
  cp "$DB_FILE" "$BACKUP_DIR/weekly/"
fi

# ------------------------------------------------------------------ medios
if [ "$DB_ONLY" -eq 0 ]; then
  ensure_backup_image
  prev="$(find "$BACKUP_DIR/media" -mindepth 1 -maxdepth 1 -type d -name '20*Z' | sort | tail -n 1)"
  link_args=()
  [ -n "$prev" ] && link_args=(--link-dest="/backup/$(basename "$prev")")
  mkdir -p "$BACKUP_DIR/media/$STAMP.partial"
  log "Instantánea de medios${prev:+ (incremental sobre $(basename "$prev"))}..."
  # root dentro del contenedor para leer todo el volumen; los archivos quedan a nombre del
  # usuario del host y solo legibles por él.
  docker run --rm --network none \
    -v "$MEDIA_VOLUME:/data:ro" \
    -v "$BACKUP_DIR/media:/backup" \
    "$BACKUP_IMAGE" \
    rsync -rlt --delete --chown="$(id -u):$(id -g)" --chmod=Du=rwx,Dgo=,Fu=rw,Fgo= \
    "${link_args[@]}" /data/ "/backup/$STAMP.partial/"
  mv "$BACKUP_DIR/media/$STAMP.partial" "$BACKUP_DIR/media/$STAMP"
  log "Medios OK ($(du -sh "$BACKUP_DIR/media/$STAMP" | cut -f1) aparentes; los enlaces duros no ocupan de nuevo)."
fi

# ------------------------------------------------------------------ rotación
find "$BACKUP_DIR/db" -maxdepth 1 -name 'db_nightly_*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR/db" -maxdepth 1 -name 'db_manual_*.sql.gz' -mtime +30 -delete
find "$BACKUP_DIR/weekly" -maxdepth 1 -name 'db_nightly_*.sql.gz' -mtime +56 -delete
# pre-deploy: los 10 más recientes; pre-restore: los 5 más recientes.
keep_newest() {
  find "$BACKUP_DIR/db" -maxdepth 1 -name "$1" -printf '%T@ %p\n' | sort -rn | tail -n +"$(($2 + 1))" |
    cut -d' ' -f2- | xargs -r rm -f
}
keep_newest 'db_pre-deploy-*.sql.gz' 10
keep_newest 'db_pre-restore_*.sql.gz' 5
find "$BACKUP_DIR/media" -mindepth 1 -maxdepth 1 -type d -name '20*Z' | sort | head -n -"$MEDIA_KEEP" | xargs -r rm -rf

ping_hc ''
log "Respaldo '$LABEL' terminado."
