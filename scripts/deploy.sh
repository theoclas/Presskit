#!/usr/bin/env bash
# Despliegue en el VPS: pull, respaldo, build por etapas, arranque, verificación y, si algo
# falla, vuelta automática a la versión anterior.
#
# Uso (como deploy, en ~/apps/fersuastudio-booking):
#   bash scripts/deploy.sh                    # actualización normal
#   bash scripts/deploy.sh --first            # primer despliegue (sin respaldo previo)
#   bash scripts/deploy.sh --no-auto-rollback # si falla, deja todo como quedó para revisar
#   bash scripts/deploy.sh --no-pull          # despliega el commit que ya está (sin git pull)
. "$(dirname "$0")/lib.sh"

FIRST=0
AUTO_ROLLBACK=1
PULL=1
for arg in "$@"; do
  case "$arg" in
    --first) FIRST=1 ;;
    --no-auto-rollback) AUTO_ROLLBACK=0 ;;
    --no-pull) PULL=0 ;;
    -h | --help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *) die "Opción desconocida: $arg" ;;
  esac
done

require_cmd docker git curl flock df awk
require_env_file

# Un solo despliegue a la vez (cron de respaldo y un deploy manual no deben pisarse).
mkdir -p "$DEPLOY_DIR"
exec 9>"$DEPLOY_DIR/deploy.lock"
flock -n 9 || die "Ya hay un despliegue en curso."

# ------------------------------------------------------------------ 1. chequeos previos
log "Chequeos previos..."
[ -z "$(git status --porcelain --untracked-files=no)" ] ||
  die "Hay cambios sin commitear en el servidor. La copia del VPS no se edita a mano: git status"

free_kb="$(df -Pk "$ROOT_DIR" | awk 'NR==2 {print $4}')"
[ "$free_kb" -ge $((3 * 1024 * 1024)) ] ||
  die "Hay menos de 3 GB libres en disco ($((free_kb / 1024)) MB). Libera espacio: docker system df"

bash "$ROOT_DIR/scripts/check-env.sh"
dc config --quiet || die "docker compose config falló: revisa .env"

# MySQL ignora en silencio un my.cnf que cualquiera puede escribir (pasa con umask 000).
chmod o-w deploy/mysql/my.cnf deploy/mysql/init/01-app-user.sh
# Sin bit de ejecución también funciona (MySQL lo carga con source), pero es mejor ejecutarlo aparte.
[ -x deploy/mysql/init/01-app-user.sh ] ||
  warn "deploy/mysql/init/01-app-user.sh sin bit de ejecución: git update-index --chmod=+x (docs/02)"

# ------------------------------------------------------------------ 2. código
if [ "$PULL" -eq 1 ]; then
  log "git pull --ff-only..."
  git fetch --prune origin
  git pull --ff-only
fi
NEW="$(git rev-parse --short=12 HEAD)"
PREV="$(cat "$DEPLOY_DIR/current" 2>/dev/null || true)"
log "Versión nueva: $NEW (actual: ${PREV:-ninguna})"

# check-env otra vez: el pull pudo traer variables nuevas en .env.prod.example.
bash "$ROOT_DIR/scripts/check-env.sh"

# ------------------------------------------------------------------ 3. respaldo previo
if [ "$FIRST" -eq 0 ] && [ "$(service_health db)" = healthy ]; then
  log "Respaldo de la base de datos antes de desplegar..."
  bash "$ROOT_DIR/scripts/backup.sh" "pre-deploy-$NEW" --db-only
else
  log "Sin respaldo previo (primer despliegue o db apagada)."
fi

