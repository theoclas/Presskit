# Plan — fersuastudio-booking (plataforma de booking de DJs)

## Contexto
Hoy fersuastudio.com es HTML estático en el hosting compartido de Hostinger (`public_html`, IP 195.179.239.107).
La página de Mac Fly & Mike Bran (`public_html/MacflyMikebran.html`) es la referencia visual, pero tiene
fallos: un `</div>` suelto rompe el layout, fotos de 20-28 MB (84 MB por visita), botones "Book" que envían
`{nombre del evento}` literal y og:image relativo. Fernando quiere convertir eso en una **plataforma real**
(NestJS + React + MySQL, en Docker en su VPS 177.7.40.130) donde:
- cada DJ se registra (usuario + contraseña) y arma su página con esa misma plantilla, editable dentro de límites;
- un único admin (Fernando) aprueba y administra todo;
- el index muestra a todos los DJs aprobados.

El diseño detallado salió de 4 arquitectos y 2 críticos: modelo de datos, backend y seguridad, frontend e
infraestructura, más una revisión de completitud y otra de seguridad. Está en el scratchpad de esta sesión
(`…\scratchpad\d-*.md`, `c-*.md`) y se copia al repo en `docs/diseno/`. Este plan fija las decisiones y
resuelve las contradicciones entre esos documentos. Si algo choca, **manda este plan**.

## Decisiones tomadas con Fernando
| Tema | Decisión |
|---|---|
| Repo | Monorepo en `C:\Fernando\Desarrollo\hostinger\fersuastudio-booking`, remoto `https://github.com/theoclas/Presskit.git` (existe y está vacío), rama `main` |
| Registro | Abierto. La página no es pública ni sale en el index hasta que el admin la aprueba |
| Login | Usuario + contraseña (JWT). El correo solo sirve para recuperar y para avisos |
| Recuperación | Los DJs recuperan por correo (SMTP de Hostinger, `no-reply@fersuastudio.com`) o el admin les pone una contraseña temporal |
| Admin | Uno solo: usuario `Fersua` (se guarda en minúscula). Contraseña de 12+ caracteres escrita por Fernando en el VPS, sin guardarse en archivos ni en git. 2FA TOTP obligatorio. Su recuperación es solo por CLI en el VPS, nunca por correo |
| Cuentas DJ | 1 usuario = máx. 1 cuenta DJ. Una cuenta puede ser dúo: Mike Bran & Macfly = 1 cuenta con 2 integrantes |
| Contenido | Textos, fotos, fechas, rider, redes con íconos de una lista fija, integrantes y paleta. Todo con límites que valida el servidor |
| Formulario | Catálogo fijo de campos: correo 1-3, teléfono 1-3, dirección 1-2, evento, presupuesto… El DJ activa, obliga, renombra y ordena |
| Envío del formulario | Se guarda en la BD (bandeja del DJ y del admin) y después abre WhatsApp con el resumen que arma el servidor |
| Diseño | Plantilla fija + 8 paletas predefinidas. La naranja/rosa actual es la de por defecto |
| Imágenes | En el VPS, en un volumen Docker. sharp las convierte a WebP con variantes y sin EXIF/GPS |
| URLs | `fersuastudio.com/<slug>`. Index: grilla de tarjetas estilo Mac Fly, con buscador, filtro por género y destacados |
| Lanzamiento | Primero `booking.fersuastudio.com`. Luego cambio de DNS del dominio principal. `booking.` queda como alias que redirige 301 al principal |
| Semilla | Solo Mac Fly & Mike Bran: perfil APROBADO y destacado **sin dueño** (el admin lo asigna después), slug `macfly-mike-bran`. Allset, Diann & Makinne y Molly quedan fuera |
| Build | En el VPS, con 2 GB de swap (Fernando lo crea una vez con sudo) |
| Cambios de un DJ aprobado | Salen al instante, sin retención. Quedan en la auditoría y el admin puede suspender |
| Privacidad (Ley 1581) | Borrador completo con marcadores `[NOMBRE] [NIT/CC] [CORREO]` que Fernando completa antes de lanzar. Solicitudes se guardan 12 meses |

