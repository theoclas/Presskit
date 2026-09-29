# 02 · Primer despliegue en el VPS (booking.fersuastudio.com)

Etiquetas: **[PC]** tu computador · **[hPanel]** panel de Hostinger · **[VPS sudo]** tú en el VPS con
sudo · **[VPS deploy]** el usuario `deploy` en el VPS (el que ya corre Docker para HabitFer/Dashboard).

Resultado: el sitio en `https://booking.fersuastudio.com`, con Mac Fly & Mike Bran, sin tocar
todavía el dominio principal (eso es `docs/05-cambio-dns.md`).

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

2. **IPv6**: `ip -6 addr show scope global`. Anota si hay dirección: decide el AAAA en el cambio de DNS.
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

## G. Lo que viene después

- **Admin (M2)**: se creará con una CLI interactiva que pide usuario, correo y contraseña con entrada
  oculta y configura el TOTP, algo como
  `docker compose run --rm -it api node dist/cli/main.js admin:create`.
  Nunca pongas `ADMIN_*` en `.env`: el api se niega a arrancar si las encuentra.
- **Monitoreo**: UptimeRobot (gratis) sobre `https://booking.fersuastudio.com/api/health`, y la URL de
  healthchecks.io en `BACKUP_HEALTHCHECK_URL`.
- **Antes de lanzar**: completar los marcadores `[...]` de los textos legales y cargar fechas nuevas de Mac Fly.
