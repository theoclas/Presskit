# Estado del proyecto y cómo continuar

> Documento de continuación. Léelo primero al retomar (persona o Claude).
> Última actualización: 2026-09-30. **M4 en producción** (`412d1b2`): microcaché, PQRS con token, registros legales y **copia externa cifrada en Google Drive activa** (restic, primera instantánea `2b98e772`) + vigilante cada 10 min. Fernando ya guardó la clave de los respaldos. Registro de DJs **cerrado** hasta que Fernando decida abrirlo.

## Decisiones del 2026-09-30 (Fernando)
- **La plataforma de DJs vive definitivamente en `booking.fersuastudio.com`.** No se mueve `fersuastudio.com`: el dominio principal y **Allset se quedan en Hostinger sin tocar**. Nada de reglas ni 410 para Allset o /pedido.
- **Respaldo externo en Google Drive** (restic con backend rclone). Fernando crea el remoto de rclone en su PC; se copia la configuración al VPS.

## Qué es
Plataforma de booking de DJs de **Fersua Studio**: cada DJ (o dúo) arma su página con la plantilla de
Mac Fly & Mike Bran, recibe solicitudes y las gestiona. Un único admin (Fernando) aprueba y administra.
El plan aprobado, con todas las decisiones, está en `docs/00-plan.md`: **manda sobre todo lo demás**.
Los diseños detallados están en `docs/diseno/01…11`. Los contratos del api están en `docs/api-m2.md`, `docs/api-m3.md` y `docs/api-m4.md`.

- **Repo:** https://github.com/theoclas/Presskit (rama `main`, **público**, sin secretos).
- **Carpeta local:** `C:\Fernando\Desarrollo\hostinger\fersuastudio-booking`.
- **Sitio viejo, solo lectura, fuente de la semilla:** `C:\Fernando\Desarrollo\hostinger\public_html`.
- **VPS:** `ssh -i ~/.ssh/fersua_vps_ed25519 deploy@177.7.40.130`. Ubuntu 24.04, 1 vCPU, 3,8 GB, swap de 2 GB, IPv6 `2a02:4780:75:e4cb::1`.
  - Ya corren Dashboard, HabitFer y Wandy: no tocarlos.
  - `deploy` tiene sudo con contraseña: lo usa Fernando.
  - Docker de Ubuntu **sin buildx**: el Dockerfile evita las funciones de BuildKit.

## Hitos (avance total aprox. 97 %)
| Hito | Estado |
|---|---|
| **M0** Fundaciones | ✅ Hecho y subido (`7a3c321`) |
| **M1** Sitio público + semilla de Mac Fly + legal + infraestructura | ✅ Hecho, subido (`1235f4c`, `b19e6f1`) y **EN PRODUCCIÓN** |
| **M2** Auth con 2FA + panel admin | ✅ Hecho, revisado, subido (`31fa48a`) y **EN PRODUCCIÓN**; admin real creado |
| **M3** Registro y autoservicio de DJs | ✅ Hecho, revisado, subido (`fb2027e`, `f055c5d`) y **EN PRODUCCIÓN** (registro cerrado) |
| **M4** Endurecimiento + dominio definitivo en `booking.` (sin cambio de DNS) | ✅ Hecho, revisado, subido (`412d1b2`) y **EN PRODUCCIÓN**; copia a Google Drive y vigilante activos |

## Producción (M1 + M2)
- **https://booking.fersuastudio.com**, con HTTPS por certbot (vence el 2026-12-28 y se renueva solo), `noindex` mientras sea beta.
- **VPS:** `~/apps/fersuastudio-booking`, proyecto compose `fersua-booking` (db, migrate, api, edge). El edge escucha en `127.0.0.1:8090`; el vhost del host es `/etc/nginx/sites-available/fersua-booking.conf`.
- **Versión desplegada:** `412d1b2` (M4), con la migración `m4_hardening` aplicada. Microcaché verificada en vivo (MISS → HIT). Registro cerrado: para abrirlo, `sed -i "s/^REGISTRATION_OPEN=.*/REGISTRATION_OPEN=true/" .env && docker compose up -d api` en el VPS (antes, la verificación de correos guardados de la sección I de `docs/02-primer-despliegue.md`).
- **Respaldos (crontab de `deploy`, UTC):**
  - 08:15, nocturno local (`scripts/backup.sh nightly`);
  - 08:45, copia externa cifrada a Google Drive (`scripts/offsite-backup.sh nightly`, repositorio `rclone:gdrive:fersua-booking-respaldos`);
  - cada 10 min, `scripts/watchdog.sh`, que avisa por correo por disco, respaldo viejo, contenedores, certificado o copia externa.

  Primera copia externa: `2b98e772` (2026-09-30), `restic check` OK. La clave `OFFSITE_RESTIC_PASSWORD` está en el `.env` del VPS y **Fernando guardó una copia fuera del VPS**. La configuración de rclone está en `~/.config/rclone/rclone.conf` (600). Ojo: usa el `client_id` compartido de rclone, que Google retira en 2026; si falla, el vigilante avisa y hay que crear un `client_id` propio (`docs/04-backups.md`). Semilla: 27 géneros y Mac Fly & Mike Bran (APROBADO, sin dueño).
