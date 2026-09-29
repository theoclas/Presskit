#!/usr/bin/env bash
# Vuelve a una versión anterior de las imágenes (api + edge) sin recompilar.
#
# Uso:
#   bash scripts/rollback.sh          # a la versión anterior a la actual
#   bash scripts/rollback.sh <sha>    # a una versión concreta (docker image ls fersua-booking-api)
#
# No corre `migrate`: la imagen vieja nunca toca un esquema más nuevo. Por eso las migraciones
# son expand/contract (ver docs/03-actualizar-rollback.md). El repo sigue en el commit nuevo:
# el próximo deploy.sh vuelve a compilarlo, así que sube un revert antes de desplegar otra vez.
. "$(dirname "$0")/lib.sh"

require_cmd docker curl
require_env_file

CURRENT="$(cat "$DEPLOY_DIR/current" 2>/dev/null || true)"
TARGET="${1:-}"

if [ -z "$TARGET" ]; then
  # .deploy/releases guarda, en orden, cada versión que quedó corriendo sana (deploy o rollback).
  # Se vuelve a la que corría antes de la actual; si la actual no está (deploy fallido), a la última sana.
  [ -f "$DEPLOY_DIR/releases" ] || die "No hay historial en .deploy/releases. Indica la versión: rollback.sh <sha>"
  TARGET="$(awk -v cur="$CURRENT" '$0 == cur { seen = 1; if (prev != "") found = prev; next } { prev = $0 } END { print (seen ? found : prev) }' "$DEPLOY_DIR/releases")"
  [ -n "$TARGET" ] || die "No encontré una versión anterior a '$CURRENT'. Indica la versión: rollback.sh <sha>"
fi

[[ "$TARGET" =~ ^[0-9a-f]{7,40}$ ]] || die "Versión no válida: $TARGET"
docker image inspect "$API_IMAGE:$TARGET" >/dev/null 2>&1 || die "No existe la imagen $API_IMAGE:$TARGET (¿se borró en la limpieza?)."
docker image inspect "$EDGE_IMAGE:$TARGET" >/dev/null 2>&1 || die "No existe la imagen $EDGE_IMAGE:$TARGET."

log "Rollback: ${CURRENT:-?} -> $TARGET"
docker tag "$API_IMAGE:$TARGET" "$API_IMAGE:current"
docker tag "$EDGE_IMAGE:$TARGET" "$EDGE_IMAGE:current"

# --no-deps: sin migrate. db ya está arriba.
dc up -d --no-deps api edge

if ! wait_healthy 150 api edge; then
  dc logs --no-color --tail 60 api edge || true
  die "La versión $TARGET no quedó sana. Revisa los logs."
fi

reported="$(health_version || true)"
[ "$reported" = "$TARGET" ] || warn "/api/health reporta '${reported:-nada}' (esperado $TARGET)."

mkdir -p "$DEPLOY_DIR"
echo "$TARGET" >"$DEPLOY_DIR/current"
echo "$TARGET" >>"$DEPLOY_DIR/releases"
printf '%s rollback %s -> %s\n' "$(date -u '+%FT%TZ')" "${CURRENT:-none}" "$TARGET" >>"$DEPLOY_DIR/history"
log "Listo: corriendo $TARGET."
