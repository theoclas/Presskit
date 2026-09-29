# Estado del proyecto y cómo continuar

> Documento de continuación. Léelo primero al retomar (persona o Claude).
> Última actualización: 2026-09-29, pausa pedida por Fernando durante la integración de M2.

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

## Hitos (avance total aprox. 60 %)
| Hito | Estado |
|---|---|
| **M0** Fundaciones | ✅ Hecho y subido (`7a3c321`) |
| **M1** Sitio público + semilla de Mac Fly + legal + infraestructura | ✅ Hecho, subido (`1235f4c`, `b19e6f1`) y **EN PRODUCCIÓN** |
| **M2** Auth con 2FA + panel admin | 🟡 ~70 %: construcción terminada, **sin commitear**; la integración quedó a medias |
| **M3** Registro y autoservicio de DJs | ⏳ Pendiente |
| **M4** Endurecimiento + cambio de DNS del dominio principal | ⏳ Pendiente |

## Producción (M1)
- **https://booking.fersuastudio.com**, con HTTPS por certbot (vence el 2026-12-28 y se renueva solo), `noindex` mientras sea beta.
- **VPS:** `~/apps/fersuastudio-booking`, proyecto compose `fersua-booking` (db, migrate, api, edge). El edge escucha en `127.0.0.1:8090`; el vhost del host es `/etc/nginx/sites-available/fersua-booking.conf`.
- **Versión desplegada:** `b19e6f1`. Semilla cargada: 27 géneros y Mac Fly & Mike Bran (APROBADO, sin dueño). Ya hay un respaldo manual.
- **`.env` del VPS** (chmod 600, nunca en git): secretos aleatorios y la clave SMTP real de `no-reply@fersuastudio.com`, verificada contra Hostinger.
- **Actualizar:** `cd ~/apps/fersuastudio-booking && bash scripts/deploy.sh` (git pull, build clásico, migraciones y salud; si falla, vuelve atrás solo).

## M2 — dónde quedó exactamente
**Terminado, pero SIN COMMITEAR** (unos 110 archivos en disco: `git status`):

| Parte | Carpetas |
|---|---|
| Auth: login por usuario, refresh `__Host-rt` (`rt` en desarrollo), bloqueos, 2FA TOTP con códigos de recuperación, step-up, guards globales, correo | `api/src/auth`, `api/src/mail`, `api/src/common/guards` |
| CLI del admin: `admin:create` interactivo, `admin:reset-password`, `admin:unlock`, `admin:reset-mfa` | `api/src/cli/commands` |
| Editor de perfiles para dueño y admin, subida de medios, URLs firmadas y ciclo de vida (aprobar, rechazar, suspender, asignar dueño, borrar) | `api/src/profiles`, `api/src/media` |
| Operaciones del admin: usuarios con contraseña temporal, solicitudes, PQRS con vencimientos, auditoría, géneros y estadísticas | `api/src/admin` |
| Web: `/login` con 2FA, `/cambiar-clave`, cliente http con refresh y panel admin en Ant Design (oscuro) | `web/src/auth`, `web/src/lib/http.ts`, `web/src/admin` |
| Web: editor de perfiles por pestañas y `/_preview` | `web/src/admin/profiles`, `web/src/editor-kit`, `web/src/public/pages/PreviewPage.tsx` |

**Informes de cada agente de construcción:** `.m2-build-reports.md`, en la raíz. Es local y está fuera de git por `.git/info/exclude`.

**Pendiente, en este orden:**
1. **Integración de M2** (se interrumpió en curso):
   - `npm install`;
   - build y pruebas de shared, api (unitarias y e2e) y web;
   - probar de punta a punta login → 2FA → editor de Mac Fly → subir foto → usuarios con contraseña temporal → solicitudes, PQRS y auditoría, y que un USER reciba 403 en el admin;
   - Docker de ensayo local.
   - En la BD local **ya existe un admin de prueba `fersua` con 2FA**, de contraseña desconocida: para probar hay que resetearlo con `admin:reset-password` y `admin:reset-mfa` (tienen flags para automatizar). No usar `admin:create` otra vez.
2. **Revisión** de seguridad y de requisitos.
3. **Correcciones.**
4. **Commit y push de M2.** El push lo hace el agente principal, porque los subagentes lo tienen bloqueado.
5. **Desplegar en el VPS** con `bash scripts/deploy.sh`.
6. **Admin real, lo hace Fernando por SSH en el VPS:**
   `cd ~/apps/fersuastudio-booking && docker compose run --rm -it api node dist/cli/main.js admin:create`
   Pide usuario (`fersua`), correo y contraseña oculta de 12+ caracteres, muestra el QR para Google Authenticator e imprime 10 códigos de recuperación **una sola vez**.