## Arquitectura

```
Internet ─► nginx del host (TLS/certbot, :443) ─► 127.0.0.1:8090 ─► [edge nginx] ─┬─ SPA estática + /media (solo lectura)
                                                                    (contenedor)  ├─ /api/*  ─► [api NestJS] ─► [db MySQL 8.4]
                                                                                  └─ / y /<slug> ─► /api/public/shell (inyecta meta/OG)
```

**Stack**
- NestJS 11 sobre Express 5, Prisma 6.19, MySQL 8.4 y Node 22 alpine.
- React 19 + Vite + react-router 7 + TanStack Query.
- Ant Design 6 solo en el panel y el admin. La página pública es CSS copiado de la plantilla, sin AntD.
- npm workspaces: `packages/shared`, `api`, `web`.

**Base reutilizada:** HabitFer (`C:\Fernando\Desarrollo\Personal\FersuaStore\HabitFer`).
- De ahí se toman `api/src/main.ts`, `common/guards/origin.guard.ts`, `config/env.validation.ts` y la estructura de auth.
- Se corrigen sus debilidades:
  - `prisma db push` pasa a ser `migrate deploy`.
  - Caddy quedaba publicado en 0.0.0.0; aquí solo loopback.
  - Contenedores como root.
  - Sin healthchecks ni límites de memoria.
  - `npm audit` con `continue-on-error`.

### Árbol del repo
```
fersuastudio-booking/
├─ package.json (workspaces)  package-lock.json  .nvmrc(22)  .gitattributes(eol=lf)  .gitignore  .dockerignore(**/.env*, **/node_modules)
├─ Dockerfile                 # multi-target: deps → shared → web-build / api-build → api / edge
├─ docker-compose.yml         # dev: MySQL 127.0.0.1:3309 + mailpit 8025/1025
├─ docker-compose.prod.yml    # db, migrate, api, edge
├─ .env.example  .env.prod.example
├─ packages/shared/src/       # @fersua/shared (tsup CJS+ESM): limits, text-slots, booking-fields, booking-validate,
│                             #   form-config-validate, palettes, social-platforms, slug, username, password, routes, dates
├─ api/  prisma/{schema.prisma,migrations/}  seed-assets/macfly-mike-bran/  src/…  test/…
├─ web/  src/{public,auth,panel,admin,editor-kit,lib,i18n}  tests/{unit,e2e,visual}
├─ deploy/ edge/{nginx.conf,default.conf,snippets/}  mysql/{my.cnf,init/01-app-user.sh}  host-nginx/{booking.conf,apex.conf,snippets/}
├─ scripts/ prepare-seed-media.mjs  init-env.sh  check-env.sh  deploy.sh  rollback.sh  backup.sh  restore.sh  status.sh
├─ docs/ 00-contrato.md  diseno/*.md  01-desarrollo-local.md  02-primer-despliegue.md  03-actualizar-rollback.md
│        04-backups.md  05-cambio-dns.md  06-seguridad.md  07-correo-spf-dkim-dmarc.md  legal/politica-v1.md
└─ .github/workflows/ci.yml  dependabot.yml
```

## Contrato único
Estas decisiones resuelven las contradicciones de los diseños y van a `docs/00-contrato.md`.

- **Nombres de modelos:** `User`, `RefreshToken`, `EmailToken`, `DjProfile`, `Member`, `SocialLink`, `GalleryItem`,
  `RiderItem`, `Event`, `Genre`, `ProfileGenre`, `MediaAsset`, `BookingRequest`, `SlugRedirect`, `AuditLog`.
  - Orden por `sortOrder`.
  - IDs `cuid`; `Genre` usa Int.
  - Charset `utf8mb4_unicode_ci`.
  - Hashes siempre en hex `CHAR(64)`.
