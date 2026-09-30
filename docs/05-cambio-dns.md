# 05 · Dominio definitivo: booking.fersuastudio.com

**Decisión del 2026-09-30 (Fernando):** la plataforma de DJs vive de forma definitiva en
`https://booking.fersuastudio.com`. **No hay cambio de DNS del dominio principal**:

- `fersuastudio.com`, `www` y Allset (`/Allset`, `/pedido.html`) se quedan en el hosting compartido
  de Hostinger, tal como están.
- No se crean reglas, redirecciones ni páginas 410 para Allset, `/pedido` ni el sitio viejo. En
  booking esas rutas no tienen nada especial: las atiende el shell como a cualquier slug (301 a
  minúsculas y después 404).
- Nada que tocar en la zona DNS: MX, SPF, DKIM, DMARC, `dashboard.` y `corporaciondestellos.`
  siguen igual.

Lo que queda es **pasar booking de beta (`noindex`) a sitio indexable**, cuando Fernando lo decida.
Etiquetas: **[VPS deploy]** (usuario `deploy`, en `~/apps/fersuastudio-booking`), **[VPS sudo]**
(nginx del host, lo corre Fernando) y **[PC]**.

## Antes de indexar

- [ ] **M4 desplegado** (microcaché del edge) y probado:

  ```bash
  cd ~/apps/fersuastudio-booking && bash scripts/deploy.sh
  B=https://booking.fersuastudio.com
  for i in 1 2; do curl -s -o /dev/null -D - $B/macfly-mike-bran | grep -i '^x-cache-status'; done   # MISS, HIT
  ```

- [ ] **Textos legales definitivos:** los marcadores del responsable (nombre o razón social, NIT o
  cédula, dirección, correo y teléfono) en `web/src/public/legal/operator.ts` y `docs/legal/`.
- [ ] **Datos de prueba de la beta borrados** desde `/admin` (DJs, cuentas y solicitudes de prueba;
  nunca Mac Fly ni el admin). Después, un respaldo fresco y la copia externa al día
  (`docs/04-backups.md`):

  ```bash
  bash scripts/backup.sh manual           # se borra solo a los 20 días (otras etiquetas no rotan igual)
  bash scripts/offsite-backup.sh manual   # si la copia externa ya está configurada
  ```

- [ ] **Monitoreo externo** creado (UptimeRobot y healthchecks.io, `docs/08-monitoreo.md`).
- [ ] `bash scripts/check-env.sh` en verde: con `SEO_INDEXABLE=true` falla si quedan marcadores legales
  sin llenar en `web/src/public/legal/operator.ts`.

## Pasar a indexable

1. **[VPS deploy]** El api deja de mandar `noindex` y `robots.txt` pasa a `Allow: /` con el sitemap:

   ```bash
   cd ~/apps/fersuastudio-booking
   sed -i 's#^SEO_INDEXABLE=.*#SEO_INDEXABLE=true#' .env
   grep -E '^(PUBLIC_URL|SEO_INDEXABLE)=' .env     # PUBLIC_URL=https://booking.fersuastudio.com
   bash scripts/check-env.sh && docker compose up -d api
   ```

2. **[VPS sudo]** Quita el `X-Robots-Tag: noindex, nofollow` del vhost del host (certbot convirtió el
   bloque original en el del 443, así que la línea está ahí):

   ```bash
   sudo grep -n 'X-Robots-Tag' /etc/nginx/sites-available/fersua-booking.conf
   sudo cp /etc/nginx/sites-available/fersua-booking.conf ~/fersua-booking.conf.antes-de-indexar
   sudo sed -i '/X-Robots-Tag/d' /etc/nginx/sites-available/fersua-booking.conf
   sudo nginx -t && sudo systemctl reload nginx
   sudo grep -rn 'X-Robots-Tag' /etc/nginx/sites-enabled/     # sin resultados
   ```

3. La microcaché del edge se renueva sola en 10 s (`robots.txt`, `sitemap.xml` y las páginas). Si hay
   prisa: **[VPS deploy]** `docker compose restart edge` (la caché vive en el tmpfs).
4. **[PC] Google Search Console:** agrega la propiedad `https://booking.fersuastudio.com/` (prefijo de
   URL) o la de dominio `fersuastudio.com`. La de dominio se verifica con un TXT nuevo en hPanel: es un
   registro aparte, **no edites el TXT del SPF**. Envía `https://booking.fersuastudio.com/sitemap.xml`
   y pide la indexación de `https://booking.fersuastudio.com/macfly-mike-bran`.

## Verificación

`curl -I` muestra `HTTP/1.1` o `HTTP/2` según el vhost; los `grep` sirven para los dos.

