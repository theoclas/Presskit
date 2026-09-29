#!/usr/bin/env bash
# Compara .env con .env.prod.example y revisa lo básico de los valores.
# Sale con error si falta una clave, si un secreto está vacío o es débil, o si aparece una
# variable ADMIN_* (salvo ADMIN_NOTIFY_EMAIL).
#
# Uso: bash scripts/check-env.sh [archivo .env]   (por defecto ./.env)
. "$(dirname "$0")/lib.sh"

ENV_FILE="${1:-$ROOT_DIR/.env}"
EXAMPLE="$ROOT_DIR/.env.prod.example"
[ -f "$ENV_FILE" ] || die "No existe $ENV_FILE. Créalo con: bash scripts/init-env.sh"

errors=0
fail() {
  printf '  - %s\n' "$*" >&2
  errors=$((errors + 1))
}
get() { env_get "$1" '' "$ENV_FILE"; }

echo "Revisando $ENV_FILE"

# 1. Claves del ejemplo que no están en .env (típico después de un git pull con variables nuevas).
while IFS= read -r key; do
  grep -qE "^${key}=" "$ENV_FILE" || fail "falta la clave $key (está en .env.prod.example)"
done < <(grep -oE '^[A-Z][A-Z0-9_]*=' "$EXAMPLE" | tr -d '=' | sort -u)

# 2. Obligatorias con valor.
for key in PUBLIC_URL DB_NAME DB_ROOT_PASSWORD DB_MIGRATOR_USER DB_MIGRATOR_PASSWORD DB_APP_USER \
  DB_APP_PASSWORD JWT_ACCESS_SECRET BOOKING_FORM_SECRET IP_HASH_SECRET MFA_ENC_KEY SMTP_HOST \
  SMTP_USER SMTP_PASS MAIL_FROM; do
  [ -n "$(get "$key")" ] || fail "$key está vacía"
done

# 3. Fuerza y forma de los secretos (el api también lo valida al arrancar).
min_len() {
  local v
  v="$(get "$1")"
  [ -z "$v" ] || [ "${#v}" -ge "$2" ] || fail "$1 debe tener al menos $2 caracteres"
}
min_len JWT_ACCESS_SECRET 64
min_len BOOKING_FORM_SECRET 32
min_len IP_HASH_SECRET 32
min_len DB_ROOT_PASSWORD 24
min_len DB_MIGRATOR_PASSWORD 24
min_len DB_APP_PASSWORD 24

mfa="$(get MFA_ENC_KEY)"
[ -z "$mfa" ] || [[ "$mfa" =~ ^[0-9a-fA-F]{64}$ ]] || fail "MFA_ENC_KEY debe ser 64 caracteres hex (openssl rand -hex 32)"

for key in DB_MIGRATOR_PASSWORD DB_APP_PASSWORD; do
  v="$(get "$key")"
  [ -z "$v" ] || [[ "$v" =~ ^[A-Za-z0-9._~-]+$ ]] || fail "$key solo admite [A-Za-z0-9._~-] (va dentro de DATABASE_URL)"
done
for key in DB_NAME DB_MIGRATOR_USER DB_APP_USER; do
  v="$(get "$key")"
  [ -z "$v" ] || [[ "$v" =~ ^[A-Za-z0-9_]+$ ]] || fail "$key solo admite letras, números y _"
done
[ "$(get DB_MIGRATOR_USER)" != "$(get DB_APP_USER)" ] || fail "DB_MIGRATOR_USER y DB_APP_USER deben ser distintos"
# Valores de ejemplo (api/.env.example es público) o sin azar: el api tampoco arranca con ellos.
secret_keys="JWT_ACCESS_SECRET BOOKING_FORM_SECRET IP_HASH_SECRET MFA_ENC_KEY"
for key in $secret_keys; do
  v="$(get "$key")"
  [ -n "$v" ] || continue
  case "$v" in
    *change-me* | dev-* | *example* | *placeholder*) fail "$key tiene un valor de ejemplo: genera uno nuevo (ver scripts/init-env.sh)" ;;
  esac
  distinct="$(printf '%s' "$v" | fold -w1 | sort -u | wc -l)"
  [ "$distinct" -ge 8 ] || fail "$key no parece aleatorio: genera uno nuevo (ver scripts/init-env.sh)"
done
for a in $secret_keys; do
  for b in $secret_keys; do
    [ "$a" \< "$b" ] || continue
    [ -z "$(get "$a")" ] || [ "$(get "$a")" != "$(get "$b")" ] || fail "$a y $b no pueden ser iguales"
  done
done

case "$(get PUBLIC_URL)" in
  https://*) ;;
  '') ;;
  *) fail "PUBLIC_URL debe empezar por https://" ;;
esac

# 4. Nada de ADMIN_* (la contraseña del admin nunca va en archivos).
while IFS= read -r key; do
  [ "$key" = ADMIN_NOTIFY_EMAIL ] || fail "quita $key de .env: el admin se crea con la CLI interactiva"
done < <(grep -oE '^ADMIN_[A-Z0-9_]*' "$ENV_FILE" || true)

# 5. Permisos (solo aviso: en Windows/CI no aplica).
if perms="$(stat -c '%a' "$ENV_FILE" 2>/dev/null)" && [ "$perms" != 600 ] && [ "$perms" != 400 ]; then
  warn "$ENV_FILE tiene permisos $perms; deja 600: chmod 600 $ENV_FILE"
fi

if [ "$errors" -gt 0 ]; then
  die "$errors problema(s) en $ENV_FILE"
fi
log "OK: $ENV_FILE tiene todas las claves de .env.prod.example."