- **Esquema base:** el de `d-data.md` §1, con estos ajustes:
  - `ProfileStatus` = DRAFT, PENDING_REVIEW, APPROVED, REJECTED, SUSPENDED.
  - `DjProfile.userId String? @unique`: el perfil puede no tener dueño.
  - `DjProfile.bookingForm Json` reemplaza la tabla `FormFieldConfig`. Se guarda con un PUT atómico y al leerse se fusiona con el catálogo.
  - Se elimina la clase OG: el JPEG de 1200×630 para OG se deriva de la imagen HERO.
  - Se agregan `featuredRank` y los campos TOTP del admin (secreto cifrado con AES-GCM y códigos de recuperación con hash).
  - `previewFeatures = ["strictUndefinedChecks"]`.
  - Se elimina la tabla `Setting`: pasa a flags de entorno.
- **Página pública visible** si y solo si: `status = APPROVED` **y** (no tiene dueño **o** el dueño está ACTIVE). Esto se evalúa en cada petición, con un único `PublicProfileResolver` que usan todos los endpoints públicos.
- **Catálogos compartidos (`packages/shared`):**
  - `LIMITS`, `PAGE_TEXT_SLOTS` (unas 40 claves), `BOOKING_FIELD_CATALOGUE` (27 campos, sin cédula ni NIT), 17 `SOCIAL_PLATFORMS` con lista de hosts permitidos y las 8 `PALETTES` (SUNSET, MIAMI, NEON, ACID, INFERNO, OCEAN, GOLD, MONO), todos de `d-data.md`.
  - `RESERVED_SLUGS` ⊇ `APP_TOP_LEVEL_ROUTES`. Incluye `allset` y `pedido`; no incluye `diannmakinne` ni `molly`, porque serán DJs.
  - Un test verifica que los enums de Prisma coincidan con los de shared.
- **Límites clave:**

| Elemento | Límite |
|---|---|
| Géneros | 1-6, de un catálogo que maneja el admin |
| Integrantes | 6 |
| Galería | 24 |
| Rider | 20 |
| Fechas | 30 próximas / 100 guardadas |
| Redes | 10 por perfil y 6 por integrante |
| Subida | 10 MB (el navegador reduce antes a 2560 px), 40 MP |
| Cuota por DJ | 25 MB / 20 archivos sin aprobar; 100 MB / 100 archivos aprobado |

- **Rutas de la API:** se usa el naming de `d-backend.md` §3. La lista se exporta desde `shared/routes.ts` y un test de CI comprueba que las regex del edge coincidan con ella.
  - `/api/auth/*`, `/api/me/profile/*`, `/api/admin/profiles/:profileId/*` (los mismos controladores montados dos veces).
  - `/api/public/djs`, `/api/public/djs/:slug`, `/api/public/djs/:slug/booking-token`, `/api/public/djs/:slug/booking-requests`, `/api/public/shell`, `/api/health`.
- **Variables de entorno:**
  - `PUBLIC_URL` (una sola, se usa en todo), `UPLOAD_DIR=/data/media` servido en `/media`.
  - `JWT_ACCESS_SECRET`, `BOOKING_FORM_SECRET`, `IP_HASH_SECRET`, `MFA_ENC_KEY`.
  - `SEO_INDEXABLE`, `REGISTRATION_OPEN`, `ADMIN_NOTIFY_EMAIL`, SMTP_*.
  - Sin `JWT_REFRESH_SECRET` ni `BCRYPT_ROUNDS`.
  - **Ninguna variable `ADMIN_*` en `.env` ni en compose.**

## Seguridad (requisito explícito)
**Autenticación**
- Contraseñas con argon2id (m=19 MiB, t=2), de 10 a 128 caracteres, normalizadas con NFKC.
  - No pueden contener el usuario ni estar en una lista de 10k contraseñas comunes; se valida con `validatePassword` de shared.
  - Para el admin, mínimo 12.
- Access JWT HS256 de 15 min, guardado en memoria del navegador. Claims `sub`, `tv` (tokenVersion) y `sid`.
  - En cada petición se relee de la BD el rol, el estado, `tv` y si la sesión fue revocada.
