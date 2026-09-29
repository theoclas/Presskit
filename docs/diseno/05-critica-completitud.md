# Requirements-completeness critique of the 4 Fersua DJs designs, with a phased delivery plan

The 4 designs cover all 16 requirements, but they are not yet compatible with each other. Almost every shared identifier differs between them: enum values, model names, env var names, API paths, limits, the cookie name, the SSR contract and the media URL prefix. Several combinations of choices break outright on this VPS; they are listed in section C. We need a single "contract" document (section B) before anyone writes code.

Verified facts: the VPS IP is 177.7.40.130 (from the Dashboard docs). All 9 Mac Fly dates in `MacflyMikebran.html` (lines 933-1003) are in the past. The gallery references `photo-10/11/12`, which do not exist. The pills in the template are commented out.

---

## A. Coverage of requirements 1-16

| # | Status | Gaps and fixes |
|---|---|---|
| 1 Index | Covered | Three different sort rules. The backend paginates and searches on the server; the frontend filters on the client. **Fix:** `GET /api/public/djs` returns every visible card unpaginated (capped at 500). Order: `featured DESC, featuredRank ASC, nextEventDate ASC (nulls last, sorted in JS), approvedAt DESC`. In v1, compute `nextEventDate` when reading (few DJs), with no nightly job. The index hero copy and logo have no owner. |
| 2 DJ page | Covered | **All seeded events are past, so on beta "Fechas" shows only "Disponible". The page will not look "tal cual" unless the owner gives current dates.** Fixing the stray `</div>` changes the layout (booking card becomes 1120px wide, gaps come back), so the owner must approve it. "Book" today opens a flyer page. v1 = FlyerDialog without the `/:slug/fecha/:id` deep link. Do not build pills; they are commented out in the source. |
| 3 Registration/auth | Covered | Username rules differ: 3-24 `[a-z0-9._]` (data, frontend) vs 3-30 allowing `-` (backend). Use the data model's `USERNAME_RE` with `VarChar(24)`. Email is nullable in the data model and required in the backend. **Fix:** nullable column, required in `RegisterDto`. Email verification is an addition the owner did not ask for; he should confirm it. |
| 4 Admin | Covered | Three bootstrap methods (value in `.env` / `ADMIN_FORCE_RESET` / `docker compose run -e` with `read -s`). **Pick infra's runtime `-e`**, which matches "seeded from env vars" without persisting the secret. Deleting a user either cascades to the profile (backend) or sets it NULL (data). **Pick cascade after typed confirmation.** The frontend admin has no "create user" action, although the backend has `POST /admin/users`. |
| 5 One DJ per user | Covered | `userId` is nullable (data) vs required (backend). **Pick required** `userId @unique` plus `PATCH /admin/profiles/:id/owner`. Unassigned profiles break the rule "visible = APPROVED AND user ACTIVE". |
| 6 Recovery | Covered | Token TTL is 30 or 45 min; the fragment key is `#token=` or `#t=`. **Pick 30 min and `/restablecer#t=`.** Outbound SMTP on 465 from the VPS is untested (`nc -vz smtp.hostinger.com 465`). The `no-reply@` mailbox has to exist in the Hostinger plan. |
| 7 Customization | Partial | The backend `SocialPlatform` enum **has no WHATSAPP**, which the requirement lists explicitly. Limits differ in every design: gallery 12/24, upcoming events 30/40, stored events 60/250, upload 10/15 MB, quota 80/150/200 MB. Only the data model defines text slots. The backend has a `whatsappMessage` column that duplicates `texts.heroWhatsappMessage`. The frontend uses `focalX/focalY`, which no schema has. |
| 8 Form catalogue | Covered | Catalogues differ: the backend has `taxId` and a free-text `budget`; the data model excludes `taxId` and makes budget a COP select. Label length is 40 or 60. Storage is a `FormFieldConfig` table (data) or a `bookingForm Json` column (backend). The frontend caps active fields at 15; nobody else does. |
| 9 Booking submit | Partial | (1) The honeypot's fake 201 has no `whatsappUrl`. If a real user trips it (autofill of a field named `website`, which is also a catalogue key), the lead is lost silently. (2) The frontend fetches the token on first focus while the server requires a minimum age of 3 s, so a fast autofill submit gets rejected. After an expired token is refetched, an automatic retry is also "too fast", so it loops. (3) Nothing defines the `/privacidad` text or who the data controller is. (4) The data model builds the WhatsApp summary on the client; backend and frontend build it on the server. **Pick the server.** |
| 10 Palettes | Partial | Three incompatible palette sets. Data: SUNSET/MIAMI/NEON/ACID/INFERNO/OCEAN/GOLD/MONO. Backend: NEON_LIME/VIOLET/CRIMSON/AQUA. Frontend: lowercase Spanish ids. **Pick the data model's set** (complete tokens), with lowercase keys only in the `data-palette` attribute. The frontend's WCAG ≥4.5 test fails on the default SUNSET (2.8:1). Exempt it or ask the owner. |
| 11 Images | Covered | Three sets of variant widths. URL prefix is `/media` or `/uploads`; on-disk layouts differ. OG is its own kind (data) or derived from HERO (backend). **Pick derived:** drop `OG` and `ogImageId`. Nobody plans for how uploads backups grow (see C). |
| 12 Seed | Covered | Folder and script names differ, and so do the slug and the event years (2024-25 vs 2025-26). Credentials are either a random password that is thrown away or a temporary password printed once. **Pick thrown away; the admin issues a temporary password in M2.** Putting `api/prisma/seed.ts` in the data model's location breaks the Nest build path (C-8). |
| 13 Legacy 301 | Covered | The split is right: the edge handles `.html`, `/Eventos/*` and `/default.php`; the API shell handles case and the SlugRedirect table; the SPA fallback is a safety net only. The edge's `return 301` is broken (C-3). The table is called `SlugRedirect` or `SlugAlias`. **Pick `SlugRedirect`.** |
| 14 Rollout | Partial | The cutover runbook never flips `SEO_INDEXABLE=true`, so the apex would ship with `robots: Disallow /`. Beta is the production database: test DJs, users and bookings must be purged before cutover. Where Allset, pedido, DiannMakinne, Molly and the current landing page go is still open and **blocks cutover**. Add `REGISTRATION_OPEN` as an env flag for beta. |
| 15 Security | Covered (heavily) | The P0 conflicts are in section C. |
| 16 Structure | Covered | Answer to the owner: **one private repo** (monorepo), e.g. `theoclas/fersua-djs`. |

