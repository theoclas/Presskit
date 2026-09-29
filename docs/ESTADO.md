# Estado del proyecto y cómo continuar

> Documento de continuación. Léelo primero al retomar (persona o Claude).
> Última actualización: 2026-09-29.

## Qué es
Plataforma de booking de DJs de **Fersua Studio**: cada DJ (o dúo) arma su página con la plantilla de
Mac Fly & Mike Bran, recibe solicitudes y las gestiona. Un único admin (Fernando) aprueba y administra.
El plan aprobado, con todas las decisiones, está en `docs/00-plan.md`: **manda sobre todo lo demás**.
Los diseños detallados están en `docs/diseno/01…11`.

- **Repo:** https://github.com/theoclas/Presskit (rama `main`).
- **Carpeta local:** `C:\Fernando\Desarrollo\hostinger\fersuastudio-booking`.
- **Sitio viejo, solo lectura, fuente de la semilla:** `C:\Fernando\Desarrollo\hostinger\public_html`.
- **VPS:** `ssh -i ~/.ssh/fersua_vps_ed25519 deploy@177.7.40.130`. Ubuntu 24.04, 1 vCPU, 3,8 GB.
  - Ya corren Dashboard, HabitFer y Wandy: no tocarlos.
  - nginx del host tiene certbot.
  - `deploy` no tiene sudo.

## Decisiones clave (resumen)
- **Stack:** NestJS 11 + Prisma 6.19 + MySQL 8.4 en el api; React 19 + Vite 7 en la web; npm workspaces con `packages/shared` (`@fersua/shared`).
- **Cuentas:**
  - Login con usuario + contraseña (JWT de 15 min en memoria, refresh en la cookie `__Host-rt`).
  - Registro abierto, pero el admin aprueba cada perfil.
  - 1 usuario = 1 cuenta DJ.
  - Un solo admin: usuario `Fersua`, 12+ caracteres, 2FA TOTP. Se crea con una CLI interactiva en el VPS; nunca va en `.env`.
- **Formulario:** catálogo fijo de campos. Cada solicitud se guarda y luego abre WhatsApp.
- **Diseño:** plantilla fija + 8 paletas.
- **Imágenes:** WebP con sharp en un volumen Docker.
- **URL:** `fersuastudio.com/<slug>`. Primero se lanza en `booking.fersuastudio.com` y después se cambia el DNS del dominio principal.
- **Semilla:** solo Mac Fly & Mike Bran, sin dueño, slug `macfly-mike-bran`. Allset queda fuera.
- **Build:** en el VPS, con 2 GB de swap.
- **Cambios de un DJ aprobado:** salen al instante (auditados).
- **Legal breve (Colombia):** `/privacidad`, `/terminos`, `/terminos-artistas`, `/pqrs`, `/reportar` y pie legal. El registro privado del art. 53 (portal de contacto) es obligatorio antes de aprobar un perfil. Marcadores `[NOMBRE] [NIT/CC] [DIRECCIÓN] [CORREO]` por completar.

## Hitos
| Hito | Estado |
|---|---|
| **M0** Fundaciones | ✅ Hecho y subido (commit `7a3c321`) |
| **M1** Sitio público + semilla Mac Fly + legal + infraestructura | ✅ Hecho y subido |
| **M2** Auth + admin (2FA, editar perfiles, tickets, auditoría) | 🟡 En construcción (contrato en `docs/api-m2.md`) |
| **M3** Registro y autoservicio de DJs (correo, panel, media privada) | ⏳ Pendiente |
| **M4** Endurecimiento + cambio de DNS del dominio principal | ⏳ Pendiente |

### M0 (hecho)
- `packages/shared`: límites, catálogos y validadores, con sus pruebas.
- `api`: esquema Prisma (18 tablas) + migración `init`, configuración validada, filtro de errores, guard de origen, throttler por IP real, auditoría y health.
- `docker-compose.yml` de desarrollo.