### Cómo retomar
- **Misma sesión de Claude:** reanudar el workflow `m1-close-m2-admin` con `resumeFromRunId: "wf_b4d6014e-d48"`.
  - Script: `C:\Users\ASUS\.claude\projects\C--Fernando-Desarrollo-hostinger-fersuastudio-booking-api\7001a633-9002-4a49-913a-6a3a2560edb9\workflows\scripts\m1-close-m2-admin-wf_b4d6014e-d48.js`.
  - Los 6 agentes ya terminados (cierre de M1 y las 5 construcciones de M2) se reutilizan; arranca de nuevo en la integración.
- **Sesión nueva:** decir *"Lee docs/ESTADO.md del proyecto fersuastudio-booking y continúa M2 desde la integración"*.
  - Claude debe leer `.m2-build-reports.md`, `docs/api-m2.md` y el plan.
  - Luego integrar lo que hay en disco, revisar, corregir, commitear, subir y desplegar.

## Decisiones clave (resumen)
- **Stack:** NestJS 11 + Prisma 6.19 + MySQL 8.4 en el api; React 19 + Vite 7 en la web; npm workspaces con `packages/shared` (`@fersua/shared`).
- **Cuentas:**
  - Login con usuario + contraseña (JWT de 15 min en memoria, refresh en la cookie `__Host-rt`).
  - Registro abierto, pero el admin aprueba cada perfil.
  - 1 usuario = 1 cuenta DJ.
  - Un solo admin: usuario `fersua`, 12+ caracteres, 2FA TOTP. Se crea con la CLI interactiva en el VPS; nunca va en `.env` ni en git.
- **Formulario:** catálogo fijo de campos. Cada solicitud se guarda y luego abre WhatsApp.
- **Diseño:** plantilla fija + 8 paletas.
- **Imágenes:** WebP con sharp en un volumen Docker.
- **URL:** `fersuastudio.com/<slug>`. Primero `booking.fersuastudio.com`, después el cambio de DNS del dominio principal.
- **Semilla:** solo Mac Fly & Mike Bran, sin dueño, slug `macfly-mike-bran`. Allset queda fuera.
- **Cambios de un DJ aprobado:** salen al instante (auditados).
- **Legal breve (Colombia):** `/privacidad`, `/terminos`, `/terminos-artistas`, `/pqrs`, `/reportar` y pie legal. El registro privado del art. 53 (portal de contacto) es obligatorio antes de aprobar un perfil.

## Desarrollo local
```bash
docker compose up -d            # MySQL 127.0.0.1:3309 (root/devroot) + mailpit http://127.0.0.1:8025
npm install && npm run build:shared
npm run build -w api && npm run cli -w api -- seed:genres && npm run cli -w api -- seed:macfly
npm run dev:api                 # http://127.0.0.1:4100/api/health
npm run dev:web                 # http://localhost:5180 (proxy de /api y /media al api)
```
Verificación completa: `npm test -w @fersua/shared`, `npm test -w api`, `npm run test:e2e -w api` (con la BD arriba), `npm test -w web`, `npm run ci:compose`, `npm run ci:bundle` (después de `npm run build -w web`).

## Pendientes de Fernando (no frenan el desarrollo)
- **Marcadores legales:** nombre o razón social, NIT o cédula, dirección, correo y teléfono del responsable. Van en `web/src/public/legal/operator.ts` y `docs/legal/`.
- **Fechas actuales de Mac Fly & Mike Bran:** se podrán cargar desde el admin con M2.
- **`DjLegalInfo` de Mac Fly** (registro privado del art. 53). Se carga desde el admin; sin él el admin no puede aprobar perfiles nuevos (Mac Fly ya está aprobado).
- **Confirmar para Mac Fly:** el SoundCloud del dúo, el pie de foto "2024 / 2025" y el texto al compartir.
- **Respaldo nocturno automático:** decidir si se programa el cron del VPS (`deploy/cron/crontab.example`).
- **Seguridad:**
  - La clave del buzón `no-reply@` se escribió en el chat: conviene cambiarla en hPanel y actualizar `SMTP_PASS` en el `.env` del VPS.
  - Opcional: pasar el repo a privado; en ese caso hace falta una deploy key de solo lectura en el VPS.
