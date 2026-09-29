#!/usr/bin/env bash
# Crea .env a partir de .env.prod.example con secretos aleatorios. Solo la primera vez:
# se niega si .env ya existe (regenerar las claves de BD rompería el acceso a los datos).
#
# Uso (VPS, en ~/apps/fersuastudio-booking):  bash scripts/init-env.sh
. "$(dirname "$0")/lib.sh"

require_cmd openssl sed
[ -e .env ] && die ".env ya existe. No se sobrescribe; edítalo a mano si hace falta."
[ -f .env.prod.example ] || die "Falta .env.prod.example"

umask 077
cp .env.prod.example .env
chmod 600 .env

set_key() {
  # Valores hex o rutas sin '|': seguros como reemplazo de sed.
  sed -i "s|^$1=.*|$1=$2|" .env
}

# hex: sin + / = ni $, así caben en DATABASE_URL y compose no los interpreta.
for k in DB_ROOT_PASSWORD DB_MIGRATOR_PASSWORD DB_APP_PASSWORD; do
  set_key "$k" "$(openssl rand -hex 32)"
done
for k in JWT_ACCESS_SECRET BOOKING_FORM_SECRET IP_HASH_SECRET; do
  set_key "$k" "$(openssl rand -hex 48)"
done
# Exactamente 32 bytes (64 caracteres hex): clave AES-256 para el secreto TOTP del admin.
set_key MFA_ENC_KEY "$(openssl rand -hex 32)"
set_key BACKUP_DIR "$HOME/backups/fersua-booking"

log ".env creado (chmod 600) con secretos nuevos."
cat <<'EOF'

Falta completar a mano (nano .env):
  SMTP_PASS           clave del buzón no-reply@fersuastudio.com, entre comillas simples
  ADMIN_NOTIFY_EMAIL  tu correo para avisos (opcional)

Después:
  bash scripts/check-env.sh
  Guarda una copia de .env en tu gestor de contraseñas.
EOF