# ------------------------------------------------------------------ 4. build por etapas
# Una etapa pesada a la vez (vite, luego nest) para no agotar 1 vCPU / 2 GB + swap.
# La caché de BuildKit hace que los pasos siguientes reutilicen lo ya compilado.
log "Build: web..."
docker build --target web-build -t "$STAGE_IMAGE:web-build" "$ROOT_DIR"
log "Build: api (nest)..."
docker build --target api-build -t "$STAGE_IMAGE:api-build" "$ROOT_DIR"
log "Build: imagen api..."
APP_VERSION="$NEW" dc build api
log "Build: imagen edge..."
APP_VERSION="$NEW" dc build edge

docker tag "$API_IMAGE:$NEW" "$API_IMAGE:current"
docker tag "$EDGE_IMAGE:$NEW" "$EDGE_IMAGE:current"
# Las etapas intermedias solo servían para compilar de a una; la caché de BuildKit se queda.
docker image rm "$STAGE_IMAGE:web-build" "$STAGE_IMAGE:api-build" >/dev/null 2>&1 || true

# ------------------------------------------------------------------ 5. arranque
# El edge monta public/ del volumen de medios con subpath: tiene que existir antes.
dc run --rm --no-deps -T --entrypoint sh api -c 'mkdir -p /data/media/public /data/media/private' ||
  die "No se pudo preparar el volumen de medios."

on_failure() {
  warn "El despliegue de $NEW falló."
  printf '%s deploy-fallido %s -> %s\n' "$(date -u '+%FT%TZ')" "${PREV:-none}" "$NEW" >>"$DEPLOY_DIR/history"
  # :current ya apunta a NEW. Así un rollback.sh sin argumentos (p. ej. tras --no-auto-rollback)
  # vuelve a la última versión sana.
  echo "$NEW" >"$DEPLOY_DIR/current"
  dc ps -a || true
  dc logs --no-color --tail 60 migrate api edge || true
  if [ "$AUTO_ROLLBACK" -eq 1 ] && [ -n "$PREV" ] && [ "$PREV" != "$NEW" ]; then
    warn "Volviendo automáticamente a $PREV..."
    bash "$ROOT_DIR/scripts/rollback.sh" "$PREV" || warn "El rollback automático también falló: revisa a mano."
    warn "Si la migración dañó datos: bash scripts/restore.sh <respaldo pre-deploy-$NEW>"
  fi
  exit 1
}

log "docker compose up (migrate corre antes del api)..."
dc up -d --remove-orphans || on_failure

# ------------------------------------------------------------------ 6. verificación
log "Esperando a que api y edge estén healthy..."
wait_healthy 180 api edge || on_failure

reported="$(health_version || true)"
if [ "$reported" != "$NEW" ]; then
  warn "/api/health reporta la versión '${reported:-nada}' y se esperaba '$NEW'."
  on_failure
fi

# ------------------------------------------------------------------ 7. registro
echo "$NEW" >"$DEPLOY_DIR/current"
echo "$NEW" >>"$DEPLOY_DIR/releases"
printf '%s deploy %s -> %s\n' "$(date -u '+%FT%TZ')" "${PREV:-none}" "$NEW" >>"$DEPLOY_DIR/history"

# ------------------------------------------------------------------ 8. limpieza
# Se guardan las 3 últimas versiones de cada imagen para poder volver atrás.
prune_tags() {
  local image="$1" tag
  docker image ls "$image" --format '{{.Tag}}' |
    grep -vE '^(current|dev|<none>)$' |
    awk -v keep="$NEW" '$0 != keep' |
    tail -n +3 |
    while read -r tag; do
      docker image rm "$image:$tag" >/dev/null 2>&1 || true
    done
}
prune_tags "$API_IMAGE"
prune_tags "$EDGE_IMAGE"
# Solo imágenes sueltas de este proyecto (las demás apps del VPS no se tocan).
docker image prune -f --filter label=fersua.project=fersua-booking >/dev/null 2>&1 || true
if [ -z "${FERSUA_SKIP_BUILDER_PRUNE:-}" ]; then
  docker builder prune -f --filter until=168h >/dev/null 2>&1 || true
fi

log "Listo: $NEW desplegada y sana."
dc ps
