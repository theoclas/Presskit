# Fersua DJs frontend plan (React + Vite + TypeScript, in `web/`)

## 0. What the template audit found (these shape the port)

I read `MacflyMikebran.html`, `index.html`, `.htaccess`, `Eventos/MacflyMikeBran/*.html`, the Dashboard front and HabitFer web in full.

- **The stray `</div>` does more damage than listed.** Line 910 comments out `<div class="shows">`. The `</div>` at line 1013 then closes `.grid`, which implicitly closes `section#fechas`. The `</div>` at 1019 closes `.shell`. Result on the live site:
  - show items have no 8px gap;
  - `.shows-note` sits outside the card;
  - `#booking` and the footer render outside `.shell`, full width with no 1120px max.
  - The componentized version restores the intended layout. The owner must know the booking card will now be as wide as the rest of the page.
- **Event "Book" links open separate flyer pages.** Each `Eventos/MacflyMikeBran/*.html` is a black page with the flyer wrapped in a `wa.me` link. This becomes a `FlyerDialog` plus a deep link `/:slug/fecha/:eventId`.
- **Mobile bugs to fix without changing the look:**
  - Inputs are 13px, so iOS zooms on focus. Use 16px at ≤640px.
  - `.show-cta a`, `.socials a`, `.nav-links a` and `.media-tab-btn` are about 28px tall. Enlarge the hit area with an invisible `::after` (inset -8px) so the visuals stay the same.
  - There are no `:focus-visible` styles.
  - `.sec-title` is a `div`. Make it an `h2` but keep `font-weight:400; margin:0 0 4px` so it looks the same.
- **Unsafe WhatsApp text building.** The script concatenates `%0A` with raw user input and no `encodeURIComponent`, so `&` or `#` cuts the message. The server will build the URL instead.
- **The body background repeats per viewport.** `html,body{height:100%}` plus a body background means the radial gradient tiles every viewport height. To reproduce it exactly, the background must go on `body`, not on a wrapper div. See §3.
- **Other things not to carry over:**
  - Google Fonts from a third party. Self-host Inter instead.
  - The Gmail address exposed in the JSON-LD.
  - `theme-color` #0f172a does not match the #020617 background.
  - The old `index.html`: custom cursor, plus a forced 2-second "Ingresando a booking…" delay on mobile.
- **HEIC photos.** `public_html/img` holds many `.HEIC` files. sharp's prebuilt binaries can't decode HEIC. Accept only `image/jpeg,image/png,image/webp`. iOS Safari converts HEIC to JPEG automatically when `accept` excludes HEIC; desktop HEIC gets the message "Exporta la foto como JPG".
- **Legacy apex URLs will break on the DNS switch.** `/Allset`, `/pedido`, `/DiannMakinne` and `/Molly` live on the apex through `.htaccess` (`/x` → `x.html`). Reserve these as slugs, and the deploy area must decide where they are served from.
- **Owner's current auth pattern differs.** HabitFer and Dashboard keep the JWT in `localStorage`. This project deliberately does not (see §6).

## 1. Stack and folder layout

**Dependencies:**
- **Public core:** react 19, react-dom, react-router 7 (data router, for `lazy` and `useBlocker`), @tanstack/react-query 5, @fontsource-variable/inter (latin subset only).
- **Panel/admin chunks only:** antd 6, @ant-design/icons, dayjs (es locale, utc/timezone), axios, @dnd-kit/core, @dnd-kit/sortable, react-easy-crop.
- **Dev:** vite 8, typescript, vitest, @testing-library/react, @playwright/test, @axe-core/playwright, eslint with jsx-a11y and react-hooks, postcss-prefix-selector, rollup-plugin-visualizer.

**Shared constants** come from a workspace package `@fersua/shared` (`shared/src`, pure TS, no dependencies), used by both api and web:
- `limits.ts`, `fieldCatalog.ts`, `palettes.ts`, `socialPlatforms.ts`, `genres.ts`, `reservedSlugs.ts`
- `validators.ts`: `validateSlug`, `validateUsername`, `validatePassword`, `validateBookingSubmission(config, payload)`, `profileCompleteness(profile)`
- `types/public.ts`: `PublicDjProfile`, `PublicDjCard`, `MediaAsset`

```
web/
  index.html                  # <html lang="es-CO" data-surface data-palette>, <!--ssr-head-->,
                              # <script id="__INITIAL_DATA__" type="application/json"></script>,
                              # default <meta name="robots" content="noindex">
  vite.config.ts              # proxy /api and /media -> localhost:3000; manualChunks; visualizer
  postcss.config.cjs          # prefix-selector ".djp" only for src/public/dj/dj-template.css
  public/icons/social.svg     # SVG sprite (Simple Icons, CC0), <symbol id="instagram">…
  src/
    main.tsx                  # createRoot + QueryClientProvider + RouterProvider (no antd import)
    router.tsx
    app/{queryClient.ts, queryKeys.ts, AuthProvider.tsx, guards.tsx, initialData.ts}
    lib/{publicApi.ts (fetch), http.ts (axios+refresh, lazy), authToken.ts, whatsapp.ts,
         dates.ts, media.ts, safeUrl.ts, inAppBrowser.ts}
    i18n/es.ts                # every UI string and API error-code mapping
    public/
      styles/{base.css, palettes.css, public-ui.css}
      layouts/PublicLayout.tsx
      pages/{IndexPage.tsx, DjPage.tsx, NotFoundPage.tsx, PrivacyPage.tsx, TermsPage.tsx, PreviewFrame.tsx}
      index/{IndexHero.tsx, DjFilters.tsx, DjCard.tsx, DjGrid.tsx, index.css}
      dj/{DjPublicView.tsx, DjNav.tsx, DjHero.tsx, HeroPhoto.tsx, HeroMiniCards.tsx,
          MediaModule.tsx, GalleryGrid.tsx, RiderList.tsx, Lightbox.tsx, ArtistsSection.tsx,
          ArtistCard.tsx, SocialLinks.tsx, ShowsSection.tsx, ShowItem.tsx, FlyerDialog.tsx,
          BookingSection.tsx, BookingForm.tsx, BookingField.tsx, DjFooter.tsx,
          dj-template.css, dj-additions.css}
      components/{ResponsiveImage.tsx, SocialIcon.tsx, Skeleton.tsx}
    auth/                     # lazy; public look, no AntD
      {LoginPage, RegisterPage, ForgotPage, ResetPage, ForceChangePage, VerifyEmailPage}.tsx
    panel/                    # lazy chunk, AntD
      PanelApp.tsx, PanelLayout.tsx, pages/…, editor/…
    admin/                    # lazy chunk, AntD
      AdminApp.tsx, AdminLayout.tsx, pages/…
    editor-kit/               # AntD building blocks shared by panel and admin
      {DjEditorScope.tsx, DraftProvider.tsx, PreviewPane.tsx, ImageUploader.tsx,
       FocalPointPicker.tsx, CropModal.tsx, SortableList.tsx, LimitedInput.tsx,
       UnsavedChangesGuard.tsx, imagePipeline.ts}
    theme/antdTheme.ts        # dark theme, accent #f97316, ConfigProvider locale es_ES
  tests/{unit, e2e, visual/template-reference.html}
```

