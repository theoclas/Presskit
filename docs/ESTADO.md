# Estado del proyecto y cómo continuar

> Documento de continuación. Léelo primero al retomar (persona o Claude).
> Última actualización: 2026-09-29. **M2 terminado**: revisado, corregido y commiteado ("feat: M2 — login con 2FA y panel de administración"). Falta subirlo y desplegarlo.

## Qué es
Plataforma de booking de DJs de **Fersua Studio**: cada DJ (o dúo) arma su página con la plantilla de
Mac Fly & Mike Bran, recibe solicitudes y las gestiona. Un único admin (Fernando) aprueba y administra.
El plan aprobado, con todas las decisiones, está en `docs/00-plan.md`: **manda sobre todo lo demás**.
Los diseños detallados están en `docs/diseno/01…11`. El contrato de M2 está en `docs/api-m2.md`.

- **Repo:** https://github.com/theoclas/Presskit (rama `main`, **público**, sin secretos).
- **Carpeta local:** `C:\Fernando\Desarrollo\hostinger\fersuastudio-booking`.
- **Sitio viejo, solo lectura, fuente de la semilla:** `C:\Fernando\Desarrollo\hostinger\public_html`.
- **VPS:** `ssh -i ~/.ssh/fersua_vps_ed25519 deploy@177.7.40.130`. Ubuntu 24.04, 1 vCPU, 3,8 GB, swap de 2 GB, IPv6 `2a02:4780:75:e4cb::1`.
  - Ya corren Dashboard, HabitFer y Wandy: no tocarlos.
  - `deploy` tiene sudo con contraseña: lo usa Fernando.
  - Docker de Ubuntu **sin buildx**: el Dockerfile evita las funciones de BuildKit.

## Hitos (avance total aprox. 70 %)
| Hito | Estado |
|---|---|
| **M0** Fundaciones | ✅ Hecho y subido (`7a3c321`) |
| **M1** Sitio público + semilla de Mac Fly + legal + infraestructura | ✅ Hecho, subido (`1235f4c`, `b19e6f1`) y **EN PRODUCCIÓN** |
| **M2** Auth con 2FA + panel admin | ✅ Hecho, revisado y commiteado. **Falta push y despliegue** |
| **M3** Registro y autoservicio de DJs | ⏳ Siguiente |
| **M4** Endurecimiento + cambio de DNS del dominio principal | ⏳ Pendiente |

## Producción (M1)
- **https://booking.fersuastudio.com**, con HTTPS por certbot (vence el 2026-12-28 y se renueva solo), `noindex` mientras sea beta.
- **VPS:** `~/apps/fersuastudio-booking`, proyecto compose `fersua-booking` (db, migrate, api, edge). El edge escucha en `127.0.0.1:8090`; el vhost del host es `/etc/nginx/sites-available/fersua-booking.conf`.
- **Versión desplegada:** `b19e6f1`. Semilla cargada: 27 géneros y Mac Fly & Mike Bran (APROBADO, sin dueño). Ya hay un respaldo manual.
- **`.env` del VPS** (chmod 600, nunca en git): secretos aleatorios y la clave SMTP real de `no-reply@fersuastudio.com`, verificada contra Hostinger.
- **Actualizar:** `cd ~/apps/fersuastudio-booking && bash scripts/deploy.sh` (git pull, build clásico, migraciones y salud; si falla, vuelve atrás solo).