---

## B. Contradictions between the designs, with the recommended pick

| Topic | Variants | Pick |
|---|---|---|
| Shared package | `packages/shared` "@fersua/shared" (data) · `shared/src` (frontend) · `@fersua-djs/shared` (infra) · backend keeps its own `common/constants` + `catalogues` + `GET /public/meta` | `packages/shared`, name `@fersua-djs/shared`, tsup CJS+ESM. The backend's `common/*` re-exports it. Drop `/public/meta` (web imports shared at build time). Vite may alias to `src` in dev. |
| Model names | DjProfile / DjAccount (infra restore check) · Session / RefreshToken · UserToken / EmailToken · GalleryImage / GalleryItem · `sortOrder` / `position` | `DjProfile`, `RefreshToken`, `EmailToken`, `GalleryItem`, `sortOrder`. The data model's schema is the base, patched as listed in this table. |
| Status enum | `PENDING` vs `PENDING_REVIEW` | `PENDING_REVIEW` (the backend state machine and e2e tests use it) |
| Genre id | Int (data) vs cuid (backend `genreIds: string[]`) | Int |
| Collation | `utf8mb4_unicode_ci` (data) vs `utf8mb4_0900_ai_ci` (backend, infra my.cnf) | `utf8mb4_unicode_ci` in my.cnf too. Prisma migrate writes unicode_ci per table anyway; mixing collations is only a source of confusion. |
| Password hashing | bcrypt (infra `BCRYPT_ROUNDS`, owner convention) vs argon2id + zxcvbn (backend) vs frontend "10-72, no zxcvbn" | argon2id, 10-128 chars. Drop zxcvbn in v1 and use a shared `validatePassword` (length, not containing the username, top-10k deny-list) so client and server agree. |
| Event model | `place` + `startTime` (data) vs `title?` + `venue` + `time` (backend) | `date @db.Date`, `startTime?`, `title?`, `venue`, `city?`, `flyerId?`, `ctaType`, `ctaUrl?`, `ctaLabel?`. The API sends dates as `YYYY-MM-DD` strings. |
| Booking form storage | `FormFieldConfig` table vs `bookingForm Json` | JSON column: an atomic full-list PUT, merged with the catalogue on read, validated by the shared `validateFormConfig`. Label max 60. Catalogue = the data model's (no `taxId`). |
| IP storage | HMAC (data) vs raw `ip VarChar(45)` (backend) | `HMAC-SHA256(IP_HASH_SECRET, ip)` everywhere, `Char(64)`. |
| Env var names | `PUBLIC_BASE_URL` vs `PUBLIC_URL`; `UPLOAD_DIR=/data/media` vs `/app/uploads`; `ADMIN_EMAIL` vs `ADMIN_NOTIFY_EMAIL`; `JWT_REFRESH_SECRET` (infra only; refresh tokens are opaque); `BOOKING_FORM_SECRET`, `IP_HASH_SECRET`, `SEO_INDEXABLE` missing from `.env.prod.example`; `SPA_TEMPLATE_URL` vs `SHELL_TEMPLATE` | `PUBLIC_URL`, `UPLOAD_DIR=/data/media` served at `/media`, `ADMIN_NOTIFY_EMAIL`. Drop `JWT_REFRESH_SECRET` and `BCRYPT_ROUNDS`. Add `BOOKING_FORM_SECRET`, `IP_HASH_SECRET`, `SEO_INDEXABLE`, `REGISTRATION_OPEN`. `SHELL_TEMPLATE` is a file baked into the image. |
| SSR contract | Backend: `web` container, `@render`, `/api/seo/render` + `X-Render-Path`, internal `:8081` template fetch. Infra: one `edge` container, `/api/public/shell?path=`, `index.html` copied from the same `web-build` stage. Frontend: `__INITIAL_DATA__` + template from `http://web/index.html`. | **Infra's**: the edge proxies `/` and single-segment paths to `/api/public/shell`. v1 injects only the head (title, description, canonical, og, JSON-LD); `__INITIAL_DATA__` is phase 2. The shell's list of SPA routes comes from the shared `APP_TOP_LEVEL_ROUTES`. |
| API paths | `/me/profile/...` + `/admin/profiles/:profileId/...` (backend) vs `/me/dj`, `/admin/djs/:id` (frontend); `booking-requests` vs `bookings`; GET `booking-token` vs POST `form-token`; reinstate / reactivate; owner / assign; `PATCH feature` vs `PUT featured-order`; `/verificar-email` vs `/verificar-correo` | The backend's naming everywhere. SPA routes: `/restablecer`, `/verificar-correo`, `/cambiar-clave`, all in `RESERVED_SLUGS`. |
| Refresh cookie | `__Secure-rt`, Path=/api/auth (backend) vs `COOKIE_NAME_PREFIX=__Host-` (infra); the frontend expects an `fs_session=1` hint cookie that nobody sets | `__Secure-rt` (HttpOnly, Secure, SameSite=Strict, Path=/api/auth). The API also sets and clears a non-HttpOnly `fs_session=1` (Path=/). |
| Social platforms | 17 (data) / 14 without WhatsApp (backend) / 12 (frontend) | The data model's 17, host allow-lists in shared. |
| Media | Widths and prefixes differ; the frontend wants 320/640/960/1440/1920 plus focal points | The data model's `MEDIA_VARIANTS` without OG. The OG JPEG is generated from HERO. Focal points and client crop are phase 2 (server `attention` crop). |
| Limits | Every design has a different `LIMITS` table | The data model's `LIMITS`, changed as follows: upload 10 MB (after client downscale), quota 50 MB / 100 assets per DJ (real WebP variants total <30 MB even with a full gallery), events 30 upcoming / 100 stored with no auto-delete. |
| Honeypot / token | `hp` vs `website`; token lifetime 3 s-24 h vs 3 s-2 h | The honeypot's name must not collide with a catalogue key and must be unlikely to autofill. On a hit, return the normal success shape *including* `whatsappUrl` and just skip the DB insert. Fetch the token with an IntersectionObserver when the form scrolls into view. Minimum age 2 s, maximum 2 h. On `FORM_EXPIRED`, refetch and ask the user to press submit again; no automatic retry. |
| Seed slug | `macflymikebran` (data) vs `macfly-mike-bran` (backend, infra) | `macflymikebran`. The legacy URL then needs only the lowercase 301 and no alias row; this is the owner's call. |
| Seed location | `api/prisma/seed.ts` vs `src/cli/*` | `api/src/cli/*.ts` → `dist/cli/*.js`. Assets are mounted read-only at runtime (`-v ./api/seed-assets:/seed-assets:ro`), not baked into the image. |

