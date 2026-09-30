#!/usr/bin/env bash
# Vigilante del VPS (cron cada 10 min, como deploy). Revisa:
#   - el disco libre en / (MONITOR_DISK_MIN_GB, 5 por defecto);
#   - que el último respaldo nocturno tenga menos de 26 h;
#   - que db, api y edge estén healthy y no se hayan reiniciado solos;
#   - que el certificado HTTPS de PUBLIC_URL no venza en menos de 14 días;
#   - que la última copia externa correcta tenga menos de 30 h (si está configurada).
# Por cada problema manda un correo al admin con la CLI del api (ops:alert): como mucho uno por
# tipo cada 24 h (aunque el problema vaya y vuelva), y otro cuando lleva dos corridas resuelto.
# Si un envío falla, lo reintenta como mucho una vez por hora. Si todo está bien no imprime nada.
# También recorta los logs de los trabajos del cron (backup, offsite, drill y el suyo).
# Qué hacer con cada aviso: docs/08-monitoreo.md.
#
# Uso:
#   bash scripts/watchdog.sh                  # cron
#   bash scripts/watchdog.sh --dry-run        # muestra cada revisión y lo que avisaría; no envía ni guarda nada
#   bash scripts/watchdog.sh --pause <min>    # silencia los avisos un rato (mantenimiento, restauración)
#   bash scripts/watchdog.sh --resume         # quita la pausa
. "$(dirname "$0")/lib.sh"
. "$ROOT_DIR/scripts/lib-offsite.sh"

DRY_RUN=0
PAUSE_MIN=""
RESUME=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --pause)
      PAUSE_MIN="${2:-}"
      if ! [[ "$PAUSE_MIN" =~ ^[0-9]+$ ]] || [ "$PAUSE_MIN" -lt 1 ] || [ "$PAUSE_MIN" -gt 1440 ]; then
        die "--pause necesita los minutos (1 a 1440)"
      fi
      shift
      ;;
    --resume) RESUME=1 ;;
    -h | --help)
      sed -n '12,16p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) die "Opción desconocida: $1" ;;
  esac
  shift
done

require_cmd docker df awk find
require_env_file
umask 077

STATE_DIR="${FERSUA_WATCHDOG_STATE:-$HOME/.fersua-booking-watchdog}"
mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
NOW="$(date +%s)"

# Número guardado en un archivo de estado (0 si no existe o no es un número).
read_num() {
  local v
  v="$(cat "$1" 2>/dev/null || true)"
  [[ "$v" =~ ^[0-9]+$ ]] && printf '%s' "$v" || printf 0
}
# Umbral desde .env, o el valor por defecto si no es un entero positivo.
threshold() {
  local v
  v="$(env_get "$1" "$2")"
  [[ "$v" =~ ^[1-9][0-9]*$ ]] && printf '%s' "$v" || printf '%s' "$2"
}

if [ -n "$PAUSE_MIN" ]; then
  printf '%s\n' "$((NOW + PAUSE_MIN * 60))" >"$STATE_DIR/pause-until"
  log "Avisos en pausa por $PAUSE_MIN min (hasta $(date -d "@$((NOW + PAUSE_MIN * 60))" '+%F %T')). Quitar antes: --resume"
  exit 0
fi
if [ "$RESUME" -eq 1 ]; then
  rm -f "$STATE_DIR/pause-until"
  log "Pausa quitada."
  exit 0
fi
paused_until="$(read_num "$STATE_DIR/pause-until")"
if [ "$paused_until" -gt "$NOW" ]; then
  [ "$DRY_RUN" -eq 1 ] || exit 0
  printf 'Avisos en pausa hasta %s (en cron no revisaría nada).\n' "$(date -d "@$paused_until" '+%F %T')"
fi

# Dos corridas del cron no deben pisarse (la del dry-run sí puede correr al lado).
if [ "$DRY_RUN" -eq 0 ] && command -v flock >/dev/null 2>&1; then
  exec 7>"$STATE_DIR/lock"
  flock -n 7 || exit 0