## M2 — qué quedó
| Parte | Carpetas |
|---|---|
| Auth: login por usuario, refresh `__Host-rt` (`rt` en desarrollo), bloqueos, 2FA TOTP con códigos de recuperación, step-up, guards globales, correo | `api/src/auth`, `api/src/mail`, `api/src/common/guards` |
| CLI del admin: `admin:create` interactivo, `admin:reset-password`, `admin:unlock`, `admin:reset-mfa` | `api/src/cli/commands` |
| Editor de perfiles para dueño y admin, subida de medios, URLs firmadas y ciclo de vida (aprobar, rechazar, suspender, asignar dueño, borrar) | `api/src/profiles`, `api/src/media` |
| Operaciones del admin: usuarios (con cambio de correo), solicitudes, PQRS con vencimientos y aviso por correo, auditoría, géneros y estadísticas | `api/src/admin`, `api/src/tickets` |
| Web: `/login` con 2FA, `/cambiar-clave`, cliente http con refresh y panel admin en Ant Design (oscuro) | `web/src/auth`, `web/src/lib/http.ts`, `web/src/admin` |
| Web: editor de perfiles (pestañas; en el teléfono, lista de secciones) y `/_preview` | `web/src/admin/profiles`, `web/src/editor-kit`, `web/src/public/pages/PreviewPage.tsx` |
| Compartido: transiciones de estado, `normalizeDocNumber`, cabeceras y rutas de auth, límites del admin, festivos de Colombia | `packages/shared/src` |

**Migración nueva:** `20260929230000_m2_review_fixes` (contador de 2FA por usuario y retención del registro del art. 53). `deploy.sh` la aplica sola.

**Revisión de seguridad y requisitos, corregida en el mismo commit:**
- **2FA del admin:** los códigos malos se cuentan por usuario (no por `mfaToken`), se auditan (`security.mfa_failed`, `auth.mfa_challenge`), avisan por correo y, desde el 3.º seguido, pausan el 2FA 15·2^(n−3) min (máx. 4 h), salvo en el navegador ya conocido. `admin:unlock` quita la pausa.
- **Cookie de dispositivo conocido** atada a `tokenVersion`: cambiar o restablecer la contraseña, o cerrar todas las sesiones, la invalida. Candados en proceso separados por flujo (un login anónimo ya no hace fallar el 2FA ni el step-up).
- **Subidas:** cupo (3 en el api, 2 por usuario), Content-Length y cuota se revisan **antes** de leer el cuerpo; el edge limita 3 subidas simultáneas por IP. Una ráfaga de 30 subidas de 9,8 MB ahora sube la memoria del api ~44 MB (antes ~190 MB).
- **Logs sin datos personales:** api y edge registran la ruta sin query string (búsquedas del admin, firmas de vista previa); el nginx del host tiene un formato nuevo (ver pendientes). La clave del límite IPv6 del edge agrupa bien los /64 comprimidos.
- **Producción:** el api no arranca con secretos de ejemplo, sin azar o repetidos (`check-env.sh` también lo revisa).
- **Visibilidad y datos:** suspender la cuenta de un DJ avisa que su página deja de verse; borrar la cuenta suspende su perfil aprobado; borrar un perfil conserva 12 meses su registro del art. 53 (job diario de purga) y se niega si hay reportes o solicitudes de datos abiertos; reactivar exige el registro legal; no se asigna un perfil a una cuenta suspendida; las lecturas de datos legales del admin se auditan.
- **Admin:** insignia y correo por cada PQRS nueva; cambio de correo de un DJ (con step-up); aviso de perfiles publicados sin datos legales (Mac Fly lo tiene); aprobar muestra lo que le falta a la página; editar y duplicar fechas archivadas; auditoría en español; íconos de las redes; clave temporal vencida; enlace de cada DJ a sus solicitudes; textos que ya no prometen cosas de M3.
- **PQRS:** los días hábiles descuentan los festivos de Colombia (calculados, sin tabla que mantener).

**Verificación final (2026-09-29):** shared 41 pruebas; api 359 unitarias (35 suites) y 75 e2e (6 suites); web 134 (21 archivos); `ci:bundle` y `ci:compose` en verde; imágenes `api` y `edge` compiladas con el builder clásico. Prueba de humo contra el api compilado y revisión en el navegador (resumen, editor en 390 px, fechas archivadas, redes con íconos, auditoría) sin errores de consola.

