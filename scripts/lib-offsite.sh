# shellcheck shell=bash
# Piezas comunes de la copia externa con restic (offsite-backup.sh, restore-drill.sh,
# watchdog.sh y status.sh). Se carga DESPUÉS de lib.sh:
#   . "$(dirname "$0")/lib.sh"
#   . "$ROOT_DIR/scripts/lib-offsite.sh"
#
# restic corre en su imagen oficial: nada se instala en el host. Los secretos viajan en el
# entorno del proceso docker (-e NOMBRE, sin valor): nunca en la línea de comandos ni en el log.

# Versiones fijas: restic define el formato del repositorio y rclone habla con Google Drive.
# Para subirlas: cambiar las tres líneas, correr "offsite-backup.sh check" y el ensayo.
RESTIC_IMAGE="restic/restic:0.19.1"
RCLONE_IMAGE="rclone/rclone:1.75.1"
# La imagen de restic no trae rclone: esta le suma el binario oficial (se construye una vez).
RESTIC_RCLONE_IMAGE="fersua-booking-restic:0.19.1-rclone1.75.1"
# Host fijo en las instantáneas: el contenedor tiene otro hostname en cada corrida y la
# retención de restic agrupa por host (sin esto, forget nunca borraría nada).
# shellcheck disable=SC2034  # la usan offsite-backup.sh y restore-drill.sh
RESTIC_HOST="fersua-booking"
# Dónde queda BACKUP_DIR dentro del contenedor: es la ruta que guardan las instantáneas.
RESTIC_SOURCE="/data/fersua-booking"
# Montajes extra para restic_run (la carpeta de destino de una restauración).
RESTIC_MOUNTS=()

backup_dir() { env_get BACKUP_DIR "$HOME/backups/fersua-booking"; }
offsite_repo() { env_get OFFSITE_RESTIC_REPOSITORY ''; }
offsite_configured() { [ -n "$(offsite_repo)" ]; }
offsite_state_file() { printf '%s/offsite-state' "$(backup_dir)"; }
offsite_rclone_config() { env_get OFFSITE_RCLONE_CONFIG "$HOME/.config/rclone/rclone.conf"; }

# Ruta del host como la entiende docker (en Git Bash, C:/...; en Linux, la misma).
docker_host_path() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi
}

# Estado de la copia externa (clave=valor, epoch en segundos). Lo escribe offsite-backup.sh
# y lo leen watchdog.sh y status.sh.
# Nunca falla (con set -eE un archivo que falta cortaría a quien la llama).
offsite_state_get() {
  local f
  f="$(offsite_state_file)"
  [ -f "$f" ] || return 0
  sed -n "s/^$1=//p" "$f" | tail -n 1
}
offsite_state_set() {
  local f tmp
  f="$(offsite_state_file)"
  tmp="$f.tmp.$$"
  { grep -v "^$1=" "$f" 2>/dev/null || true; printf '%s=%s\n' "$1" "$2"; } >"$tmp"
  mv -f "$tmp" "$f"
}