- **Admin:** un solo usuario `fersua` (ADMIN, 2FA TOTP y correo registrado), creado por Fernando con `admin:create` el 2026-09-29. Se entra por https://booking.fersuastudio.com/login. Rescate solo desde el VPS (`admin:reset-password`, `admin:reset-mfa`, `admin:unlock`).
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
1. ~~Push de M2~~ ✅ · ~~Desplegar en el VPS~~ ✅ · ~~Crear el admin real~~ ✅ · ~~Push y despliegue de M3~~ ✅
2. ~~M4: push, despliegue, crontab, copia externa a Google Drive y vigilante~~ ✅ (2026-09-30). Opcional: cuentas de UptimeRobot y healthchecks.io (`docs/08-monitoreo.md`).
3. **Abrir el registro en producción** cuando Fernando decida (`docs/02-primer-despliegue.md`, sección I):
   - antes, la revisión única de correos guardados (una consulta que debe dar `0`, está en la sección I);
   - en el `.env` del VPS poner `REGISTRATION_OPEN=true` y correr `bash scripts/check-env.sh && docker compose up -d api`;
   - confirmar que `PUBLIC_URL=https://booking.fersuastudio.com` (los enlaces de los correos salen de ahí);
   - si la auditoría muestra "Se agotó un cupo diario de correos" (cupo `verify`), cerrar el registro otra vez.
4. **Log del nginx del host sin query string** (sudo, una vez; detalle en `docs/02-primer-despliegue.md`, sección E):
   `sudo cp deploy/host-nginx/conf.d/fersua-booking-log.conf /etc/nginx/conf.d/`, agregar ` fersua_booking` a los `access_log` de `/etc/nginx/sites-available/fersua-booking.conf`, `sudo nginx -t` y reload.
5. Desde `/admin`: cargar el registro legal (art. 53) de Mac Fly (el resumen lo marca en rojo) y sus fechas nuevas.

## M3 — qué quedó (en producción)
Contrato: `docs/api-m3.md`. Tipos nuevos: `packages/shared/src/owner-types.ts`.

| Parte | Carpetas |
|---|---|
| Registro (`/api/auth/register`, 3 casillas, honeypot, `REGISTRATION_OPEN`), verificación del correo con clic explícito, reenvío, olvido y restablecimiento de la contraseña (solo USER; el admin nunca por correo) y re-aceptación de términos (`TermsGuard` en `/api/me/**`, `MeDto.termsOutdated`) | `api/src/auth/account.*`, `api/src/auth/tokens/email-token.service.ts`, `api/src/common/guards/terms.guard.ts` |
| Plantillas de correo de M3: verificar, restablecer, solicitud nueva al DJ (tope de 5 al día), perfil enviado (al admin), aprobado, rechazado, suspendido y borrador por vencer | `api/src/mail` |
| Dueño: onboarding (`POST /api/me/profile`), disponibilidad del slug, géneros, enviar y retirar de revisión (correo verificado → registro legal → checklist), fotos solo con el correo verificado, bandeja de solicitudes, avisos por correo y purgas programadas (borrador 21/30 días, rechazado 30, cuenta sin verificar 14) | `api/src/profiles/owner-*`, `profile-notifier.service.ts`, `api/src/booking/booking-notify.service.ts` |
| Web: `/registro`, `/verificar-correo`, `/recuperar` y `/restablecer` (el token va en `#t=` y se quita de la URL; `no-referrer`) | `web/src/auth` |
| Web: panel del DJ `/panel/*` (términos, banner de correo, onboarding, resumen con checklist, secciones del editor con actor `owner`, solicitudes y cuenta) y `/_preview` para el dueño | `web/src/panel`, `web/src/editor-kit`, `web/src/public/pages/PreviewPage.tsx` |
| Compartido y edge: rutas de auth de M3 en `API_ROUTES`; `verify-email` y `resend-verification` en la zona `auth` del edge; `LIMITS.retention.draftWarnDays` y `rejectedIdleDays`; `MeDto.privacyVersion` | `packages/shared`, `deploy/edge/default.conf`, `scripts/ci/check-compose.mjs` |

**Sin migración nueva:** `EmailToken` y los campos de términos ya existían; el "ya avisado" del borrador es una fila de auditoría.

