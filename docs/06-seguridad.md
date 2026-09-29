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
  el api aplica los límites finos (por usuario, por perfil).
- Si algún día se pone Cloudflare delante, hay que cambiar a `CF-Connecting-IP` y sus rangos.

## Cabeceras

- El **edge es el único dueño** de CSP y demás cabeceras de seguridad (el api tiene el CSP de helmet
  apagado y el edge oculta las del api): nunca salen dos CSP.
- CSP: `default-src 'self'`, sin scripts de terceros, `frame-ancestors 'none'`. Los medios llevan
  `default-src 'none'; sandbox` y `nosniff`.
- Redirecciones siempre relativas (`absolute_redirect off`).
- HSTS lo pone el host (certbot `--hsts`), sin `includeSubDomains`.

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