- Refresh opaco en la cookie `__Host-rt` (HttpOnly, Secure, SameSite=Strict, Path=/, sin Domain). Así los subdominios hermanos (dashboard., corporaciondestellos.) no pueden sembrarla.
  - Rota en cada uso y detecta reutilización con 10 s de gracia; la reutilización revoca toda la familia.
  - Exige el header `X-Requested-With` y el chequeo de Origin.
  - El edge borra la cabecera Cookie en `/api/public/*` y en el shell.
  - Sesiones de DJ: 7 días inactiva / 30 días absoluta. Del admin: 1 día / 7 días.
- Bloqueo por pareja (usuario, IP /64) tras 5 fallos, con backoff, más un tope suave de 30 fallos por hora por usuario.
  - Un mutex en proceso evita contar intentos paralelos, y un semáforo limita argon2 a 4 hashes a la vez.
  - El admin nunca se bloquea duro: lo protegen el TOTP y el límite por IP.
- Respuestas idénticas en login y en recuperación, con hash ficticio, para no revelar qué usuarios existen. `forgot-password` para el ADMIN no envía nada.
- Admin: TOTP con otplib y 10 códigos de recuperación.
  - Pide contraseña + TOTP recientes antes de borrar, reiniciar contraseñas o transferir un perfil.
  - Correo de aviso en cada ingreso desde una IP nueva.
  - CLI interactiva por TTY con entrada oculta: `admin create | reset-password | unlock | disable-mfa`.
- Recuperación por correo: token de un solo uso, 30 min, guardado con hash, en `/restablecer#t=`. Los enlaces se arman con `PUBLIC_URL`, nunca con el header Host.

**Autorización**
- `ProfileScopeGuard` decide el alcance por el prefijo de la ruta (`/api/admin/` o `/api/me/`), nunca por la presencia de un parámetro.
- Los servicios solo aceptan un `ScopedProfileId` y siempre consultan con `{ id, profileId }`; si no hay coincidencia, 404.
- DTOs anidados con `@ValidateNested`, `@Type` y `@ArrayMaxSize`. Nunca se hace spread de un DTO hacia Prisma.
- `texts` y los campos del formulario se construyen recorriendo solo las claves del catálogo.
- `ValidationPipe` con whitelist, `forbidNonWhitelisted` y `forbidUnknownValues`.
- Ningún DTO acepta role, status, userId, profileId o featured.

**Contenido**
- Texto plano siempre: React escapa y `react/no-danger` es un error de lint. `cleanText` quita caracteres de control, zero-width y bidi.
- URLs solo https, con lista de hosts por plataforma y `rel="noopener noreferrer nofollow ugc"`.
- Los enlaces de WhatsApp los arma el servidor.
- Etiquetas prohibidas en el formulario: tarjeta, clave, contraseña, cédula, cuenta bancaria, nequi… Se rechaza cualquier número de tarjeta que pase la validación de Luhn.

**Subidas**
- Multer en memoria con máximo 10 MB. Se verifican los magic bytes (JPEG/PNG/WebP) y el formato real con sharp `metadata()`.
- Opciones de sharp: `limitInputPixels 40e6`, `failOn:'error'`, `animated:false`, timeout de 20 s, cola de 1 con máximo 3 en espera (luego 503), `sharp.cache(false)`.
- Nombres aleatorios, escritura atómica y chequeo de path traversal. Si el disco tiene menos de 5 GB libres, 503.
- Desde M3: los perfiles no aprobados guardan sus archivos en `private/`. Se mueven a `public/` al aprobarse. El dueño y el admin los ven por URL firmada de 1 h.

**Formulario público**
- Token HMAC `{slug, iat, nonce}` de un solo uso, válido de 2 s a 2 h. Se pide cuando el formulario entra en pantalla.
- Honeypot con nombre no semántico (`hp_x7`): si se llena, se guarda como SPAM y el usuario igual recibe `whatsappUrl`.
- Límites por IP y por slug. Pasado el tope diario, las solicitudes se guardan como SPAM en vez de responder 429.
- Casilla de consentimiento Ley 1581 obligatoria, sin marcar por defecto. Se guardan la versión y la fecha.