fi

DISK_MIN_GB="$(threshold MONITOR_DISK_MIN_GB 5)"
BACKUP_MAX_H="$(threshold MONITOR_BACKUP_MAX_AGE_H 26)"
TLS_MIN_DAYS="$(threshold MONITOR_TLS_MIN_DAYS 14)"
OFFSITE_MAX_H="$(threshold MONITOR_OFFSITE_MAX_AGE_H 30)"

# Resultado de cada revisión, por tipo de aviso (los mismos de la CLI ops:alert).
declare -A CHECKED=() PROBLEM=() CONFIRM=() OKTEXT=()
problem() {
  CHECKED[$1]=1
  PROBLEM[$1]="$2"
  [ "${3:-}" != confirm ] || CONFIRM[$1]=1
  [ "$DRY_RUN" -eq 0 ] || printf '  [!!] %-18s %s\n' "$1" "$2"
}
fine() {
  CHECKED[$1]=1
  OKTEXT[$1]="$2"
  [ "$DRY_RUN" -eq 0 ] || printf '  [ok] %-18s %s\n' "$1" "$2"
}
skip() { [ "$DRY_RUN" -eq 0 ] || printf '  [--] %-18s %s\n' "$1" "$2"; }

[ "$DRY_RUN" -eq 0 ] || printf 'Watchdog (simulación) %s\n' "$(date '+%F %T')"

# ------------------------------------------------------------------ (a) disco
# Contando desde el final: el nombre del sistema de archivos puede tener espacios.
avail_kb="$(df -Pk / | awk 'NR == 2 { print $(NF - 2) }')"
if [[ "$avail_kb" =~ ^[0-9]+$ ]]; then
  gb="$(awk -v k="$avail_kb" 'BEGIN { printf "%.1f", k / 1048576 }')"
  if [ "$avail_kb" -lt $((DISK_MIN_GB * 1048576)) ]; then
    problem disk-low "Quedan $gb GB libres en / (mínimo $DISK_MIN_GB GB)"
  else
    fine disk-low "Hay $gb GB libres en /"
  fi
else
  skip disk-low "no se pudo leer df"
fi

# ------------------------------------------------------------------ (b) respaldo nocturno
BACKUP_DIR="$(backup_dir)"
newest="$(find "$BACKUP_DIR/db" -maxdepth 1 -name 'db_nightly_*.sql.gz' -printf '%T@ %f\n' 2>/dev/null | sort -n | tail -n 1 || true)"
if [ -z "$newest" ]; then
  problem backup-stale "No hay respaldos nocturnos en $BACKUP_DIR/db"
else
  age_h=$(((NOW - ${newest%%.*}) / 3600))
  if [ "$age_h" -ge "$BACKUP_MAX_H" ]; then
    stamp="${newest#* db_nightly_}"
    problem backup-stale "El último respaldo nocturno es de hace $age_h h (${stamp%.sql.gz})"
  else
    fine backup-stale "El último respaldo nocturno es de hace $age_h h"
  fi
fi

# ------------------------------------------------------------------ (c) contenedores
deploy_running() {
  command -v flock >/dev/null 2>&1 && [ -e "$DEPLOY_DIR/deploy.lock" ] || return 1
  ! flock -n "$DEPLOY_DIR/deploy.lock" true
}
if deploy_running; then
  # Durante un despliegue los contenedores se recrean: se revisan en la corrida siguiente.
  skip container-down "hay un despliegue en curso"
