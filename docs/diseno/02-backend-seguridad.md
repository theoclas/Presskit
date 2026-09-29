# NestJS backend and security design for the Fersua Studio DJ booking platform

I read these files before designing:
- The visual template `C:\Fernando\Desarrollo\hostinger\public_html\MacflyMikebran.html`.
- A sample old event page (`Eventos/MacflyMikeBran/14 Nov.html`). Each one is only a flyer image wrapped in a WhatsApp link.
- The old `.htaccess`, which rewrites `/x` to `x.html`, so both `/MacflyMikebran` and `/MacflyMikebran.html` links are in the wild.
- The Dashboard's `docs/07-seguridad-infra.md`, `docker-compose.yml` and `back/src/middleware.ts`.
- The local HabitFer checkout at `C:\Fernando\Desarrollo\Personal\FersuaStore\HabitFer`: `api/src/main.ts`, `app.module.ts`, `auth/*`, `common/guards/origin.guard.ts`, `config/env.validation.ts`, `api/Dockerfile`, `docker-entrypoint.sh`, `docker-compose.prod.yml`, `deploy/*` and `.github/workflows`.

**Lessons carried over from the existing apps:**
- **Role and status come from the database.** The Dashboard middleware documents a bug where the role was trusted from the token. Here, role, status and `tokenVersion` are always re-read from the DB on each request.
- **Migrations, not `db push`.** HabitFer's entrypoint runs `prisma db push`. This app uses `prisma migrate deploy` and fails fast if a migration fails.
- **CI must fail on audit.** HabitFer's `npm audit` step has `continue-on-error: true`. Here, a high-severity finding fails CI.
- **Nothing published on all interfaces.** HabitFer's Caddy listens on 8080 on every interface. This stack only listens on `127.0.0.1`.

---

## 0. Key decisions (summary)