```bash
B=https://booking.fersuastudio.com

# Indexable: sin X-Robots-Tag, con HSTS, CSP y X-Frame-Options
curl -sI $B/ | grep -iE '^HTTP|^strict-transport|^content-security|^x-frame|^x-robots|^x-cache'
curl -s $B/robots.txt                       # Allow: / y "Sitemap: https://booking.fersuastudio.com/sitemap.xml"
curl -s $B/sitemap.xml | head -5            # URLs con https://booking.fersuastudio.com/
curl -s $B/macfly-mike-bran | grep -oE '<meta name="robots"[^>]*>|<link rel="canonical"[^>]*>|<meta property="og:(url|image)"[^>]*>'
# sin "noindex"; canonical y og:url con https://booking.fersuastudio.com/macfly-mike-bran
curl -s $B/api/health                       # {"status":"ok","version":"<commit desplegado>"}
```

**Microcaché** (`X-Cache-Status`: `MISS` la primera vez, `HIT` durante 10 s, `EXPIRED` al renovarse,
`BYPASS` con `Authorization`, y ausente en lo que nunca se cachea):

```bash
for i in 1 2 3; do curl -s -o /dev/null -D - $B/macfly-mike-bran | grep -i '^x-cache-status'; done
# MISS (o EXPIRED), HIT, HIT
curl -s -o /dev/null -D - $B/api/public/djs | grep -iE '^x-cache-status|^cache-control'
# X-Cache-Status: MISS o HIT; Cache-Control: public, max-age=30 (el del api, para el navegador)
curl -s -o /dev/null -D - -H 'Authorization: Bearer x' $B/api/public/djs | grep -i '^x-cache-status'
# BYPASS
for i in 1 2; do curl -s -o /dev/null -D - $B/api/public/djs/macfly-mike-bran/booking-token | grep -iE '^HTTP|^cache-control|^x-cache-status'; done
for i in 1 2; do curl -s -o /dev/null -D - $B/api/public/tickets/token | grep -iE '^HTTP|^cache-control|^x-cache-status'; done
# 200 y Cache-Control: no-store las dos veces, y NUNCA X-Cache-Status (no pasan por la caché)
```

**URLs viejas dentro de booking** (las únicas redirecciones heredadas que quedan):

```bash
curl -sI $B/MacflyMikebran | grep -iE '^HTTP|^location'                          # 301 -> /macfly-mike-bran
curl -sI $B/MacflyMikebran.html | grep -iE '^HTTP|^location'                     # 301 -> /macfly-mike-bran
curl -sI "$B/Eventos/MacflyMikeBran/14%20Nov.html" | grep -iE '^HTTP|^location'  # 301 -> /macfly-mike-bran#fechas
curl -sIL $B/Allset | grep -E '^HTTP'                                            # 301 (a /allset) y luego 404: sin regla propia
```

**IPv6 de booking:** si el nombre tiene AAAA, el vhost debe escuchar también en IPv6:

```bash
dig +short AAAA booking.fersuastudio.com
# nada, o 2a02:4780:75:e4cb::1 (la IPv6 del VPS) y entonces:
sudo grep -nF 'listen [::]:443' /etc/nginx/sites-available/fersua-booking.conf
curl -6 -sI https://booking.fersuastudio.com/ | head -1    # desde una red con IPv6
```

**El dominio principal sigue en Hostinger** (nada cambió):

```bash
dig +short A fersuastudio.com       # la IP del hosting compartido, no 177.7.40.130
curl -sI https://fersuastudio.com/Allset | head -1
```

- [ ] Vista previa de WhatsApp de `https://booking.fersuastudio.com/macfly-mike-bran` con foto y título.
- [ ] SSL Labs con nota A y securityheaders.com.
- [ ] `docker compose logs --since 15m api edge` sin errores y `bash scripts/status.sh` en verde.

## Volver atrás (dejar de indexar)

1. **[VPS deploy]** `sed -i 's#^SEO_INDEXABLE=.*#SEO_INDEXABLE=false#' .env && bash scripts/check-env.sh && docker compose up -d api`
2. **[VPS sudo]** Restaura el vhost guardado y recarga:

   ```bash
   sudo cp ~/fersua-booking.conf.antes-de-indexar /etc/nginx/sites-available/fersua-booking.conf
   sudo nginx -t && sudo systemctl reload nginx
   ```

3. En Search Console, "Eliminaciones" si hace falta sacar URLs rápido.

## Opcional: enlazar desde el sitio viejo

Solo si Fernando lo pide algún día. Se hace **en Hostinger**, no en el VPS: por ejemplo, un enlace en
la página vieja o dos reglas en el `.htaccess` de `public_html` (respáldalo antes). Ese `.htaccess` ya
usa `mod_rewrite` (`RewriteRule ^([^/]+)$ $1.html`): las reglas van con `RewriteRule` (no `Redirect`,
que es de otro módulo y se aplica en otro orden) **justo después de `RewriteEngine On`**:

```apache
RewriteRule ^MacflyMikebran(\.html)?$ https://booking.fersuastudio.com/macfly-mike-bran [R=301,L,NC]
RewriteRule ^Eventos/MacflyMikeBran/ https://booking.fersuastudio.com/macfly-mike-bran#fechas [R=301,L,NC,NE]
```

Prueba: `curl -sI https://fersuastudio.com/MacflyMikebran.html | grep -iE '^HTTP|^location'` (un solo
301, directo a booking).

Allset y el resto de `public_html` no se tocan.