### Pendiente, en este orden
1. **Push de M2** (lo hace el agente principal; los subagentes lo tienen bloqueado).
2. **Desplegar en el VPS:** `cd ~/apps/fersuastudio-booking && bash scripts/deploy.sh` (compila api y edge y aplica la migración nueva).
3. **Admin real, lo hace Fernando por SSH** (paso a paso en `docs/02-primer-despliegue.md`, sección G):
   `cd ~/apps/fersuastudio-booking && docker compose run --rm -it api node dist/cli/main.js admin:create`
   Pide usuario (`fersua`), correo y contraseña oculta de 12+ caracteres, muestra el QR para Google Authenticator, pide un código para confirmar e imprime 10 códigos de recuperación **una sola vez**.
4. **Log del nginx del host sin query string** (sudo, una vez; detalle en `docs/02-primer-despliegue.md`, sección E):
   `sudo cp deploy/host-nginx/conf.d/fersua-booking-log.conf /etc/nginx/conf.d/`, agregar ` fersua_booking` a los `access_log` de `/etc/nginx/sites-available/fersua-booking.conf`, `sudo nginx -t` y reload.
5. Desde `/admin`: cargar el registro legal (art. 53) de Mac Fly (el resumen lo marca en rojo) y sus fechas nuevas.

### Siguiente hito: M3 (registro y autoservicio de DJs)
- Registro abierto con verificación de correo, recuperación de contraseña y panel `/panel` reutilizando el editor (`EditorScopeProvider` con actor `owner`; hoy `/panel` muestra "Tu cuenta está lista").
- Hace falta: `GET /api/me/genres` (géneros activos con id para el dueño), onboarding cuando `/api/me/profile` responde 404 `NO_PROFILE`, avisos por correo de solicitudes nuevas (`notifyByEmail` ya se guarda) y el motivo de rechazo/suspensión visible para el DJ.

### Conocido y aceptado (no frena)
- **Un solo admin en la BD:** no se agregó el CHECK `role = ADMIN ⇔ adminSlot` porque las pruebas e2e crean admins desechables (con `adminSlot` NULL) sobre la BD de desarrollo, que ya tiene al admin real. Lo protegen el índice único, `admin:create` y que ningún endpoint cambia roles. Si algún día las e2e usan una BD propia, se agrega.
- **Registros del art. 53 de perfiles borrados:** se conservan 12 meses, pero todavía no hay pantalla para consultarlos ni el flujo `disclose` del diseño (docs/diseno/11): hoy se leen en la BD. Va en M4.
- **Formulario de PQRS:** falta el token HMAC con tiempo mínimo de llenado (como el de booking). Los avisos al admin los acotan los topes diarios de tickets y el cupo de correo por destinatario. M4.
- El chunk del admin pesa ~1,1 MB (350 kB gzip) y Vite lo advierte; separar antd con `manualChunks` es opcional.

### Cómo retomar
- **Sesión nueva:** decir *"Lee docs/ESTADO.md del proyecto fersuastudio-booking y continúa"* (push/despliegue de M2 si aún no están, o M3).
- **Admin de desarrollo:** en la BD local existe el admin `fersua` con 2FA. Sus credenciales de prueba están en un archivo del temp del sistema (fuera del repo). Si se pierden, se regeneran sin tocar nada más:
  `echo "<clave nueva de 12+>" | npm run cli -w api -- admin:reset-password --password-stdin` y
  `npm run cli -w api -- admin:reset-mfa --totp-secret-out <archivo en el temp>` (escribe el secreto TOTP; bórralo al terminar).
  No usar `admin:create` otra vez: se niega porque ya hay un admin.

## Decisiones clave (resumen)
- **Stack:** NestJS 11 + Prisma 6.19 + MySQL 8.4 en el api; React 19 + Vite 7 en la web; npm workspaces con `packages/shared` (`@fersua/shared`).
- **Cuentas:**
  - Login con usuario + contraseña (JWT de 15 min en memoria, refresh en la cookie `__Host-rt`).
  - Registro abierto, pero el admin aprueba cada perfil.
  - 1 usuario = 1 cuenta DJ.
  - Un solo admin: usuario `fersua`, 12+ caracteres, 2FA TOTP. Se crea con la CLI interactiva en el VPS; nunca va en `.env` ni en git.
  - Acciones delicadas del admin (borrar, reiniciar contraseñas, asignar dueño, cambiar el correo de un DJ) piden contraseña + código otra vez (step-up, vale 5 min).