**Revisión de seguridad y requisitos de M3, corregida (commit aparte):**
- **Purgas:** solo tocan lo que el DJ hizo solo: cuentas que pasaron por `/registro` sin auditoría `admin.user.*` y perfiles sin `admin.profile.*` (rechazar o leer el registro legal no cuenta). Lo que el admin creó, editó, asignó o administró nunca se borra solo; el bloqueo `FOR UPDATE` repite las mismas condiciones.
- **Correo:** `isValidEmail` es un addr-spec estricto (ya no pasan `x<otro@buzón>` ni listas con coma). MailService además exige una sola dirección según el parser de nodemailer y manda sobre SMTP explícito.
- **Cupos de correo por tipo:** alertas de seguridad; "tu contraseña/correo cambió" (cupo propio); restablecer (100 al día y 5 por buzón); confirmar el correo (80 al día); PQRS del admin (nunca los agotan los avisos); avisos. Además:
  - los topes por buzón cuentan `dj+x@` como `dj@`;
  - "olvidé mi contraseña" y "reenviar" no emiten un enlace (ni anulan el anterior) si el correo no va a salir;
  - el registro responde 503 `REGISTRATION_BUSY` sin cupo de confirmaciones, y hay un tope de 20 confirmaciones al día por IP;
  - si un cupo se agota, queda `system.mail.cap_reached` en la auditoría.
- **Cambios del dueño:** 60 cada 10 min por usuario en `/api/me/profile/**` (429; el admin no tiene tope).
- **Slug:** un perfil que nunca se publicó libera su slug viejo (no acapara nombres con redirecciones).
- **Admin:** la clave temporal y la suspensión anulan los enlaces de restablecer pendientes.
- **Correos sin texto del público:**
  - el aviso de solicitud al DJ ya no lleva el nombre del solicitante;
  - el nombre artístico en el correo al admin va sin `. @ : /`;
  - el correo de rechazo usa `rejectedIdleDays`.
- **Resumen de solicitudes:** a las 08:00, quien ayer pasó el tope de 5 avisos y tiene sin leer recibe "Tienes N solicitudes sin leer".
- **Conservación de solicitudes:** job diario 04:30 que borra las de más de 12 meses y el SPAM de más de 30 días (`LIMITS.retention.spamDays`).
- **Legal y avisos:**
  - aviso de privacidad breve en `/registro`;
  - la política §8 y los Términos para Artistas §10 dicen los borrados automáticos;
  - el banner de correo, el de borrador y el de rechazado también lo dicen, igual que el correo de verificación.
- **Mayoría de edad:** las cuentas que creó el admin la declaran al aceptar los términos (`MeDto.ageConfirmed`, `confirmAge`).
- **Registro legal:** la declaración de veracidad del dueño se envía (`truthful`) y queda en la auditoría.
- **Checklist:** en perfiles con dueño, "Escribe el título de la portada" exige un título propio (el de la plantilla es solo un ejemplo en el editor).
- **Teléfono:** el banner de correo es de una línea con "Ver más", y el slug del onboarding usa el prefijo `/`.

**Verificación después de las correcciones (2026-09-29):**
- **Pruebas:** shared 43; api 452 unitarias (42 suites) y 104 e2e (8 suites); web 204 (25 archivos). `ci:bundle`, `ci:compose` e imágenes `api` y `edge` con el builder clásico, en verde.
- **En vivo** (api compilado + vite, a 375 px y en escritorio):
  - `/registro` con el aviso de privacidad antes de las casillas;
  - el banner compacto (124 px; antes unos 270) y el prefijo `/` del slug;
  - el título de la portada pendiente hasta escribirlo; el de la plantilla escrito a mano se guarda;
  - datos legales guardados con `declared: true`;
  - un correo `x<…>` rechazado con 400.
- La BD de desarrollo y mailpit quedaron como antes.

**Verificación de la integración (2026-09-29):**
- **Pruebas:** shared 41; api 432 unitarias (40 suites) y 101 e2e (8 suites, con `auth-m3` y `owner`); web 201 (25 archivos).
- **CI e imágenes:** `ci:bundle` y `ci:compose` en verde; imágenes `api` y `edge` compiladas con el builder clásico (`DOCKER_BUILDKIT=0`).
- **Punta a punta** contra el api compilado + vite (51/51 comprobaciones), en este orden:
  - registro y verificación con el enlace de mailpit;
  - onboarding; la subida de fotos queda bloqueada hasta confirmar el correo;
  - editor y datos legales;
  - enviar a revisión (aviso al admin) y aprobación del admin con 2FA (aviso al DJ);
  - página pública y una solicitud pública (aviso al DJ y bandeja);
  - aislamiento entre dos DJs;
  - olvido y restablecimiento de la contraseña (la sesión anterior deja de servir); el admin no recibe enlaces;
  - re-aceptación de términos.
- **En el navegador:**
  - `/registro` con las 3 casillas (a 375 px, sin scroll horizontal);
  - registro y verificación desde la UI;
  - onboarding y editor en `/panel`;
  - el perfil pendiente en `/admin/djs`.