else
  bad=()
  restarted=()
  restarts_state=""
  for svc in db api edge; do
    id="$(dc ps -a -q "$svc" 2>/dev/null | head -n 1 || true)"
    if [ -z "$id" ]; then
      bad+=("$svc: no existe")
      continue
    fi
    info="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}} {{.RestartCount}}' "$id" 2>/dev/null || echo 'missing 0')"
    health="${info% *}"
    count="${info##* }"
    [[ "$count" =~ ^[0-9]+$ ]] || count=0
    [ "$health" = healthy ] || bad+=("$svc: $health")
    # RestartCount sube cuando Docker lo levanta de nuevo tras una caída. Solo se compara con el
    # mismo contenedor: un despliegue crea otro y el contador vuelve a 0.
    prev="$(awk -v s="$svc" '$1 == s { print $2 " " $3 }' "$STATE_DIR/restarts" 2>/dev/null || true)"
    if [ "${prev%% *}" = "${id:0:12}" ] && [[ "${prev##* }" =~ ^[0-9]+$ ]] && [ "$count" -gt "${prev##* }" ]; then
      restarted+=("$svc ($((count - ${prev##* })))")
    fi
    restarts_state+="$svc ${id:0:12} $count"$'\n'
  done
  [ "$DRY_RUN" -eq 1 ] || printf '%s' "$restarts_state" >"$STATE_DIR/restarts"
  if [ "${#bad[@]}" -gt 0 ]; then
    problem container-down "$(IFS=,; printf '%s' "${bad[*]}" | sed 's/,/, /g')" confirm
  else
    fine container-down "db, api y edge están healthy"
  fi
  if [ "${#restarted[@]}" -gt 0 ]; then
    problem container-restart "Docker los volvió a levantar tras una caída: $(IFS=,; printf '%s' "${restarted[*]}" | sed 's/,/, /g')"
  else
    fine container-restart "Sin reinicios desde la corrida anterior"
  fi
fi

