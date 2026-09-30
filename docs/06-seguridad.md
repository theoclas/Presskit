# 06 · Seguridad de la infraestructura

Resumen del modelo; el detalle está en `docs/00-plan.md` y `docs/diseno/06-critica-seguridad.md`.

## Exposición

- **Un solo puerto publicado**: el edge, y solo en `127.0.0.1:8090`. El único acceso desde internet es
  el nginx del host (TLS con certbot).
- **Lección aprendida (Dashboard):** Docker escribe sus propias reglas de iptables y **se salta ufw**.
  Un `ports: "8080:8080"` queda abierto a internet aunque ufw diga lo contrario. Por eso todo puerto
  va con `127.0.0.1:` delante, y la CI (`npm run ci:compose`) falla si otro servicio publica puertos.
- La db está en una red `internal` (sin salida a internet) y sin puertos.
- Recomendado en el host: un `default_server` que responda `444` a hosts desconocidos.

## Contenedores

- api como `node` (uid 1000), edge como nginx sin root (uid 101).
- `read_only`, `tmpfs` en `/tmp`, `cap_drop: ALL`, `no-new-privileges`, límites de memoria, CPU y procesos.
- El edge monta solo `public/` del volumen de medios y en solo lectura: lo de perfiles no aprobados
  (`private/`) nunca se sirve.
- Logs con rotación (10 MB × 5 por servicio).

## IP real y límites

```
visitante ─► nginx host (X-Real-IP = $remote_addr) ─► edge (confía solo en 172.30.90.1) ─► api (trust proxy = 172.30.90.0/24)
```

- El host y el edge **sobrescriben** `X-Forwarded-For`: lo que mande el cliente se ignora.
- El edge limita por IP (login, formularios, api, páginas) de forma holgada por el CGNAT de los móviles;
  el api aplica los límites finos (por usuario, por perfil). Los límites del edge se aplican antes de
  la microcaché: una respuesta guardada también cuenta.
- Si algún día se pone Cloudflare delante, hay que cambiar a `CF-Connecting-IP` y sus rangos.

## Cabeceras

- El **edge es el único dueño** de CSP y demás cabeceras de seguridad (el api tiene el CSP de helmet
  apagado y el edge oculta las del api): nunca salen dos CSP.
- CSP: `default-src 'self'`, sin scripts de terceros, `frame-ancestors 'none'`. Los medios llevan
  `default-src 'none'; sandbox` y `nosniff`.
- Redirecciones siempre relativas (`absolute_redirect off`).
- HSTS lo pone el host (certbot `--hsts`), sin `includeSubDomains`: `dashboard.`, `corporaciondestellos.`
  y los demás subdominios viven en otros servidores y no deben quedar obligados a HTTPS por este.

## Microcaché del edge (M4)

Cada visita a `/<slug>` arma el shell con una consulta a la BD, y el VPS tiene 1 vCPU. El edge guarda
las respuestas públicas unos segundos (`deploy/edge/snippets/microcache.conf`): una ráfaga de visitas
llega al api una vez cada 10 s.

- **Qué se guarda:** 200 y 301 durante 10 s, 404 durante 5 s, y solo de `/`, `/<slug>` (shell),
  `/api/public/djs`, `/api/public/djs/<slug>`, `/api/public/genres`, `/sitemap.xml` y `/robots.txt`.
- **Qué nunca:** `booking-token` (un token por visita, `no-store`), `booking-requests`, `tickets` (y su
  token), `/api/auth/*`, `/api/me/*`, `/api/admin/*`, las subidas, `/_preview`, los medios y los
  estáticos (esos ya tienen su propio `Cache-Control`).
- **Por qué no puede filtrar datos de nadie:**
  - Esos locations usan `proxy-api-public.conf`: el api no recibe cookies y ningún `Set-Cookie` sale.
    La respuesta es la misma para todos los visitantes.
  - Con cabecera `Authorization`: `BYPASS`, ni se lee ni se guarda.
  - Una respuesta con `Set-Cookie`, con `Cache-Control: no-store` o `private`, o con
    `X-Accel-Expires: 0` no se guarda. `microcache.conf` ignora el `Cache-Control` del api para imponer
    sus 10 s (el shell manda `no-cache` para el navegador), así que el `no-store`/`private` se revisa
    aparte con `$edge_upstream_nostore` (`nginx.conf`).