### M1 (hecho)
- **API** (`api/src/public`, `booking`, `tickets`, `media`, `cli`):
  - `GET /api/public/djs`, `/djs/:slug` (301 desde slugs viejos), `/genres`, `sitemap.xml`, `robots.txt`.
  - Shell SEO `GET /api/public/shell?path=`: head, OG y JSON-LD por perfil, head propio en las páginas legales, 301 relativos (mayúsculas, `.html`, slug viejo) y 404 con noindex.
  - Formulario de booking: token HMAC, honeypot, tiempo mínimo, topes diarios (lo que pasa el tope se guarda como SPAM) y enlace de WhatsApp armado en el servidor.
  - Tickets públicos (PQRS y reportes) con radicado y fecha límite.
  - Imágenes: sharp → WebP sin metadatos (recorte 4:5 centrado para tarjetas) + JPEG de OG.
  - CLI: `seed:genres`, `seed:macfly [--force]`.
- **Web** (`web/src/public`): página del DJ con la plantilla de Mac Fly (fiel al original, con los bugs corregidos), index con búsqueda y filtros, páginas legales, PQRS/reportar, 404 y página de error. Pie legal y aviso de privacidad breve junto a cada formulario.
- **Infra**: `Dockerfile` (targets `api` y `edge`), `docker-compose.prod.yml`, edge nginx con límites por IP (IPv6 por /64), backups, cron y guías `docs/01…07`. CI: build, pruebas, e2e, `ci:compose` y `ci:bundle`.
- **Cómo correrlo:** ver "Desarrollo local" abajo y `docs/01-desarrollo-local.md`. Para publicar: `docs/02-primer-despliegue.md`.
- **Pendiente técnico (no bloquea):** la prueba visual con Playwright contra `tests/visual/template-reference.html` (390×844 y 1280×800) todavía no existe.

### M2 (en construcción)
Auth (usuario + contraseña, 2FA del admin, cookie `__Host-rt`), panel de admin para editar perfiles, tickets y auditoría. El contrato de endpoints está en `docs/api-m2.md` y los tipos en `packages/shared/src/admin-types.ts`.

## Desarrollo local
```bash
docker compose up -d            # MySQL 127.0.0.1:3309 (root/devroot) + mailpit http://127.0.0.1:8025
npm install && npm run build:shared
npm run build -w api && npm run cli -w api -- seed:genres && npm run cli -w api -- seed:macfly
npm run dev:api                 # http://127.0.0.1:4100/api/health (en desarrollo solo escucha en 127.0.0.1)
npm run dev:web                 # http://localhost:5180 (proxy de /api y /media al api)
```
Verificación completa: `npm test -w @fersua/shared`, `npm test -w api`, `npm run test:e2e -w api` (con la BD arriba), `npm test -w web`, `npm run ci:compose`, `npm run ci:bundle` (después de `npm run build -w web`).

## Pendientes de Fernando (no frenan el desarrollo)
- **Marcadores legales:** nombre o razón social, NIT o cédula, dirección, correo y teléfono del responsable. Van en `web/src/public/legal/operator.ts` (los documentos y los avisos junto a los formularios los toman de ahí) y en las copias de `docs/legal/`. Revisar los textos con un abogado.
- **Fechas actuales de Mac Fly & Mike Bran:** todas las del sitio viejo ya pasaron; mientras tanto "Fechas" solo muestra la fila "Disponible".
- **`DjLegalInfo` de Mac Fly** (registro privado del art. 53: nombre, documento y contacto del responsable del dúo). Se carga en M2 desde el admin; sin ese registro el admin no puede aprobar perfiles.
- **Confirmar para la semilla de Mac Fly:** el SoundCloud del dúo (se quitó del hero hasta confirmarlo), el año del pie de la foto ("2024 / 2025") y si la descripción al compartir debe volver a "Contrataciones, próximas fechas y press kit." (hoy sale `seoDescription`; no hay campo aparte).
- **Aprobar las diferencias intencionales con la página original:** íconos en las redes, asteriscos de obligatorio, casilla de autorización, avisos legales, "Rider Técnico" con tilde y la columna de "Disponible" más ancha.
- **hPanel:** registro A `booking` → 177.7.40.130 y crear el buzón `no-reply@fersuastudio.com`.
- **VPS con sudo:** 2 GB de swap, vhost de nginx y certbot. Los comandos están en `docs/02-primer-despliegue.md`.
- **GitHub:** agregar la deploy key de solo lectura del VPS al repo Presskit.
