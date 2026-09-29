#!/usr/bin/env bash
# Restaura la base de datos desde un dump de backup.sh y, opcionalmente, los medios desde
# una instantánea. Antes hace un respaldo "pre-restore" de lo que hay ahora.
#
# Uso:
#   bash scripts/restore.sh <db_*.sql.gz> [carpeta_instantánea_de_medios] [--yes]
# Ejemplo:
#   bash scripts/restore.sh ~/backups/fersua-booking/db/db_nightly_20261001T081500Z.sql.gz \
#                           ~/backups/fersua-booking/media/20261001T081500Z
. "$(dirname "$0")/lib.sh"

DUMP=""
MEDIA_SNAPSHOT=""
YES=0
for arg in "$@"; do
  case "$arg" in
    --yes) YES=1 ;;
    *)
      if [ -z "$DUMP" ]; then DUMP="$arg"; elif [ -z "$MEDIA_SNAPSHOT" ]; then MEDIA_SNAPSHOT="$arg"; else die "Sobra el argumento: $arg"; fi
      ;;
  esac
done

[ -n "$DUMP" ] || die "Uso: restore.sh <db_*.sql.gz> [carpeta_de_medios] [--yes]"
require_cmd docker gzip
require_env_file
DUMP="$(cd "$(dirname "$DUMP")" && pwd)/$(basename "$DUMP")"
[ -f "$DUMP" ] || die "No existe $DUMP"
gzip -t "$DUMP" || die "El dump está corrupto."
gzip -dc "$DUMP" | tail -n 1 | grep -q 'Dump completed' || die "El dump está incompleto (no termina en 'Dump completed')."
if [ -n "$MEDIA_SNAPSHOT" ]; then
  MEDIA_SNAPSHOT="$(cd "$MEDIA_SNAPSHOT" && pwd)" || die "No existe la carpeta $MEDIA_SNAPSHOT"
fi

DB_NAME="$(env_get DB_NAME fersua_booking)"
cat <<EOF
Se va a REEMPLAZAR la base de datos '$DB_NAME' con:
  $DUMP
${MEDIA_SNAPSHOT:+y los medios con:
  $MEDIA_SNAPSHOT
}El sitio queda caído unos minutos. Antes se hace un respaldo pre-restore.
EOF
if [ "$YES" -eq 0 ]; then
  read -r -p "Escribe RESTAURAR para continuar: " answer
  [ "$answer" = RESTAURAR ] || die "Cancelado."
fi

dc up -d db
wait_healthy 120 db || die "db no está healthy."

log "Respaldo de seguridad pre-restore..."
bash "$ROOT_DIR/scripts/backup.sh" pre-restore

log "Deteniendo edge y api (sin escrituras durante la restauración)..."
dc stop edge api

log "Restaurando la base de datos..."
# El dump se hizo con --databases: recrea la base. Los permisos a nivel de base (usuario de la
# app) viven en mysql.db y sobreviven al DROP.
printf 'DROP DATABASE IF EXISTS `%s`;\n' "$DB_NAME" | db_sql
gzip -dc "$DUMP" | db_sql

if [ -n "$MEDIA_SNAPSHOT" ]; then
  ensure_backup_image
  log "Restaurando medios..."
  docker run --rm --network none \
    -v "$MEDIA_VOLUME:/data" \
    -v "$MEDIA_SNAPSHOT:/src:ro" \
    "$BACKUP_IMAGE" \
    sh -c 'rsync -rlt --delete /src/ /data/ && mkdir -p /data/public /data/private && chown -R 1000:1000 /data && chmod -R u=rwX,go=rX /data'
fi

log "Levantando todo (migrate aplica las migraciones más nuevas que el dump)..."
dc up -d
wait_healthy 180 api edge || die "El stack no quedó sano después de restaurar. Revisa: docker compose logs migrate api"

counts="$(db_counts "$DB_NAME")"
BACKUP_DIR="$(env_get BACKUP_DIR "$HOME/backups/fersua-booking")"
log "Conteos ahora (User/DjProfile/Event/BookingRequest/MediaAsset/Ticket): $counts"
log "Conteos al respaldar:"
grep -F "$(basename "$DUMP")" "$BACKUP_DIR/counts.log" 2>/dev/null || echo "  (no hay registro para ese dump en counts.log)"
log "Deben coincidir exactamente. Restauración terminada."