- **Contra el envenenamiento:** la clave es esquema + host + URI normalizada + query, y cada location
  con caché tiene un `rewrite ... break` para que el api reciba exactamente esa URI. Sin eso, nginx le
  pasa la URI cruda (`//api/public/djs`, `/api/public/%64js`): el api podía responder 404 y ese 404
  quedaba guardado bajo la URL buena para todos.
- **Contra el relleno:** todos los locations con caché descartan la query del visitante (`fbclid`,
  `utm_*`, `?x=<azar>`) con el `?` final del `rewrite`, así que no se multiplican las entradas ni se
  salta la caché para llegar a la BD (la CI lo exige). Los límites de tasa van antes de la caché (un `HIT` también cuenta), el
  tope es de 16 MB en el tmpfs de `/tmp` (32 MB, que también guarda los temporales de nginx y cuenta
  en los 64 MB del contenedor) y con `inactive=60s` solo queda lo pedido en el último minuto.
- **Si el api se cae** o reinicia (deploy), el edge sirve la última copia (`STALE`) en vez del error; sin
  copia, la SPA sola (`@spa`).
- **Cabeceras:** las de seguridad son las mismas en `MISS` y en `HIT`. `X-Cache-Status` dice qué pasó:
  `MISS`, `HIT`, `EXPIRED`, `UPDATING`, `STALE` o `BYPASS` (y no aparece donde no hay caché). El log
  del edge lo repite al final de cada línea (`cache=HIT`, `cache=-` donde no hay caché):
  `docker compose logs edge | grep -c 'cache=HIT'`.
- **Lo que se acepta:** un cambio del DJ o del admin, incluida una suspensión, tarda hasta 10 s en
  verse en la página pública (más si el api está caído, porque se sirve la copia). Si urge:
  `docker compose restart edge` vacía la caché.
- **CI:** `npm run ci:compose` falla si la caché aparece en otro location (o en booking-token,
  booking-requests o tickets), si falta el `rewrite`, `X-Cache-Status`, el bypass de `Authorization` o
  el bloqueo de `Set-Cookie`/`no-store`, si algún tiempo pasa de 10 s o si el tope no cabe en el tmpfs.

## Dominio definitivo (M4)

Decisión del 2026-09-30: la app vive de forma definitiva en `booking.fersuastudio.com` y
`fersuastudio.com` (con Allset) se queda en Hostinger. No hay cambio de DNS. Pasar de beta a
indexable está en `docs/05-cambio-dns.md`. Lo que toca la seguridad:

- Un solo vhost en el host (`deploy/host-nginx/booking.conf`); no hay vhost del dominio principal ni
  redirecciones entre dominios. Las cookies (`__Host-rt`) siguen atadas a `booking.`.
- El `X-Robots-Tag: noindex` del vhost y `SEO_INDEXABLE=false` se quitan juntos cuando Fernando decida
  indexar; HSTS sigue sin `includeSubDomains`.
- **Sin reglas para Allset ni `/pedido`:** en booking son una ruta más: el shell responde 301 a la
  versión en minúsculas (`/Allset` → `/allset`) y después 404 (con `noindex`). `npm run ci:compose` falla si alguien agrega una regla propia para esas URLs o para
  `/DiannMakinne` y `/Molly`, que pueden llegar a ser slugs de DJs.

## Datos del art. 53 y PQRS (M4)

- **Registros legales:** la lista del admin no trae documento, dirección ni teléfonos. El detalle y la
  entrega a un solicitante (`disclose-dj`) piden **step-up** (contraseña + código): una sesión robada o
  un XSS en el admin no puede leer los documentos en lote. El detalle además tiene su propio límite
  (30 cada 10 min) y cada vista y cada entrega quedan en la auditoría, sin valores.
- **Perfil borrado:** `disclose-dj` no busca el registro conservado por el slug del ticket (un slug
  liberado puede ser de otro DJ después): responde `LEGAL_RECORD_MISSING` y el admin lo busca a mano.
