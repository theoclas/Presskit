# 02 · Primer despliegue en el VPS (booking.fersuastudio.com)

Etiquetas: **[PC]** tu computador · **[hPanel]** panel de Hostinger · **[VPS sudo]** tú en el VPS con
sudo · **[VPS deploy]** el usuario `deploy` en el VPS (el que ya corre Docker para HabitFer/Dashboard).

Resultado: el sitio en `https://booking.fersuastudio.com`, con Mac Fly & Mike Bran. Es el dominio
definitivo (decisión del 2026-09-30): `fersuastudio.com` y Allset se quedan en Hostinger. Pasar de
beta a indexable está en `docs/05-cambio-dns.md`.

```
Internet ─► nginx del host (:443, certbot) ─► 127.0.0.1:8090 ─► edge (nginx) ─► api ─► db
```

## A. [hPanel] DNS y correo

1. **DNS → Agregar registro**: tipo `A`, nombre `booking`, apunta a `177.7.40.130`, TTL `300`.
   No agregues AAAA (salvo que el paso C2 muestre IPv6 y quieras usarlo).
   Comprueba desde el PC: `nslookup booking.fersuastudio.com 8.8.8.8` → `177.7.40.130`.
2. **Correos → Crear cuenta** `no-reply@fersuastudio.com` con una clave larga (va en `SMTP_PASS`).
   Revisa que SPF y DKIM salgan en verde y agrega DMARC (`docs/07-correo-spf-dkim-dmarc.md`).

## B. [PC] Repo en GitHub

El código va en `github.com/theoclas/Presskit` (rama `main`). Antes del primer despliegue:

```bash
git ls-files -s deploy/mysql/init/01-app-user.sh   # debe decir 100755
# si dice 100644:
git update-index --chmod=+x deploy/mysql/init/01-app-user.sh scripts/*.sh
git commit -m "chore: bit de ejecución en los scripts" && git push
```

Sin el bit de ejecución MySQL "carga" el script con `source` en vez de ejecutarlo. Funciona igual
(está escrito para los dos casos y se probó así), pero ejecutarlo aparte es más limpio. Una vez
en git, `npm run ci:compose` (y la CI) fallan si el bit falta.

## C. [VPS sudo] Preparar el servidor (una vez)