**ESLint rules:**
- `no-restricted-imports` blocks `antd`, `@ant-design/*`, `axios`, `dayjs`, `@dnd-kit/*` and `src/editor-kit/*` inside `src/public/**`.
- `react/no-danger` is an error.

## 2. Route map (`createBrowserRouter`)

| Path | Page | Notes |
|---|---|---|
| `/` | IndexPage | eager |
| `/:slug` | DjPage | eager, the most visited |
| `/:slug/fecha/:eventId` | DjPage with FlyerDialog open | replaces the `Eventos/*.html` pages; SSR sets `og:image` to the flyer |
| `/login` | LoginPage | lazy |
| `/registro` | RegisterPage | lazy |
| `/recuperar` | ForgotPage | lazy; one field, "Usuario o correo" |
| `/restablecer` | ResetPage | lazy; reads the token from the fragment, see below |
| `/cambiar-clave` | ForceChangePage | lazy; required when `mustChangePassword` is set |
| `/verificar-correo` | VerifyEmailPage | lazy; token in `#t=` (only if email verification is adopted) |
| `/privacidad`, `/terminos` | static | lazy |
| `/_preview` | PreviewFrame | underscore is invalid in a slug, so it can't collide |
| `/panel/*` | PanelApp | lazy |
| `/admin/*` | AdminApp | lazy |
| `*` | NotFound | "Este perfil no existe o aún no está publicado." |

**Reset token.** I deliberately use `/restablecer#t=<token>` instead of the requested `/restablecer/:token`. A fragment is never sent to the server, so the token stays out of nginx and API logs and out of the Referer header. On load the page reads it, calls `history.replaceState(null,'','/restablecer')`, keeps it in memory and sets `<meta name="referrer" content="no-referrer">`.

**Panel routes** (guards: RequireAuth → RequireRole USER → RequirePasswordOk; ADMIN goes to `/admin`):
- `/panel` Resumen: status banner, completeness checklist, "Enviar a revisión", stats.
  - Status banner values: Borrador / En revisión / Aprobado / Rechazado + motivo / Suspendido + motivo.
  - The checklist is `profileCompleteness()` from shared.
  - Stats: new requests, link to the public page when approved.
- `/panel/crear`: onboarding when the user has no DJ yet. Artist name, slug with live availability, type (Solista / Dúo / Grupo). RequireNoDj, the reverse of RequireDj.
- `/panel/perfil`: Perfil y textos + palette + contact channels + hero CTAs.
- `/panel/fotos`: hero photo, index card photo, gallery.
- `/panel/integrantes`
- `/panel/fechas`: tabs Próximas / Archivadas.
- `/panel/rider`
- `/panel/redes`
- `/panel/formulario`
- `/panel/solicitudes` and `/panel/solicitudes/:id` (AntD Drawer)
- `/panel/cuenta`: change password, change email, close other sessions.
- `/panel/vista-previa`: opens `/_preview` in a new tab.

**Admin routes** (RequireRole ADMIN; a USER gets the NotFound page, which reveals nothing):
- `/admin`: counters (pending approval, requests in the last 7 days, new users).
- `/admin/djs?estado=&q=`
- `/admin/djs/destacados`: drag order of featured DJs.
- `/admin/djs/:djId/editar/*`: the same editor routes as the panel, wrapped in `<DjEditorScope scope={{kind:'admin', djId}}>`.
- `/admin/usuarios`
- `/admin/solicitudes`
- `/admin/auditoria`
- `/admin/cuenta`

**Slug collisions:**
- `shared/reservedSlugs.ts` exports `APP_TOP_LEVEL_ROUTES`, which router.tsx imports when building its top-level paths. `RESERVED_SLUGS` is that list plus:
  - `api media assets static uploads img images icons eventos favicon.ico robots.txt sitemap.xml manifest.webmanifest health healthz well-known www beta fersua fersuastudio soporte ayuda contacto blog djs dj buscar nuevo crear editar auth logout signup signin register account cuenta perfil user users usuarios root null undefined index home inicio 404 500`
  - Legacy slugs `allset pedido diannmakinne molly`; only the admin can release these.
- Slug regex: `^[a-z0-9](?:[a-z0-9]|-(?!-)){1,38}[a-z0-9]$` (3–40 characters).
- A unit test asserts every top-level route is in `RESERVED_SLUGS`. React Router already ranks static segments above `:slug`, so the reserved list only has to stop DJs from claiming them.

**Legacy and case handling:**
- The server 301s `/MacflyMikebran` (slug alias table) and any non-lowercase path.
- Client fallback: if `slug !== slug.toLowerCase()`, `<Navigate replace>`. If the API answers `{redirectTo}`, `navigate('/'+redirectTo, {replace:true})`.
- Old `/Eventos/MacflyMikeBran/*` URLs should 301 to the DJ page (deploy area).

**Login `next`:** accepted only if it matches `^/(panel|admin)(/|$)`, which prevents open redirects.

## 3. Public DJ page: componentizing the template

**Theme surface (exact background fidelity).**
- `PublicLayout` sets `document.documentElement.dataset.surface='public'` and `dataset.palette=<id>` in a `useLayoutEffect`, and clears them when unmounting into the panel.
- The server render endpoint writes the same attributes on `<html>` so there is no palette flash on first paint.
- CSS in `base.css`, a verbatim port of the template with the palette variables:

```css
html[data-surface=public], html[data-surface=public] body{height:100%}
html[data-surface=public] body{margin:0;font-family:"Inter Variable",Inter,system-ui,…;color:var(--text);
  background:radial-gradient(900px 700px at 0% 0%, rgb(var(--accent-rgb)/.25), transparent 55%),
             radial-gradient(800px 600px at 100% 100%, rgb(var(--accent-2-rgb)/.22), transparent 55%), var(--bg);}
```