- **PQRS:** solo el honeypot se guarda como spam sin avisar. Pasado un tope diario (por IP o total)
  quien escribe recibe un 429 con el correo de contacto: una PQRS con plazo legal nunca se guarda en
  silencio donde el admin no la ve.

## Copia externa de los respaldos (M4)

- **Protege de:** perder el disco o el VPS. La copia sale cifrada (restic, clave que solo está en el
  `.env` del VPS y en el gestor de contraseñas de Fernando): Google o Backblaze ven bloques cifrados.
- **No protege de:** alguien que tome el usuario `deploy` del VPS. Ahí están la clave de restic y el
  acceso a Drive (o la llave de B2), porque cada noche se sube y se borra lo viejo: puede leer y
  borrar también la copia externa. Para ese caso, la copia fría ocasional en el PC de
  `docs/04-backups.md` («Qué protege y qué no») o, con B2, una llave sin permiso de borrar.
- El token de rclone (`rclone.conf`) da acceso solo a lo que rclone creó en el Drive (`drive.file`):
  fuera del repo, `chmod 600`.
- Los logs de los trabajos del cron (`backup.log`, `offsite.log`, `drill-cron.log`, `watchdog.log`) no
  llevan datos personales y el vigilante los recorta (1 MB, últimas 5.000 líneas).

## Base de datos

- Dos usuarios: el **migrador** (`MYSQL_USER`, todo sobre la base) solo lo usa el servicio `migrate`;
  el **de la app** solo tiene SELECT/INSERT/UPDATE/DELETE. El api nunca recibe la clave root ni la del migrador.
- MySQL aplica las claves solo al crear el volumen. Para rotar una después:

  ```bash
  docker compose exec db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD"'
  -- ALTER USER 'fersua_app'@'%' IDENTIFIED BY '<nueva>';
  ```

  y actualiza `.env` + `docker compose up -d api`.

## Secretos

- Todo en `.env` del VPS (`chmod 600`), generado con `openssl rand -hex` por `init-env.sh`, con copia en
  tu gestor de contraseñas. Nunca en git, en imágenes ni en respaldos.
- `.dockerignore` deja fuera `**/.env*`, `node_modules`, claves y respaldos.
- **Ninguna variable `ADMIN_*`** (salvo `ADMIN_NOTIFY_EMAIL`, que es solo un correo). El admin se crea
  con una CLI interactiva con entrada oculta (M2); el api se niega a arrancar si encuentra otra `ADMIN_*`.
- `MFA_ENC_KEY` cifra el TOTP del admin: si se pierde, hay que reconfigurar el 2FA por CLI.
- gitleaks corre en la CI. Si un secreto llega a git: rótalo (no basta con borrarlo del historial).

## Dependencias

- Un solo `package-lock.json`, `npm ci` siempre.
- `npm audit --omit=dev --audit-level=high` bloquea la CI.
- **Override de `deepmerge-ts`** en el `package.json` raíz: Prisma 6.19 (`@prisma/config`) trae la
  7.1.5, que tiene un aviso alto (GHSA-ggr8-5vv4-36mx, agotamiento de pila). El override fuerza la 8.x.
  Cuando se actualice Prisma, revisa con `npm explain deepmerge-ts` si ya trae la 8 y quita el override.
- Dependabot semanal con 5 días de espera. Las actualizaciones de `sharp` (procesa imágenes de
  usuarios) se revisan y despliegan rápido.

## El usuario `deploy`

Estar en el grupo `docker` equivale a ser root. El SSH de `deploy` debe ser solo con llave, y las apps
de pm2 no deberían correr como `deploy`. Mantén Docker actualizado (28+ bloquea el acceso desde la
LAN a puertos publicados en loopback).

## Incidentes

Si hay una fuga de datos personales, la Ley 1581 obliga a reportarla a la SIC. Pasos mínimos: rotar
secretos, revisar `docker compose logs`, la tabla de auditoría y los logs de nginx del host
(`/var/log/nginx/fersua-booking.*.log`), y restaurar desde un respaldo limpio si hace falta.