**Infraestructura**
- Solo el edge publica puerto, y solo en `127.0.0.1:8090`. La db va en una red interna.
- Dos usuarios de BD: el que migra y el de la app, que solo tiene DML.
- Contenedores sin root, con sistema de archivos de solo lectura, `cap_drop ALL` y `no-new-privileges`.
- El CSP lo pone solo el edge (helmet con CSP desactivado). `frame-ancestors 'none'`.
- Edge con `absolute_redirect off`, subredes fijas en compose, realip confiando solo en el gateway del edge, `trust proxy` = subred del edge, y el throttler cuenta por IP (IPv6 por /64).
- Logs con pino, redactando authorization, cookie, password y token. IPs guardadas como HMAC. Auditoría de acciones del admin y de eventos de seguridad.

**CI:** build, lint, pruebas unitarias y e2e con MySQL, chequeo de drift de migraciones, `npm audit --omit=dev --audit-level=high` bloqueante, gitleaks, test de la matriz de guards y de IDOR, y lint de compose (solo el edge publica puerto, sin `ADMIN_*`).

## Parte legal (Colombia, versión breve)
Los informes completos van a `docs/diseno/legal-*.md` como referencia. En v1 se implementa solo lo esencial.

**Qué exige la ley y cómo se cumple**
- **Datos personales (Ley 1581/2012 y Decreto 1377/2013):**
  - Página `/privacidad` con la Política de Tratamiento. Lleva el contenido mínimo del art. 13 del Decreto 1377: responsable, finalidades, derechos, canal y procedimiento, y vigencia.
  - Incluye un apartado corto sobre cookies y conservación: solicitudes 12 meses; backups 14 días nocturnos y 8 semanas semanales.
  - Aviso de privacidad breve junto a cada formulario.
  - Casilla de autorización **sin marcar** en el formulario de booking y en el registro. Se guardan versión, fecha e ipHash.
- **Canal PQRS / habeas data:** `/pqrs` con un formulario simple más un correo. Plazos legales: consultas en 10 días hábiles y reclamos en 15. El admin ve el vencimiento.
- **Portal de contacto (art. 53 Ley 1480/2011) — sí aplica:**
  - Cada DJ debe registrar en privado su nombre o razón social, documento, dirección de notificaciones y teléfonos. Solo el admin lo ve y es **obligatorio antes de aprobar** la página.
  - Esos datos se entregan a quien haya contratado y presente una queja, o a la autoridad.
  - En la página del DJ y en el formulario va el aviso: "Fersua Studio es un portal de contacto: no presta el servicio ni recibe pagos; el contrato es directamente con el DJ".
- **Términos:**
  - `/terminos` para visitantes.
  - `/terminos-artistas` para DJs: veracidad de la información, 1 usuario = 1 cuenta, derechos sobre las fotos y la imagen de los integrantes, contenido prohibido, mayores de 18, aprobación y suspensión, y que no hay intermediación de pagos.
  - Sin exclusiones de responsabilidad absolutas, porque serían nulas por el art. 43 de la Ley 1480.
- **Cookies:** no hace falta banner, porque solo hay cookies esenciales de sesión. Si algún día se agrega analítica o el píxel de Meta, habrá banner con aceptación previa.
- **RNBD:** no aplica. Solo obliga a sociedades con más de 100.000 UVT en activos. Sí aplica el deber de reportar incidentes de seguridad a la SIC.

**Cómo se ve en la interfaz** (estilo de los bloques de políticas de Allset, adaptado a la plantilla)
- **Pie legal en todas las páginas públicas**, incluidas las de cada DJ:
  - "Términos · Política de datos · PQRS · Reportar contenido · www.sic.gov.co".
  - Una línea de identificación: "Fersua Studio · [NIT/CC] · [dirección] · [correo]".
  - En las páginas de DJ se agrega "Plataforma operada por Fersua Studio".
