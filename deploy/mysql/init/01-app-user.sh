#!/bin/bash
# Crea el usuario de la app, que solo puede leer y escribir filas (SELECT/INSERT/UPDATE/DELETE).
# El que migra es MYSQL_USER: la imagen oficial ya le da todos los permisos sobre MYSQL_DATABASE.
#
# Solo corre la primera vez que se crea el volumen de datos. Cambiar la clave después
# requiere ALTER USER (ver docs/06-seguridad.md).
#
# Sin `set -u` ni `set -e` propios: si el archivo pierde el bit de ejecución, el entrypoint
# de MySQL lo carga con `source` y esas opciones se filtrarían a su propio script.
# Debe tener fin de línea LF y bit de ejecución (git update-index --chmod=+x).

fersua_fail() {
  echo "01-app-user.sh: $1" >&2
  exit 1
}

[ -n "${DB_APP_USER:-}" ] || fersua_fail 'falta DB_APP_USER'
[ -n "${DB_APP_PASSWORD:-}" ] || fersua_fail 'falta DB_APP_PASSWORD'
[ -n "${MYSQL_DATABASE:-}" ] || fersua_fail 'falta MYSQL_DATABASE'

# Los valores van dentro de SQL: se aceptan solo caracteres seguros (los mismos que caben
# sin escapar en DATABASE_URL). init-env.sh genera claves hex.
[[ "$DB_APP_USER" =~ ^[A-Za-z0-9_]{1,32}$ ]] || fersua_fail 'DB_APP_USER solo admite letras, números y _'
[[ "$MYSQL_DATABASE" =~ ^[A-Za-z0-9_]{1,64}$ ]] || fersua_fail 'MYSQL_DATABASE solo admite letras, números y _'
[[ "$DB_APP_PASSWORD" =~ ^[A-Za-z0-9._~-]{16,128}$ ]] || fersua_fail 'DB_APP_PASSWORD debe tener 16+ caracteres [A-Za-z0-9._~-]'

# La clave root va en un archivo temporal y no en la línea de comandos (se vería en ps).
fersua_cnf="$(mktemp)"
chmod 600 "$fersua_cnf"
printf '[client]\nuser=root\npassword=%s\n' "$MYSQL_ROOT_PASSWORD" > "$fersua_cnf"

# En un GRANT, "_" es comodín: fersua_booking también valdría para fersuaXbooking. Se escapa
# igual que hace la imagen oficial con MYSQL_USER. Con sed porque ${var//_/...} trata la barra
# invertida distinto según la versión de bash.
fersua_grant_db="$(printf '%s' "$MYSQL_DATABASE" | sed 's/_/\\_/g')"

mysql --defaults-extra-file="$fersua_cnf" --protocol=socket <<SQL
CREATE USER IF NOT EXISTS '${DB_APP_USER}'@'%' IDENTIFIED BY '${DB_APP_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`${fersua_grant_db}\`.* TO '${DB_APP_USER}'@'%';
FLUSH PRIVILEGES;
SQL
fersua_rc=$?
rm -f "$fersua_cnf"
[ "$fersua_rc" -eq 0 ] || fersua_fail "no se pudo crear el usuario de la app (código $fersua_rc)"
echo "01-app-user.sh: usuario de la app creado con permisos de solo DML"