- **Limpieza:** todos los datos de prueba se borraron.

**Correcciones de la integración:**
- `profiles.e2e-spec` actualizado a las reglas de M3:
  - usuarios con términos aceptados y correo verificado;
  - orden correo → legal → checklist;
  - ya no deja `DjLegalInfo` huérfanos.
- `route-guards` incluye `/auth/registration`.
- Etiquetas de auditoría de M3.
- Texto del aviso por correo en el editor del admin.
- Se quitaron `ComingSoonPage` y `PanelSoonPage`, que ya no se usaban.

## M4 — qué quedó (hecho y revisado; falta desplegar)
Contrato: `docs/api-m4.md`. Migración: `20260930120000_m4_hardening` (`Ticket.isSpam` y `BookingRequest.ownerDeletedAt`); `deploy.sh` la aplica sola. Pasos en el VPS: `docs/02-primer-despliegue.md`, sección J.

| Parte | Dónde |
|---|---|
| PQRS y reportes con token HMAC (2 s a 2 h, un solo uso, no sirve para booking). Solo el honeypot se guarda como spam, sin aviso al admin; pasados los topes diarios (10 por IP sin spam, 200 en total), 429 con el correo de contacto; techo de 1.000 al día | `api/src/tickets`, `api/src/booking/form-token.service.ts`, `web/src/public/legal/TicketForm.tsx`, `web/src/lib/useFormToken.ts` |
| Admin: PQRS sin spam por defecto, filtro y marca de spam, contador de 30 días; «Entregar datos del DJ» (art. 53) con step-up, casilla de verificación (y el aviso de si el correo coincide con una solicitud a ese DJ) y respuesta en texto plano; página «Registros legales» (activos y conservados, sin documento en la lista, detalle con step-up y auditado) | `api/src/admin/legal`, `api/src/admin/tickets`, `web/src/admin/pages/TicketsPage.tsx`, `web/src/admin/pages/LegalRecordsPage.tsx` |
| Borrado suave de solicitudes desde el panel del DJ: el admin la sigue viendo («Oculta por el DJ») hasta la purga de 12 meses | `api/src/profiles/owner-bookings.*`, `web/src/panel/pages/BookingsPage.tsx`, `web/src/admin/pages/BookingsPage.tsx` |
| Microcaché del edge (10 s) en `/`, `/<slug>`, `/api/public/djs*`, géneros, sitemap y robots; nunca en tokens, formularios ni sesión; `X-Cache-Status`; la CI lo vigila | `deploy/edge/nginx.conf`, `deploy/edge/default.conf`, `deploy/edge/snippets/microcache.conf`, `scripts/ci/check-compose.mjs` |
| Copia externa cifrada con restic (Google Drive por rclone; B2 como alternativa), ensayo de restauración y vigilante cada 10 min con avisos por correo (`ops:alert`) | `scripts/offsite-backup.sh`, `scripts/restore-drill.sh`, `scripts/watchdog.sh`, `scripts/lib-offsite.sh`, `api/src/cli/commands/ops-alert.command.ts`, `docs/04-backups.md`, `docs/08-monitoreo.md` |
| ESLint en el api (SQL armado con texto y `console` fuera de la CLI prohibidos) y en la web (HTML crudo, `target=_blank`, hooks); los dos corren en la CI | `api/eslint.config.mjs`, `web/eslint.config.js`, `.github/workflows/ci.yml` |
| Regresión visual con Playwright (página del DJ e index, móvil y escritorio) y comparación con el sitio original | `web/tests/visual`, `docs/visual/README.md` |
| AntD en su propio chunk (`ui-kit`): Vite ya no advierte el tamaño | `web/vite.config.ts` |

**Alineado con la decisión del 2026-09-30 durante la integración:**
- El edge traía un 410 para `/Allset` y `/pedido`, un vhost del dominio principal y la redirección de `booking.` hacia él. Se quitaron `legacy-redirects.conf`, `apex.conf` y `booking-redirect.conf`.
- La CI ahora exige que esas URLs no tengan regla propia: las atiende el shell, que responde 404.
- `docs/05-cambio-dns.md` pasó a ser "Dominio definitivo: booking.fersuastudio.com", que explica cómo pasar de beta a indexable.

**Verificación de la integración (2026-09-30):**
- **Pruebas:**
  - shared 43;
  - api 492 unitarias (46 suites) y 119 e2e (9 suites);
  - web 212 (27 archivos);
  - regresión visual: 3 OK y 2 omitidas (la comparación manual).