- **Páginas legales:** tabla de contenido con anclas, "Versión 1 · Última actualización: …" y marcadores `[NOMBRE] [NIT/CC] [DIRECCIÓN] [CORREO]`.
- **Formulario de booking:**
  - Casilla de autorización de datos con enlace a `/privacidad`.
  - Aviso de portal de contacto.
- **Registro:** 3 casillas separadas: acepto los Términos para Artistas, autorizo el tratamiento de datos y declaro ser mayor de 18.
- **Panel del DJ:**
  - Sección "Datos legales" (el registro del art. 53).
  - Si cambia la versión de los términos, se pide aceptarlos de nuevo al entrar.
- **"Reportar este perfil"** en cada página de DJ. Crea un ticket para el admin.

**Modelo de datos (mínimo)**
- `DjLegalInfo`: una fila por perfil, privada, con legalName, docType, docNumber, address, phones.
- `User`: termsVersion, termsAcceptedAt, privacyVersion.
- `BookingRequest`: ya tiene consentAt y consentVersion.
- `Ticket`: type PQRS_CONSULTA | PQRS_RECLAMO | REPORTE_PERFIL | SOLICITUD_DATOS_DJ, más estado, dueAt, datos de contacto y mensaje.
- Las versiones de los documentos viven en `shared/legal.ts`.

**En qué hito entra**
- **M1:** `/privacidad`, `/terminos`, `/pqrs`, pie legal, casilla y aviso en el formulario de booking, y el Ticket público.
- **M2:** bandeja de tickets en el admin y `DjLegalInfo` editable por el admin.
- **M3:** `/terminos-artistas`, casillas del registro, "Datos legales" en el panel como requisito para enviar a revisión, y la reaceptación por cambio de versión.
- **M4:** Fernando completa los marcadores (revisión de un abogado opcional, recomendable).

## Frontend
- **Rutas:**
  - Públicas: `/`, `/:slug`, `/login`, `/registro`, `/recuperar`, `/restablecer`, `/cambiar-clave`, `/verificar-correo`, `/privacidad`, `/terminos`, `/_preview`.
  - Carga diferida: `/panel/*` y `/admin/*`.
- **`DjPublicView`** es un componente puro que usan tanto la página como la vista previa. Su CSS es el `<style>` de la plantilla copiado tal cual, con prefijo `.djp` (postcss-prefix-selector).
  - Los rgba fijos se reemplazan por variables de la paleta.
  - Se corrigen: el `</div>` suelto, el zoom de iOS al enfocar inputs (16 px), las áreas táctiles de 44 px y `:focus-visible`.
  - Componentes: DjNav, DjHero, HeroPhoto, HeroMiniCards, MediaModule, GalleryGrid, RiderList, ArtistsSection, ArtistCard, ShowsSection, ShowItem, FlyerDialog, BookingSection, BookingForm, DjFooter. Detalle en `d-frontend.md` §3.
- **Index:** hero de Fersua Studio, buscador (ignora tildes), chips de género y tarjetas 4:5 con la próxima fecha. Los destacados van primero. Todas las tarjetas llegan en una sola respuesta y se filtran en el navegador.
- **Datos:**
  - `publicApi` con fetch en el bundle público.
  - axios con refresh single-flight solo en panel y admin.
  - TanStack Query.
  - Las fechas se manejan como strings `YYYY-MM-DD`.
- **Editor:** secciones Perfil y textos, Fotos, Integrantes, Fechas (próximas y archivo), Rider, Redes, Formulario, Solicitudes y Cuenta. El admin reutiliza las mismas pantallas con `DjEditorScope`.
  - Vista previa en v1: guardar y abrir `/_preview` en una pestaña nueva.
- **Rendimiento:** la página pública pesa menos de 1,5 MB, con Inter alojado localmente, srcset WebP y la galería cargando solo al abrirla. La CI verifica que antd, axios y dayjs no entren al bundle público.