---

## C. What breaks in production on this VPS (by priority)

**P0: blocks launch**

1. **Two CSP headers, so every DJ page is blank.** The backend's helmet CSP is `default-src 'none'`, and the infra edge adds its own CSP to the shell responses without `proxy_hide_header`. Browsers enforce the intersection of both. **Fix:** `helmet({ contentSecurityPolicy:false, frameguard:false })`; the edge owns every HTML security header.
2. **`__Host-` prefix combined with `Path=/api/auth`.** The browser drops the cookie, so the session dies on every reload or after 15 minutes. **Fix:** use `__Secure-`.
3. **Edge `return 301 /macflymikebran#fechas` builds `http://<host>:8080/...`.** nginx's default `absolute_redirect on` plus `port_in_redirect on` produce that URL, and 8080 is **HabitFer's public Caddy**, so users land in the wrong app over plain http. **Fix:** `absolute_redirect off;` in the edge `server{}`.
4. **`OriginGuard` reads `PUBLIC_BASE_URL` while compose passes `PUBLIC_URL`.** Either joi refuses to boot or every POST gets 403. Single variable name.
5. **Build out-of-memory.** BuildKit runs `web-build` (vite + antd, 768 MB heap) and `api-build` in parallel, after an `npm ci` of the whole workspace. That happens on 1 vCPU with about 2.1 GB free, shared with HabitFer, Dashboard and pm2. Swap needs sudo from the owner. **Pick one:** build in GitHub Actions and push to GHCR (recommended; the VPS needs a read-only `read:packages` token), or have the owner add 2 GB of swap before the first build.
6. **Missing `api/node_modules` in the runtime image.** The infra Dockerfile copies only `/repo/node_modules`. Any dependency npm could not hoist lives in `/repo/api/node_modules`, and the api then fails with "Cannot find module". **Fix:** `RUN mkdir -p api/node_modules` in `api-deps`, then `COPY --from=api-deps /repo/api/node_modules ./api/node_modules`.
7. **`migrate` with `read_only: true`.** The Prisma CLI may try to write its cache or checkpoint files. If `migrate` fails, `api` never starts (`service_completed_successfully`). **Fix:** remove `read_only` from `migrate` from the start.
8. **Nest output path.** If `prisma/seed.ts` is inside the tsconfig, Nest emits `dist/src/main.js` and `CMD node dist/main.js` crash-loops. **Fix:** keep the seed in `src/cli`; `tsconfig.build.json` excludes `prisma/`.