- **CI local:** lint de api y web sin problemas, `ci:bundle` OK, `ci:compose` con 230 comprobaciones y migraciones sin drift.
- **En vivo** (api compilado + vite), 34 comprobaciones:
  - token de PQRS con `no-store`; enviar muy rápido da `FORM_TOO_FAST` y reusar el token da `FORM_TOKEN_USED`;
  - el aviso al admin llega a mailpit sin el texto del público;
  - el honeypot se guarda como spam, sin aviso y oculto en la bandeja;
  - borrado suave del DJ: 204 dos veces, una sola auditoría, y el admin la sigue viendo;
  - registros legales: la lista sin documento, el detalle auditado una vez;
  - `disclose-dj` sin step-up da 403; con step-up da 200 y el ticket pasa a "en trámite";
  - en el navegador, `/pqrs` pide el token al enfocar el formulario.
- **Stack de producción desechable** (builder clásico), humo 33/33:
  - salud;
  - `MISS` → `HIT` en `/macfly-mike-bran` y `/api/public/djs`;
  - los tokens nunca pasan por la caché;
  - cabeceras de seguridad una sola vez;
  - `/Allset` sin regla propia.
- **Respaldos contra ese stack:**
  - copia externa en un repositorio local: se crea, la segunda copia sube solo 714 B y lo restaurado es idéntico;
  - ensayo de restauración desde la copia: `OK`;
  - `watchdog.sh --dry-run` y `status.sh` funcionan.
- **Limpieza:** los datos de prueba se borraron.

**Revisión de seguridad y requisitos de M4, corregida en el mismo commit:**
- **Política de privacidad y copia externa (alta):** la §5 nombra la copia cifrada en Google Drive y la
  §8 dice que el plazo de 8 semanas incluye esa copia. Para que la promesa siga siendo cierta:
  - la copia externa lleva solo los dumps nocturnos y manuales (no los semanales ni los `pre-*`);
  - guarda instantáneas por tiempo, una diaria por 14 días y una semanal por 35 (`--keep-within-*`);
  - `prune --max-unused 0` y Drive sin papelera (`RCLONE_DRIVE_USE_TRASH=false`);
  - en el VPS, los manuales duran 20 días y ningún dump pasa de 8 semanas (antes los `pre-deploy` y
    las etiquetas sueltas no vencían);
  - `check-env.sh` avisa si `BACKUP_RETENTION_DAYS` pasa de 21.
- **PQRS pasados los topes (media):** ya no se guardan como spam en silencio. Responden 429 con el
  correo de contacto, como en M3. El spam de una IP no cuenta para el tope de esa IP (un bot detrás de
  un CGNAT no le cierra el paso a una persona), y el honeypot tiene su propio tope por IP (10 al día,
  después radicado falso sin guardar). El aviso de spam del admin ya no dice algo falso.
- **Vigilante (media):** un problema que va y viene ya no manda un correo cada 20 min:
  - el límite de uno por tipo cada 24 h se conserva al resolverse;
  - "resuelto" solo tras dos corridas seguidas bien;
  - un envío fallido se reintenta como mucho una vez por hora;
  - probado con un disco falso que alterna: 2 correos en 9 corridas (antes 6 en 6);
  - estado nuevo en `~/.fersua-booking-watchdog` (`<tipo>.open`, `.alerted`, `.okruns`, `.failed`),
    que `status.sh` muestra;
  - además recorta `backup.log`, `offsite.log`, `drill-cron.log` y `watchdog.log` (1 MB).
- **Copia externa por Google Drive (media):** probada de punta a punta con la rama rclone:
  - un remoto rclone `type = local` y las imágenes fijadas (`restic/restic:0.19.1`, `rclone/rclone:1.75.1`);
  - la imagen auxiliar se arma bien y `rclone serve restic --stdio` corre con `--read-only`, sin
    capacidades y sin root;
  - lo probado: copia, retención con instantáneas antiguas (borra la de 91 días, conserva la de 20),
    restauración byte a byte y `restore-drill.sh --from-offsite` con `RESULTADO: OK`.
- **`ops:alert` (baja):** el tope de 20 al día cuenta solo los avisos entregados. Probado contra
  mailpit: sale con 0, el correo llega y la auditoría queda con `delivered: true`. Con el SMTP
  inalcanzable sale con 1 y queda `delivered: false`.
- **Art. 53 (bajas):**
  - `disclose-dj` ya no busca el registro conservado por el slug del ticket. Un slug liberado puede
    ser de otro DJ después: responde `LEGAL_RECORD_MISSING` y el registro se busca a mano;
  - el detalle de «Registros legales» pide step-up (30 cada 10 min);
  - la entrega exige `{ confirmed: true }`: la casilla "Verifiqué que quien pide contrató al DJ";
  - el detalle del ticket dice si el correo coincide con N solicitudes de booking a ese DJ;
  - la auditoría guarda `verifiedBy` (`email-match` o `manual`) y el conteo.
- **Edge (baja):** las lecturas con microcaché (`/api/public/djs*`, géneros, `sitemap.xml`,
  `robots.txt`) descartan la query del cliente (`rewrite … ?`). Un `?x=<azar>` ya no salta la caché.
  La CI lo exige. Probado con la imagen del edge y un api falso: `MISS` y luego `HIT`, y el api
  recibe la ruta sin query.