## Hitos de entrega (cada hito se commitea y se sube a `main`)
**M0 — Fundaciones**
- Crear el monorepo, `git init` y el remoto Presskit.
- Copiar los diseños (`d-*.md`, `c-*.md`, `legal-*.md` del scratchpad) a `docs/diseno/` y escribir `docs/00-contrato.md`.
- `packages/shared` con sus tests en vitest.
- `schema.prisma` + migración 0001.
- Compose de desarrollo con MySQL 3309 y mailpit.
- CI.
- `.claude/launch.json` para web y api.

**M1 — Mac Fly en `booking.fersuastudio.com`** (sitio público, sin login)
- **API:**
  - health, `public/djs`, `public/djs/:slug`;
  - `public/shell` con head, OG y JSON-LD, redirecciones 301 relativas por mayúsculas, `.html` y SlugRedirect, y 404 con noindex;
  - booking-token y booking POST;
  - pipeline de imágenes;
  - CLIs `seed:genres` y `seed:macfly`.
- **Web:** DjPublicView, IndexPage, `/privacidad` (borrador con marcadores) y la página 404.
- **Semilla:**
  - `scripts/prepare-seed-media.mjs` lee `public_html`, rota, reduce a 2560 px y quita EXIF. Las fotos quedan en `api/seed-assets/`.
  - Contenido según la tabla `MACFLY_SEED` de `d-data.md` §9, con slug `macfly-mike-bran`, SlugRedirect `macflymikebran` y sin dueño.
  - Las 9 fechas (nov 2025 a ene 2026) entran como archivo. Por eso "Fechas" solo mostrará "Disponible" hasta cargar fechas nuevas.
- **Infra:**
  - Dockerfile con las correcciones P0 del crítico: copiar `api/node_modules`, `migrate` sin read_only, CLI en `src/cli`, `tsconfig.build` sin `prisma/`.
  - `docker-compose.prod.yml`, edge, script del usuario de BD con permiso de ejecución y LF, `my.cnf` y `deploy.sh`.
  - `backup.sh` nocturno de la BD y los uploads (incremental) con cron.
  - vhost del host + certbot.
- **Flags:** `SEO_INDEXABLE=false` y `REGISTRATION_OPEN=false`.

**M2 — Admin**
- Auth: login, refresh, me, change-password, `mustChangePassword` y bloqueo por intentos.
- TOTP del admin y CLI del admin.
- Panel admin:
  - DJs: aprobar, rechazar, suspender, reactivar, destacar, borrar y asignar dueño;
  - usuarios: contraseña temporal, suspender y cerrar sesiones;
  - todos los editores sobre `/admin/profiles/:id/*`;
  - bandeja global de solicitudes y auditoría.
- **Salida:** Fernando edita Mac Fly desde el admin, carga fechas nuevas y puede asignar la cuenta a un usuario.

**M3 — Autoservicio de DJs**
- Registro con aceptación de términos (`REGISTRATION_OPEN=true` en beta), verificación de correo con clic explícito, y olvido/restablecimiento por SMTP de Hostinger.
- Onboarding (nombre + slug), editores en `/me/*`, enviar a revisión y banners de estado.
- Media privada/pública, cuotas, guardia de disco y purgas: borradores inactivos 30 días, no verificados 14 días.
- Bandeja del DJ y correos de aviso sin texto libre del público. La cola de correo tiene presupuesto diario.
- Suite e2e de seguridad: IDOR, matriz de guards, asignación masiva, bloqueo, validación del formulario, fixtures de subida maliciosa y escapado del SEO.

**M4 — Endurecimiento y cambio de dominio**
- Microcaché del edge (10 s) para `/`, `/:slug` y `/api/public/djs*`.
- Respaldo externo (restic hacia Drive o B2) y ensayo de restauración.
- UptimeRobot + healthchecks.io.
- Texto legal final.
- Purgar los datos de prueba de beta.
- Cambio de DNS según `docs/05-cambio-dns.md`:
  - bajar el TTL, apuntar el A del dominio a 177.7.40.130, **eliminar el AAAA de Hostinger**, `www` como CNAME;
  - no tocar MX, SPF ni DKIM;
  - certbot para el dominio y `www`, `PUBLIC_URL` y `SEO_INDEXABLE=true`;
  - `booking.` redirige 301 al dominio principal y se envía el sitemap a Search Console.