**Palettes.**
- `palettes.css` defines `html[data-palette="fuego"]{--accent:#f97316;--accent-rgb:249 115 22;--accent-2:#ec4899;--accent-2-rgb:236 72 153;--on-accent:#fff;--bg:#020617;--bg-soft:#0b1120}`, and so on for each palette.
- Hard-coded rgba values in the template are converted to these variables:
  - `.hero::before`
  - `.btn-primary` box-shadow
  - `.media-tab-btn.is-active` (background, border, shadow)
- `.btn-primary` and the active tab use `color:var(--on-accent)`.
- `--text`, `--muted` and `--border` are the same for every palette, which guarantees contrast.
- Eight palettes, all in `shared/palettes.ts` with Spanish names:

| id | accent / accent-2 | `--on-accent` |
|---|---|---|
| fuego (default) | #f97316 / #ec4899 | #fff |
| neon-violeta | #a855f7 / #22d3ee | #fff |
| oceano | #0ea5e9 / #6366f1 | #fff |
| atardecer | #f59e0b / #ef4444 | #fff |
| rosa-electrico | #ec4899 / #8b5cf6 | #fff |
| esmeralda | #10b981 / #06b6d4 | #fff |
| acido | #84cc16 / #22d3ee | #0b1120 |
| monocromo | #e5e7eb / #9ca3af | #0b1120 |

- A unit test checks that shared and CSS agree, and that `--on-accent` on both accents meets WCAG ≥ 4.5:1.

**CSS files.**
- `dj-template.css` is the template `<style>` copied verbatim, minus `:root`/`body`, and auto-prefixed with `.djp` by postcss-prefix-selector. Class names stay identical (`.hero`, `.chip`, `.btn`…), so it diffs 1:1 against the template, and AntD's `ant-` classes never collide.
- `dj-additions.css` holds only new things:
  - `select` added to the `input,textarea` rule
  - `input[type=checkbox]{width:auto}`
  - `:focus-visible{outline:2px solid var(--accent);outline-offset:2px}`
  - 16px inputs at ≤640px
  - hit-area `::after`
  - `.hero-right--single{grid-template-rows:1fr}`
  - `.sec-title` as h2 reset
  - `white-space:pre-line` for multi-line texts
  - dialog, lightbox and honeypot styles
  - `prefers-reduced-motion`

**Components.** `DjPublicView({dj, mode:'live'|'preview', initialEventId})` is pure (props in, markup out) so the page and the preview share it.