- **ESLint del api (baja):** también prohíbe `new Prisma.Sql(…)`, `new Sql(…)`, importar
  `@prisma/client/runtime*` y el acceso calculado `prisma[x]` / `tx[x]` / `this.prisma[x]`, incluso
  con `as`.
- **CI (baja):** `shellcheck -S warning` sobre `scripts/*.sh` y el init de MySQL, con `.shellcheckrc`
  (sigue `lib.sh`). Los scripts nuevos quedan ejecutables en git.
- **Guías (bajas):**
  - `docs/05`: `curl -sIL` para `/Allset` (301 y luego 404), `backup.sh manual` en vez de una
    etiqueta que no vencía, reglas `RewriteRule` para el `.htaccess` viejo y revisión de IPv6;
  - `check-env.sh` no deja `SEO_INDEXABLE=true` con marcadores legales;
  - `docs/06`: modelo de amenazas de la copia externa y datos del art. 53;
  - `docs/04`: "Qué protege y qué no" y la copia fría opcional en el PC;
  - `docs/08`: la microcaché puede tapar una BD caída ante UptimeRobot, así que
    `MONITOR_HEALTHCHECK_URL` es obligatorio (también en `docs/02`, sección J);
  - comentarios de `.env.prod.example`.

**Verificación después de las correcciones (2026-09-30):**
- **Pruebas:**
  - shared 43;
  - api 496 unitarias (46 suites) y 123 e2e (9 suites);
  - web 212 (27 archivos);
  - regresión visual: 3 OK y 2 omitidas.
- **CI local:**
  - lint de api y web sin problemas, y typecheck;
  - `ci:bundle` OK y `ci:compose` con 235 comprobaciones;
  - la regla nueva del `?` probada rompiéndola a propósito;
  - `shellcheck` 0.11 sin advertencias;
  - el paso "Scripts del VPS" replicado en una carpeta temporal: `check-env` OK, falla con
    `SEO_INDEXABLE=true` y marcadores, y avisa con retención 30.
- **Imágenes:** `api` y `edge` con el builder clásico (`DOCKER_BUILDKIT=0`); `nginx -t` en el edge OK.
- **Limpieza:** la BD de desarrollo quedó con los mismos conteos y mailpit en 89 correos. Se borraron el
  repositorio restic de prueba, las imágenes de restic, rclone y shellcheck bajadas para probar, y el
  stack falso del edge.

**Lo que necesita Fernando para cerrar M4** (detalle en "Pendientes de Fernando"):
- el remoto de rclone para Google Drive y la clave de restic;
- las cuentas de UptimeRobot y healthchecks.io;
- el crontab nuevo después de desplegar;
- decidir cuándo indexar `booking.`.

El cambio de DNS y Allset ya no están pendientes: se decidió no mover nada.

### Conocido y aceptado (no frena)
- **M3, fuera del panel del DJ por ahora:**
  - el modal de autorización de fotos y los interruptores de foto y promoción (docs/diseno/11 §2.2);
  - la etiqueta "Reclamo en trámite" en solicitudes (no hay un dato para eso);
  - cambiar el usuario o el correo (no hay endpoint; lo hace el admin);
  - "Solicitar eliminación de mi cuenta" (el panel lleva a `/pqrs`).
- **Registro:** usa las 3 casillas del contrato (términos, datos y mayoría de edad). La 4.ª, de derechos sobre el contenido (docs/diseno/11), queda para revisar con lo legal. El botón "Crear cuenta" no se desactiva: si falta una casilla, marca el error y pone el foco en ella.
- **Topes de correo en memoria:** se reinician a las 00:00 UTC y con cada reinicio del api. Con un solo proceso basta; si algún día hay más, van a la BD.
- **Cuenta sin verificar con un borrador activo:** a los 14 días se borra igual (contrato M3; lo avisan el banner, el correo de verificación y la política). Si el admin tocó el perfil o la cuenta, no.
- **Textos legales:** la política §8 y los Términos §10 agregan los borrados automáticos sin subir la versión (siguen en borrador hasta que Fernando complete los marcadores legales y nadie los ha aceptado en producción). Si se publican como definitivos antes, hay que subir la versión en `LEGAL_DOCS`.
- **Resumen de solicitudes:** sale al día siguiente (08:00), no el mismo día; cuenta las solicitudes del día UTC anterior.
- **TermsGuard** hace una consulta extra en cada petición a `/api/me/**`; se podría unir a la de JwtAuthGuard.
- **Un solo admin en la BD:** no se agregó el CHECK `role = ADMIN ⇔ adminSlot` porque las pruebas e2e crean admins desechables (con `adminSlot` NULL) sobre la BD de desarrollo, que ya tiene al admin real. Lo protegen el índice único, `admin:create` y que ningún endpoint cambia roles. Si algún día las e2e usan una BD propia, se agrega.
- **Microcaché (M4):** un cambio del DJ o del admin, incluida una suspensión, tarda hasta 10 s en verse en la página pública, y si el api se cae se sirve la última copia. `docker compose restart edge` la vacía.
- **Api caído:** las rutas públicas que no pasan por la caché (p. ej. `booking-token`) responden con el 502 en HTML de nginx, no con JSON (desde antes de M4).
- **Tickets spam (solo honeypot):** se guardan sin purga; una de 30 días, como la del spam de booking, es una opción. El conteo por IP no tiene índice `(ipHash, createdAt)`: con los topes actuales no hace falta.
- **Entrega de datos (art. 53):**
  - la respuesta no sale por correo sola: el admin la copia y la envía;
  - con el perfil ya borrado, `disclose` responde `LEGAL_RECORD_MISSING` siempre y el registro se busca a mano en «Registros legales» (no hay un enlace estable ticket ↔ registro que no dependa del slug; agregarlo pide una migración);
  - la verificación es una declaración del admin (la casilla) más el aviso de si el correo coincide: el formulario público no pide número de solicitud.