- Redirecciones heredadas: `/MacflyMikebran` (cualquier combinación de mayúsculas, con o sin `.html`) → `/macfly-mike-bran`, `/Eventos/MacflyMikeBran/*` → `/macfly-mike-bran#fechas`, `/default.php` → `/`.
- ⚠ `/Allset`, `/pedido`, `/DiannMakinne` y `/Molly` dejarán de responder en fersuastudio.com. Allset debe quedar alojado en otro sitio antes del cambio.

**Fase 2 (no entra en v1):** vista previa en vivo con iframe, punto focal y recorte, `__INITIAL_DATA__`, deep link `/:slug/fecha/:id`, zxcvbn, cambio de correo y borrado de cuenta por el propio usuario (en v1 los hace el admin), drag & drop fuera de la galería, Turnstile y build en GHCR.

## Pasos que requieren a Fernando
Se documentan como comandos para copiar y pegar en `docs/02-primer-despliegue.md`.
1. **hPanel:**
   - Registro A `booking` → 177.7.40.130 (TTL 300).
   - Crear el buzón `no-reply@fersuastudio.com`.
   - Verificar SPF y DKIM y agregar DMARC `p=none`.
2. **VPS con sudo:**
   - Crear 2 GB de swap.
   - Revisar si el servidor tiene IPv6.
   - Copiar el vhost `deploy/host-nginx/booking.conf`, `nginx -t`, reload y `certbot --nginx -d booking.fersuastudio.com`.
3. **GitHub:** agregar la deploy key de solo lectura del VPS al repo Presskit.
4. **VPS como deploy, en `~/apps/fersuastudio-booking`:**
   - `scripts/init-env.sh` y completar SMTP.
   - `scripts/deploy.sh --first`, que compila `api` y luego `edge` en secuencia para no agotar la RAM.
   - `docker compose run --rm -it api node dist/cli/admin.js create`: Fernando escribe usuario, correo y contraseña, y configura el TOTP.
   - `seed:genres` y `seed:macfly`.
5. **Antes de lanzar:** completar los marcadores de `/privacidad` y cargar fechas actuales de Mac Fly.

## Verificación
- **Local:**
  - `npm test` (shared con vitest, api con jest).
  - `npm run test:e2e -w api`, con supertest contra MySQL de prueba: flujos de auth, IDOR, matriz de guards, formulario, subidas y SEO.
  - Levantar web y api con preview_start y revisar en el navegador el index, `/macfly-mike-bran`, el envío del formulario y el panel y admin en móvil y escritorio.
- **Fidelidad visual:** snapshot con Playwright de `/macfly-mike-bran` contra `tests/visual/template-reference.html` (el original con los bugs corregidos), a 390×844 y 1280×800.
- **VPS:**
  - `docker compose ps`: todo healthy y migrate con código 0.
  - `curl 127.0.0.1:8090/api/health`.
  - `curl -sI` de `/MacflyMikebran`, `/MacflyMikebran.html` y `/Eventos/MacflyMikeBran/14%20Nov.html` → 301 con Location relativa.
  - Encabezados CSP, HSTS y X-Robots-Tag correctos.
  - La vista previa del enlace en WhatsApp muestra el og:image absoluto.
  - Una solicitud se guarda y abre WhatsApp.
  - Una imagen de 25 MB responde 413 y un `.php` renombrado se rechaza.
  - 6 contraseñas malas desde datos móviles dan 429 sin bloquear otra red.
  - Correo de restablecimiento con SPF, DKIM y DMARC en pass.
  - SSL Labs A y securityheaders.com.
- **Peso:** la página pública de Mac Fly carga menos de 1,5 MB en móvil (hoy son unos 84 MB).