| Component | Markup | Template CSS kept |
|---|---|---|
| `DjPublicView` | `div.djp > div.shell` | `*`, `a`, `.shell`, @640 `.shell` |
| `DjNav` | `nav.nav > .nav-left(.brand, .nav-tag "Booking") + .nav-links` (#artistas #fechas #booking; a link is hidden if its section is empty) | `.nav*`, `.brand`, `.nav-tag`, `.nav-links a(:hover)`, @640 column |
| `DjHero` | `header.hero > .hero-left`: `.hero-label`, `h1.hero-title`, `p.hero-sub`, `.hero-genres > .chip`, `.hero-cta` (primary WhatsApp, secondary "#booking"), optional `.hero-note`, optional account `SocialLinks` row | `.hero`, `::before`, `.hero-left/right`, `.hero-label`, `.hero-title`, `.hero-sub`, `.hero-genres`, `.chip`, `.hero-cta`, `.btn*`, `.hero-note`, @960/@640 |
| `HeroPhoto` | `.hero-photo > ResponsiveImage + .hero-photo-caption(span, span)` | `.hero-photo`, `img`, `::after`, `.hero-photo-caption` |
| `HeroMiniCards` | `.hero-mini > .mini-card` ×≤2 (rider card and photos card, each hidden if empty; texts are editable: mini label, mini title, button text) | `.hero-mini`, `.mini-card`, `.mini-label`, `.mini-title`, `.mini-tabs`, `.media-tab-btn(.is-active)` |
| `MediaModule` | `section.media-module#media-module(.is-visible)` with `.media-inner[data-tab]` | `.media-module`, `.media-inner`, `.sec-title` |
| `GalleryGrid` | `.media-grid > figure.media-item > button > img` (opens the Lightbox) | `.media-grid`, `.media-item`, `img`, @640 2 columns |
| `RiderList` | keeps the template's exact markup per item, one `div.media-grid[role=listitem] > figure.media-item2 > b` each, inside `div[role=list]` (keeps the 1/3-width look) | `.media-item2` |
| `ArtistsSection` | `div.grid > section#artistas[aria-labelledby]` with `h2.sec-title`, `.sec-sub`, `.artists-list` | `.grid`, `section`, `.sec-title`, `.sec-sub`, `.artists-list`, @960 |
| `ArtistCard` | `article.artist-card > .artist-photo + div(h3.artist-name, .artist-role, p.artist-desc, .pill-row > .pill ×≤4, .socials > a[icon + label])` | `.artist-card`, `.artist-photo img`, `.artist-name`, `.artist-role`, `.artist-desc`, `.pill-row`, `.pill`, `.socials a`, @640 100px |
| `ShowsSection` | `section#fechas > h2, .sec-sub, div.shows > ShowItem*, optional "Disponible" row, p.shows-note` (the bug is fixed here) | `.shows`, `.shows-note` |
| `ShowItem` | `.show-item > .show-date` ("14 NOV", with `aria-label` = full date) + `.show-place` ("Venue · Ciudad") + `.show-cta > a/button` | `.show-item`, `.show-date`, `.show-place`, `.show-cta a`, @640 |
| `FlyerDialog` | native `<dialog>`: flyer image (black background, 12px radius, like the old Eventos page), event data, CTA button, "Cerrar" | new, in dj-additions |
| `Lightbox` | `<dialog>` with prev/next, arrow keys, Esc | new |
| `BookingSection` | `section#booking > h2.sec-title, .sec-sub, BookingForm` | `form label`, `input`, `textarea`, `.form-footer`, `.small` |
| `DjFooter` | `footer`: "© {year} {name} — Booking · Política de datos · Fersua Studio" | `footer` |

**Behaviour carried over from the template's script:**
- `activeTab` starts as `'photos'` (the button looks active), `moduleVisible=false`.
- Clicking a tab shows the module, switches the tab, calls `scrollIntoView({behavior: reducedMotion?'auto':'smooth'})` and then focuses the module (`tabIndex=-1`, `preventScroll`).
- Tab buttons get `aria-expanded` and `aria-controls="media-module"`.
- Gallery `<img>` elements are not rendered at all until the module opens. They are prefetched on `pointerenter`/`touchstart` of the Photos button.

**Event CTA logic** (`ShowItem`):
- If the event has a flyer, "Book" opens `FlyerDialog` and updates the URL to `/:slug/fecha/:id` (`replace`, no scroll).
- If not, the link goes straight to the CTA:
  - `ctaType=WHATSAPP`: `wa.me/<num>?text=` + encodeURIComponent of "Hola, quiero estar en el evento {venue} del {fecha}".
  - `ctaType=URL`: https only, `rel="noopener noreferrer nofollow ugc"`.
- The CTA label comes from a fixed list: Book / Reservar / Boletas / Info.
- Events are sorted by date on the server; past events are archived server-side.
- Dates are handled as `YYYY-MM-DD` strings, never `new Date(iso)`. `new Date('2026-11-14')` parses as UTC, which shows 13 NOV in Colombia.

**Texts** are plain React text only. Newlines are rendered with `pre-line`. Empty optional texts do not render their element.

**Metadata.**
- Crawlers: the API injects `<title>`, description, canonical, `og:*` (absolute 1200w WebP/JPEG URLs), JSON-LD `MusicGroup`/`Person` with `sameAs` = social links (no email, no phone placeholder), `theme-color` = palette `--bg`, and `robots index,follow`.
- Client navigation: React 19's native `<title>`/`<meta>` hoisting.

## 4. Live preview in the editor

- **Why an iframe:** the template's media queries (960/640) depend on viewport width, so the preview needs a real viewport. An iframe also isolates the page from AntD's reset.
- **`PreviewPane` (editor-kit):**
  - Always-on right column at ≥1200px.
  - Below that, a floating "Vista previa" button opens a full-screen Modal.
  - Device toggle: Móvil (390px, real width) or Escritorio (1280px scaled with `transform:scale()` to fit the pane).
- **Protocol:**
  - The parent loads `/_preview`. The frame posts `{type:'ready'}`.
  - The parent posts `{type:'draft', payload}` (debounced 150ms) and `{type:'scrollTo', anchor}` when the user focuses an editor section.
  - Both sides check `event.origin === location.origin` and `event.source` (parent side: `iframe.contentWindow`).
  - The frame makes no API calls when embedded.
- **Standalone `/_preview`** (opened from "Vista previa completa") fetches `/me/dj`, or `/admin/djs/:id` with `?dj=` for the admin, through the normal auth flow.
- **Draft data:** `DraftProvider` holds the saved profile from TanStack Query and per-section overrides `setSectionDraft(section, values)` fed by each AntD `Form`'s `onValuesChange`. `mergedDraft = merge(saved, drafts)`. A section's draft is cleared after its save succeeds.
- **Images in the preview:** they are uploaded immediately on selection, so the preview always uses real `/media` URLs. No `blob:` URLs are needed.
- **Preview mode:** booking submit shows "Vista previa: el formulario no se envía". Links still work.
- **Server/nginx requirement:** `frame-ancestors 'self'` (instead of HabitFer's `X-Frame-Options: DENY`).

## 5. Index page (`/`)

- **Nav:** the same `.nav` / `.brand` / `.nav-tag`: "FERSUA STUDIO" + "Booking". Links: "Artistas" (#djs), "¿Eres DJ?" → /registro, "Ingresar" (or "Mi panel" when the session hint cookie exists).
- **Hero:** `.hero` styles.
  - Label "Fersua Studio · Booking", h1 "DJs para tu evento", subtitle (owner copy), CTAs "Ver artistas" (primary) and "Registra tu proyecto" (secondary).
  - Right side: mosaic of up to 3 featured card photos in `.hero-photo` frames. With no featured DJs it becomes the single-column variant.
- **Filters:** `input[type=search]` ("Buscar por nombre, género o ciudad", 250ms debounce), synced to `?q=&genero=` with `replace`.
  - Genre chips reuse `.chip` as `<button aria-pressed>`; active chips use the `.media-tab-btn.is-active` gradient. "Todos" first.
  - The chips are built from the genres present in approved DJs, with counts.
  - All approved cards arrive in one payload (a few dozen), so filtering happens on the client and is instant. Normalize with `normalize('NFD')` so accents are ignored.
- **Order:** featured by admin order, then by next event date ascending (DJs without events last), then name. The API returns this order and the client keeps it after filtering.
- **`DjCard`:** the whole card is `<a href="/slug">`.
  - Styled like `.artist-card`: 22px radius, `--border`, radial background.
  - 4:5 photo with focal point and the `.hero-photo::after` gradient.
  - Name uppercase, weight 800, letter-spacing .06em.
  - Up to 3 `.chip` genres plus "+N".
  - Next-date row in `.show-item` style: "PRÓXIMA FECHA · 14 NOV · Ramasound Garden", or "Agenda abierta".
  - `.nav-tag` badge "Destacado".
  - Per-card `data-palette` for the hover/focus glow.
  - On `pointerenter`/`touchstart`, `prefetchQuery(publicDj(slug))` and preload the hero image.
  - Grid: `repeat(auto-fill,minmax(240px,1fr))`, gap 14px.
- **States:**
  - Loading: 6 skeleton cards (shimmer off under reduced motion).
  - No DJs: "Pronto verás aquí a nuestros artistas." + registration CTA.
  - No results: "No encontramos DJs con esos filtros." + "Limpiar filtros".
  - Error: message + "Reintentar".
- **Footer:** "© 2026 Fersua Studio · Política de datos · Términos · Ingresar".

## 6. Data layer

**Initial data (the most important performance and preview win).**
- Pages are shared as Instagram/WhatsApp links. Those crawlers don't run JS, so link previews need server-rendered meta tags.
- Nginx proxies the HTML document for `/`, `/:slug` and `/:slug/fecha/:id` to an API render endpoint. That endpoint:
  - fills `<!--ssr-head-->` and `<script id="__INITIAL_DATA__" type="application/json">{"route":"dj","slug":"…","data":{…}}</script>`;
  - escapes `<`, `>`, `&`, U+2028 and U+2029;
  - adds a `<link rel=preload as=image imagesrcset imagesizes fetchpriority=high>` for the hero;
  - gets the `index.html` template from `http://web/index.html` (cached);
  - falls back to plain `index.html` if the API is down.
- The client reads it once in `initialData.ts`, removes the node, and uses it only when `route`/`slug` match. It seeds `queryClient.setQueryData(qk.publicDj(slug), data)`. JSON data blocks are allowed under `script-src 'self'`.
- This needs sign-off from the backend and deploy areas.

**Two clients.**
- `lib/publicApi.ts`: about 40 lines of `fetch`, used by the index, DJ page and booking POST. Keeps axios out of the public bundle.
- `lib/http.ts` (axios, loaded only by auth/panel/admin chunks):
  - `baseURL:'/api'` (same origin, so no CORS), `timeout:20000`, `withCredentials:true`.
  - Header `X-Requested-With: fersua` on every call: a CSRF guard that the refresh endpoint checks together with a `SameSite=Strict` cookie scoped to path `/api/auth`.

```ts
// authToken.ts: access token in memory only, never localStorage
let token: string | null = null; const subs = new Set<(t:string|null)=>void>();
// http.ts
let refreshing: Promise<string> | null = null;
export function refreshOnce() {
  refreshing ??= crossTabLock(async () => {
    const recent = latestBroadcastToken(); if (recent && !expiresWithin(recent, 30)) return use(recent);
    const { data } = await raw.post('/auth/refresh');           // raw = axios instance without interceptors
    setAccessToken(data.accessToken); bc.postMessage({ type:'token', token:data.accessToken });
    return data.accessToken;
  }).finally(() => { refreshing = null; });
  return refreshing;
}
const crossTabLock = <T,>(fn:()=>Promise<T>) =>
  navigator.locks ? navigator.locks.request('fersua-refresh', fn) : fn();
http.interceptors.response.use(undefined, async (err) => {
  const cfg = err.config;
  if (err.response?.status !== 401 || cfg._retried || cfg.url?.startsWith('/auth/')) throw err;
  cfg._retried = true;
  try { await refreshOnce(); } catch { onSessionExpired(); throw err; }
  return http(cfg);
});
```

- **Cross-tab safety:** if refresh tokens rotate with reuse detection, two tabs refreshing at the same moment will kill the session. Prevent it with Web Locks + `BroadcastChannel('fersua-auth')` sharing the new token, plus a backend grace window of about 20 seconds.
- **Proactive refresh:** decode `exp` (no verification) and refresh 60 seconds before it expires, and again on `visibilitychange` when the tab becomes visible.
- **Logout:** `POST /auth/logout`, clear the token, `queryClient.clear()`, broadcast `{type:'logout'}`.
- **Boot:**
  - Public routes render immediately.
  - `AuthProvider` calls `/auth/refresh` (which returns `{accessToken, user}`) only on `/panel`/`/admin` routes, or when the non-httpOnly hint cookie `fs_session=1` exists. Anonymous visitors never trigger a 401.
  - `user.mustChangePassword` forces `/cambiar-clave`.

**TanStack Query.**
- Key factory `qk`: `publicDjs`, `publicDj(slug)`, `me`, `dj(scope)`, `bookings(scope, filters)`, `adminDjs(filters)`, `adminUsers`, `audit(filters)`.
- Defaults: `staleTime` 30s (public 5 min); retry only on ≥500 or network errors, max 2; `refetchOnWindowFocus:false` for editor queries so open forms aren't overwritten.
- Optimistic updates with rollback for reorders and toggles.
- `If-Match`/`version` on profile PATCH. A 409 shows "Otro usuario modificó este perfil. Recarga para ver los cambios."; this matters when the admin edits a DJ's profile at the same time.
- Per-section explicit "Guardar cambios". Unsaved changes are protected with `useBlocker` + `beforeunload`.

**Validation parity.**
- AntD `rules` come from helpers over shared `LIMITS`, e.g. `maxLen(LIMITS.hero.title)`, and `LimitedInput` shows a live `n/max` counter.
- The public booking form uses native constraint attributes plus the shared `validateBookingSubmission`, the same function the server runs.
- Proposed `LIMITS` (owner and backend to confirm):
  - username 3–24 `[a-z0-9._]`; password 10–72
  - slug 3–40; name 60
  - hero: label 40, title 60, subtitle 600, note 160, captions 40
  - section subtitles 160; shows note 200
  - genres: max 6 from catalog, plus 3 custom tags of 24 characters
  - rider: 20 items × 60 characters
  - members: max 6; name 60, role 80, description 400; 4 pills × 24; 6 social links each
  - gallery: 12 photos
  - upcoming events: 30; venue 80, city 60, URL 300
  - account social links: 10
  - booking: text fields 120, message 2000
  - upload: 10 MB after client optimization, 40 MB raw before it
  - active form fields: 15

## 7. Panel editors (AntD; Sider becomes a Drawer at ≤768px; one column on mobile)

- **Perfil y textos (`/panel/perfil`):**
  - Artist name.
  - Slug: changing it creates a 301 alias; warn "Los enlaces viejos redirigirán a la nueva dirección".
  - Hero label/title/subtitle/note, photo captions, section subtitles (Artistas/Fechas/Solicitud), shows note, "Disponible" row toggle + text, mini-card texts.
  - Genres: AntD `Select` multiple from the shared catalog (max 6) + custom tags.
  - SEO description (160).
  - Palette: `Radio.Group` of swatch cards showing both gradients.
  - Contact channels: WhatsApp number with country `Select` (default +57) and digits-only validation (10–15), used for the hero CTA and the form hand-off; hero CTA text and prefilled message (120); notification email (not public).
- **Fotos:** hero photo (focal point), index card photo (4:5 crop + focal point), gallery (multi-select up to the free slots, sortable grid, alt text per photo, delete with confirm).
- **Integrantes:** sortable list of cards. Each has photo (focal point), name, role, description, pills, and per-member social links (platform `Select` from the fixed list + URL/handle).
- **Fechas:**
  - Table/cards with date (AntD DatePicker, date-only, min today, max +2 years), optional time, venue, city, optional flyer (no crop, whole image), CTA type (WhatsApp / URL) + URL + label from the fixed list.
  - "Duplicar" action.
  - Archive tab is read-only, with delete.
  - Events are ordered chronologically, not dragged. I'm deviating from the brief here: a manual order would contradict the dates. Drag-reorder applies to gallery, members, rider, social links, form fields and featured DJs.
- **Rider:** sortable list of text items + "Agregar" (disabled at 20).
- **Redes:**
  - Sortable list; one row per platform (no duplicates).
  - Platforms: Instagram, TikTok, SoundCloud, Spotify, YouTube, Facebook, Beatport, Mixcloud, Resident Advisor, X, WhatsApp, Sitio web.
  - Accepts `@usuario` for Instagram/TikTok/X/SoundCloud and normalizes it to a URL.
  - Checked against the platform's `hostAllowlist` in shared.
- **Formulario:**
  - Left: "Campos activos", sortable. Each row has a drag handle, label input (max 60, placeholder = catalog default), Obligatorio switch and remove.
  - Right: "Catálogo" grouped Contacto / Evento / Otros; already-used fields are disabled.
  - Rule shown inline: at least one required contact field (email or phone).
  - The consent checkbox is always present and not editable.
  - Default config for new DJs matches the template: Nombre y empresa / productora (required), Email (required), Fecha del evento, Ciudad / Lugar evento, Detalles del evento.
- **Solicitudes:**
  - List with status Tabs (Nuevas / Leídas / Respondidas / Archivadas) and an unread badge in the menu (polled every 60s while the tab is visible).
  - Drawer shows fields using the labels snapshotted at submission time.
  - Actions: "Responder por WhatsApp" (to the requester's phone), "Responder por correo" (`mailto:`), change status, delete.
- **Resumen:** status, reason from the admin, checklist, "Enviar a revisión" (enabled when complete), "Ver mi página" / "Vista previa".

## 8. Admin

- **DJs table:**
  - Columns: photo, name, slug link, user, status `Tag`, Destacado `Switch`, next date, request count, created date, actions `Dropdown`.
  - Actions: Aprobar, Rechazar (motivo required), Suspender (motivo), Reactivar, Editar, Ver página, Asignar a usuario, Eliminar (type the slug to confirm).
  - Status `Segmented` filter with counts (Pendientes default / Aprobados / Rechazados / Suspendidos / Borradores / Todos) + search.
- **Destacados:** a drag list.
- **Editing any profile:** the same editor pages, with the banner "Estás editando «X» como administrador. Los cambios quedan en la auditoría". `useDjApi()` resolves `/me/dj` or `/admin/djs/:id` from `DjEditorScope`.
- **Usuarios:**
  - Columns: username, email, role, status, assigned DJ, last login.
  - Actions:
    - "Restablecer contraseña": a Modal choosing temporary password or email link. A temporary password is shown once with a copy button and "No se volverá a mostrar"; it sets `mustChangePassword`.
    - Bloquear / Desbloquear.
    - Cerrar sesiones.
    - Asignar perfil DJ: a Select of DJs without an owner. This is how the Mac Fly & Mike Bran seed account gets handed over.
  - The admin cannot block or delete themselves.
- **Solicitudes:** everything across DJs, with a DJ filter; same Drawer.
- **Auditoría:** Table with actor, action, entity, date, IP; filters by action, actor and date range; collapsed JSON diff per row.

## 9. Image uploads and responsive images

**Pipeline** (`editor-kit/imagePipeline.ts`, panel chunk only):
1. Pre-check: MIME + extension + magic bytes of the first 12 bytes (JPEG/PNG/WebP). HEIC gets the specific message. Raw size ≤ 40 MB.
2. Read dimensions and warn below the minimum width: hero 1200, gallery/flyer 800, member/card 500. Message: "Se verá borrosa", with the option to continue.
3. Downscale if the long edge exceeds 2560px or the file exceeds 4 MB:
   - `createImageBitmap(file,{imageOrientation:'from-image', resizeWidth…})`, falling back to `<img>` + canvas (2560 long edge stays under the iOS canvas limit);
   - `canvas.toBlob('image/jpeg', 0.9)` (Safari can't encode WebP).
   - Re-encoding also strips EXIF/GPS on the client; the server strips again.
   - If decoding fails and the file is ≤ 10 MB, upload the original. Otherwise: "La imagen es muy pesada; redúcela e intenta de nuevo."
4. Upload with axios `onUploadProgress` + `AbortController` (Cancelar). Tile states: "Optimizando…" → "Subiendo 45 %" → "Procesando…" → done.
5. Queue with concurrency 2, because sharp on a single vCPU is the bottleneck.

**Crop and framing guidance.**
- Hero, member and card containers change aspect ratio between desktop and mobile, so they store a focal point `{focalX, focalY}` (0–100), applied as `object-position` through the React style prop (CSSOM, so it is allowed under CSP).
- `FocalPointPicker`: click or drag, arrow keys, and two live thumbnails "Así se ve en celular / en computador".
- The index card also gets a 4:5 `react-easy-crop` crop.
- Gallery and flyers are not cropped.

**Rendering** (`ResponsiveImage`):
- The server returns `MediaAsset {id, width, height, dominantColor, focalX, focalY, variants:[{w, url}]}` with WebP variants at 320/640/960/1440/1920 (never upscaled), served as immutable `/media/…` files.
- The component outputs `srcSet`, `sizes`, `width`/`height` (no layout shift), dominant-color placeholder background, `loading="lazy"` except the hero (`eager` + `fetchPriority="high"`), and `decoding="async"`.
- `sizes` per usage:

| Usage | sizes |
|---|---|
| hero | `(max-width:960px) calc(100vw - 64px), 440px` |
| member | `(max-width:640px) 100px, 115px` |
| gallery | `(max-width:640px) 50vw, 360px` |
| card | `(max-width:560px) 100vw, 280px` |
| flyer | `min(92vw,720px)` |

## 10. Booking form

- Fields render from `dj.formConfig` (ordered `{key,label,required}`) joined with shared `FIELD_CATALOG[key]`: `{type, maxLength, autoComplete, inputMode, defaultLabel, placeholder, options?, min?, max?}`.
- Catalog:
  - `fullName`, `company`, `email1-3`, `phone1-3`, `address1-2`, `eventDate`, `eventTime`, `city`, `venue`, `message`.
  - `eventType`: select of fixed options.
  - `budget`: select of fixed COP ranges.
  - `setDuration`: select.
  - `attendees`: number 1–100000.
- Required fields are marked `*` with the legend "* Campo obligatorio". Each field gets `aria-invalid` and `aria-describedby`. On submit, the error summary focuses the first invalid field. Inputs use `enterkeyhint` and `autocomplete` tokens (name, organization, email, tel, address-line1, address-level2).
- **Anti-spam:**
  - Honeypot `input name="website"` in a visually hidden `div aria-hidden="true"` with `tabIndex={-1}` and `autoComplete="off"`.
  - Time-trap: `POST /public/djs/:slug/form-token` is fetched lazily on the first focus of any field (so readers who never book cost nothing), and submit awaits it.
  - An `Idempotency-Key` UUID per form instance means retries don't create duplicates.
  - The button is disabled while sending.
- **Consent** (required checkbox): "Autorizo el tratamiento de mis datos personales conforme a la [Política de tratamiento de datos] (Ley 1581 de 2012)." The link opens `/privacidad` in a new tab so the form isn't lost. The template's small note is kept. `consent:true` and `consentVersion` are sent.
- **Success (in `lib/whatsapp.ts`):** the API returns `{id, whatsappUrl|null}`.

```ts
const WA = /^https:\/\/wa\.me\/\d{8,15}(\?text=[^#\s]*)?$/;
export function openWhatsApp(url: string): boolean {
  if (!WA.test(url)) return false;
  if (isInAppBrowser()) { location.assign(url); return true; }   // Instagram/FB webviews (UA: Instagram|FBAN|FBAV)
  const w = window.open(url, '_blank');                              // never pass 'noopener' here: it always returns null
  if (w) { w.opener = null; return true; }
  location.assign(url); return true;                                 // iOS Safari blocks popups after an await
}
```

- After success the form is replaced by a panel: "¡Solicitud enviada!" + an "Abrir WhatsApp" `<a>` button. The button is a real tap, so it always works. The state is kept in `sessionStorage` per slug, so returning from WhatsApp doesn't show an empty form.
- With `whatsappUrl` null: "Tu solicitud fue enviada. Te contactaremos pronto."
- **Errors:**
  - 400 `{errors:{fieldKey: code}}` is mapped to the fields.
  - 429: "Has enviado varias solicitudes seguidas. Intenta de nuevo en unos minutos."
  - Network error: keep the data and offer "Reintentar".

## 11. Performance

- **Splitting:**
  - Entry chunk: react, router, TanStack Query, publicApi, Index + DJ page.
  - Separate lazy chunks: `auth-*`, `panel-*`, `admin-*`, `vendor-antd` (manualChunks), dnd-kit, react-easy-crop.
  - CI script reads `dist/.vite/manifest.json` and fails if the entry chunk graph contains `antd`, `axios` or `dayjs`.
- **Budgets** (checked in CI on `dist` + Lighthouse CI on the seeded DJ page, mobile profile):
  - public JS ≤ 110 KB gzip; CSS ≤ 15 KB gzip; font ≤ 45 KB (self-hosted Inter variable, latin, `font-display:swap`, preloaded).
  - First load of the DJ page at 390px/DPR3 about 400 KB: hero 640w ≈ 100 KB, members ≈ 40 KB.
  - Hard ceiling 1.5 MB including an opened gallery (12 × about 60 KB).
  - LCP < 2.5 s on 4G; CLS < 0.05.
- **Loading behaviour:**
  - Gallery is not rendered until opened.
  - Flyers load only in the dialog.
  - Hero is preloaded by the server.
  - Index → DJ navigation uses prefetch + cache seeding.
  - `Intl.DateTimeFormat('es-CO')` instead of dayjs on public pages.
  - No service worker.
- **Caching (for deploy):**
  - `/assets/*` and `/media/*`: `public, max-age=31536000, immutable`.
  - HTML: `no-cache`.
  - Public API: `max-age=60, stale-while-revalidate=300`.

## 12. Accessibility and mobile (Instagram in-app browser first)

- **Structure:**
  - Skip link "Saltar al contenido".
  - One `h1` (hero title; defaults to the DJ name if empty), section `h2`s with `aria-labelledby`, `h3` artist names.
  - `lang="es-CO"`.
- **Touch and focus:** 44px hit areas without visual change (the `::after` trick); `:focus-visible` rings.
- **Dialogs:** native `<dialog>` + `showModal()` for focus trap and Esc; focus returns to the trigger.
- **Media tabs:** ARIA as in §3; module focus after scroll.
- **Form:** 16px inputs on mobile (no iOS zoom).
- **Layout:** `100dvh`, `env(safe-area-inset-*)` padding in dialogs.
- **Motion:** `prefers-reduced-motion` disables smooth scroll, transitions and the skeleton shimmer.
- **Contrast:** `--muted` #9ca3af on #0b1120 is about 7.5:1 (OK); `--on-accent` is checked per palette.
- **Social icons:** decorative, so `aria-hidden` with the text label kept (the template shows labels). Icon-only links get `aria-label` = platform + name.
- **Optional:** a sticky "Solicitar booking / WhatsApp" bar on mobile after scrolling past the hero. It's a deviation from the template, so it would be a per-DJ toggle (open question 5).
- **Panel on phones:**
  - dnd-kit `TouchSensor` with a 200ms delay so scrolling still works, plus keyboard sensor.
  - "Subir / Bajar" buttons as an accessible fallback.
  - Full-screen preview modal.
- **Testing:** automated axe checks in Playwright on `/`, `/:slug`, `/login` and `/panel/perfil`.

## 13. Spanish UI copy conventions (`src/i18n/es.ts`, no i18n library)

- **Voice:** Colombian Spanish with "tú", which the template already uses ("Completa los datos… te responderemos").
- **Case:** sentence case in panel titles and buttons ("Guardar cambios", "Enviar a revisión"). Public data is stored in normal case and uppercased by CSS.
- **Fixed terms:** DJ, perfil DJ, fechas, integrantes, redes, rider técnico, solicitudes, destacado.
- **Statuses:** Borrador, En revisión, Aprobado, Rechazado, Suspendido.
- **Formats:** public dates "14 NOV" with the full date in `aria-label`; panel dates "sáb 14 nov 2026"; money `es-CO` COP ("$ 1.500.000").
- **Template English:** kept as editable defaults ("Booking", "Book", "Live Setup", "Highlights"). The seed fixes "Rider Tecnico" → "Rider técnico".
- **Error codes → messages:** the API returns codes (`INVALID_CREDENTIALS`, `USERNAME_TAKEN`, `SLUG_TAKEN`, `SLUG_RESERVED`, `ACCOUNT_SUSPENDED`, `RATE_LIMITED`, `VERSION_CONFLICT`, `FILE_TYPE`, `FILE_TOO_LARGE`, `LIMIT_REACHED`…), mapped to Spanish.
- **No account enumeration:**
  - Login failure: "Usuario o contraseña incorrectos".
  - Recovery: "Si los datos coinciden con una cuenta, enviaremos un enlace al correo registrado."
- **Confirms:** "¿Eliminar esta foto? Esta acción no se puede deshacer."
- **Toasts:** "Cambios guardados".
- **Auth pages** use the public look (`.shell`, section card, template inputs, `.btn-primary`), not AntD.
  - Show-password toggle.
  - `autocomplete` `username` / `current-password` / `new-password`.
  - Password rules shown inline: ≥10 characters, must not contain the username, not in a small common-password list. No zxcvbn (too heavy).

## 14. Frontend security

- Access token only in memory; refresh token in an httpOnly Secure `SameSite=Strict` cookie at path `/api/auth`, plus the `X-Requested-With` header.
- No `dangerouslySetInnerHTML`.
- All DJ URLs go through `safeUrl()`, which allows `https:` only and applies per-platform host allowlists. Links carry `rel="noopener noreferrer nofollow ugc"`.
- Sanitized `next` parameter (no open redirects).
- Reset token in the URL fragment.
- Uploads validated on the client for UX only; the server is authoritative.
- **Proposed CSP:** `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; form-action 'self'; base-uri 'self'; object-src 'none'`.
  - `style-src` needs `'unsafe-inline'` only because AntD injects its styles at runtime.
  - No Google Fonts or third-party scripts.
- `noindex` by default in `index.html`; the render endpoint flips it only for `/` and approved slugs; `beta.` gets `X-Robots-Tag: noindex` (deploy).
- `npm audit` in CI, like HabitFer's `security.yml`.

## 15. API contract the frontend expects (for backend alignment)

**Public:**
- `GET /api/public/djs` → `PublicDjCard[]`
- `GET /api/public/djs/:slug` → `PublicDjProfile`, or `404`, or `{redirectTo}`
- `POST /api/public/djs/:slug/form-token`
- `POST /api/public/djs/:slug/bookings` → `{id, whatsappUrl}`

**Auth:**
- `POST /api/auth/{register,login,refresh,logout,logout-all,forgot-password,reset-password,change-password}`
- `GET /api/auth/me`
- `GET /api/auth/username-available?u=` (rate limited)

**Me:**
- `GET|POST|PATCH /api/me/dj`
- `POST /api/me/dj/submit`
- `GET /api/me/dj/slug-available?s=`
- `POST /api/me/dj/media` (multipart `file` + `kind`) → `MediaAsset`
- `PATCH /api/me/dj/media/:id` (`alt`, `focal`)
- `DELETE /api/me/dj/media/:id`
- `/api/me/dj/members` CRUD + `PUT …/order`
- `/api/me/dj/events` CRUD
- `PUT /api/me/dj/gallery/order`
- `PUT /api/me/dj/rider`, `PUT /api/me/dj/socials`, `PUT /api/me/dj/form-config` (full-list replace, validated atomically)
- `GET /api/me/dj/bookings`, `GET|PATCH|DELETE /api/me/dj/bookings/:id`

**Admin:**
- `/api/admin/djs?status&q`
- `/api/admin/djs/:id/**` mirroring `me/dj`
- `POST …/:id/{approve,reject,suspend,reactivate,assign}`
- `PATCH …/:id/featured`
- `PUT /api/admin/djs/featured-order`
- `DELETE …/:id`
- `/api/admin/users` + `POST …/:id/{reset-password,block,unblock,revoke-sessions}`
- `/api/admin/bookings`
- `/api/admin/audit`

**Render endpoint** for HTML injection (§6).

## 16. Tests

- **Vitest:**
  - shared validators;
  - `BookingForm` rendering and validation parity from a config;
  - `formatShowDate`;
  - `openWhatsApp` branches;
  - reserved-routes test;
  - palette parity and contrast test;
  - http single-flight refresh (N parallel 401s cause 1 refresh).
- **Playwright end-to-end:**
  - register → create DJ → submit → admin approves → shows on `/` → booking saved + WhatsApp URL;
  - admin temporary password → forced change;
  - `/MacflyMikebran` returns 301.
- **Visual regression:** the seeded Mac Fly & Mike Bran page vs `tests/visual/template-reference.html` (the original with only the bugs fixed), at 390×844 and 1280×800, `maxDiffPixelRatio 0.02`. This is the objective proof of "se ve tal cual".

## 17. Frontend implementation order

1. **F0:** scaffold `web/`, workspace link to `@fersua/shared`, ESLint restrictions, Vite proxy, router skeleton, CSS port + palettes.
2. **F1:** `DjPublicView` fed from a static seed JSON + visual regression test. The owner validates the look before any backend work.
3. **F2:** publicApi, initial-data hydration, IndexPage.
4. **F3:** auth pages, `http.ts` refresh, guards, `/cambiar-clave`.
5. **F4:** panel layout, onboarding, section editors, ImageUploader/Focal/Crop, dnd, preview iframe.
6. **F5:** booking form + inbox.
7. **F6:** admin (reuses the editor).
8. **F7:** budgets, Lighthouse, axe, end-to-end, copy review.

## 18. Questions for the owner (frontend decisions)

1. After approval, do a DJ's edits go live immediately (recommended, with audit log and suspend available), or does every change need re-approval?
2. Genres: a fixed filterable catalog (max 6) plus up to 3 free display-only tags (e.g. "Jackin & Funky"). OK?
3. Events ordered automatically by date, with no drag. OK?
4. Where do account-level social links go? Proposed: under the hero buttons and in the footer. They don't exist in the template today.
5. Optional sticky "Solicitar booking" bar on mobile: yes/no?
6. Brand for the index page: use `public_html/imagenes/logo.jpeg` / `SIN FONDO.png` as the Fersua Studio logo? Hero copy?
7. Should email verification be required (recommended, so recovery emails reach the real owner)?
8. What COP ranges should the "Presupuesto" field offer?
9. Do you accept the corrected layout (booking card inside the 1120px width, gaps between dates)? The live page shows those broken today.
10. After the apex DNS switch, what happens to `/Allset`, `/pedido`, `/DiannMakinne` and `/Molly`? Keep serving them as static files from the VPS, or move them?

### Critical Files for Implementation
- C:\Fernando\Desarrollo\hostinger\public_html\MacflyMikebran.html (visual source of truth; its CSS becomes `web/src/public/dj/dj-template.css`)
- C:\Fernando\Desarrollo\hostinger\fersua-djs\web\src\public\dj\DjPublicView.tsx (new; shared by the public page and the preview iframe)
- C:\Fernando\Desarrollo\hostinger\fersua-djs\web\src\lib\http.ts (new; in-memory token, single-flight and cross-tab refresh)
- C:\Fernando\Desarrollo\hostinger\fersua-djs\shared\src\limits.ts (new, with fieldCatalog.ts, palettes.ts and reservedSlugs.ts; limits shared by client and server)
- C:\Fernando\Desarrollo\Personal\FersuaStore\HabitFer\web\Dockerfile and C:\Fernando\Desarrollo\Personal\FersuaStore\HabitFer\web\deploy\nginx.conf (patterns to reuse; CSP must change from `DENY` to `frame-ancestors 'self'`)