- **Perfiles (M2):** el admin puede aprobar desde borrador (arma los perfiles él mismo; se le muestra lo que falta); aprobar y reactivar exigen el registro legal del art. 53; suspender solo desde aprobado. Las fotos de perfiles sin aprobar son privadas y se ven con URL firmada de 1 h. Un perfil aprobado se ve si no tiene dueño o si la cuenta del dueño está activa.
- **Formulario:** catálogo fijo de campos. Cada solicitud se guarda y luego abre WhatsApp.
- **Diseño:** plantilla fija + 8 paletas.
- **Imágenes:** WebP con sharp en un volumen Docker.
- **URL:** `fersuastudio.com/<slug>`. Primero `booking.fersuastudio.com`, después el cambio de DNS del dominio principal.
- **Semilla:** solo Mac Fly & Mike Bran, sin dueño, slug `macfly-mike-bran`. Allset queda fuera.
- **Cambios de un DJ aprobado:** salen al instante (auditados).
- **Legal breve (Colombia):** `/privacidad`, `/terminos`, `/terminos-artistas`, `/pqrs`, `/reportar` y pie legal. El registro privado del art. 53 (portal de contacto) es obligatorio antes de publicar un perfil y se conserva 12 meses después de borrarlo. Plazos de PQRS en días hábiles sin festivos.

## Desarrollo local
```bash
docker compose up -d            # MySQL 127.0.0.1:3309 (root/devroot) + mailpit http://127.0.0.1:8025
npm install && npm run build:shared
npm run build -w api && npm exec -w api -- prisma migrate deploy && npm run cli -w api -- seed:genres && npm run cli -w api -- seed:macfly
npm run dev:api                 # http://127.0.0.1:4100/api/health
npm run dev:web                 # http://localhost:5180 (proxy de /api y /media al api)
```
- Admin local: `http://localhost:5180/login` con el admin de desarrollo (ver "Cómo retomar").
- Verificación completa: `npm test -w @fersua/shared`, `npm test -w api`, `npm run test:e2e -w api` (con la BD arriba), `npm test -w web`, `npm run ci:compose`, `npm run ci:bundle` (después de `npm run build -w web`).
- La prueba e2e de `admin:create` se salta sola si la BD ya tiene un admin (la de desarrollo lo tiene).

## Pendientes de Fernando (no frenan el desarrollo)
- **Crear el admin real en el VPS** después de desplegar M2 (`docs/02-primer-despliegue.md`, sección G).
- **Formato del log del nginx del host** sin query string (paso 4 de arriba; `docs/02-primer-despliegue.md`, sección E).
- **`DjLegalInfo` de Mac Fly** (registro privado del art. 53): se carga desde el admin (pestaña "Datos legales"). Mac Fly está publicado sin él: el resumen y el editor lo marcan en rojo, y si se suspende no se puede reactivar sin cargarlo.
- **`ADMIN_NOTIFY_EMAIL`** en el `.env` del VPS (opcional): a dónde llegan los avisos de PQRS nuevas; si está vacío, van al correo del admin.
- **Marcadores legales:** nombre o razón social, NIT o cédula, dirección, correo y teléfono del responsable. Van en `web/src/public/legal/operator.ts` y `docs/legal/`.
- **Fechas actuales de Mac Fly & Mike Bran:** se cargan desde el admin (DJs → Mike Bran & Macfly → Fechas).
- **Confirmar para Mac Fly:** el SoundCloud del dúo, el pie de foto "2024 / 2025" y el texto al compartir.
- **Respaldo nocturno automático:** decidir si se programa el cron del VPS (`deploy/cron/crontab.example`).
- **Seguridad:**
  - La clave del buzón `no-reply@` se escribió en el chat: conviene cambiarla en hPanel y actualizar `SMTP_PASS` en el `.env` del VPS.
  - Opcional: pasar el repo a privado; en ese caso hace falta una deploy key de solo lectura en el VPS.