# El repositorio para mostrar (no lleva credenciales: esas van en variables aparte).
offsite_repo_label() {
  local r
  r="$(offsite_repo)"
  case "$r" in
    b2:*) printf 'Backblaze B2 (%s)' "$r" ;;
    s3:*) printf 'S3 (%s)' "$r" ;;
    rclone:*) printf 'rclone (%s)' "$r" ;;
    /*) printf 'carpeta local (%s)' "$r" ;;
    *) printf 'no reconocido' ;;
  esac
}

# Revisa que la configuración esté completa antes de llamar a restic (mensajes claros en vez
# de un error de red o de clave).
offsite_check_config() {
  local repo pw cfg perms
  repo="$(offsite_repo)"
  pw="$(env_get OFFSITE_RESTIC_PASSWORD '')"
  [ -n "$pw" ] || die "Falta OFFSITE_RESTIC_PASSWORD en .env (genérala con: openssl rand -hex 32)."
  [ "${#pw}" -ge 20 ] || die "OFFSITE_RESTIC_PASSWORD es muy corta (mínimo 20 caracteres; usa openssl rand -hex 32)."
  case "$repo" in
    b2:?*:*)
      if [ -z "$(env_get OFFSITE_B2_ACCOUNT_ID '')" ] || [ -z "$(env_get OFFSITE_B2_ACCOUNT_KEY '')" ]; then
        die "Faltan OFFSITE_B2_ACCOUNT_ID y OFFSITE_B2_ACCOUNT_KEY en .env (la llave de aplicación de B2)."
      fi
      ;;
    s3:?*)
      if [ -z "$(env_get OFFSITE_AWS_ACCESS_KEY_ID '')" ] || [ -z "$(env_get OFFSITE_AWS_SECRET_ACCESS_KEY '')" ]; then
        die "Faltan OFFSITE_AWS_ACCESS_KEY_ID y OFFSITE_AWS_SECRET_ACCESS_KEY en .env."
      fi
      ;;
    rclone:?*:*)
      cfg="$(offsite_rclone_config)"
      [ -f "$cfg" ] || die "No existe el archivo de rclone $cfg (OFFSITE_RCLONE_CONFIG). Ver docs/04-backups.md."
      case "$(cd "$(dirname "$cfg")" && pwd)/" in
        "$ROOT_DIR"/*) die "El archivo de rclone tiene tokens de tu Google Drive: guárdalo fuera del repo (p. ej. ~/.config/rclone/rclone.conf)." ;;
      esac
      if perms="$(stat -c '%a' "$cfg" 2>/dev/null)" && [ "$perms" != 600 ] && [ "$perms" != 400 ]; then
        warn "$cfg tiene permisos $perms; deja 600: chmod 600 $cfg"
      fi
      ;;
    /?*) ;;
    *) die "OFFSITE_RESTIC_REPOSITORY no reconocido: usa b2:<bucket>:<carpeta>, rclone:<remoto>:<carpeta>, s3:<url> o una ruta absoluta." ;;
  esac
}

# Revisa la configuración y deja lista la imagen (así su construcción se ve en el log y no
# queda escondida dentro de la primera llamada a restic).
offsite_prepare() {
  offsite_check_config
  case "$(offsite_repo)" in
    rclone:*) ensure_restic_rclone_image ;;
  esac
}

# restic + rclone en una imagen local, construida una sola vez a partir de las dos oficiales.
ensure_restic_rclone_image() {
  docker image inspect "$RESTIC_RCLONE_IMAGE" >/dev/null 2>&1 && return 0
  log "Construyendo la imagen auxiliar $RESTIC_RCLONE_IMAGE (restic + rclone, una sola vez)..."
  printf 'FROM %s\nCOPY --from=%s /usr/local/bin/rclone /usr/local/bin/rclone\n' "$RESTIC_IMAGE" "$RCLONE_IMAGE" |
    docker build -q -t "$RESTIC_RCLONE_IMAGE" - >/dev/null
}

# Corre restic en un contenedor desechable. Uso: restic_run <comando de restic> [args]
# - BACKUP_DIR entra en solo lectura en $RESTIC_SOURCE; RESTIC_MOUNTS agrega otros montajes.
# - Corre con el usuario del host: la caché y lo restaurado quedan a su nombre.
# - La caché de restic vive en el host (~/.cache/fersua-booking-restic): sin ella, cada corrida
#   vuelve a bajar los índices del repositorio.
restic_run() {
  local repo target img="$RESTIC_IMAGE" net=bridge cache cfg bdir
  repo="$(offsite_repo)"
  target="$repo"
  bdir="$(backup_dir)"
  cache="$HOME/.cache/fersua-booking-restic"
  mkdir -p "$cache/tmp" "$bdir"
  chmod 700 "$cache"
  local -a opts=(
    --rm --user "$(id -u):$(id -g)" --read-only --cap-drop ALL --security-opt no-new-privileges
    --memory 768m --cpus 0.5 --pids-limit 256 --label fersua.restic=1
    -v "$(docker_host_path "$cache"):/cache"
    -v "$(docker_host_path "$bdir"):$RESTIC_SOURCE:ro"
    -e RESTIC_REPOSITORY -e RESTIC_PASSWORD -e RESTIC_CACHE_DIR=/cache -e HOME=/cache -e TMPDIR=/cache/tmp
  )
  case "$repo" in
    b2:*) opts+=(-e B2_ACCOUNT_ID -e B2_ACCOUNT_KEY) ;;
    s3:*) opts+=(-e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY) ;;
    rclone:*)
      ensure_restic_rclone_image
      img="$RESTIC_RCLONE_IMAGE"
      cfg="$(offsite_rclone_config)"
      # La carpeta (no solo el archivo): rclone reescribe el archivo al renovar el token de Drive.
      # restic le pasa su entorno a rclone. Sin papelera en Drive: lo que borra prune se va de
      # verdad (si no, quedaría 30 días más en la papelera, ocupando cupo y alargando el plazo
      # de borrado que promete la política de privacidad).
      opts+=(-v "$(docker_host_path "$(dirname "$cfg")"):/rclone" -e "RCLONE_CONFIG=/rclone/$(basename "$cfg")" -e RCLONE_DRIVE_USE_TRASH=false)
      ;;
    /*)
      # Repositorio en una carpeta del host (otro disco, o las pruebas locales): sin red.
      mkdir -p "$repo"
      chmod 700 "$repo"
      opts+=(-v "$(docker_host_path "$repo"):/repo")
      target=/repo
      net=none
      ;;
  esac
  opts+=(--network "$net" "${RESTIC_MOUNTS[@]}")
  # MSYS_NO_PATHCONV: en Git Bash (solo pruebas en Windows) que no reescriba las rutas del contenedor.
  MSYS_NO_PATHCONV=1 \
    RESTIC_REPOSITORY="$target" \
    RESTIC_PASSWORD="$(env_get OFFSITE_RESTIC_PASSWORD '')" \
    B2_ACCOUNT_ID="$(env_get OFFSITE_B2_ACCOUNT_ID '')" \
    B2_ACCOUNT_KEY="$(env_get OFFSITE_B2_ACCOUNT_KEY '')" \
    AWS_ACCESS_KEY_ID="$(env_get OFFSITE_AWS_ACCESS_KEY_ID '')" \
    AWS_SECRET_ACCESS_KEY="$(env_get OFFSITE_AWS_SECRET_ACCESS_KEY '')" \
    docker run "${opts[@]}" "$img" "$@"
}