**P1: breaks or degrades features**

9. **Editor preview blocked.** The HTML CSP has `frame-ancestors 'none'` plus `X-Frame-Options DENY`, which blocks the preview iframe. **Fix:** `frame-ancestors 'self'` + `SAMEORIGIN`, or defer the iframe (section D).
10. **Booking rate-limit zone never applies.** The edge regex `^/api/public/[a-z0-9-]+/booking-requests$` does not match `/api/public/djs/<slug>/booking-requests`. **Fix:** `^/api/public/djs/[a-z0-9-]+/booking-requests$`.
11. **Sharp can get the api OOM-killed.** The backend allows 2 concurrent 40 MP decodes (about 160 MB raw each) inside a 512 MB container with a 256 MB heap. **Fix:** a queue with concurrency 1, `sharp.cache(false)`, 429 once more than 3 uploads are waiting, and 30 MP max input.
12. **Backups fill the disk.** The nightly full uploads tarball is kept 7 days on the same 30 GB disk as 3 image tags of about 400 MB each and the build cache. At the proposed quotas (80-200 MB per DJ) this runs out of disk. **Fix:** 50 MB quota, incremental uploads backup (`rsync --link-dest` or restic) and an off-site copy **before cutover**.
13. **Upload size limits disagree.** Host nginx allows 12 MB and the backend multer 15 MB, so users get nginx's HTML 413 instead of the JSON error the frontend expects. Align everything to a 10 MB API limit: edge 11m, host 12m.
14. **MySQL init script from Windows.** Committed without the executable bit, `01-app-user.sh` gets *sourced* by the entrypoint, and its `set -eu` then leaks into the entrypoint. **Fix:** `git update-index --chmod=+x`, drop `-u`, and keep `.gitattributes eol=lf`.
15. **Cron jobs in the wrong time zone.** The container runs in UTC. `@Cron` needs `timeZone:'America/Bogota'`. "Today" for events is always computed in Bogotá, and Prisma `@db.Date` values are sent as strings.
16. **Cutover gaps.**
    - `SEO_INDEXABLE` is missing from the runbook.
    - A leftover AAAA record pointing to Hostinger keeps IPv6 visitors on the old site (infra already covers this).
    - `www` must point to the VPS before certbot runs.
    - Legacy pages return 404 unless a subdomain is prepared.