- **Regresión visual:**
  - las capturas base son de Windows (en Linux el texto se pinta distinto), por eso `test:visual` no corre en la CI;
  - la tolerancia es `maxDiffPixelRatio 0.02` en páginas de unos 3.500 px: una franja chica puede cambiar sin fallar;
  - la fidelidad con la plantilla original se revisó a ojo (`docs/visual/README.md`), no con una captura de `template-reference.html` como decía el plan. Si hace falta, capturas base de Linux en la imagen de Playwright y un job de CI.
- **Logs del correo:** los reintentos escriben el error SMTP crudo, que puede traer la dirección del destinatario (desde antes de M4).
- **`ops:alert`** arma el servicio de correo a mano y usa `setTransportForTesting` para saber si el correo salió: el servicio no tiene un método público para esperar la entrega. Probado contra mailpit en local; la primera corrida contra el SMTP real será en el VPS (`--kind test`, sección J de `docs/02`).
- **Copia externa:** no es "solo de agregar". Quien tome el usuario `deploy` del VPS puede leerla y borrarla; lo cubre la copia fría opcional en el PC (`docs/04-backups.md`, "Qué protege y qué no"). Google Drive real todavía no se probó (se probó la rama rclone con un remoto local).
- **Decisión del 2026-09-30 (booking definitivo, sin reglas para Allset):** la integración y este commit siguen la decisión anotada arriba (sin 410 de Allset, sin `apex.conf` ni `booking-redirect.conf`, `docs/05` como guía de indexación). Si Fernando no la confirma, el runbook viejo está en `6826350:docs/05-cambio-dns.md` y `6826350:deploy/host-nginx/apex.conf`, y el 410 de Allset en el reporte del edge de la integración.
- **Sin hacer en M4:**
  - el modal de autorización de fotos y la etiqueta "Reclamo en trámite";
  - los topes de correo en la BD;
  - el texto legal final, que depende de los marcadores de Fernando.
- **npm audit:** 3 hallazgos en dependencias de desarrollo (vitest y esbuild moderados, 1 bajo). El de producción, que es el que bloquea la CI, está limpio.

### Cómo retomar
- **Sesión nueva:** decir *"Lee docs/ESTADO.md del proyecto fersuastudio-booking y continúa"* (M4 tiene commit: falta push, despliegue y lo que necesita Fernando).
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
- **URL:** `booking.fersuastudio.com/<slug>`, de forma definitiva (decisión del 2026-09-30). `fersuastudio.com` y Allset se quedan en Hostinger; no hay cambio de DNS.
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
- Verificación completa: `npm test -w @fersua/shared`, `npm test -w api`, `npm run test:e2e -w api` (con la BD y mailpit arriba; las e2e de M3 leen los enlaces en el API de mailpit y borran solo sus correos), `npm test -w web`, `npm run lint -w api`, `npm run lint -w web`, `npm run ci:compose`, `npm run ci:bundle` (después de `npm run build -w web`).
- Regresión visual (M4, solo en Windows por las capturas base): `npm run test:visual -w web`. Usa el Chromium de Playwright 1.57 ya instalado; si cambia un estilo a propósito, se regeneran las capturas con `npm run test:visual -w web -- --update-snapshots`.
- Registro local: `api/.env` trae `REGISTRATION_OPEN=true`. Los correos (verificación, restablecer y avisos) se ven en http://127.0.0.1:8025.
- La prueba e2e de `admin:create` se salta sola si la BD ya tiene un admin (la de desarrollo lo tiene).