# ------------------------------------------------------------------ (d) certificado HTTPS
url="$(env_get PUBLIC_URL '')"
if [[ "$url" != https://* ]]; then
  skip tls-expiring "PUBLIC_URL no es https"
elif ! command -v openssl >/dev/null 2>&1 || ! command -v timeout >/dev/null 2>&1; then
  skip tls-expiring "faltan openssl o timeout"
else
  hostport="${url#https://}"
  hostport="${hostport%%/*}"
  host="${hostport%%:*}"
  port=443
  [ "$hostport" = "$host" ] || port="${hostport##*:}"
  end="$(timeout 20 openssl s_client -connect "$host:$port" -servername "$host" </dev/null 2>/dev/null |
    openssl x509 -noout -enddate 2>/dev/null | sed -n 's/^notAfter=//p' || true)"
  end_s=""
  [ -z "$end" ] || end_s="$(date -u -d "$end" +%s 2>/dev/null || true)"
  if [ -z "$end_s" ]; then
    # Puede ser un corte momentáneo de red: se confirma en la corrida siguiente.
    problem tls-expiring "No se pudo leer el certificado de $host" confirm
  else
    days=$(((end_s - NOW) / 86400))
    end_day="$(date -u -d "@$end_s" +%F)"
    if [ "$end_s" -le "$NOW" ]; then
      problem tls-expiring "El certificado de $host venció el $end_day"
    elif [ "$days" -lt "$TLS_MIN_DAYS" ]; then
      problem tls-expiring "El certificado de $host vence en $days días ($end_day)"
    else
      fine tls-expiring "El certificado de $host vence el $end_day ($days días)"
    fi
  fi
fi

# ------------------------------------------------------------------ (e) copia externa
if ! offsite_configured; then
  skip offsite-stale "copia externa no configurada"
else
  last_ok="$(offsite_state_get last_ok)"
  last_fail="$(offsite_state_get last_fail)"
  [[ "$last_ok" =~ ^[0-9]+$ ]] || last_ok=""
  [[ "$last_fail" =~ ^[0-9]+$ ]] || last_fail=0
  if [ -z "$last_ok" ]; then
    problem offsite-stale "Todavía no hay ninguna copia externa correcta"
  else
    age_h=$(((NOW - last_ok) / 3600))
    if [ "$age_h" -ge "$OFFSITE_MAX_H" ]; then
      detail="La última copia externa correcta es de hace $age_h h"
      [ "$last_fail" -le "$last_ok" ] || detail="$detail (la última corrida falló hace $(((NOW - last_fail) / 3600)) h)"
      problem offsite-stale "$detail"
    else
      fine offsite-stale "La última copia externa correcta es de hace $age_h h"
    fi
  fi
fi

# ------------------------------------------------------------------ avisos
# El correo lo manda el api (MailService, sus cupos y la auditoría system.ops_alert). Si el
# contenedor del api no corre, uno de un solo uso con la misma imagen (necesita la db arriba).
send_alert() {
  local kind="$1" detail="$2" resolved="${3:-}" id running=false
  local -a cli=(node dist/cli/main.js ops:alert --kind "$kind" --detail "$detail")
  [ -z "$resolved" ] || cli+=(--resolved)
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '       -> se enviaría: ops:alert --kind %s --detail "%s"%s\n' "$kind" "$detail" "${resolved:+ --resolved}"
    return 0
  fi
  id="$(dc ps -q api 2>/dev/null | head -n 1 || true)"
  [ -z "$id" ] || running="$(docker inspect -f '{{.State.Running}}' "$id" 2>/dev/null || echo false)"
  if [ "$running" = true ]; then
    timeout 150 "${DC_CMD[@]}" exec -T api "${cli[@]}"
  else
    timeout 180 "${DC_CMD[@]}" run --rm --no-deps -T api "${cli[@]}"
  fi
}

# Estado de cada tipo en $STATE_DIR (solo números: segundos epoch o conteos):
#   <tipo>.alerted  cuándo salió el último aviso del problema. Se conserva al resolverse: es el
#                   límite de uno por tipo cada 24 h, también si el problema va y viene (un disco
#                   que ronda el umbral no manda un correo cada 20 min);
#   <tipo>.open     el problema se avisó y sigue sin resolverse (lo muestra status.sh);
#   <tipo>.seen     corridas seguidas con el problema (los que se confirman dos veces);
#   <tipo>.okruns   corridas seguidas bien desde que se avisó (el "resuelto" pide dos);
#   <tipo>.failed   último envío que no salió: se reintenta como mucho una vez por hora (un SMTP
#                   caído no llena el log ni gasta intentos en bucle).
DAY_S=86400
RETRY_S=3600
state_set() { [ "$DRY_RUN" -eq 1 ] || printf '%s\n' "$2" >"$STATE_DIR/$1"; }
state_rm() {
  local f
  [ "$DRY_RUN" -eq 0 ] || return 0
  for f in "$@"; do rm -f "$STATE_DIR/$f"; done
}

# Manda un aviso salvo que el anterior de ese tipo haya fallado hace menos de una hora.
# 0 = salió; 1 = no salió o espera para reintentar (cuenta como fallo para el latido).
try_send() {
  local kind="$1" detail="$2" resolved="${3:-}" failed
  failed="$(read_num "$STATE_DIR/$kind.failed")"
  if [ $((NOW - failed)) -lt "$RETRY_S" ]; then
    [ "$DRY_RUN" -eq 0 ] || printf '  %s: el último envío falló hace %s min; se reintenta pasada la hora\n' "$kind" "$(((NOW - failed) / 60))"
    return 1
  fi
  if send_alert "$kind" "$detail" "$resolved"; then
    state_rm "$kind.failed"
    return 0
  fi
  state_set "$kind.failed" "$NOW"
  warn "No se pudo enviar el aviso${resolved:+ de resuelto} $kind: $detail (se reintenta en una hora)"
  return 1
}

[ "$DRY_RUN" -eq 0 ] || printf '\nAvisos:\n'
FAILED=0
for kind in disk-low backup-stale container-down container-restart tls-expiring offsite-stale; do
  [ -n "${CHECKED[$kind]:-}" ] || continue
  last="$(read_num "$STATE_DIR/$kind.alerted")"
  open="$(read_num "$STATE_DIR/$kind.open")"
  if [ -n "${PROBLEM[$kind]:-}" ]; then
    detail="${PROBLEM[$kind]}"
    state_rm "$kind.okruns"
    if [ -n "${CONFIRM[$kind]:-}" ]; then
      seen=$(($(read_num "$STATE_DIR/$kind.seen") + 1))
      state_set "$kind.seen" "$seen"
      if [ "$seen" -lt 2 ]; then
        log "$kind: $detail (se avisa si sigue igual en la próxima corrida)"
        continue
      fi
    fi
    if [ $((NOW - last)) -lt "$DAY_S" ]; then
      [ "$DRY_RUN" -eq 0 ] || printf '  %s: ya se avisó hace %s h; no se repite hasta cumplir 24 h\n' "$kind" "$(((NOW - last) / 3600))"
      continue
    fi
    if try_send "$kind" "$detail"; then
      state_set "$kind.alerted" "$NOW"
      # Un reinicio es un hecho puntual: no queda abierto ni tiene aviso de resuelto.
      [ "$kind" = container-restart ] || state_set "$kind.open" "$NOW"
      [ "$DRY_RUN" -eq 1 ] || log "Aviso enviado: $kind: $detail"
    else
      FAILED=$((FAILED + 1))
    fi
  else
    state_rm "$kind.seen"
    if [ "$open" -eq 0 ]; then
      state_rm "$kind.okruns"
      continue
    fi
    # "Resuelto" solo tras dos corridas seguidas bien (histéresis): un problema que va y viene
    # no manda aviso y resuelto cada 20 min.
    okruns=$(($(read_num "$STATE_DIR/$kind.okruns") + 1))
    state_set "$kind.okruns" "$okruns"
    if [ "$okruns" -lt 2 ]; then
      [ "$DRY_RUN" -eq 0 ] || printf '  %s: bien en esta corrida; se da por resuelto si sigue bien en la próxima\n' "$kind"
      continue
    fi
    if try_send "$kind" "${OKTEXT[$kind]:-}" --resolved; then
      state_rm "$kind.open" "$kind.okruns"
      [ "$DRY_RUN" -eq 1 ] || log "Resuelto: $kind: ${OKTEXT[$kind]:-}"
    else
      FAILED=$((FAILED + 1))
    fi
  fi
done
[ "$DRY_RUN" -eq 0 ] || [ "${#PROBLEM[@]}" -gt 0 ] || printf '  (ninguno)\n'

# Logs de los trabajos del cron: se recortan en el mismo archivo (sin moverlo, así quien esté
# escribiendo sigue al final) cuando pasan de 1 MB, dejando las últimas 5.000 líneas.
trim_log() {
  local f="$1" tmp
  [ -f "$f" ] || return 0
  [ "$(wc -c <"$f")" -gt 1048576 ] || return 0
  tmp="$f.trim.$$"
  tail -n 5000 "$f" >"$tmp" && cat "$tmp" >"$f"
  rm -f "$tmp"
}
if [ "$DRY_RUN" -eq 0 ]; then
  for f in "$STATE_DIR/watchdog.log" "$BACKUP_DIR/backup.log" "$BACKUP_DIR/offsite.log" "$BACKUP_DIR/drill-cron.log"; do
    trim_log "$f" || warn "No se pudo recortar $f"
  done
fi

# Latido opcional a healthchecks.io: si el VPS se cae entero, deja de llegar y te avisa. /fail
# cuando un aviso no pudo salir (así te enteras aunque el correo del api esté roto).
if [ "$DRY_RUN" -eq 0 ]; then
  hc="$(env_get MONITOR_HEALTHCHECK_URL '')"
  if [ -n "$hc" ]; then
    suffix=""
    [ "$FAILED" -eq 0 ] || suffix=/fail
    curl -fsS -m 10 --retry 2 "$hc$suffix" >/dev/null 2>&1 || warn "No se pudo avisar a healthchecks.io"
  fi
fi
[ "$FAILED" -eq 0 ] || exit 1