---

## D. Over-engineering to defer to phase 2

1. **Live draft preview.** Iframe, postMessage draft protocol, device toggle, scaled desktop view. v1: save, then open `/_preview` in a new tab. This also removes C-9.
2. **Image framing tools.** FocalPointPicker, react-easy-crop, per-usage focal points. v1: server-side `attention` or centre crop. Keep the simple client downscale (`createImageBitmap`/canvas to 2560 px).
3. **SSR extras.** `__INITIAL_DATA__` hydration, hero preload links, the `/:slug/fecha/:id` route with a flyer og:image.
4. **Concurrency controls.** Optimistic `If-Match`/version and `Idempotency-Key`. A disabled button is enough in v1.
5. **Admin TOTP.** Offer it as the first phase-2 item. v1 relies on a strong password, lockout, and admin refresh limits of 1 day idle / 7 days absolute.
6. **Password strength and extra email flows.**
   - zxcvbn.
   - Emails on refresh-token reuse and on lockout.
   - The self-service email-change flow (the admin edits emails in v1).
   - Self-service account deletion (handled by the admin on request in v1; Ley 1581 is satisfied through the admin).
7. **Slug changes after approval.** v1: the DJ edits the slug only before approval; after that only the admin changes it, which creates a `SlugRedirect`.
8. **Extra profile features.** Custom genre tags, member pills, DJ type (Solista/Dúo/Grupo), duplicating events, auto-deleting old events.
9. **Admin extras.** Audit-diff UI, stats dashboard, drag-to-order featured DJs. v1: audit rows in a plain table, plus a featured toggle and a numeric rank.
10. **Scheduled jobs.** Retention purges (nothing reaches 24 months for two years). Keep only the token cleanup and the orphan-media sweep.
11. **The `Setting` table.** Replace it with env flags.
12. **Drag and drop.** dnd-kit everywhere is phase 2. v1 uses up/down buttons (dnd-kit at most for the gallery).
13. **Test and CI extras.** Lighthouse CI, bundle budgets, axe, 2-viewport visual regression. v1 keeps one Playwright snapshot of the Mac Fly page plus an e2e smoke test.
14. **Ops extras.** Trivy, auto-rollback in `deploy.sh`, Sentry, fail2ban, Turnstile, `dominantColor`, sha256 dedupe, the Web Locks / BroadcastChannel refresh. The backend's 20-second race window already covers two tabs refreshing at once.

