#!/usr/bin/env bash
# Resumen rápido del estado en el VPS: contenedores, memoria, disco, respaldos, certificado
# y versión desplegada. Solo lee; no cambia nada.
#
# Uso: bash scripts/status.sh
. "$(dirname "$0")/lib.sh"

require_cmd docker curl
require_env_file

section() { printf '\n== %s ==\n' "$*"; }

section "Contenedores"
dc ps -a
for svc in db api edge; do
  id="$(dc ps -q "$svc" 2>/dev/null | head -n 1 || true)"
  [ -n "$id" ] && printf '%-5s reinicios: %s\n' "$svc" "$(docker inspect -f '{{.RestartCount}}' "$id")"
done

section "Versión"
printf 'Desplegada (.deploy/current): %s\n' "$(cat "$DEPLOY_DIR/current" 2>/dev/null || echo '?')"
printf 'Reportada por /api/health:     %s\n' "$(health_version || echo 'sin respuesta')"
[ -f "$DEPLOY_DIR/history" ] && tail -n 3 "$DEPLOY_DIR/history"

section "Memoria y CPU"
ids="$(dc ps -q 2>/dev/null || true)"
# shellcheck disable=SC2086
[ -n "$ids" ] && docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}' $ids
free -h 2>/dev/null || true

section "Disco"
df -h "$ROOT_DIR" | tail -n +1
docker system df

section "Respaldos"
BACKUP_DIR="$(env_get BACKUP_DIR "$HOME/backups/fersua-booking")"
last_db="$(ls -1t "$BACKUP_DIR"/db/db_*.sql.gz 2>/dev/null | head -n 1 || true)"
if [ -n "$last_db" ]; then
  age_h=$((($(date +%s) - $(stat -c %Y "$last_db")) / 3600))
  printf 'Último dump: %s (hace %s h)\n' "$(basename "$last_db")" "$age_h"
  [ "$age_h" -le 26 ] || warn "El último respaldo tiene más de 26 horas: revisa el cron."
else
  warn "No hay respaldos en $BACKUP_DIR/db"
fi
last_media="$(find "$BACKUP_DIR/media" -mindepth 1 -maxdepth 1 -type d -name '20*Z' 2>/dev/null | sort | tail -n 1)"
[ -n "$last_media" ] && printf 'Última instantánea de medios: %s\n' "$(basename "$last_media")"
[ -d "$BACKUP_DIR" ] && du -sh "$BACKUP_DIR" 2>/dev/null

section "Certificado TLS"
host="$(env_get PUBLIC_URL '' | sed -E 's#^https?://([^/:]+).*#\1#')"
if [ -n "$host" ] && command -v openssl >/dev/null 2>&1; then
  echo | openssl s_client -servername "$host" -connect "$host:443" 2>/dev/null |
    openssl x509 -noout -enddate 2>/dev/null | sed "s/^notAfter=/$host vence: /" ||
    warn "No se pudo leer el certificado de $host"
fi
