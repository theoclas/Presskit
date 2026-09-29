# 05 · Cambio al dominio principal (fersuastudio.com)

Hoy `fersuastudio.com` es el sitio estático del hosting compartido (IP `195.179.239.107`). Este cambio
lo mueve al VPS (`177.7.40.130`) y deja `booking.` como alias que redirige 301.

> ⚠ Después del cambio, `/Allset`, `/pedido`, `/DiannMakinne` y `/Molly` **dejan de existir** en
> fersuastudio.com. Allset (y lo que quieras conservar) debe quedar alojado en otro sitio antes.

## T-48 h [hPanel]

- [ ] `dig NS fersuastudio.com +short` → la zona está en Hostinger.
- [ ] Captura o exporta toda la zona DNS (para poder volver).
- [ ] Baja el TTL a `300` en el A del dominio, el AAAA y `www`.
- [ ] Si el CDN de Hostinger está activo para el sitio, desactívalo.

## T-24 h

- [ ] **[hPanel]** Respalda `public_html` (comprimir y descargar) y déjalo intacto en Hostinger: es el plan B.
- [ ] Decide dónde quedan Allset, DiannMakinne y Molly (p. ej. un subdominio en el hosting compartido).
- [ ] **[VPS sudo]** Agrega el vhost del dominio (no hace nada mientras el DNS apunte a Hostinger):

  ```bash
  cd /home/deploy/apps/fersuastudio-booking
  sudo cp deploy/host-nginx/apex.conf /etc/nginx/sites-available/fersua-booking-apex.conf
  sudo ln -s /etc/nginx/sites-available/fersua-booking-apex.conf /etc/nginx/sites-enabled/
  sudo nginx -t && sudo systemctl reload nginx
  ```

- [ ] **[VPS deploy]** Borra los datos de prueba de la beta (DJs, usuarios y solicitudes de prueba).
- [ ] Respaldo fuera del VPS funcionando (`docs/04-backups.md`).

## T0

1. **[hPanel] DNS**
   - [ ] `A` de `fersuastudio.com` (`@`) → `177.7.40.130`.
   - [ ] **Borra el `AAAA` de Hostinger.** Si se queda, quien entra por IPv6 (común en móviles en
     Colombia) sigue viendo el sitio viejo. Solo pon un AAAA al VPS si tiene IPv6, nginx escucha en
     `[::]` y el firewall lo permite.
   - [ ] `www` → `CNAME` a `fersuastudio.com` (si hoy es un A a Hostinger, reemplázalo).
   - [ ] **No toques** MX, el TXT de SPF, los CNAME de DKIM, `_dmarc`, `autodiscover`/`autoconfig`,
     `dashboard`, `corporaciondestellos` ni `booking`.
2. Espera a que el DNS autoritativo responda la IP nueva (1-2 min):
   `dig +short fersuastudio.com @<ns1 de la consulta NS>` → `177.7.40.130`.
3. **[VPS sudo]** Certificado del dominio y `www`:

   ```bash
   sudo certbot --nginx -d fersuastudio.com -d www.fersuastudio.com --redirect --hsts
   sudo nginx -t && sudo systemctl reload nginx
   ```

4. **[VPS deploy]** En `.env`: `PUBLIC_URL=https://fersuastudio.com` y `SEO_INDEXABLE=true`. Luego:

   ```bash
   bash scripts/check-env.sh && docker compose up -d api
   ```

   Las sesiones de `booking.` se cierran (las cookies son del host): toca volver a entrar.
5. **[VPS sudo]** En el bloque 443 de `booking.fersuastudio.com` (el que creó certbot en
   `/etc/nginx/sites-available/fersua-booking.conf`) cambia el `location /` por:

   ```nginx
   location / { return 301 https://fersuastudio.com$request_uri; }
   ```

   Y quita el `X-Robots-Tag` del bloque del dominio principal si lo copiaste. `sudo nginx -t && sudo systemctl reload nginx`.

## Verificación

```bash
D=https://fersuastudio.com
curl -sI http://fersuastudio.com | grep -iE '^HTTP|^location'          # 301 a https
curl -sI https://www.fersuastudio.com | grep -iE '^HTTP|^location'     # 301 a https://fersuastudio.com/
curl -sI $D/ | grep -iE '^HTTP|strict-transport|x-robots'              # 200, HSTS, SIN X-Robots-Tag
curl -sI $D/MacflyMikebran | grep -iE '^HTTP|^location'                # 301 /macfly-mike-bran
curl -sI "$D/Eventos/MacflyMikeBran/14%20Nov.html" | grep -iE '^HTTP|^location'
curl -sI https://booking.fersuastudio.com/macfly-mike-bran | grep -i '^location'   # al dominio principal
curl -s  $D/robots.txt                                                  # ya no dice Disallow: /
dig MX fersuastudio.com +short                                         # igual que antes
```

- [ ] `/api/health` muestra la versión esperada; login y solicitud de booking funcionan.
- [ ] Un correo de restablecimiento llega con enlace al dominio principal y SPF/DKIM/DMARC en pass.
- [ ] Enviar y recibir con tu buzón sigue funcionando.
- [ ] Prueba desde datos móviles (otro DNS). Si dejaste AAAA: `curl -6 -sI $D`.
- [ ] Vista previa de WhatsApp correcta, SSL Labs A.
- [ ] Google Search Console: agrega la propiedad y envía `https://fersuastudio.com/sitemap.xml`.

## Volver atrás

A del dominio otra vez a `195.179.239.107` y restaura el AAAA de Hostinger. `public_html` sigue
intacto; con TTL 300 el cambio tarda unos 5 minutos.

## T+48 h

- Sube los TTL a 3600-14400.
- No borres `public_html` en 2-4 semanas.
- No canceles el plan de hosting sin confirmar que el correo no depende de él.