**Keep in v1:** the route-guard matrix and IDOR e2e tests, the two DB users, the single-admin DB constraint, refresh rotation, lockout, magic-byte checks and gitleaks. They are cheap and directly serve requirement 15.

---

## E. Phased delivery (Mac Fly on beta as early as possible)

**M0: Contract and skeleton**
- Freeze section B in `docs/00-contrato.md`.
- Get answers to the blocking questions Q1-Q5.
- Create the monorepo with `packages/shared` (LIMITS, catalogues, validators, palettes, slug and username rules, `RESERVED_SLUGS` ⊇ `APP_TOP_LEVEL_ROUTES`) and its vitest tests.
- Write the full Prisma schema and migration 0001, and the dev compose (MySQL 127.0.0.1:3309 plus mailpit).
- CI: build, lint, unit tests, `migrate diff`, `npm audit --omit=dev --audit-level=high`, gitleaks, docker build (and a push to GHCR if chosen).

**M1: "Mac Fly en beta"** (public site plus booking, no login)
- **API:**
  - health;
  - `GET /public/djs` and `/public/djs/:slug`;
  - `/public/shell` with head injection, lowercase and SlugRedirect 301s, and a 404 page marked `noindex`;
  - booking-token and booking POST (save, consent, honeypot, throttle, `whatsappUrl`);
  - the media pipeline, used by the seed;
  - CLIs `admin:create`, `seed:genres`, `seed:macfly`.
- **Web:**
  - `DjPublicView` with the template CSS copied verbatim under the `.djp` prefix and the bugs fixed;
  - IndexPage (search and genre chips);
  - `/privacidad`;
  - the 404 page.
- **Infra:**
  - the Dockerfile with the fixes for C-6, C-7 and C-8;
  - `docker-compose.prod.yml` with `absolute_redirect off`, a single CSP owner and the booking regex fixed;
  - the host vhost for beta plus certbot (owner, sudo);
  - nightly DB and uploads backups;
  - a basic `deploy.sh`.
- **Needs from the owner:** current Mac Fly dates, the privacy-policy controller details, and the swap or GHCR decision.
- **Exit criteria:**
  - `beta.fersuastudio.com/macflymikebran` matches the Playwright snapshot and the owner signs off;
  - `/MacflyMikebran`, `/MacflyMikebran.html` and `/Eventos/MacflyMikeBran/*` return 301 to relative locations;
  - a booking is saved and WhatsApp opens;
  - the WhatsApp link preview shows the absolute og:image;
  - `SEO_INDEXABLE=false` and `REGISTRATION_OPEN=false`.

**M2: Admin**
- Auth: username login, refresh cookie, `/auth/me`, change-password, `mustChangePassword`, lockout.
- Admin: DJ list with approve, reject, suspend, reinstate, feature and delete; transfer owner; users with temporary-password reset, suspend and revoke sessions.
- All section editors mounted under `/admin/profiles/:id/*`: texts and palette, photos, members and socials, events and flyers, rider, socials, booking form.
- The global booking inbox and audit writes.
- **Exit:** the owner edits Mac Fly himself and hands over credentials through a temporary password.