1. **Swap de 2 GB** (el build de la web y del api lo necesita). Si `free -h` muestra swap 0:

   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf && sudo sysctl --system
   ```

2. **IPv6**: `ip -6 addr show scope global`. Anota si hay dirección: solo importa si algún día quieres un AAAA para `booking` (paso A1).
3. **Puerto libre**: `ss -ltnp | grep ':8090 '` no debe imprimir nada.
4. **Docker 26 o más nuevo** (el edge monta el volumen con `subpath`; recomendado 28+):
   `docker version --format '{{.Server.Version}}'` y `docker compose version` (2.26+).
5. **Subredes libres** (el compose fija `172.30.90.0/24` y `172.30.91.0/24`):

   ```bash
   docker network inspect $(docker network ls -q) --format '{{.Name}} {{range .IPAM.Config}}{{.Subnet}} {{end}}' | grep '172\.30\.'
   ```

   No debe imprimir nada. Si otra red ya usa `172.30.x`, avisa antes de seguir: hay que cambiar la
   subred en `docker-compose.prod.yml` y `deploy/edge/nginx.conf` a la vez (`npm run ci:compose` lo revisa).
6. **Salida SMTP**: `nc -vz smtp.hostinger.com 465` → `succeeded`.

## D. [VPS deploy] Código, .env y arranque

1. **Deploy key de solo lectura**:

   ```bash
   ssh-keygen -t ed25519 -N "" -C "deploy@vps presskit" -f ~/.ssh/id_ed25519_presskit
   printf 'Host github-presskit\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/id_ed25519_presskit\n  IdentitiesOnly yes\n' >> ~/.ssh/config
   cat ~/.ssh/id_ed25519_presskit.pub
   ```

   **[PC]** GitHub → Presskit → Settings → Deploy keys → Add deploy key: pega la clave, **sin** "Allow write access".

2. **Clonar**:

   ```bash
   mkdir -p ~/apps && cd ~/apps
   git clone git@github-presskit:theoclas/Presskit.git fersuastudio-booking
   cd ~/apps/fersuastudio-booking
   ```

3. **.env** (secretos aleatorios; solo completas el correo):

   ```bash
   bash scripts/init-env.sh
   nano .env                 # SMTP_PASS='clave del buzón'  y  ADMIN_NOTIFY_EMAIL=tu correo
   bash scripts/check-env.sh
   ```

   Guarda una copia de `.env` en tu gestor de contraseñas. Nunca la subas a git.

4. **Primer despliegue** (10-20 min la primera vez; compila web y api una detrás de otra):

   ```bash
   bash scripts/deploy.sh --first
   ```

5. **Comprobar**:

   ```bash
   docker compose ps                    # db, api y edge "healthy"; migrate "Exited (0)"
   docker compose logs migrate          # "All migrations have been successfully applied"
   curl -s http://127.0.0.1:8090/api/health
   ```

6. **Datos iniciales** (idempotentes, se pueden repetir):

   ```bash
   docker compose run --rm --no-deps api node dist/cli/main.js seed:genres
   docker compose run --rm --no-deps api node dist/cli/main.js seed:macfly
   ```

7. **Respaldos**: `bash scripts/backup.sh manual`, luego `crontab -e` y pega lo de
   `deploy/cron/crontab.example` (ajusta la ruta si tu usuario no es `deploy`). Ver `docs/04-backups.md`.

## E. [VPS sudo] nginx del host y certificado

```bash
cd /home/deploy/apps/fersuastudio-booking
sudo cp deploy/host-nginx/conf.d/fersua-booking-log.conf /etc/nginx/conf.d/
sudo cp deploy/host-nginx/snippets/fersua-booking-proxy.conf /etc/nginx/snippets/
sudo cp deploy/host-nginx/booking.conf /etc/nginx/sites-available/fersua-booking.conf
sudo ln -s /etc/nginx/sites-available/fersua-booking.conf /etc/nginx/sites-enabled/fersua-booking.conf
sudo nginx -t && sudo systemctl reload nginx
curl -sI -H 'Host: booking.fersuastudio.com' http://127.0.0.1/ | head -n 1
sudo certbot --nginx -d booking.fersuastudio.com --redirect --hsts
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run
```

- Deja `listen [::]:80;` solo si los otros vhosts ya escuchan en IPv6.
- Recomendado: un `default_server` que responda `444` a hosts desconocidos (ver comentario en `booking.conf`).
- HSTS queda sin `includeSubDomains` ni `preload` (hay otros subdominios que no son nuestros).
- **Log sin datos personales (desde M2):** `fersua-booking-log.conf` define el formato `fersua_booking`, que escribe la ruta sin la query string (las búsquedas del admin llevan correos y teléfonos). Si el vhost ya estaba instalado (certbot lo modificó, así que no se vuelve a copiar), basta con:
  ```bash
  sudo cp deploy/host-nginx/conf.d/fersua-booking-log.conf /etc/nginx/conf.d/
  sudo sed -i 's|fersua-booking.access.log;|fersua-booking.access.log fersua_booking;|' /etc/nginx/sites-available/fersua-booking.conf
  sudo nginx -t && sudo systemctl reload nginx
  ```

## F. Verificación

```bash
B=https://booking.fersuastudio.com
curl -s  $B/api/health                                             # {"status":"ok","version":"<sha>"}
curl -sI $B/ | grep -iE '^HTTP|strict-transport|x-robots|content-security'
curl -sI $B/macfly-mike-bran | grep -ci content-security-policy    # 1 (un solo CSP)
curl -sI $B/MacflyMikebran | grep -iE '^HTTP|^location'            # 301  location: /macfly-mike-bran
curl -sI $B/MacflyMikebran.html | grep -iE '^HTTP|^location'       # 301  location: /macfly-mike-bran
curl -sI "$B/Eventos/MacflyMikeBran/14%20Nov.html" | grep -iE '^HTTP|^location'  # 301 /macfly-mike-bran#fechas
curl -sI $B/default.php | grep -iE '^HTTP|^location'               # 301  location: /
curl -sI $B/.env | head -n 1                                       # 404
```

- [ ] `http://` redirige a `https://`.
- [ ] Las páginas llevan `X-Robots-Tag: noindex, nofollow` (beta).
- [ ] Abre `/macfly-mike-bran` en el celular, envía una solicitud de prueba: se guarda y abre WhatsApp.
- [ ] La vista previa del enlace en WhatsApp muestra la foto (og:image absoluto).
- [ ] IP real: después de visitar desde el celular, `docker compose logs --tail 5 edge` muestra tu IP
      pública, no `172.30.90.1`.
- [ ] SSL Labs (nota A) y securityheaders.com.

## G. [VPS deploy] Cuenta de administración (M2)