| Topic | Decision |
|---|---|
| Stack | NestJS 11 on Express 5, Prisma 6.19.x (the owner's current version), MySQL 8.4, Node 22 alpine |
| Edge inside compose | The `web` container (nginx) is the only service with a published port, `127.0.0.1:8090`. It serves the SPA and `/media/*` (read-only volume), proxies `/api/*` to the api, and sends HTML page loads to the SEO renderer. The host nginx only terminates TLS. No Caddy, which saves memory. |
| Password hashing | argon2id (`argon2` package, has alpine/musl prebuilds). Settings: m=19456 KiB, t=2, p=1. Hashes are upgraded automatically at login when settings change. |
| Access token | JWT HS256, 15 min, kept in memory on the client. The algorithm, `iss` and `aud` are pinned. Claims: `sub`, `tv` (tokenVersion), `sid` (session family). |
| Refresh token | 32 random bytes in cookie `__Secure-rt` (HttpOnly, Secure, SameSite=Strict, Path=`/api/auth`, host-only). Only its SHA-256 is stored. Rotated on every use, with reuse detection. |
| Ownership | `/api/me/...` never takes a profile id from the client. Child resources are always looked up with `where: { id, profileId }`, and a miss returns 404. |
| Admin and owner code reuse | One controller per resource, mounted on two paths: `@Controller(['me/events', 'admin/profiles/:profileId/events'])`. A `ProfileScopeGuard` decides which profile is targeted and who may do it. |
| SEO | Page loads go from nginx to the api's `/api/seo/render`. The api takes the built `index.html`, injects the meta tags, JSON-LD and the right status (200/301/404). If the renderer fails, nginx falls back to the static `index.html`. |
| Images | Validated by magic bytes and sharp; `limitInputPixels` of 40 MP; rotated, resized and re-encoded to WebP with metadata stripped. A 1200x630 JPEG is also made for link previews. Files get random names and are served by nginx with immutable cache headers. |
| Booking | Validated against a fixed field catalogue plus the DJ's config. Anti-spam: honeypot, signed min-time token, per-IP limits, per-profile daily cap. The WhatsApp link is built on the server. |

---

## 1. Folder tree (`fersua-djs/api`)

```
api/
  Dockerfile                      # multi-stage node:22-alpine, USER node, mkdir+chown /data/media
  docker-entrypoint.sh            # set -e; npx prisma migrate deploy; exec "$@"
  package.json  nest-cli.json  tsconfig.json  tsconfig.build.json  eslint.config.mjs
  prisma/
    schema.prisma
    migrations/                   # committed; CI checks schema <-> migrations drift
  seed-assets/macfly/             # pre-compressed JPEGs (<=2560px, q85) + flyers; committed
  src/
    main.ts                       # helmet, cookie-parser, trust proxy, body limit, ValidationPipe, CORS, prefix /api
    app.module.ts                 # global guards in order: Throttler -> Origin -> JwtAuth -> MustChangePassword -> Roles
    config/
      env.validation.ts           # joi schema (section 12)
      app.config.ts               # typed namespaces: auth, mail, media, seo, booking
    prisma/ prisma.module.ts prisma.service.ts
    common/
      constants/ limits.ts  reserved-slugs.ts  reserved-usernames.ts  privacy.ts (POLICY_VERSION)
      catalogues/ booking-fields.catalogue.ts  social-platforms.catalogue.ts  palettes.catalogue.ts
      decorators/ public.decorator.ts  roles.decorator.ts  current-user.decorator.ts
                  allow-pending-password-change.decorator.ts  target-profile-id.decorator.ts  public-cache.decorator.ts
      guards/ app-throttler.guard.ts  origin.guard.ts  jwt-auth.guard.ts  roles.guard.ts
              must-change-password.guard.ts  profile-scope.guard.ts
      filters/ all-exceptions.filter.ts   # Prisma P2002->409, P2025->404, no stack traces in prod, stable {code}
      interceptors/ cache-control.interceptor.ts   # default no-store; @PublicCache(s) opts in
      middleware/ request-id.middleware.ts
      validators/ is-username.ts is-slug.ts is-safe-text.ts is-social-url.ts is-whatsapp-number.ts
                  is-https-url.ts is-date-only.ts is-strong-password.ts
      dto/ pagination.dto.ts  paginated.ts
      utils/ crypto.ts (randomToken, sha256, safeEqual)  html-escape.ts  bogota-date.ts  text-normalize.ts
    auth/
      auth.module.ts  auth.controller.ts  auth.service.ts
      tokens/ access-token.service.ts  refresh-token.service.ts  refresh-cookie.ts
      strategies/ jwt.strategy.ts
      password/ password-hasher.service.ts (argon2id + dummy hash)  password-policy.service.ts (zxcvbn-ts)
      lockout.service.ts  email-token.service.ts
      dto/ register.dto.ts login.dto.ts change-password.dto.ts forgot-password.dto.ts reset-password.dto.ts verify-email.dto.ts
    users/        users.module.ts users.service.ts me-account.controller.ts dto/
    profiles/
      profiles.module.ts profiles.service.ts profile-status.service.ts slug.service.ts completeness.ts
      profile.controller.ts        # ['me/profile', 'admin/profiles/:profileId']
      members/  members.controller.ts members.service.ts dto/
      rider/    rider.controller.ts rider.service.ts dto/
      gallery/  gallery.controller.ts gallery.service.ts dto/
      socials/  socials.controller.ts socials.service.ts dto/
      genres/   genres.controller.ts (public list + admin CRUD) genres.service.ts dto/
      booking-form/ booking-form.controller.ts booking-form.service.ts dto/
    events/       events.controller.ts events.service.ts event-cta.builder.ts next-event.service.ts dto/
    media/        media.controller.ts media.service.ts image-pipeline.service.ts magic-bytes.ts
                  storage.service.ts (atomic write, path-safe delete) media-cleanup.job.ts dto/
    booking-requests/
                  public-booking.controller.ts booking-requests.controller.ts (['me/booking-requests','admin/booking-requests'])
                  booking-requests.service.ts booking-validation.service.ts form-token.service.ts
                  whatsapp-message.builder.ts dto/
    public/       public.controller.ts public.service.ts public-profile.mapper.ts
    admin/        admin-users.controller.ts admin-profiles.controller.ts admin-audit.controller.ts
                  admin-stats.controller.ts admin.service.ts dto/
    mail/         mail.module.ts mail.service.ts mail-queue.ts (in-process, 3 retries) templates/*.ts
    audit/        audit.module.ts audit.service.ts audit-actions.ts
    seo/          seo.controller.ts spa-template.service.ts head-builder.ts json-ld.builder.ts sitemap.builder.ts
    health/       health.controller.ts
    jobs/         maintenance.jobs.ts   # token purge, retention, stale unverified users
    cli/          seed.ts               # Nest standalone context: `admin`, `genres`, `macfly`
  test/
    jest-e2e.json setup-e2e.ts factories.ts fixtures/images/*
    auth.e2e-spec.ts ownership.e2e-spec.ts route-guard-matrix.e2e-spec.ts public.e2e-spec.ts
    booking.e2e-spec.ts media.e2e-spec.ts seo.e2e-spec.ts admin.e2e-spec.ts
```

**Dependencies**
- `@nestjs/{common,core,platform-express,config,jwt,passport,throttler,schedule}`, `passport-jwt`
- `class-validator`, `class-transformer`, `joi`, `helmet`, `cookie-parser`
- `argon2`, `@zxcvbn-ts/core`, `@zxcvbn-ts/language-common`, `@zxcvbn-ts/language-es-es`
- `sharp`, `nodemailer`, `nestjs-pino`, `pino-http`, `@prisma/client` and `prisma` (both pinned to 6.19.x)
- Dev: `jest`, `ts-jest`, `supertest`, `@nestjs/testing`

The `file-type` package is not used: it is ESM-only and awkward from Nest's CommonJS build. The first bytes are checked by a small in-house sniffer, cross-checked with sharp's `metadata()`.

---

## 2. Data model (Prisma, MySQL; utf8mb4_0900_ai_ci, which is case- and accent-insensitive)

```prisma
enum Role { ADMIN USER }
enum UserStatus { ACTIVE SUSPENDED }
enum ProfileStatus { DRAFT PENDING_REVIEW APPROVED REJECTED SUSPENDED }
enum Palette { SUNSET NEON_LIME OCEAN VIOLET GOLD CRIMSON MONO AQUA }   // SUNSET = current orange/pink
enum MediaPurpose { HERO CARD MEMBER GALLERY FLYER }
enum SocialPlatform { INSTAGRAM SOUNDCLOUD SPOTIFY TIKTOK YOUTUBE FACEBOOK BEATPORT MIXCLOUD RESIDENT_ADVISOR X APPLE_MUSIC BANDCAMP TWITCH WEBSITE }
enum EventCtaType { WHATSAPP URL NONE }
enum BookingStatus { NEW READ ARCHIVED SPAM }
enum EmailTokenPurpose { VERIFY_EMAIL RESET_PASSWORD }

model User {
  id                    String     @id @default(cuid())
  username              String     @unique @db.VarChar(30)    // stored lowercase (canonical)
  email                 String     @unique @db.VarChar(254)   // lowercase; one DJ = one user = one email
  emailVerifiedAt       DateTime?
  passwordHash          String     @db.VarChar(255)           // argon2id PHC string
  passwordChangedAt     DateTime   @default(now())
  mustChangePassword    Boolean    @default(false)
  tempPasswordExpiresAt DateTime?
  role                  Role       @default(USER)
  adminSingleton        Boolean?   @unique                    // TRUE only on the admin -> DB guarantees <=1 admin
  status                UserStatus @default(ACTIVE)
  tokenVersion          Int        @default(0)
  failedLoginCount      Int        @default(0)
  lockedUntil           DateTime?
  lastLoginAt           DateTime?
  createdAt             DateTime   @default(now())
  updatedAt             DateTime   @updatedAt
  profile               DjProfile?
  refreshTokens         RefreshToken[]
  emailTokens           EmailToken[]
}

model RefreshToken {
  id String @id @default(cuid())
  userId String
  familyId String @db.VarChar(30)
  tokenHash String @unique @db.Char(64)
  expiresAt DateTime
  familyExpiresAt DateTime
  replacedAt DateTime?
  revokedAt DateTime?
  revokeReason String? @db.VarChar(30)
  userAgent String? @db.VarChar(255)
  ip String? @db.VarChar(45)
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([familyId])
}

model EmailToken {
  id String @id @default(cuid())
  userId String
  purpose EmailTokenPurpose
  tokenHash String @unique @db.Char(64)
  newEmail String? @db.VarChar(254)
  expiresAt DateTime
  usedAt DateTime?
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, purpose])
}

model DjProfile {
  id String @id @default(cuid())
  userId String @unique                     // one user -> at most one DJ account
  slug String @unique @db.VarChar(40)
  status ProfileStatus @default(DRAFT)
  displayName String @db.VarChar(60)
  city String? @db.VarChar(60)
  palette Palette @default(SUNSET)
  texts Json                                // validated by ProfileTextsDto (fixed keys)
  bookingForm Json                          // validated by BookingFormConfigDto
  whatsappNumber String? @db.VarChar(15)    // digits only, E.164 without '+'
  whatsappMessage String? @db.VarChar(200)
  publicEmail String? @db.VarChar(254)
  publicPhone String? @db.VarChar(20)
  heroImageId String? @unique
  cardImageId String? @unique
  featured Boolean @default(false)
  featuredRank Int @default(100)
  nextEventDate DateTime? @db.Date          // denormalized; recomputed on event CUD + nightly
  notifyByEmail Boolean @default(true)
  slugChangedAt DateTime?
  submittedAt DateTime?
  approvedAt DateTime?
  reviewedById String?
  reviewNote String? @db.VarChar(500)       // reject/suspend reason, shown to owner
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  // relations: user, heroImage/cardImage (named 1-1 to MediaAsset), media (1-n "ProfileMedia"),
  // members, events, gallery, riderItems, socialLinks, genres, bookingRequests, slugRedirects
  @@index([status, featured, featuredRank, nextEventDate])
}

model Member { id String @id @default(cuid()); profileId String; position Int; name String @db.VarChar(60); role String? @db.VarChar(80); description String? @db.VarChar(400); photoId String? @unique; @@index([profileId, position]) }
model SocialLink { id String @id @default(cuid()); profileId String; memberId String?; platform SocialPlatform; url String @db.VarChar(500); position Int; @@index([profileId]) @@index([memberId]) }   // profileId always set -> one ownership check
model RiderItem { id String @id @default(cuid()); profileId String; position Int; text String @db.VarChar(60) }
model GalleryItem { id String @id @default(cuid()); profileId String; assetId String @unique; position Int; alt String? @db.VarChar(120) }
model Event { id String @id @default(cuid()); profileId String; date DateTime @db.Date; time String? @db.VarChar(5); title String? @db.VarChar(80); venue String @db.VarChar(80); city String? @db.VarChar(60); flyerId String? @unique; ctaType EventCtaType @default(WHATSAPP); ctaUrl String? @db.VarChar(500); ctaLabel String? @db.VarChar(20); createdAt DateTime @default(now()); updatedAt DateTime @updatedAt; @@index([profileId, date]) }
model Genre { id String @id @default(cuid()); slug String @unique @db.VarChar(40); name String @unique @db.VarChar(40) }
model ProfileGenre { profileId String; genreId String; position Int; @@id([profileId, genreId]) @@index([genreId]) }
model MediaAsset { id String @id @default(cuid()); profileId String; purpose MediaPurpose; key String @unique @db.VarChar(32); width Int; height Int; variants Json; hasOg Boolean @default(false); bytes Int; createdAt DateTime @default(now()); @@index([profileId, createdAt]) }  // back-relations: heroOf, cardOf, member, event, galleryItem (all onDelete SetNull on the referencing side)
model BookingRequest { id String @id @default(cuid()); profileId String; status BookingStatus @default(NEW); contactName String @db.VarChar(80); contactEmail String? @db.VarChar(254); contactPhone String? @db.VarChar(20); eventDate DateTime? @db.Date; data Json; consentAt DateTime; consentVersion String @db.VarChar(20); ip String? @db.VarChar(45); userAgent String? @db.VarChar(255); createdAt DateTime @default(now()); readAt DateTime?; @@index([profileId, createdAt]) @@index([status]) @@index([contactEmail]) }
model SlugRedirect { fromSlug String @id @db.VarChar(40); profileId String; createdAt DateTime @default(now()) }
model AuditLog { id BigInt @id @default(autoincrement()); actorId String?; actorUsername String? @db.VarChar(30); action String @db.VarChar(50); targetType String? @db.VarChar(30); targetId String? @db.VarChar(40); meta Json?; ip String? @db.VarChar(45); userAgent String? @db.VarChar(255); createdAt DateTime @default(now()); @@index([createdAt]) @@index([targetType, targetId]) @@index([action]) }
```

All child rows cascade on profile delete. `BookingRequest.data` stores a snapshot at submit time as `[{key,label,value}]`. The denormalized `contact*` and `eventDate` columns exist so the admin can search and list, and so the admin can answer habeas-data requests by email.

**Hard limits** (`common/constants/limits.ts`; also exposed through `GET /api/public/meta`):

| Item | Limit |
|---|---|
| Username | 3–30 characters |
| Password | 10–128 characters, zxcvbn score of at least 3 |
| Email | up to 254 characters |
| Slug | 3–40 characters |
| Display name | 2–60 characters |
| Hero label / title / subtitle / note | 40 / 60 / 600 / 160 |
| Captions, mini-card label/title/button | 40 each |
| Section titles / subtitles | 40 / 160 |
| Events note, booking subtitle / note | 200 / 200 / 300 |
| Footer | 120 |
| Genres | at most 6 |
| Rider items | at most 20, 60 characters each |
| Members | at most 6 (name 60, role 80, description 400, up to 6 social links each) |
| Profile social links | at most 10 |
| Upcoming events | at most 40; 250 events in total per profile |
| Gallery | at most 24 photos |
| Upload | 15 MB and 40 megapixels per file |
| Per-profile storage | 80 assets and 150 MB of variants |
| Booking message | 2,000 characters |
| Booking requests per profile per day | 50 |

**Text normalization** (`is-safe-text`) applies to every text field:
- Unicode NFC, then trim.
- Strip control characters. Newlines are kept only in multi-line fields.
- Strip zero-width characters and bidi overrides (U+202A–E, U+2066–9).
- Collapse runs of 3 or more newlines.
- The length is checked before any regex runs.

---

## 3. REST endpoints (global prefix `/api`)

**Guards:**
- **PUB**: `@Public()`, no login needed.
- **AUTH\***: logged in; allowed even while `mustChangePassword` is set.
- **AUTH**: logged in; blocked by `MustChangePasswordGuard` until the password is changed.
- **OWN**: role USER; the target profile is the user's own (resolved by `ProfileScopeGuard`).
- **ADM**: role ADMIN, read from the DB.

**Dual-mounted resources:** `[me|adm]` means the same controller answers on `/api/me/...` (OWN) and on `/api/admin/profiles/:profileId/...` (ADM).

**Pagination:** `PaginationQueryDto`: `page` is an integer of at least 1 (default 1); `pageSize` is 1–50 (default 20). Responses look like `{ items, page, pageSize, total }`.

**Errors:** `{ statusCode, code, message, details? }`. `code` is machine-readable, for example `USERNAME_TAKEN`, `SLUG_RESERVED`, `LIMIT_EXCEEDED`, `PASSWORD_CHANGE_REQUIRED`, `INVALID_CREDENTIALS`, `NO_PROFILE`. `message` is in Spanish. Validation errors never echo the submitted values.

### 3.1 Auth (`/api/auth`)

| Method and path | Guard / rate limit | Request | Response |
|---|---|---|---|
| POST `/auth/register` | PUB, 5/hour/IP | `RegisterDto { username (lowercased, `^[a-z0-9](?!.*[._-]{2})[a-z0-9._-]{1,28}[a-z0-9]$`, not reserved), email (IsEmail, ≤254, lowercased), password (policy), acceptTerms: true, website: '' (honeypot) }` | 201 `{ accessToken, expiresIn: 900, user: MeDto }` plus refresh cookie. Sends a verification email. 409 `USERNAME_TAKEN` / `EMAIL_TAKEN`. |
| POST `/auth/login` | PUB, 10/15 min/IP | `LoginDto { username (1–64, trimmed and lowercased), password (1–128) }`. Username only; an email in this field never matches. | 200 `{ accessToken, expiresIn, user: MeDto }` plus cookie. 401 `INVALID_CREDENTIALS` in every failure case. |
| POST `/auth/refresh` | PUB (cookie), 60/15 min/IP; Origin must match and header `X-Requested-With: fersua` is required | none | 200 `{ accessToken, expiresIn, user }` plus rotated cookie. 401 `REFRESH_INVALID` (cookie cleared) or `REFRESH_RACE` (client retries once). |
| POST `/auth/logout` | PUB (cookie) | none | 204. Revokes the current family and clears the cookie. |
| POST `/auth/logout-all` | AUTH\* | none | 204. `tokenVersion++`, all refresh tokens revoked. |
| GET `/auth/me` | AUTH\* | none | `MeDto { id, username, email, emailVerified, role, mustChangePassword, profile: { id, slug, status } \| null }` |
| POST `/auth/change-password` | AUTH\*, 5/15 min | `{ currentPassword, newPassword }` (must differ from current; policy applies) | 200 with a new token pair. `tokenVersion++`, every other session revoked, `mustChangePassword` cleared, notification email sent. |
| POST `/auth/forgot-password` | PUB, 5/hour/IP and 3/hour per identifier | `{ identifier }` (username or email, ≤254) | Always 202 with the same generic body. |
| POST `/auth/reset-password` | PUB, 10/hour/IP | `{ token (43 base64url chars), newPassword }` | 204 |
| POST `/auth/verify-email` | PUB, 10/hour/IP | `{ token }` | 204 |
| POST `/auth/resend-verification` | AUTH\*, 3/hour | none | 202 |

### 3.2 Own account (`/api/me/account`)

| Method and path | Guard | Request | Response |
|---|---|---|---|
| PATCH `/me/account/email` | AUTH, 3/hour | `{ newEmail, currentPassword }` | 202. Link sent to the new address, notice sent to the old one. The change applies on `verify-email`. |
| DELETE `/me/account` | AUTH (USER), 3/hour | `{ currentPassword, confirm: 'ELIMINAR' }` | 204. Deletes the user, profile, bookings and media files. Covers the right to deletion under Ley 1581. |

### 3.3 Profile and its content (dual-mounted `[me|adm]`)

| Method and path (`/me/...` or `/admin/profiles/:profileId/...`) | Request | Response / notes |
|---|---|---|
| POST `/me/profile` (OWN only) | `{ slug, displayName }` | 201 `OwnerProfileDto`. Created as DRAFT with the template's default texts and form. 409 if the user already has a profile or the slug is taken. |
| GET `profile` | none | `OwnerProfileDto` (every field plus `status`, `reviewNote`, `usage { assets, bytes, limits }`) |
| PATCH `profile` | `UpdateProfileDto { displayName?, city?, palette? (enum), texts?: ProfileTextsDto (partial, fixed keys, each length-capped), whatsappNumber? (7–15 digits), whatsappMessage?, publicEmail?, publicPhone?, heroImageId?, cardImageId?, notifyByEmail? }` | `OwnerProfileDto`. An image id must belong to the same profile and have the matching purpose (HERO / CARD), otherwise 400. |
| GET `profile/slug-availability?slug=` | 30/min | `{ available, reason?: 'FORMAT'\|'RESERVED'\|'TAKEN' }` |
| PUT `profile/slug` | `{ slug }` | Slug rules: `^[a-z0-9](?:[a-z0-9]\|-(?=[a-z0-9])){2,39}$`, not reserved, unique across profiles and `SlugRedirect`. For an APPROVED owner, one change per 30 days (the admin is exempt). The old slug becomes a `SlugRedirect`. Audited. |
| POST `profile/submit` (OWN) | none | DRAFT or REJECTED becomes PENDING_REVIEW. Needs a verified email and a complete profile (section 6). The admin is emailed. |
| POST `profile/withdraw` (OWN) | none | PENDING_REVIEW becomes DRAFT |
| GET `profile/preview` | none | `PublicProfileDto`, whatever the status, for the panel preview |
| PUT `profile/genres` | `{ genreIds: string[] }` (1–6, unique, must exist) | `Genre[]` |
| PUT `profile/rider` | `{ items: { text }[] }` (max 20) | `RiderItem[]`. Replaces the list; order = array order. |
| PUT `profile/socials` | `{ links: { platform, url }[] }` (max 10, platform unique) | `SocialLink[]` |
| GET / PUT `profile/booking-form` | `{ fields: { key: BookingFieldKey, required: bool, label?: ≤40, placeholder?: ≤80 }[] }` | Keys must be unique and in the catalogue. Must include `fullName` and at least one of `email1` / `phone1`, set as required. Order = array order. |
| GET / POST `members`, PATCH / DELETE `members/:id`, PUT `members/order` | `CreateMemberDto { name, role?, description?, photoId? }`; order is `{ ids: string[] }` (must be exactly the profile's members) | Max 6. `photoId` must have purpose MEMBER. |
| PUT `members/:id/socials` | `{ links: { platform, url }[] }` (max 6) | |
| GET `events?scope=upcoming\|past&page`, POST `events`, PATCH / DELETE `events/:id` | `CreateEventDto { date: 'YYYY-MM-DD' (between today in Bogotá and today + 2 years; past dates allowed on PATCH only for the admin), time?: 'HH:mm', title?, venue, city?, flyerId? (purpose FLYER), ctaType, ctaUrl? (required when URL; https only, ≤500), ctaLabel? }` | Recomputes `nextEventDate` |
| GET / POST `gallery`, PATCH / DELETE `gallery/:id`, PUT `gallery/order` | `{ assetId (purpose GALLERY), alt? }` | Max 24 |
| POST `media` (multipart) | fields `file`, `purpose: MediaPurpose`; 30 uploads/10 min per user | 201 `MediaAssetDto { id, purpose, width, height, src, srcset, ogUrl? }`. Errors: 413 (size), 415 (type), 409 `QUOTA_EXCEEDED`. |
| GET `media?unattached=true` | | `MediaAssetDto[]` |
| DELETE `media/:id` | | 204, or 409 if the asset is still in use |
| GET `booking-requests?status=&page=`, GET `booking-requests/unread-count` | | Items: `{ id, createdAt, status, contactName, eventDate }`; count: `{ count }` |
| GET `booking-requests/:id` | | `{ id, status, createdAt, fields: [{key,label,value}], consentAt, consentVersion }`. Marks the request READ. |
| PATCH `booking-requests/:id` | `{ status: READ\|ARCHIVED\|SPAM }` | |
| DELETE `booking-requests/:id` | | 204 |

**How `ProfileScopeGuard` resolves the target profile:**
- **Admin paths:** if `req.params.profileId` is present, the DB role must be ADMIN and the profile must exist. The guard sets `req.targetProfileId = param` and `req.actingAsAdmin = true`.
- **Owner paths:** otherwise the role must be USER. The guard sets `req.targetProfileId = user.profile.id`, or returns 404 `NO_PROFILE` if there is none.
- **Services:** they only accept `@TargetProfileId()` and always query with `{ id, profileId }`. The admin is not allowed to own a profile.

### 3.4 Public (`/api/public`, all PUB)

| Method and path | Request | Response |
|---|---|---|
| GET `/public/meta` | none | `{ palettes, socialPlatforms, bookingFieldCatalogue, limits, reservedSlugs, privacyPolicyVersion }`. Cached publicly for 1 hour. |
| GET `/public/genres` | none | Genres with at least one visible profile: `[{ slug, name, count }]`. Cached 60 s. |
| GET `/public/djs?search=&genre=&page=&pageSize≤48` | `search` ≤60 characters (matches display name, member names, city; the collation is case- and accent-insensitive); `genre` is a slug | `{ items: DjCardDto[], … }` with `DjCardDto { slug, displayName, city, cardImage: ImageDto\|null (falls back to hero), genres:[{slug,name}], nextEvent:{date,venue}\|null, featured }`. Visible means `status=APPROVED` and `user.status=ACTIVE`. Order: `featured DESC, featuredRank ASC, nextEventDate ASC NULLS LAST, approvedAt DESC`. Cached 30 s. |
| GET `/public/djs/:slug` | slug lowercased | `PublicProfileDto` (below). A non-visible profile returns 404. A slug found in `SlugRedirect` returns 301 to `/api/public/djs/<new>`; the SPA then calls `history.replaceState` when `data.slug !== urlSlug`. Cached 30 s. |
| GET `/public/djs/:slug/booking-token` | none | `{ token }` (HMAC-signed, no-store) |
| POST `/public/djs/:slug/booking-requests` | Rate limits: 3/10 min per IP+slug, 10/hour per IP; 50/day per profile, then 429 | Section 8 |

**PublicProfileDto:**
- `slug`, `displayName`, `navTag`, `palette`.
- `texts{…}`, including `riderCard{label,title,button}`, `mediaCard{…}` and `openDateRow{enabled,dateText,placeText,ctaLabel,url}`.
- `heroImage`, `genres`, `heroCta.whatsappUrl`, `riderItems: string[]`, `gallery: [{image, alt}]`.
- `members: [{ name, role, description, photo, socials:[{platform,label,url}] }]`, `socials`.
- `events` (upcoming only): `[{ id, date, dateLabel: '14 NOV', time, title, venue, city, flyer, cta: {label, url} | null }]`.
- `bookingForm: { fields: [{ key, type, label, placeholder, required, maxLength, options? }], consentText, privacyUrl, whatsappEnabled }`.
- `updatedAt`.

**ImageDto:** `{ src, srcset, width, height, alt }`.

Every URL above is built by the server, which removes the `{nombre del evento}` placeholder bug and the `REEMPLAZAR_TELEFONO` bug.

### 3.5 Admin (`/api/admin`, all ADM; mutations 60/min)

| Method and path | Request | Notes |
|---|---|---|
| GET `/admin/stats` | | Counts by status, pending count, bookings in the last 30 days |
| GET `/admin/users?search=&status=&hasProfile=&page=` | | `[{ id, username, email, emailVerified, role, status, lockedUntil, lastLoginAt, createdAt, profile:{id,slug,status}\|null }]` |
| POST `/admin/users` | `{ username, email }` | 201 `{ user, temporaryPassword, expiresAt }` (no-store). For onboarding DJs manually. |
| GET / PATCH `/admin/users/:id` | `{ email?, status?: ACTIVE\|SUSPENDED, reason? }` | Suspending bumps `tokenVersion` and revokes refresh tokens. The admin cannot target itself. There is no role field anywhere. |
| POST `/admin/users/:id/reset-password` | `{ mode: 'TEMPORARY'\|'EMAIL_LINK' }` | Section 5 |
| POST `/admin/users/:id/unlock` / `revoke-sessions` | | |
| DELETE `/admin/users/:id` | `{ confirm: <username> }` | Cascades. The admin account cannot be deleted. |
| GET `/admin/profiles?status=&search=&featured=&page=` | | |
| POST `/admin/profiles` | `{ userId, slug, displayName }` | Assigns a DJ account to a user who has none; otherwise 409 |
| GET `/admin/profiles/:profileId` | | `OwnerProfileDto` plus owner and recent audit entries |
| POST `/admin/profiles/:profileId/approve` | `{ note? }` | From PENDING_REVIEW (or REJECTED). Emails the DJ. |
| POST `…/reject` | `{ reason: 10–500 }` | |
| POST `…/suspend` | `{ reason: 10–500 }` | Takes effect immediately. The API reads the DB on every request, so the page disappears within the 30 s cache. |
| POST `…/reinstate` | none | From SUSPENDED back to APPROVED |
| PATCH `…/feature` | `{ featured: bool, featuredRank?: 0–999 }` | |
| PATCH `…/owner` | `{ userId }` | Transfer. The target must have no profile (enforced by the unique key). Used to hand the seeded account to the real DJ. |
| POST `…/slug-redirects` / DELETE `/admin/slug-redirects/:fromSlug` | `{ fromSlug }` | Legacy links and releasing old slugs |
| DELETE `/admin/profiles/:profileId` | `{ confirm: <slug> }` | Deletes the profile and its media folder |
| All section 3.3 resources under `/admin/profiles/:profileId/...` | | Same controllers, audited as admin edits |
| GET `/admin/booking-requests?profileId=&status=&q=&from=&to=&page=` | `q` matches contactName / contactEmail / contactPhone | Plus GET / PATCH / DELETE `/:id` |
| GET / POST / PATCH / DELETE `/admin/genres` | `{ name: 2–40 }` (slug derived) | Delete returns 409 if the genre is in use |
| GET `/admin/audit-logs?action=&actorId=&targetType=&targetId=&from=&to=&page=` | | Also the "recent profile changes" feed (`action=PROFILE_UPDATE`) |

### 3.6 SEO and health

| Method and path | Guard | Notes |
|---|---|---|
| GET `/api/seo/render` | PUB, reached only through nginx's internal `@render` location (external `/api/seo/` is blocked in nginx) | Header `X-Render-Path`. Returns full HTML with 200, 301 or 404. |
| GET `/api/seo/sitemap.xml`, `/api/seo/robots.txt` | PUB | nginx maps `/sitemap.xml` and `/robots.txt` to these |
| GET `/api/health` | PUB, `@SkipThrottle` | `{ status:'ok', db:'ok' }`, checked with a tagged `$queryRaw\`SELECT 1\``. Used by the docker healthcheck. |

---

## 4. Auth design

- **Global guard order** (APP_GUARD, in `app.module.ts`):
  1. `AppThrottlerGuard`, tracked by `req.ip`.
  2. `OriginGuard` (HabitFer's version): for non-GET requests, `Origin` must equal `PUBLIC_BASE_URL`; in production a missing Origin gets 403.
  3. `JwtAuthGuard`, which skips `@Public`.
  4. `MustChangePasswordGuard`.
  5. `RolesGuard`.
- **JwtStrategy.validate:**
  - Loads `{id, role, status, tokenVersion, mustChangePassword}` by primary key.
  - Rejects with 401 if the user is missing, `status≠ACTIVE`, or `payload.tv≠tokenVersion`. This is how revocation is instant.
  - Takes the role from the DB, never from the token.
  - `jsonwebtoken` verifies with `algorithms:['HS256']`, `issuer:'fersua-djs'` and `audience:'fersua-djs-web'`.
  - `JWT_ACCESS_SECRET` must be at least 64 characters.
- **Refresh rotation** (`refresh-token.service.ts`):
  1. `hash = sha256(cookie)`, then `findUnique({tokenHash})`.
  2. If not found or `revokedAt` is set: 401 `REFRESH_INVALID` and clear the cookie.
  3. If `replacedAt` is set: within 20 s of the rotation, return 401 `REFRESH_RACE` (a second tab racing; the browser already holds the new cookie, so the client retries once). After 20 s it is **reuse**: revoke the whole `familyId` (`revokeReason='REUSE'`), audit `SECURITY_REFRESH_REUSE`, email the user, return 401.
  4. If `expiresAt` (idle limit: 7 days for users, 1 day for the admin) or `familyExpiresAt` (absolute limit: 30 days for users, 7 days for the admin) has passed: 401.
  5. Atomic compare-and-set: `updateMany({where:{id, replacedAt:null, revokedAt:null}, data:{replacedAt:now}})`. A count of 0 is treated as the race case. Then insert the new token in the same family, with `expiresAt = min(now + idle, familyExpiresAt)`, inside the same transaction.
- **Cookie:** `res.cookie('__Secure-rt', token, { httpOnly:true, secure:true, sameSite:'strict', path:'/api/auth', maxAge })`.
  - No Domain attribute, so beta and apex never share it.
  - `dashboard.fersuastudio.com` counts as same-site, so SameSite=Strict does not stop CSRF from it. OriginGuard plus the custom-header requirement covers that case.
  - `COOKIE_SECURE=false` is allowed only in development.
- **Revocation triggers:** password change, admin reset, suspension and logout-all all do `tokenVersion++` and `updateMany RefreshToken revokedAt`.
- **Lockout** (`lockout.service.ts`, stored in the DB so it survives restarts):
  - Every failure does `failedLoginCount++`.
  - From 5 failures on, `lockedUntil = now + min(15·2^(n−5), 240)` minutes.
  - While locked, the password is not checked, but the dummy hash still runs (for timing). The response is the same generic 401.
  - The first lock of the day emails the user a notice with a reset link.
  - Success, a completed email reset, and admin unlock all reset the counter.
  - Per-IP limits (10 per 15 min on login) come from the throttler.
  - The admin username comes from env and must not be `admin` (it is on the reserved list).
- **Username enumeration:**
  - Login: when the user is not found, `argon2.verify(DUMMY_HASH, password)` still runs (the dummy hash is computed at boot). The same 401 and the same body are returned in every case.
  - Forgot-password: returns 202 immediately. The lookup and the email are queued after the response, so timing cannot reveal whether the account exists.
  - Register: it has to reveal a taken username or email. This is mitigated with 5/hour/IP plus the honeypot.
- **Password policy** (server side; the front mirrors it as a strength meter):
  - 10–128 characters, with no composition rules.
  - zxcvbn-ts score of at least 3, with `userInputs=[username, email local part, slug, 'fersua', 'studio', 'booking']`.
  - Must not equal the current password.
  - The 128-character cap limits hashing DoS.
- **Optional hardening:** TOTP two-factor for the admin account (`otplib`; secret encrypted with AES-256-GCM using `MFA_ENC_KEY`; 10 hashed recovery codes). Login would return `{ mfaRequired, mfaToken (5-minute JWT, purpose 'mfa') }`, followed by `POST /auth/mfa/verify`. See question 3.

## 5. Password recovery

- **By email:**
  - `forgot-password` looks the user up by username or email and invalidates earlier unused RESET tokens.
  - Token: 32 random bytes as base64url, stored as a SHA-256 hash, valid for 45 minutes (`RESET_TOKEN_TTL_MIN`), single use.
  - The link is `${PUBLIC_BASE_URL}/restablecer#token=…`. Because the token is in the **URL fragment**, it never reaches nginx logs or the Referer header. That page also sends `Referrer-Policy: no-referrer`.
  - Every absolute link is built from `PUBLIC_BASE_URL`, never from the request's Host header, which prevents host-header poisoning of reset links.
  - On `reset-password`: `safeEqual` against the hash, then check it is unused and not expired. Then set the new password (policy applies), set `usedAt`, set `emailVerifiedAt` (owning the mailbox proves the address), clear the lockout, `tokenVersion++`, revoke all sessions, and send a "password changed" email.
- **Mail:** nodemailer over Hostinger SMTP (`smtp.hostinger.com:465`, secure) as `no-reply@fersuastudio.com`.
  - Messages are plain text plus minimal HTML, with every value HTML-escaped.
  - They go through an in-process queue with 3 retries (1 s, 10 s, 60 s). Failures are logged and never shown to the user.
  - In development, `MAIL_TRANSPORT=log` (or Mailpit).
  - Templates: `verify-email`, `reset-password`, `password-changed`, `email-changed-old`, `account-locked`, `profile-submitted` (to `ADMIN_EMAIL`), `profile-approved`, `profile-rejected`, `profile-suspended`, `new-booking` (to the DJ when `notifyByEmail` is on and the email is verified).
- **By the admin:**
  - `mode:'TEMPORARY'` generates a 16-character password from a CSPRNG (unambiguous alphabet) and returns it **once** (no-store). It sets `mustChangePassword=true` and `tempPasswordExpiresAt=now+72h`, does `tokenVersion++`, revokes all sessions, and audits the action (never the password).
  - `mode:'EMAIL_LINK'` sends the normal reset email.
  - After a temporary-password login, `MustChangePasswordGuard` returns 403 `PASSWORD_CHANGE_REQUIRED` on every route except those marked `@AllowPendingPasswordChange` (`/auth/me`, `/auth/change-password`, `/auth/logout`, `/auth/logout-all`).
  - An expired temporary password gets the generic 401 at login.
- **Admin rescue from the VPS shell:** `docker compose exec api node dist/cli/seed.js admin --reset-password` reads `ADMIN_PASSWORD` from env. This mirrors the Dashboard's `admin-rescate.mjs`.

## 6. Approval workflow

```
DRAFT --submit(owner)--> PENDING_REVIEW --approve(admin)--> APPROVED --suspend(admin)--> SUSPENDED
  ^                         |   |                                ^                            |
  +------withdraw(owner)----+   +--reject(admin)--> REJECTED     +--------reinstate(admin)----+
                                          +--submit(owner)--> PENDING_REVIEW
```

- Transitions live in a table inside `profile-status.service.ts`. Anything else returns 409 `INVALID_TRANSITION`. Every transition is audited and emailed.
- **Completeness required to submit:**
  - A verified email.
  - `displayName`, `texts.heroTitle` and `heroImageId` set.
  - At least one member.
  - At least one genre.
  - A valid booking form.
  - `whatsappNumber` set, or email notifications enabled.
- **Public visibility** means `profile.status = APPROVED` **and** `user.status = ACTIVE`, evaluated on every request. Suspending the user also hides the page.
- **Edits to an APPROVED profile do not need re-approval. Reasons:**
  1. The main job of the panel is updating dates and flyers every week. Re-approval would block that and turn the single admin into a bottleneck.
  2. The blast radius is small: a fixed template, plain text only (no HTML, no inline styles), images re-encoded by the server, URL allowlists, and hard limits.
  3. The trust decision happens once at onboarding (identity and first review). After that, controls are after the fact: every owner edit writes a `PROFILE_UPDATE` audit entry listing the changed fields, the admin has a "recent changes" feed, slug changes are rate-limited and notified, and suspension takes effect immediately.

  The one exception is slug changes on APPROVED profiles: at most one per 30 days, they create a redirect, and they are audited.

## 7. Upload pipeline (`media/`)

1. **Multer memory storage.** Limits: `fileSize: 15 MB`, `files: 1`, `fields: 5`, `parts: 8`. `purpose` must be a MediaPurpose enum value.
2. **Quota pre-check** (asset count and total bytes); fails with 409 before any decoding.
3. **Magic bytes** (`magic-bytes.ts`): JPEG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF????WEBP`.
   - HEIC, AVIF, GIF, TIFF, SVG, PDF and anything else get 415.
   - HEIC: the prebuilt sharp binaries cannot decode it. iOS Safari converts to JPEG when the file input has `accept="image/jpeg,image/png,image/webp"`.
4. **Decode:** `sharp(buf, { limitInputPixels: 40_000_000, failOn: 'error', sequentialRead: true })`. `metadata().format` must match the sniffed type (so polyglot files are rejected); the minimum side is 200 px.
5. **Transform:** `.rotate()` applies the EXIF orientation first. Then, per purpose, resize with `fit:'inside'` and `withoutEnlargement`, and output `.webp({ quality: 78 })` (flyers use 82):

   | Purpose | Output widths |
   |---|---|
   | HERO | 1600 / 1024 / 640, plus an **og** variant: 1200x630 cover crop, `.jpeg({quality:80, mozjpeg:true})`, kept under 300 KB for WhatsApp previews |
   | CARD | 800 / 480, plus og |
   | MEMBER | 600 / 300 |
   | GALLERY | 1600 / 800 / 400 |
   | FLYER | 1200 / 600 |

   Sharp drops all metadata (EXIF/GPS/XMP) because `withMetadata()` is never called, and it converts to sRGB.
6. **Resource limits:** `sharp.concurrency(1)`, `sharp.cache({ memory: 50 })`, and a semaphore allowing at most 2 uploads processing at once. These fit a 1 vCPU box with a 512 MB container limit.
7. **Storage** (`storage.service.ts`):
   - Path: `${UPLOAD_DIR}/${profileId}/${key}-${variant}.webp|jpg`, where `key` is `randomBytes(16).toString('base64url')`. No user-supplied filenames are ever used.
   - Files are written to `${UPLOAD_DIR}/.tmp/` and then `rename`d into place, so writes are atomic. Files are 0644 and folders 0755.
   - The DB row is inserted afterwards; if that fails, the files are unlinked.
   - Before any delete, `path.resolve(p).startsWith(UPLOAD_DIR + sep)` is checked.
8. **Attach step:** domain DTOs reference `*ImageId` / `assetId` / `photoId` / `flyerId`. The service checks `asset.profileId === targetProfileId` and that the purpose matches. When an image is replaced, the old asset is deleted after commit.
9. **Cleanup** (`@nestjs/schedule`):
   - Hourly: delete assets older than 24 h with no references (all back-relations null) plus their files, and sweep `.tmp` files older than 1 h.
   - Weekly: delete files on disk that have no DB row and are older than 1 day.
   - When a profile is deleted, its whole folder is removed.
10. **Serving** (web nginx; the `media` volume is mounted `:ro` at `/srv/media`; the api mounts it read-write at `/data/media`):

    ```
    location /media/ { alias /srv/media/; limit_except GET HEAD { deny all; } autoindex off;
      location ~ ^/media/\.tmp/ { return 404; }
      location ~ \.(webp|jpg)$ { add_header Cache-Control "public, max-age=31536000, immutable" always;
                                 add_header X-Content-Type-Options nosniff always; }
      return 404; }
    ```

    Immutable caching is safe because every upload gets a new key. The Dockerfile runs `mkdir -p /data/media && chown node:node /data/media` so the new named volume inherits the right owner. The volume is part of the nightly backup.

## 8. Booking submission

- **Field catalogue** (`booking-fields.catalogue.ts`; key, type, default label, maximum):

  | Key(s) | Type | Limit / options |
  |---|---|---|
  | `fullName` | text | 80 |
  | `company` | text | 80 |
  | `email1`–`email3` | email | 254 |
  | `phone1`–`phone3` | tel | 7–15 digits, optional `+`, spaces |
  | `address1`, `address2` | text | 150 |
  | `eventDate` | date | today to +3 years |
  | `eventTime` | time | HH:mm |
  | `city` | text | 80 |
  | `venue` | text | 100 |
  | `eventType` | select | Club / Festival / Bar / Boda / Corporativo / Privado / Otro |
  | `setDuration` | select | 1h / 1.5h / 2h / 3h / 4h+ |
  | `attendees` | int | 1–100000 |
  | `budget` | text | 60 |
  | `taxId` | text | 20 |
  | `promoterLink` | https URL | 300 |
  | `message` | textarea | 2000 |

  The default config reproduces today's form: fullName (label "Nombre y empresa / productora", required), email1 (required), eventDate, city ("Ciudad / Lugar evento"), message ("Detalles del evento").
- **Form token:** `GET …/booking-token` returns `base64url({slug, iat})` plus an HMAC-SHA256 signature using `BOOKING_FORM_SECRET`.
- **Submit DTO:** `{ fields: Record<string,string|number> (IsObject, max 25 keys), consent: true (Equals), formToken, website: '' }`.
- **Processing order:**
  1. Load the visible profile, otherwise 404.
  2. **Honeypot:** if `website` is not empty, return a fake `201 {ok:true}`, store nothing, and increment a log metric.
  3. **Token check:** the HMAC must be valid (`timingSafeEqual`), the slug must match, and the age must be between 3 s and 2 h. Otherwise 400 `FORM_EXPIRED` (the front refetches the token).
  4. `BookingValidationService`:
     - Any key not enabled in the DJ's `bookingForm` gets 400. There is no silent dropping.
     - Required fields must be present.
     - Each value is validated and normalized by its catalogue type: safe-text, emails lowercased, phones reduced to digits, selects checked against their options, dates checked against Bogotá "today".
  5. Store the `BookingRequest`: a data snapshot with the labels in effect, the contact columns, `consentAt`, `consentVersion=PRIVACY_POLICY_VERSION`, the IP and the user agent. This is the proof of authorization Ley 1581 requires.
  6. After commit, queue the `new-booking` email (per-profile cap of 50/day).
  7. **WhatsApp message** (`whatsapp-message.builder.ts`):
     - Text: `Solicitud de booking — {displayName}\n` + `{label}: {value}` per field in the configured order + `\nEnviado desde {PUBLIC_BASE_URL}/{slug}`.
     - The message field is truncated to 700 characters and the whole text to 1,800.
     - URL: `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`.
  8. Response `201 { id, whatsappUrl | null }`. Front note: open the new window synchronously inside the click handler (or show an "Abrir WhatsApp" button), because iOS blocks `window.open` after an `await`.
- **Event CTAs** (`event-cta.builder.ts`):
  - WHATSAPP: `wa.me/<n>?text=` + `encodeURIComponent("Hola, quiero estar en el evento " + (title ?? venue) + " — " + dateLabel + (venue ? " en " + venue : ""))`.
  - URL: the stored, validated https URL, rendered with `rel="noopener noreferrer nofollow"`.
  - NONE: the CTA is hidden.
  - The same builder produces the hero CTA from `whatsappMessage` and the "Disponible / Reservar" row.
- **Social URLs** (`is-social-url.ts`):
  - https only; the host must match the platform's allowlist, for example INSTAGRAM `instagram.com`, SOUNDCLOUD `soundcloud.com`/`on.soundcloud.com`, SPOTIFY `open.spotify.com`, YOUTUBE `youtube.com`/`youtu.be`, RESIDENT_ADVISOR `ra.co`, X `x.com`/`twitter.com`, each with optional `www.`/`m.` prefixes.
  - WEBSITE accepts any public https host except IP literals and `localhost`.
  - `javascript:` / `data:` URLs are rejected by the https-only rule.

## 9. Security hardening checklist

**`main.ts`**
- [ ] `app.set('trust proxy', 1)`. Web nginx normalizes the client IP with `set_real_ip_from 127.0.0.1; set_real_ip_from 172.16.0.0/12; real_ip_header X-Forwarded-For; real_ip_recursive on;` and forwards `X-Forwarded-For $remote_addr`, overwriting the header. The api is never published.
- [ ] helmet on the API with CSP `default-src 'none'; frame-ancestors 'none'`, `crossOriginResourcePolicy: same-origin`. HSTS (1 year) is set only by the host nginx vhost.
- [ ] The **HTML CSP is owned by web nginx**, and the `@render` location strips helmet's CSP with `proxy_hide_header`:

  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests`

  The Inter font is self-hosted via `@fontsource/inter`, so there is no Google Fonts dependency. JSON-LD data blocks are not affected by `script-src`.
- [ ] CORS `origin: [PUBLIC_BASE_URL]` (plus localhost in development), `credentials:true`. Because the SPA and API share an origin, CORS is effectively closed.
- [ ] `ValidationPipe({ whitelist:true, forbidNonWhitelisted:true, forbidUnknownValues:true, transform:true, validationError:{target:false,value:false} })`.
- [ ] `useBodyParser('json',{limit:'100kb'})`; urlencoded is off. Express 5's simple query parser (no nested objects).

**Guards, errors, logging**
- [ ] Global `ThrottlerGuard`: default 120/min per IP, with the stricter per-route values from section 3. In-memory storage is fine for one instance; switch to Redis if the api is ever scaled out.
- [ ] `AllExceptionsFilter`: no stacks or Prisma messages in production, `X-Request-Id` on every response.
- [ ] nestjs-pino with `redact` on `req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]` and `*.password*`, `*.token`, `temporaryPassword`.

**Data access**
- [ ] Prisma only. ESLint `no-restricted-properties` bans `$queryRawUnsafe` and `$executeRawUnsafe`; the tagged `$queryRaw` is allowed only in `health/`.
- [ ] No mass assignment: no DTO contains `role`, `status`, `userId`, `profileId`, `featured`, `adminSingleton` or `tokenVersion`. An e2e test sends them and expects 400.
- [ ] IDOR: `{id, profileId}` scoping, 404 on a miss, and the route-guard matrix test (section 13).

**Output and SEO**
- [ ] Output escaping: React text only (ESLint `react/no-danger`). The SEO renderer HTML-escapes attributes and serializes JSON-LD with `<`, `>`, `&`, U+2028 and U+2029 escaped as `\u003c` and so on. Palettes are CSS classes, never user-supplied styles.
- [ ] `Cache-Control: no-store` by default, `@PublicCache(30)` on public GETs, no-store on every auth or admin response.
- [ ] Beta: `SEO_INDEXABLE=false` gives robots `Disallow: /`, a `noindex` meta tag and an `X-Robots-Tag: noindex` header (nginx envsubst template).

**Secrets**
- [ ] `.env` is gitignored; `.env.example` holds placeholders; joi validates at boot.
- [ ] `JWT_ACCESS_SECRET` of at least 64 characters, `BOOKING_FORM_SECRET` of at least 32 (generate with `openssl rand -base64 64`).
- [ ] `ADMIN_PASSWORD` is only needed by the seed CLI and should be removed from `.env` after seeding.

**Container and DB**
- [ ] `USER node`, `read_only: true` with a `/tmp` tmpfs, `cap_drop: [ALL]`, `no-new-privileges`, `mem_limit: 512m`, `NODE_OPTIONS=--max-old-space-size=256`.
- [ ] No host port for db. The entrypoint runs `migrate deploy` and fails fast.
- [ ] Optional: a separate DML-only DB user at runtime, with `MIGRATE_DATABASE_URL` used only by the entrypoint.

**CI**
- [ ] `npm ci`, `npm audit --audit-level=high` (**no** continue-on-error), unit and e2e tests against a MySQL service container, and `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url … --exit-code` so a forgotten migration fails CI (the Dashboard lesson). Dependabot enabled.

**Audit and retention**
- [ ] `AuditService.log(tx, …)` is called explicitly, inside the same transaction, for:
  - all admin actions;
  - security events: lockout, refresh reuse, password change/reset, email change, account deletion;
  - owner content edits (field names only, never values).

  Append-only (no update or delete endpoints); 24-month retention job.
- [ ] Housekeeping jobs (daily, `jobs/maintenance.jobs.ts`):
  - Purge refresh and email tokens more than 1 day past expiry.
  - Delete booking requests older than `BOOKING_RETENTION_MONTHS` (24).
  - Delete unverified users with no profile older than 14 days.
  - Recompute `nextEventDate` at 00:05 Bogotá time.

## 10. SEO (simplest robust mechanism)

- **Web nginx** (the `web` image; `web/index.html` contains `<!--seo:start-->` default title, description and og tags `<!--seo:end-->`):

  ```
  location / { try_files $uri @render; }                # real files (assets, favicon) served directly
  location @render {
    rewrite ^ /api/seo/render break;
    proxy_set_header X-Render-Path $request_uri;
    proxy_hide_header Content-Security-Policy;
    proxy_intercept_errors on;
    error_page 500 502 503 504 = @spa;
    proxy_pass http://api:3000;
  }
  location @spa { try_files /index.html =404; }         # renderer down -> plain SPA, site stays up
  location = /sitemap.xml { proxy_pass http://api:3000/api/seo/sitemap.xml; }
  location = /robots.txt  { proxy_pass http://api:3000/api/seo/robots.txt; }
  location ^~ /api/seo/   { return 404; }               # not reachable from outside
  location ^~ /Eventos/MacflyMikeBran/ { return 301 /<seed-slug>; }
  server { listen 8081; location = /index.html { root /usr/share/nginx/html; } }   # internal-only template source, not published
  ```

- **`SpaTemplateService`:** fetches `SPA_TEMPLATE_URL=http://web:8081/index.html` with a 2 s timeout and caches it for 60 s. It replaces the block between the markers. CI checks that the built `index.html` still contains the markers.
- **Resolving `X-Render-Path`** (at most 300 characters; the raw path is never echoed into the HTML):
  - `/` returns 200 with the index meta and JSON-LD `Organization` (Fersua Studio) plus an `ItemList` of visible DJs.
  - One segment, optionally ending in `.html`, is treated as a slug. The `.html` suffix is stripped and the segment lowercased.
    - If the lowercase form differs from the path, or `.html` was present: 301 to `/<lower>`.
    - If it is in `SlugRedirect`: 301 to `/<newSlug>`. This covers `/MacflyMikebran` and `/MacflyMikebran.html`.
    - A visible profile: 200 with per-profile tags.
    - Anything else: 404 with `noindex` (the SPA shows its not-found page).
  - SPA routes (`/login`, `/registro`, `/panel/*`, `/admin/*`, `/restablecer`, `/verificar-email`, `/privacidad`, `/terminos`) return 200 with default tags plus `noindex`. The same names are on the reserved-slug list.
  - Anything else returns 404 with the shell. HTML is sent with `Cache-Control: no-cache`.
- **Per-profile head:**
  - `<title>{displayName} — Booking | Fersua Studio</title>` (at most 70 characters).
  - `description` = `heroSubtitle` truncated to 155 characters.
  - `canonical` = `${PUBLIC_BASE_URL}/{slug}`.
  - `og:title/description/url`, `og:type=profile`, `og:site_name`, `og:locale=es_CO`.
  - `og:image` = absolute URL of the **hero og JPEG** (falls back to the card, then a site default), with `og:image:width=1200`, `og:image:height=630`.
  - `twitter:card=summary_large_image`, palette `theme-color`, robots meta according to `SEO_INDEXABLE`.
- **JSON-LD `MusicGroup`:**
  - `name`, `url`, `image`, `genre[]`, `member[{@type:Person,name}]`, `sameAs[]` (validated social URLs).
  - `contactPoint` only when `publicEmail` or `publicPhone` is set, so no more `REEMPLAZAR_TELEFONO`.
  - `event[]` (MusicEvent: `name`, `startDate`, `location{Place, name: venue, address: city}`).
- **Sitemap:** `/` plus `/{slug}` for each visible profile, with `lastmod=updatedAt`, XML-escaped.
- **robots.txt:** when indexable: `Allow: /`, `Disallow: /panel /admin /api/`, and a `Sitemap:` line. When not indexable: `Disallow: /`.
- **Alternative (rejected):** copying the web build into the api image from a shared Docker stage. That couples the two builds; the runtime fetch keeps them independent, and the nginx fallback protects availability.

## 11. Seed (`src/cli/seed.ts`, compiled to `dist/cli/seed.js`, Nest standalone context)

- **`admin`:**
  - If no admin exists, create one from `ADMIN_USERNAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` (the password must pass the policy and be at least 16 characters), with `role=ADMIN`, `adminSingleton=true` and `emailVerifiedAt=now`.
  - If an admin exists, do nothing unless `--reset-password` is passed.
  - It refuses to run if any variable is missing. Nothing is hard-coded.
- **`genres`:** upserts about 30 genres, including House, Tech House, Minimal Deep Tech, Jackin & Funky, Techno, Afro House, Melodic Techno, Deep House, Reggaeton, Guaracha, and so on.
- **`macfly --assets /seed-assets/macfly`:**
  - Creates user `macflymikebran` with a random unusable password and status ACTIVE. The owner later uses the admin temporary-password reset, or transfers the profile to the DJ's own user.
  - Creates the profile as APPROVED, with texts, genres, the 7 rider items, 2 members with Instagram and SoundCloud links (tracking parameters removed), WhatsApp `573505209860`, gallery photos 1–8, hero (`header.JPEG`), member photos and events plus flyers. Everything goes through `ImagePipelineService`.
  - Adds a `SlugRedirect` from `macflymikebran` if the chosen slug differs.
  - Idempotent: keyed by slug.
  - Run with: `docker compose run --rm -v ./api/seed-assets:/seed-assets:ro api node dist/cli/seed.js macfly --assets /seed-assets/macfly`.

## 12. Environment variables (joi)

| Group | Variables |
|---|---|
| Core | `NODE_ENV`, `PORT=3000`, `DATABASE_URL`, `PUBLIC_BASE_URL` (https, no trailing slash), `CORS_ORIGINS`, `TRUST_PROXY_HOPS=1`, `LOG_LEVEL` |
| Auth | `JWT_ACCESS_SECRET` (min 64), `JWT_ACCESS_TTL_SEC=900`, `REFRESH_IDLE_DAYS=7`, `REFRESH_ABSOLUTE_DAYS=30`, `ADMIN_REFRESH_IDLE_HOURS=24`, `ADMIN_REFRESH_ABSOLUTE_DAYS=7`, `COOKIE_SECURE=true`, `RESET_TOKEN_TTL_MIN=45`, `VERIFY_TOKEN_TTL_HOURS=48` |
| Booking and data | `BOOKING_FORM_SECRET` (min 32), `BOOKING_RETENTION_MONTHS=24` |
| Mail | `SMTP_HOST`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_TRANSPORT=smtp\|log`, `ADMIN_EMAIL` (for notifications) |
| Media | `UPLOAD_DIR=/data/media`, `MEDIA_BASE_URL=/media`, `UPLOAD_MAX_MB=15`, `PROFILE_QUOTA_MB=150` |
| SEO | `SEO_INDEXABLE=false` (beta), `SPA_TEMPLATE_URL=http://web:8081/index.html` |
| Seed only | `ADMIN_USERNAME`, `ADMIN_PASSWORD` |
| Optional | `MFA_ENC_KEY`, `MIGRATE_DATABASE_URL` |

## 13. Testing strategy

- **Unit tests (jest, `*.spec.ts`):**
  - `PasswordPolicyService`: rejects weak passwords, passwords containing the username, and passwords over 128 characters.
  - Username and slug validators: reserved words, case handling, double hyphens, dots.
  - `PasswordHasher`: rehash when settings change; dummy-hash path.
  - `RefreshTokenService` against the test DB: rotation, reuse within and after the grace window, family revocation, idle and absolute expiry, compare-and-set race.
  - `JwtStrategy.validate`: `tv` mismatch, suspended user, role taken from the DB.
  - Guards: `MustChangePasswordGuard`, `RolesGuard`, `ProfileScopeGuard` (USER on an admin path gets 403; ADMIN on `/me` gets 403; no profile gets `NO_PROFILE`).
  - The status-transition matrix.
  - `BookingValidationService`: unknown key, disabled key, missing required field, each type's valid and invalid cases, normalization.
  - `FormTokenService`: tampering, too fast, expired, wrong slug.
  - `WhatsappMessageBuilder`: encoding of `&`, `#`, emoji and newlines; truncation; no leftover `{…}` placeholders.
  - `EventCtaBuilder`.
  - `SocialUrl`: host allowlist, `javascript:`, `http:`, IP literals.
  - `ImagePipeline` with fixtures:
    - JPEG, PNG and WebP pass.
    - A text file renamed to `.jpg`, an SVG, and a HEIC are rejected.
    - A small PNG declaring 20000x20000 pixels (decompression bomb) is rejected.
    - A JPEG with GPS EXIF comes out with no EXIF (checked via `sharp(out).metadata()`).
    - Orientation is applied.
  - `HeadBuilder` and `JsonLd`: escaping of `"`, `<`, `</script>` and U+2028; absolute og:image.
- **E2E tests (supertest; `docker-compose.test.yml` with mysql:8.4 on tmpfs; `prisma migrate reset --force` in the global setup; `--runInBand`; mail transport mocked; clock controlled by updating `expiresAt` directly in the DB):**
  - **auth:**
    - Register, then log in by username. Logging in with the email in the username field fails.
    - `/me`; refresh sets a new cookie; the old cookie reused after 20 s causes a family-wide 401 on both.
    - `logout-all` makes an existing access token fail immediately.
    - 5 failures lock the account; the unknown-user and wrong-password bodies are byte-identical.
    - `forgot-password` gives the same 202 for known and unknown users.
    - Reset tokens are single-use and expire.
    - After an admin temporary reset, only allowlisted routes work (others give 403 `PASSWORD_CHANGE_REQUIRED`); they all work after `change-password`; an expired temporary password is rejected.
  - **ownership:**
    - User B gets 404 on PATCH/DELETE of A's event, member, gallery item, media and booking request.
    - B cannot attach A's asset id.
    - B's list endpoints never include A's data.
  - **route-guard matrix:** walks every registered route through `DiscoveryService` and `Reflector`:
    - Every non-`@Public` route gives 401 without a token.
    - Every `/admin/**` route gives 403 to a USER token.
    - Every `/me/**` route gives 403 to the ADMIN token.

    New routes cannot silently miss a guard.
  - **mass assignment:** PATCH `/me/profile` with `{status:'APPROVED'}`, `{featured:true}` or `{userId}` gives 400.
  - **public:**
    - DRAFT, PENDING, REJECTED and SUSPENDED profiles, and profiles of suspended users, are absent from the list, the detail endpoint, the sitemap and `render` (404).
    - Featured profiles come first; genre filter and accent-insensitive search work; past events are hidden (Bogotá boundary at 23:30 local).
  - **booking:**
    - A disabled field, a missing required field, `consent:false` and a token younger than 3 s all give 400.
    - The honeypot gives 201 with no row stored.
    - The 4th request in 10 minutes gives 429; the profile daily cap is enforced.
    - The stored snapshot and `whatsappUrl` are correct.
    - A non-visible profile gives 404.
  - **media:** 16 MB gives 413; wrong type gives 415; quota gives 409; files exist on disk under a random name; orphans are removed by the cleanup job (invoked directly).
  - **slug and SEO:**
    - A reserved slug gives 400; the case-insensitive duplicate gives 409; the 30-day cooldown is enforced.
    - `render` of `/MacflyMikebran` and `/MacflyMikebran.html` gives 301 to the seed slug.
    - `/{slug}` HTML contains the escaped title, the absolute og:image and a JSON-LD block that parses.
  - **admin:**
    - Approve, reject, suspend and reinstate each write audit rows and send emails.
    - Transfer to a user who already has a profile gives 409.
    - A second ADMIN cannot be created (`adminSingleton`).
    - Deleting a user removes the media folder.
- **CI:** GitHub Actions job with a `mysql:8.4` service, running migrate deploy, lint, unit, e2e, the migrate-diff drift check, `npm audit --audit-level=high` (blocking), and a docker build.

## 14. Open questions for the owner (backend-relevant)

1. **Email verification:** should a verified email be required before a profile can be submitted for review? Recommended: yes.
2. **Genres:** a fixed catalogue managed by the admin (recommended, needed for a clean genre filter), or free text chosen by each DJ?
3. **Admin two-factor:** add TOTP for the admin account now, or in phase 2?
4. **Bookings and privacy:** how long should booking requests be kept (24 months suggested)? For the privacy text: is Fersua Studio the data controller, or each DJ?
5. **Seed dates:** all of Mac Fly & Mike Bran's dates (Nov 2025 to Jan 2026) are in the past as of 2026-09-28, so they would all be archived. Some flyer file names say 2025 for the January dates. Seed them as archived history, or skip them? And what should the new slug be (e.g. `macfly-mikebran`)?
6. **Other pages on the apex:** Allset.html, pedido.html, DiannMakinne.html and Molly.html live on the apex today. They stop working when the apex DNS moves to the VPS, and the AAAA record must also be changed or removed. Where should Allset live?
7. **DJ controls:** may a DJ unpublish their own page or delete their own account? Account deletion is recommended because of the data-subject rights in Ley 1581.
8. **Notifications:** should booking-request emails to the DJ be on by default, and should the admin be emailed on every new submission for review?

### Critical files for implementation
- C:\Fernando\Desarrollo\hostinger\fersua-djs\api\prisma\schema.prisma
- C:\Fernando\Desarrollo\hostinger\fersua-djs\api\src\auth\tokens\refresh-token.service.ts
- C:\Fernando\Desarrollo\hostinger\fersua-djs\api\src\common\guards\profile-scope.guard.ts
- C:\Fernando\Desarrollo\hostinger\fersua-djs\api\src\media\image-pipeline.service.ts
- C:\Fernando\Desarrollo\hostinger\fersua-djs\api\src\booking-requests\booking-validation.service.ts
- C:\Fernando\Desarrollo\hostinger\fersua-djs\api\src\seo\seo.controller.ts
- C:\Fernando\Desarrollo\Personal\FersuaStore\HabitFer\api\src\main.ts and common\guards\origin.guard.ts (patterns reused)
- C:\Fernando\Desarrollo\hostinger\public_html\MacflyMikebran.html (template and seed source)