**M3: Self-service for DJs**
- Registration with terms consent, `REGISTRATION_OPEN=true`, email verification, forgot/reset over Hostinger SMTP with SPF, DKIM and DMARC verified.
- The `/me/*` mounts of the same editors, onboarding (profile plus slug), submit for review, status banners.
- The DJ's inbox and notification emails.
- The security e2e suite: IDOR, guard matrix, mass assignment, lockout, booking validation.

**M4: Cutover**
- Off-site backups and a restore drill, UptimeRobot and healthchecks.io.
- Legacy pages moved (e.g. to `old.fersuastudio.com`) with the edge 302 rule enabled.
- Beta test data purged.
- DNS cutover (A record to 177.7.40.130, remove or replace the AAAA, `www` as a CNAME, MX untouched), then certbot for the apex and `www`.
- `PUBLIC_URL`, `CORS_ORIGINS` and `SEO_INDEXABLE=true`, then an api restart; beta 301s to the apex.
- Submit the sitemap in Search Console.

**Phase 2:** the items in section D, plus TOTP for the admin and CD from GHCR if the VPS build was kept.

---

## F. Consolidated owner questions (Q1-Q6 block progress)

1. Slug for Mac Fly: `macflymikebran` (recommended) or `macfly-mike-bran`?
2. Upcoming dates for Mac Fly. Also, which year were the old ones, and should they be seeded as archive or skipped?
3. Ley 1581: who is the data controller (legal name, NIT, contact email)? Is 24-month retention for booking requests acceptable? Is there privacy-policy text, or should we draft it?
4. Build images in GitHub Actions and push to GHCR (recommended), or on the VPS? If on the VPS, you must add swap with sudo. Does the VPS already have swap, and does it have IPv6?
5. After cutover, where do Allset, pedido, DiannMakinne, Molly and the current landing page live (a Hostinger subdomain with 302s, or 404)?
6. Do you accept the corrected layout (booking card inside 1120px, gaps between dates restored)? Keep white text on orange for SUNSET?
7. Edits after approval go live immediately (recommended)? Require email verification before a DJ can submit for review (recommended)?
8. Genres only from an admin-managed catalogue? Are the COP budget ranges right?
9. Publish a public booking email for Mac Fly? Today a Gmail address is exposed in the JSON-LD.
10. Photos: use `Mcfly1.png` and `MikeBran1.jpg` instead of the low-resolution ones? Update the "2024 / 2025" caption?
11. Index brand: logo file and hero copy.
12. Is Hostinger Email independent of the shared-hosting plan? Can we create the `no-reply@` mailbox? Where should off-site backups go (Drive or B2)? Should admin TOTP come now or in phase 2?

### Critical Files for Implementation
- C:\Fernando\Desarrollo\hostinger\fersua-djs\docs\00-contrato.md (the single contract resolving section B)
- C:\Fernando\Desarrollo\hostinger\fersua-djs\packages\shared\src\ (limits.ts, booking-fields.ts, text-slots.ts, palettes.ts, social-platforms.ts, slug.ts, routes.ts)
- C:\Fernando\Desarrollo\hostinger\fersua-djs\api\prisma\schema.prisma
- C:\Fernando\Desarrollo\hostinger\fersua-djs\Dockerfile and C:\Fernando\Desarrollo\hostinger\fersua-djs\docker-compose.prod.yml
- C:\Fernando\Desarrollo\hostinger\fersua-djs\deploy\edge\default.conf (`absolute_redirect off`, single CSP owner, booking regex)
- Sources: C:\Fernando\Desarrollo\hostinger\public_html\MacflyMikebran.html, C:\Fernando\Desarrollo\Personal\FersuaStore\Dashboard\docs\07-seguridad-infra.md, C:\Fernando\Desarrollo\Personal\FersuaStore\HabitFer\docker-compose.prod.yml