Hay un solo admin y se crea una sola vez, por SSH en el VPS, con la CLI interactiva. La contraseña se
escribe oculta: nunca queda en `.env`, en git ni en el historial de la terminal. Nunca pongas
variables `ADMIN_*` en `.env`: el api se niega a arrancar si las encuentra.

Antes, en el celular: instala Google Authenticator (sirven también Microsoft Authenticator, 1Password
o Aegis).

```bash
cd ~/apps/fersuastudio-booking
docker compose ps        # db, api y edge "healthy" (despliega M2 antes con: bash scripts/deploy.sh)
docker compose run --rm -it api node dist/cli/main.js admin:create
```

La CLI pide, en este orden:

1. **Usuario**: Enter deja `fersua` (se guarda en minúscula; está reservado para el admin).
2. **Correo**: el tuyo. Ahí llega un aviso cada vez que alguien entra al admin desde una red nueva.
3. **Contraseña**: mínimo 12 caracteres, dos veces. No se ve nada mientras escribes (ni asteriscos).
4. **QR**: escanéalo con la app. Si la terminal lo deforma, agrega la cuenta a mano con la URI
   `otpauth://...` que se imprime debajo.
5. **Código de 6 dígitos** que muestra la app, para confirmar que quedó bien configurada.
6. **10 códigos de recuperación** (`XXXX-XXXX`): cópialos ya a tu gestor de contraseñas. Se muestran
   **una sola vez** y cada uno sirve una vez si pierdes el teléfono.

Si ya existe un admin, `admin:create` se niega (hay uno solo): usa los comandos de rescate.

**Primer ingreso:** `https://booking.fersuastudio.com/login` → usuario y contraseña → código de la app
→ llegas a `/admin`. En "DJs" está Mac Fly & Mike Bran para editarlo, cargar fechas y sus datos
legales (art. 53).

**Rescate** (siempre desde el VPS; la cuenta del admin nunca se recupera por correo):

| Situación | Comando |
|---|---|
| Olvidaste la contraseña | `docker compose run --rm -it api node dist/cli/main.js admin:reset-password` |
| Perdiste el teléfono o gastaste los códigos | `docker compose run --rm -it api node dist/cli/main.js admin:reset-mfa` |
| Cuenta bloqueada por intentos fallidos | `docker compose run --rm -it api node dist/cli/main.js admin:unlock` |

- `admin:reset-password` y `admin:reset-mfa` cierran todas las sesiones abiertas del admin;
  `admin:reset-mfa` muestra un QR nuevo y 10 códigos nuevos (los viejos dejan de servir).
- `admin:unlock --username <usuario>` desbloquea también la cuenta de un DJ.
- `node dist/cli/main.js help` lista todos los comandos.

**Comprobar** (desde el PC o el VPS):

```bash
B=https://booking.fersuastudio.com
curl -s -o /dev/null -w '%{http_code}\n' $B/api/admin/stats    # 401: sin sesión no hay admin
curl -sI $B/admin | grep -iE '^HTTP|content-security' | head -n 3  # 200 y un solo CSP
```

- [ ] En el navegador, DevTools → Application → Cookies: `__Host-rt` es HttpOnly, Secure y
      SameSite=Strict (JavaScript no la ve).
- [ ] "Cerrar sesión" (arriba a la derecha) y volver a entrar con usuario, contraseña y código.

## H. Lo que viene después

- **M4** (endurecimiento): sección J. Trae la copia externa, el vigilante y el monitoreo externo
  (`docs/04-backups.md` y `docs/08-monitoreo.md`).
- **Antes de lanzar**: completar los marcadores `[...]` de los textos legales y cargar fechas nuevas de Mac Fly.
- **M3**: registro abierto de DJs, su panel en `/panel` y la recuperación de contraseña por correo.
  Se despliega con un `deploy.sh` normal (no trae migraciones) y el registro se abre aparte (sección I).

## I. [VPS deploy] Abrir el registro de DJs (M3)

Con M3 desplegado, el registro sigue **cerrado** (`REGISTRATION_OPEN=false` por defecto): `/registro`
muestra "El registro está cerrado por ahora" y `POST /api/auth/register` responde 403.

Antes de abrirlo, una revisión única: ningún correo guardado debe tener sintaxis de lista o de
"nombre <buzón>" (desde M3 el api ya no las acepta; esto confirma que no quedó ninguna de antes). Debe
responder `0`:

```bash
cd ~/apps/fersuastudio-booking
docker compose exec db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -N -e "SELECT COUNT(*) FROM User WHERE email REGEXP \"[<>,;:() ]\" OR LOCATE(CHAR(34), email) > 0"'
```

Para abrirlo:

```bash
cd ~/apps/fersuastudio-booking
nano .env                      # REGISTRATION_OPEN=true
                               # (revisa también PUBLIC_URL=https://booking.fersuastudio.com: los
                               #  enlaces de los correos se arman solo con él)
bash scripts/check-env.sh && docker compose up -d api
curl -s https://booking.fersuastudio.com/api/auth/registration   # {"open":true} (caché de 60 s)
```

- [ ] Registrar una cuenta de prueba con un correo propio: llega "Confirma tu correo", el enlace abre
      `/verificar-correo` y pide el clic en "Confirmar mi correo".
- [ ] `/panel`: crear el perfil, completar la lista y "Enviar a revisión". Al admin le llega "Perfil
      enviado a revisión" (a `ADMIN_NOTIFY_EMAIL` o, si está vacío, a su correo).
- [ ] Rechazarlo desde `/admin/djs` con un motivo (al DJ le llega el aviso). Después borrar el perfil
      de prueba (DJs → borrar) y su cuenta (Usuarios → eliminar).

Para cerrarlo otra vez: `REGISTRATION_OPEN=false` y el mismo `docker compose up -d api`. Las cuentas y
perfiles ya creados siguen funcionando; solo se frenan los registros nuevos.

**Señal de alarma:** si en `/admin` → Auditoría aparece "Se agotó un cupo diario de correos"
(`system.mail.cap_reached`) con el cupo `verify`, hubo más de 80 correos de confirmación en el día: casi
seguro una ola de registros falsos. Ese día el registro ya responde "intenta mañana"; conviene cerrarlo
como arriba y revisar las cuentas nuevas en Usuarios.

## J. [VPS deploy] Desplegar M4 (endurecimiento)

Trae la migración `20260930120000_m4_hardening` (spam en tickets y borrado suave de solicitudes del
DJ): `deploy.sh` la aplica sola, después del respaldo automático previo.

Cambios que se notan: el detalle de «Registros legales» pide la contraseña y el código (como la
entrega de datos del DJ); una PQRS que pasa los topes diarios recibe un 429 con el correo de
contacto (ya no se guarda como spam en silencio); los avisos del admin (PQRS nuevas y alertas del
vigilante) van a `ADMIN_NOTIFY_EMAIL` o, vacío, al correo del admin.

```bash
cd ~/apps/fersuastudio-booking && bash scripts/deploy.sh
B=https://booking.fersuastudio.com
curl -s $B/api/health                                                                    # version = el commit nuevo
for i in 1 2; do curl -s -o /dev/null -D - $B/macfly-mike-bran | grep -i '^x-cache-status'; done   # MISS, HIT
curl -s -o /dev/null -D - $B/api/public/tickets/token | grep -iE '^HTTP|^cache-control|^x-cache'  # 200, no-store, sin X-Cache-Status
docker compose exec -T api node dist/cli/main.js ops:alert --kind test --detail "Prueba desde el VPS"   # llega un correo al admin
```

- Las páginas públicas quedan en la microcaché del edge 10 s: un cambio del DJ (o una suspensión)
  tarda hasta 10 s en verse. Si urge: `docker compose restart edge`.
- Un formulario de booking abierto antes del despliegue falla una vez con "vuelve a enviar" (el token
  cambió de formato); la web pide uno nuevo sola.

**Después, en este orden** (cada paso está en su guía):

1. **Crontab:** `crontab -e` y agrega las líneas nuevas de `deploy/cron/crontab.example` (copia externa
   a las `45 8` y vigilante cada 10 min). La del vigilante, **solo con M4 ya desplegado**: antes el api
   no tiene `ops:alert` y cada aviso fallaría.
2. **Copia externa en Google Drive:** remoto de rclone en tu PC, el archivo al VPS, las líneas
   `OFFSITE_*` en `.env`, `bash scripts/offsite-backup.sh manual` y
   `bash scripts/restore-drill.sh --from-offsite` (`docs/04-backups.md`, "Copia fuera del VPS"). La
   política de privacidad publicada con M4 ya nombra a Google Drive (§5): no actives la copia con un
   proveedor distinto sin cambiar antes la política.
3. **Monitoreo externo:** los dos monitores de UptimeRobot y los tres checks de healthchecks.io, con sus
   URLs en `.env` (`docs/08-monitoreo.md`). **`MONITOR_HEALTHCHECK_URL` es obligatorio:** es lo único
   que avisa si la base de datos se cae (el vigilante no puede mandar el correo sin ella y la
   microcaché puede tapar la caída ante UptimeRobot).
4. `bash scripts/status.sh`: respaldos, copia externa, último ensayo y vigilante en verde.