## Pendientes de Fernando (no frenan el desarrollo)
- **Abrir el registro de DJs** después de desplegar M3 (`docs/02-primer-despliegue.md`, sección I: primero la revisión de correos guardados, después `REGISTRATION_OPEN=true`).
- **Revisar con lo legal** los textos nuevos: aviso de privacidad de `/registro`, política §8 y Términos para Artistas §10 (borrados automáticos). También falta decidir la 4.ª casilla del registro (derechos sobre el contenido).
  - **M4:** la política §5 suma a Google (Google Drive) como encargado de la copia cifrada de los respaldos, posiblemente fuera de Colombia, y la §8 aclara que el plazo de 8 semanas incluye esa copia. Se agregó sin subir la versión (sigue en borrador, con marcadores, como los cambios de M3). Si se prefiere guardar la copia externa más tiempo, primero hay que cambiar la §8.
- **Formato del log del nginx del host** sin query string (paso 4 de arriba; `docs/02-primer-despliegue.md`, sección E).
- **`DjLegalInfo` de Mac Fly** (registro privado del art. 53): se carga desde el admin (pestaña "Datos legales"). Mac Fly está publicado sin él: el resumen y el editor lo marcan en rojo, y si se suspende no se puede reactivar sin cargarlo.
- **`ADMIN_NOTIFY_EMAIL`** en el `.env` del VPS (opcional): a dónde llegan los avisos de PQRS nuevas; si está vacío, van al correo del admin.
- **Marcadores legales:** nombre o razón social, NIT o cédula, dirección, correo y teléfono del responsable. Van en `web/src/public/legal/operator.ts` y `docs/legal/`.
- **Fechas actuales de Mac Fly & Mike Bran:** se cargan desde el admin (DJs → Mike Bran & Macfly → Fechas).
- **Confirmar para Mac Fly:** el SoundCloud del dúo, el pie de foto "2024 / 2025" y el texto al compartir.
- ~~Respaldo nocturno automático~~ ✅ programado el 2026-09-30.
- ~~Allset y el cambio de DNS~~ ✅ decidido el 2026-09-30: no se mueve nada; `booking.` es el dominio definitivo.
- **M4, después de desplegarlo** (`docs/02-primer-despliegue.md`, sección J):
  - **Copia externa en Google Drive:**
    - crear el remoto de rclone en tu PC (`docs/04-backups.md`, "Opción A") y copiar el archivo al VPS, fuera del repo;
    - generar `OFFSITE_RESTIC_PASSWORD` (`openssl rand -hex 32`) y **guardarla primero en tu gestor de contraseñas**: sin ella las copias no se pueden leer;
    - agregar las líneas `OFFSITE_*` al `.env` del VPS;
    - correr `bash scripts/offsite-backup.sh manual` y `bash scripts/restore-drill.sh --from-offsite`.
  - **Monitoreo externo** (`docs/08-monitoreo.md`):
    - cuentas gratis en UptimeRobot (2 monitores: salud y la palabra "Mike Bran") y healthchecks.io (3 checks: nocturno, copia externa y vigilante);
    - las URLs de healthchecks.io van en `BACKUP_HEALTHCHECK_URL`, `OFFSITE_HEALTHCHECK_URL` y `MONITOR_HEALTHCHECK_URL` (**este último es obligatorio**: es lo único que avisa si la base de datos se cae).
  - **Crontab:** agregar las líneas nuevas de `deploy/cron/crontab.example`, **solo con M4 ya desplegado** (antes el api no tiene `ops:alert`). Son estas dos (la del nocturno ya está):

    ```
    45 8 * * * cd /home/deploy/apps/fersuastudio-booking && bash scripts/offsite-backup.sh nightly >> /home/deploy/backups/fersua-booking/offsite.log 2>&1
    */10 * * * * mkdir -p /home/deploy/.fersua-booking-watchdog && cd /home/deploy/apps/fersuastudio-booking && bash scripts/watchdog.sh >> /home/deploy/.fersua-booking-watchdog/watchdog.log 2>&1
    ```

    El ensayo mensual (`30 9 1 * *`, comentado en el ejemplo) es opcional. La copia externa sin `OFFSITE_*` solo dice "no configurada".
  - **Probar el aviso:** `docker compose exec -T api node dist/cli/main.js ops:alert --kind test --detail "Prueba"`.
- **Cuándo indexar `booking.`** (`docs/05-cambio-dns.md`):
  - antes, los textos legales definitivos y los datos de prueba borrados;
  - después, `SEO_INDEXABLE=true`, quitar el `noindex` del vhost (sudo) y enviar el sitemap a Search Console.
- **Seguridad:**
  - La clave del buzón `no-reply@` se escribió en el chat: conviene cambiarla en hPanel y actualizar `SMTP_PASS` en el `.env` del VPS.
  - Opcional: pasar el repo a privado; en ese caso hace falta una deploy key de solo lectura en el VPS.
