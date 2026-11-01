# Fase 2 de plantillas: reproductor del mix y videos (instrucciones para Cursor)

> Encargo autocontenido para trabajarlo en una rama aparte. Antes de empezar, leer
> `docs/ESTADO.md` (sección "Plantillas visuales") y `docs/00-plan.md`.

## Dónde y cómo
- Carpeta: `C:\Fernando\Desarrollo\Personal\Presskit` (clon del mismo repo). Primero `git pull`
  en `main` (tiene que incluir las seis plantillas: Clásica, Signal, Neon Groove, Editorial Noir, Hyperwave y Vertex Club).
- Rama nueva: `feat/fase2-musica-videos`. Nada directo a `main`; al final, un PR.
- Node 22 (`.nvmrc`). Desarrollo local y verificación completa: sección "Desarrollo local" de
  `docs/ESTADO.md`.
- No tocar: `.claude/`, el VPS ni producción.

## Qué se quiere
Que el DJ pueda mostrar **su último mix** (SoundCloud, Mixcloud o Spotify) y **hasta 6 videos**
(YouTube) en su página:
- Signal: sección "Latest mix" justo después de la franja y una de videos antes de la galería;
- Neon Groove: la barra del reproductor bajo la portada (como en su concepto) y "Escuchar ahora"
  baja hasta ella cuando hay mix (hoy abre la red de música del perfil);
- Editorial Noir: el reproductor dentro de la sección "Música" (hoy solo enlaces a las plataformas);
- Hyperwave: el reproductor en la tarjeta "Música" del mosaico (hoy, enlaces a las plataformas);
- Vertex Club: el reproductor dentro del módulo "Música" (hoy, el panel de enlaces);
- en la Clásica es opcional.

## Reglas del proyecto que hay que respetar
- **El api arma todas las URLs** (ver el comentario de `packages/shared/src/api-types.ts`): la
  web nunca construye la URL del reproductor con texto del DJ.
- Validación en `packages/shared` (la usan el api y el editor), con pruebas en
  `packages/shared/test`:
  - `normalizeMixUrl(url)`: solo `https://soundcloud.com/<usuario>/<pista o set>`,
    `https://www.mixcloud.com/<usuario>/<show>/` y `https://open.spotify.com/<album|playlist|track|episode|show>/<id>`. Devuelve `{ provider, url }` o un error.
  - `parseYoutubeId(url)`: `youtube.com/watch?v=`, `youtu.be/` y `youtube.com/shorts/`; un id
    de 11 caracteres `[A-Za-z0-9_-]`.
- Base de datos (migración nueva de Prisma, sin drift; ver el paso de la CI en
  `.github/workflows/ci.yml`):
  - `DjProfile.mixUrl String? @db.VarChar(300)`;
  - modelo `ProfileVideo` (`id`, `profileId`, `youtubeId VarChar(11)`, `title String? VarChar(80)`,
    `sortOrder`) con borrado en cascada, como `RiderItem`.
  - Topes en `LIMITS` (6 videos).
- Api:
  - el PATCH del perfil acepta `mixUrl` (null lo quita; inválido = error de campo `INVALID`);
  - los videos se reemplazan con un PUT de la lista entera, igual que el rider
    (`api/src/profiles`);
  - la página pública suma `mix: { provider, embedUrl } | null` y
    `videos: { id, embedUrl, title }[]`:
    - SoundCloud: `https://w.soundcloud.com/player/?url=<codificada>&auto_play=false&visual=false`;
    - Mixcloud: `https://player-widget.mixcloud.com/widget/iframe/?hide_cover=1&feed=<ruta>`;
    - Spotify: `https://open.spotify.com/embed/<tipo>/<id>`;
    - YouTube: `https://www.youtube-nocookie.com/embed/<id>`.
- **Privacidad (Ley 1581):** los reproductores no cargan nada de terceros hasta que la persona
  toca "Escuchar" o "Ver" (fachada con botón; el iframe aparece al hacer clic). El `iframe` va
  con `title`, `loading="lazy"`, `referrerpolicy="strict-origin-when-cross-origin"` y
  `allow` mínimo.
- **CSP:** en `deploy/edge/snippets/security-headers.conf` agregar
  `frame-src https://w.soundcloud.com https://player-widget.mixcloud.com https://open.spotify.com https://www.youtube-nocookie.com`.
  Revisar si `scripts/ci/check-compose.mjs` valida esa cabecera y actualizarlo.
- **Editor:** una tarjeta "Música y videos" en el editor (`web/src/editor-kit`), con la misma
  validación del api antes de enviar. Va con un interruptor en "Secciones visibles", como los demás.
- **Plantillas:** usar las clases y variables de cada una (`signal/signal.css` con prefijo
  `.djp.djs`; `groove/groove.css` con prefijo `.djp.djg`; `noir/noir.css` con prefijo `.djp.djn`; `hyperwave/hyperwave.css` con prefijo `.djp.djh`; `vertex/vertex.css` con prefijo `.djp.djv`), siempre con las variables de la paleta.
  Los textos nuevos ("Latest mix", "Videos") van como `PAGE_TEXT_SLOTS` con `templates` (las
  plantillas que los muestran).

## Terminado es
- Pruebas: shared, api (unitarias y e2e), web, lint y typecheck en verde; `ci:bundle` y
  `ci:compose` OK.
- Regresión visual: la Clásica sin cambios; Signal, Neon Groove, Editorial Noir, Hyperwave y Vertex Club con capturas base nuevas (el fixture
  `web/tests/visual/fixtures/macfly-profile.json` con un mix y dos videos).
- `docs/ESTADO.md` actualizado y un PR a `main`. **No desplegar:** Claude revisa el PR y
  Fernando decide.
- Pendiente para Fernando antes de publicar: que la política de datos (`docs/legal/`) mencione
  los reproductores de terceros (SoundCloud, Mixcloud, YouTube).
