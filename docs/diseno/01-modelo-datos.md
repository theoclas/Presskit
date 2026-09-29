## Data model and content limits: Fersua DJs monorepo

### 0. Key decisions

- **IDs.** Use `cuid()` strings everywhere, as HabitFer does. `Genre` is the exception: it uses an `Int` autoincrement.
- **Charset.** MySQL 8.4 runs with `--character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci`. Prisma migrate already emits `DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci` per table. Uniqueness is case- and accent-insensitive, and slugs, usernames and emails are also stored lowercase.
- **Page texts go in one `DjProfile.texts Json` column.** It is validated against a fixed shared catalogue, `PAGE_TEXT_SLOTS` (key, default, max length). About 40 template strings would otherwise be 40 columns. Adding a slot needs no migration, and missing keys fall back to the defaults.
  - Columns are kept only for fields that are queried, indexed or semantic: slug, displayName, tagline, whatsapp, palette, status, SEO.
- **Only one ADMIN can exist, enforced by the database.** The column `adminSlot Boolean? @unique` is `TRUE` only on the admin row and `NULL` on all others. MySQL allows many NULLs but only one `TRUE`.
- **Genres come from a list the admin manages.** DJs pick from it; they cannot type free text. This keeps the genre filter on the index consistent.
- **Social platforms and palettes are Prisma enums, duplicated in shared.** An api unit test checks that the Prisma enum values equal the shared arrays. Form field keys and text slots are `VarChar`, validated against the catalogues, because those lists will grow.
- **Tokens and IPs are only stored hashed.**
  - Refresh, reset and verify tokens: stored as `sha256(hex)` `CHAR(64)`. The raw value is never stored.
  - IPs: stored as `HMAC-SHA256(IP_HASH_SECRET, ip)`. A plain sha256 of an IPv4 address can be brute-forced.

---

### 1. `api/prisma/schema.prisma`

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "mysql"  url = env("DATABASE_URL") }

enum UserRole            { USER ADMIN }
enum UserStatus          { ACTIVE SUSPENDED }
enum UserTokenType       { PASSWORD_RESET EMAIL_VERIFY }
enum SessionRevokeReason { LOGOUT ROTATED REUSE_DETECTED PASSWORD_CHANGED ADMIN_ACTION }
enum ProfileStatus       { DRAFT PENDING APPROVED REJECTED SUSPENDED }
enum PaletteKey          { SUNSET MIAMI NEON ACID INFERNO OCEAN GOLD MONO }
enum SocialPlatform      { INSTAGRAM SOUNDCLOUD SPOTIFY TIKTOK YOUTUBE FACEBOOK BEATPORT MIXCLOUD RESIDENT_ADVISOR X WHATSAPP APPLE_MUSIC BANDCAMP TWITCH THREADS LINKTREE WEBSITE }
enum MediaKind           { HERO CARD OG MEMBER GALLERY FLYER }
enum EventCtaType        { WHATSAPP URL NONE }
enum BookingStatus       { NEW READ ARCHIVED SPAM }   // SPAM = optional addition

model User {
  id                 String     @id @default(cuid())
  username           String     @unique @db.VarChar(24)   // lowercase, login identifier
  email              String?    @unique @db.VarChar(254)  // lowercase; required by RegisterDto, NULL only for seed/admin-created users
  emailVerifiedAt    DateTime?
  passwordHash       String     @db.VarChar(255)          // bcrypt(12) or argon2id
  role               UserRole   @default(USER)
  adminSlot          Boolean?   @unique                   // TRUE only for the ADMIN -> DB guarantees <=1 admin
  status             UserStatus @default(ACTIVE)
  mustChangePassword Boolean    @default(false)           // set by admin reset
  tokenVersion       Int        @default(0)               // in access JWT ("tv"); ++ revokes all access tokens
  passwordChangedAt  DateTime   @default(now())
  failedLoginCount   Int        @default(0)
  lockedUntil        DateTime?
  lastLoginAt        DateTime?
  termsVersion       String?    @db.VarChar(20)
  termsAcceptedAt    DateTime?
  createdAt          DateTime   @default(now())
  updatedAt          DateTime   @updatedAt

  profile          DjProfile?   @relation("ProfileOwner")
  approvedProfiles DjProfile[]  @relation("ProfileApprover")
  sessions         Session[]
  tokens           UserToken[]
  uploads          MediaAsset[] @relation("MediaUploader")
  auditLogs        AuditLog[]

  @@index([role])
}

model Session {                                     // one row per refresh token (rotation)
  id           String               @id @default(cuid())
  userId       String
  user         User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  familyId     String               @db.VarChar(30)       // constant across rotations of one login
  tokenHash    String               @unique @db.Char(64)
  userAgent    String?              @db.VarChar(200)
  ipHash       String?              @db.Char(64)
  createdAt    DateTime             @default(now())
  lastUsedAt   DateTime             @default(now())
  expiresAt    DateTime
  revokedAt    DateTime?
  revokeReason SessionRevokeReason?
  replacedById String?              @db.VarChar(30)      // reuse of a replaced token => revoke whole family

  @@index([userId, revokedAt])
  @@index([familyId])
  @@index([expiresAt])
}

model UserToken {                                   // password reset + email verification
  id            String        @id @default(cuid())
  userId        String
  user          User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  type          UserTokenType
  tokenHash     String        @unique @db.Char(64)
  expiresAt     DateTime                              // reset 30 min, verify 48 h
  usedAt        DateTime?
  requestIpHash String?       @db.Char(64)
  createdAt     DateTime      @default(now())

  @@index([userId, type, createdAt])                  // "max 3 reset mails/hour" check
  @@index([expiresAt])
}

model DjProfile {
  id               String        @id @default(cuid())
  userId           String?       @unique              // 1 user <-> max 1 profile; NULL = unassigned (admin-held)
  user             User?         @relation("ProfileOwner", fields: [userId], references: [id], onDelete: SetNull)
  slug             String        @unique @db.VarChar(40)
  slugChangedAt    DateTime?
  displayName      String        @db.VarChar(60)      // nav brand, index card, <title>
  tagline          String?       @db.VarChar(120)     // index card line
  seoDescription   String?       @db.VarChar(160)     // meta description
  shareDescription String?       @db.VarChar(160)     // og:description (fallback seoDescription)
  city             String?       @db.VarChar(60)
  countryCode      String        @default("CO") @db.Char(2)
  whatsappNumber   String?       @db.VarChar(15)      // E.164 digits w/o '+', e.g. 573505209860
  publicEmail      String?       @db.VarChar(254)     // JSON-LD / contact (optional, opt-in)
  publicPhone      String?       @db.VarChar(16)      // "+57..." JSON-LD; fallback '+'+whatsappNumber
  palette          PaletteKey    @default(SUNSET)
  texts            Json                               // Record<TextSlotKey,string>; set {} on create (no Json default)
  showGallery      Boolean       @default(true)
  showRider        Boolean       @default(true)
  showEvents       Boolean       @default(true)
  showOpenDateRow  Boolean       @default(true)       // "Disponible / Abrir nueva fecha / Reservar" row
  formEnabled      Boolean       @default(true)
  formOpenWhatsapp Boolean       @default(true)       // after DB save, open wa.me with summary
  notifyByEmail    Boolean       @default(true)       // email owner on new BookingRequest

  heroImageId      String?       @unique
  heroImage        MediaAsset?   @relation("ProfileHero", fields: [heroImageId], references: [id], onDelete: SetNull)
  cardImageId      String?       @unique
  cardImage        MediaAsset?   @relation("ProfileCard", fields: [cardImageId], references: [id], onDelete: SetNull)
  ogImageId        String?       @unique
  ogImage          MediaAsset?   @relation("ProfileOg",   fields: [ogImageId],   references: [id], onDelete: SetNull)

  status           ProfileStatus @default(DRAFT)
  statusReason     String?       @db.VarChar(300)     // shown to DJ on REJECTED/SUSPENDED
  submittedAt      DateTime?
  reviewedAt       DateTime?
  approvedAt       DateTime?
  approvedById     String?
  approvedBy       User?         @relation("ProfileApprover", fields: [approvedById], references: [id], onDelete: SetNull)
  featured         Boolean       @default(false)
  sortOrder        Int           @default(0)
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  genres        ProfileGenre[]
  members       Member[]
  socialLinks   SocialLink[]
  gallery       GalleryImage[]
  riderItems    RiderItem[]
  events        Event[]
  formFields    FormFieldConfig[]
  bookings      BookingRequest[]
  media         MediaAsset[]   @relation("ProfileMedia")
  slugRedirects SlugRedirect[]

  @@index([status, featured, sortOrder])              // index grid: APPROVED, featured DESC, sortOrder ASC, approvedAt DESC
}

model SlugRedirect {                                 // old slugs + legacy names -> 301
  fromSlug  String    @id @db.VarChar(60)
  profileId String
  profile   DjProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  createdAt DateTime  @default(now())
  @@index([profileId])
}

model Genre {
  id        Int            @id @default(autoincrement())
  slug      String         @unique @db.VarChar(40)
  name      String         @unique @db.VarChar(40)
  isActive  Boolean        @default(true)             // admin deactivates instead of deleting
  sortOrder Int            @default(0)
  createdAt DateTime       @default(now())
  profiles  ProfileGenre[]
}

model ProfileGenre {                                 // chip order = sortOrder
  profileId String
  profile   DjProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  genreId   Int
  genre     Genre     @relation(fields: [genreId], references: [id], onDelete: Restrict)
  sortOrder Int       @default(0)
  @@id([profileId, genreId])
  @@index([genreId])
}

model Member {
  id          String       @id @default(cuid())
  profileId   String
  profile     DjProfile    @relation(fields: [profileId], references: [id], onDelete: Cascade)
  name        String       @db.VarChar(60)
  role        String?      @db.VarChar(80)          // "House / Tech / Jackin · DJ"
  description String?      @db.VarChar(400)
  photoId     String?      @unique
  photo       MediaAsset?  @relation("MemberPhoto", fields: [photoId], references: [id], onDelete: SetNull)
  sortOrder   Int          @default(0)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  socialLinks SocialLink[]
  @@index([profileId, sortOrder])
}

model SocialLink {                                   // memberId NULL = profile-level link
  id        String         @id @default(cuid())
  profileId String                                   // always set (authorization scope)
  profile   DjProfile      @relation(fields: [profileId], references: [id], onDelete: Cascade)
  memberId  String?                                  // service asserts member.profileId == profileId
  member    Member?        @relation(fields: [memberId], references: [id], onDelete: Cascade)
  platform  SocialPlatform
  url       String         @db.VarChar(500)          // normalized https URL (host allow-list per platform)
  label     String?        @db.VarChar(30)           // NULL => platform label
  sortOrder Int            @default(0)
  createdAt DateTime       @default(now())
  @@index([profileId, memberId, sortOrder])
  @@index([memberId])
}

model GalleryImage {
  id        String     @id @default(cuid())
  profileId String
  profile   DjProfile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  mediaId   String     @unique
  media     MediaAsset @relation("GalleryMedia", fields: [mediaId], references: [id], onDelete: Cascade)
  alt       String?    @db.VarChar(125)
  sortOrder Int        @default(0)
  createdAt DateTime   @default(now())
  @@index([profileId, sortOrder])
}

model RiderItem {
  id        String    @id @default(cuid())
  profileId String
  profile   DjProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  name      String    @db.VarChar(60)                 // "CDJ 3000"
  note      String?   @db.VarChar(80)                 // "x2", "o similar"
  sortOrder Int       @default(0)
  @@index([profileId, sortOrder])
}

model Event {
  id        String       @id @default(cuid())
  profileId String
  profile   DjProfile    @relation(fields: [profileId], references: [id], onDelete: Cascade)
  date      DateTime     @db.Date                   // calendar date in America/Bogota
  startTime String?      @db.VarChar(5)             // "22:00"
  place     String       @db.VarChar(90)            // .show-place text; also {evento} in WA message
  city      String?      @db.VarChar(60)
  flyerId   String?      @unique
  flyer     MediaAsset?  @relation("EventFlyer", fields: [flyerId], references: [id], onDelete: SetNull)
  ctaType   EventCtaType @default(WHATSAPP)
  ctaUrl    String?      @db.VarChar(500)           // https only, required iff ctaType=URL
  ctaLabel  String?      @db.VarChar(20)            // NULL => texts.eventCtaLabel ("Book")
  isHidden  Boolean      @default(false)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  @@index([profileId, date])                          // public: date >= todayBogota AND !isHidden; archive: date < today
  @@index([date, isHidden])                           // index "next date" per profile (GROUP BY profileId MIN(date))
}

model FormFieldConfig {
  id          String    @id @default(cuid())
  profileId   String
  profile     DjProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  fieldKey    String    @db.VarChar(32)             // key of BOOKING_FIELD_CATALOGUE
  enabled     Boolean   @default(false)
  required    Boolean   @default(false)
  label       String?   @db.VarChar(60)             // NULL => catalogue default
  placeholder String?   @db.VarChar(80)
  sortOrder   Int       @default(0)
  updatedAt   DateTime  @updatedAt
  @@unique([profileId, fieldKey])
  @@index([profileId, sortOrder])
}

model BookingRequest {
  id             String        @id @default(cuid())
  profileId      String
  profile        DjProfile     @relation(fields: [profileId], references: [id], onDelete: Cascade)
  payload        Json                                // { [fieldKey]: string } only enabled keys, sanitized
  fieldsSnapshot Json                                // [{ key, label, type }] as shown at submit time
  contactName    String        @db.VarChar(80)      // denormalized from fullName
  contactEmail   String?       @db.VarChar(254)     // from email1
  contactPhone   String?       @db.VarChar(20)      // from phone1
  eventDate      DateTime?     @db.Date
  status         BookingStatus @default(NEW)
  readAt         DateTime?
  archivedAt     DateTime?
  consentAt      DateTime                            // Ley 1581 checkbox (mandatory)
  consentVersion String        @db.VarChar(20)      // CONSENT_VERSION, e.g. "2026-09"
  ipHash         String        @db.Char(64)
  userAgent      String?       @db.VarChar(200)
  createdAt      DateTime      @default(now())
  @@index([profileId, status, createdAt])
  @@index([createdAt])                                // retention purge + admin "all requests"
  @@index([ipHash, createdAt])                        // per-IP daily caps
}

model MediaAsset {
  id            String     @id @default(cuid())
  profileId     String?                              // NULL = platform asset
  profile       DjProfile? @relation("ProfileMedia", fields: [profileId], references: [id], onDelete: Cascade)
  uploadedById  String?
  uploadedBy    User?      @relation("MediaUploader", fields: [uploadedById], references: [id], onDelete: SetNull)
  kind          MediaKind
  storageKey    String     @unique @db.VarChar(80)  // "p/<profileId>/<assetId>" under /data/media
  variants      Json                                  // [{ w, h, bytes, file: "960.webp", format }]
  width         Int                                   // largest variant
  height        Int
  bytesTotal    Int                                   // sum of variants (quota)
  originalBytes Int
  originalMime  String     @db.VarChar(20)           // sniffed by magic bytes
  sha256        String     @db.Char(64)              // of original upload
  dominantColor String?    @db.Char(7)               // placeholder bg
  attachedAt    DateTime?                             // NULL = orphan; swept after 24 h
  createdAt     DateTime   @default(now())

  heroOf    DjProfile?    @relation("ProfileHero")
  cardOf    DjProfile?    @relation("ProfileCard")
  ogOf      DjProfile?    @relation("ProfileOg")
  memberOf  Member?       @relation("MemberPhoto")
  galleryOf GalleryImage? @relation("GalleryMedia")
  flyerOf   Event?        @relation("EventFlyer")

  @@index([profileId, kind])
  @@index([attachedAt, createdAt])
  @@index([sha256])
}

model AuditLog {                                     // no FK to targets: survives deletions
  id            String   @id @default(cuid())
  actorId       String?
  actor         User?    @relation(fields: [actorId], references: [id], onDelete: SetNull)
  actorUsername String?  @db.VarChar(24)            // snapshot
  action        String   @db.VarChar(48)            // AUDIT_ACTIONS, e.g. "admin.profile.approve"
  targetType    String?  @db.VarChar(24)
  targetId      String?  @db.VarChar(30)
  profileId     String?  @db.VarChar(30)
  metadata      Json?                                // changed field names / non-sensitive before-after; never secrets
  ipHash        String?  @db.Char(64)
  createdAt     DateTime @default(now())
  @@index([createdAt])
  @@index([actorId, createdAt])
  @@index([targetType, targetId])
  @@index([profileId, createdAt])
}

model Setting {                                      // registration.open, index.texts, privacy.version
  key         String   @id @db.VarChar(64)
  value       Json
  updatedById String?  @db.VarChar(30)
  updatedAt   DateTime @updatedAt
}
```

**Deletion rules:**
- **Profile deletion must follow a fixed order, because of the circular reference between `DjProfile` and `MediaAsset`.** In one transaction:
  1. Collect the `storageKey`s.
  2. `UPDATE DjProfile SET heroImageId/cardImageId/ogImageId = NULL`.
  3. `DELETE DjProfile`. This cascades to members, links, gallery, rider, events, form config, bookings, media rows and redirects.
  4. After the commit, `rm -r /data/media/p/<profileId>`.

  Cover this with an integration test.
- **Deleting a user sets `DjProfile.userId` to NULL.** The admin UI offers "delete profile too" (the default) or "keep unassigned". `AuditLog.actorId` is also set to NULL, and `actorUsername` keeps the name.
- **Replacing an image deletes the old asset immediately.** A nightly job deletes assets that still have `attachedAt IS NULL` 24 hours after `createdAt`.

**Profile status transitions:**
- DRAFT → PENDING: the DJ clicks "Enviar a revisión". The `PUBLISH_CHECKLIST` must pass: displayName, slug, a non-empty `texts.heroTitle`, heroImage, at least 1 genre, at least 1 member, and at least one contact (whatsappNumber, or the form with email1 or phone1 required).
- PENDING → APPROVED or REJECTED, set by the admin with a reason.
- REJECTED → PENDING when the DJ resubmits.
- APPROVED ↔ SUSPENDED, admin only.

Only APPROVED profiles are public or appear on the index. The owner and the admin can preview in any status.

---

### 2. Shared constants: where they live

Use npm workspaces. The root `package.json` has `"workspaces": ["packages/shared","api","web"]`.

```
packages/shared/            name "@fersua/shared", zero runtime deps, built with tsup -> dist/index.js (ESM) + index.cjs (Nest CJS) + .d.ts
  src/limits.ts  media.ts  text-slots.ts  booking-fields.ts  booking-validate.ts  form-config-validate.ts
  src/palettes.ts  social-platforms.ts  slug.ts  username.ts  genres.ts  consent.ts  sanitize.ts  dates.ts  enums.ts  index.ts
  test/*.spec.ts (vitest)
```

- **Docker build context changes to the repo root.** In compose: `build: { context: ., dockerfile: api/Dockerfile }`. Each Dockerfile copies the root `package*.json`, `packages/shared` and its own app, then runs `npm ci -w packages/shared -w api`, builds shared, then builds the app. Add a root `.dockerignore`.
- **Fallback if you want to keep separate build contexts:** `scripts/sync-shared.mjs` copies `packages/shared/src` into `api/src/shared` and `web/src/shared`. The copied files carry a "GENERATED – DO NOT EDIT" header, and CI runs `git diff --exit-code` after sync.
- **The web app never imports `@prisma/client`.** `enums.ts` mirrors `PROFILE_STATUSES`, `SOCIAL_PLATFORM_KEYS`, `PALETTE_KEYS`, `MEDIA_KINDS` and `BOOKING_STATUSES`. `api/src/shared-enums.spec.ts` checks they equal the Prisma enums.
- **Every validator is a pure shared function.** Examples: `validateSlug`, `normalizeSocialUrl`, `validateBookingSubmission(config, body, today)`, `validateFormConfig`, `resolveTexts(texts, displayName)`, `cleanText`. The web app pre-validates with them; the api is the authority. Fixed DTOs use class-validator with `@MaxLength(LIMITS.x)`. The dynamic booking payload and `texts` use the shared validators.

---

### 3. `LIMITS` and `MEDIA_VARIANTS` (`packages/shared/src/limits.ts`, `media.ts`)

```ts
export const LIMITS = {
  user:    { usernameMin: 3, usernameMax: 24, emailMax: 254, passwordMin: 10, passwordMaxBytes: 72 },
  profile: { slugMin: 3, slugMax: 40, slugChangeCooldownDays: 30, maxSlugRedirects: 5,
             displayNameMax: 60, taglineMax: 120, seoDescriptionMax: 160, cityMax: 60,
             whatsappDigitsMin: 8, whatsappDigitsMax: 15, statusReasonMax: 300 },
  genres:  { perProfileMin: 1, perProfileMax: 6, nameMax: 40 },
  members: { max: 6, nameMax: 60, roleMax: 80, descriptionMax: 400 },
  social:  { perProfileMax: 10, perMemberMax: 6, urlMax: 500, labelMax: 30, perPlatformPerOwner: 1 /* WEBSITE: 2 */ },
  gallery: { max: 24, altMax: 125 },
  rider:   { max: 20, nameMax: 60, noteMax: 80 },
  events:  { upcomingMax: 30, storedMax: 60 /* oldest past auto-deleted incl. flyer */, placeMax: 90,
             cityMax: 60, ctaLabelMax: 20, ctaUrlMax: 500, maxDaysAhead: 730 },
  texts:   { multilineMaxLines: 6 },
  form:    { labelMax: 60, placeholderMax: 80 },
  booking: { payloadMaxBytes: 16_384, textareaMaxLines: 30, perIpPerProfilePerDay: 5, perIpPerDay: 20,
             minFillMs: 3_000, maxFillMs: 86_400_000, inboxPageSize: 20, inboxPageSizeMax: 100 },
  upload:  { maxBytes: 15 * 1024 * 1024 /* nginx client_max_body_size 16m */, maxInputPixels: 40_000_000,
             minSidePx: 200, allowedMimes: ['image/jpeg', 'image/png', 'image/webp'] as const,
             perProfileAssetsMax: 100, perProfileBytesMax: 80 * 1024 * 1024, orphanTtlHours: 24,
             sharpConcurrency: 1 },
  retention: { bookingMonths: 24, auditMonths: 24, sessionPurgeDaysAfterExpiry: 30, userTokenPurgeDays: 7,
               resetTokenMinutes: 30, verifyTokenHours: 48 },
} as const;

// All: .rotate() (apply EXIF orientation) -> resize withoutEnlargement -> strip ALL metadata; skip widths > source.
export const MEDIA_VARIANTS = {
  HERO:    { widths: [480, 960, 1440], fit: 'inside', format: 'webp', quality: 80 },
  CARD:    { widths: [400, 800], aspect: [4, 5], fit: 'cover', position: 'attention', format: 'webp', quality: 78 },
  MEMBER:  { widths: [240, 480], fit: 'inside', format: 'webp', quality: 80 },      // CSS object-fit handles crop
  GALLERY: { widths: [480, 960, 1600], fit: 'inside', format: 'webp', quality: 80 },
  FLYER:   { widths: [540, 1080], fit: 'inside', format: 'webp', quality: 82 },
  OG:      { widths: [1200], height: 630, fit: 'cover', format: 'jpeg', quality: 82 }, // JPEG: crawler compat
} as const;
export const MEDIA_KIND_MAX = { HERO: 1, CARD: 1, OG: 1, MEMBER: LIMITS.members.max, GALLERY: LIMITS.gallery.max, FLYER: LIMITS.events.storedMax } as const;
```

The upload input should use `accept="image/jpeg,image/png,image/webp"`. iOS then converts HEIC to JPEG itself; the prebuilt sharp binaries cannot decode HEIC. The web app may also shrink images to 2560 px in the browser before upload; the server validates anyway.

---

### 4. `PAGE_TEXT_SLOTS` (`text-slots.ts`)

Each entry is `{ key, group, default, max, multiline?, optional?, placeholders? }`.

**Sanitizing (`cleanText`):**
- NFC normalize, then trim.
- Remove control characters, zero-width characters and bidi overrides: `[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]`.
- Newlines are allowed only in multiline slots.
- Texts are rendered as text only (React escaping). Any server-side meta or JSON-LD rendering must escape `<`, `>` and `</script`.

| key | default (new DJ) | max | notes |
|---|---|---|---|
| navTag | Booking | 20 | also `<title>` = `${navTag} — ${displayName}` |
| navArtists / navEvents / navBooking | Artistas / Fechas / Solicitud | 20 | |
| heroLabel | DJs | 40 | |
| heroTitle | Electronic club show | 60 | required for publish |
| heroSubtitle | "" | 600 | multiline, optional |
| heroNote | "" | 160 | optional (hidden if empty) |
| heroPrimaryCta | WhatsApp Booking | 30 | wa.me/{whatsapp}?text=heroWhatsappMessage |
| heroWhatsappMessage | Hola, quiero cotizar booking | 200 | |
| heroSecondaryCta | Enviar solicitud | 30 | anchors #booking |
| heroPhotoAlt | "" → `Show de ${displayName}` | 125 | |
| heroCaptionLeft / heroCaptionRight | Live club show / "" | 40 | |
| riderCardLabel / riderCardTitle / riderButton | Live Setup / Specs / Rider técnico | 24/30/24 | |
| riderTitle | "" | 40 | optional |
| galleryCardLabel / galleryCardTitle / galleryButton | Media / Highlights / Photos | 24/30/24 | |
| galleryTitle | Galería | 40 | |
| artistsTitle / artistsSubtitle | Artistas / "" | 40/160 | |
| eventsTitle / eventsSubtitle | Fechas / Agenda actual y espacios abiertos para nuevas reservas. | 40/160 | |
| eventsNote | "" | 240 | |
| eventsEmpty | Pronto anunciaremos nuevas fechas. | 120 | |
| eventCtaLabel | Book | 20 | |
| eventWhatsappMessage | Quiero estar en el evento {evento} ({fecha}) | 200 | placeholders `{evento}`, `{fecha}` only; replaced and URL-encoded (fixes the literal-placeholder bug) |
| openDateLabel / openDateText / openDateCta | Disponible / Abrir nueva fecha / Reservar | 20/60/20 | |
| openDateWhatsappMessage | "" | 200 | optional |
| bookingTitle / bookingSubtitle | Solicitud de booking / Completa los datos básicos y te responderemos con la propuesta y condiciones. | 40/200 | bookingTitle is also the WA summary header |
| bookingSubmit / bookingWhatsappButton | Enviar solicitud / Hablar por WhatsApp | 30 | |
| bookingWhatsappMessage | Hola, quiero booking | 200 | |
| bookingDisclaimer | Al enviar aceptas ser contactado por email o WhatsApp con info de disponibilidad, cachet y rider técnico. | 300 | the habeas-data checkbox and policy link are platform-fixed, not editable |
| bookingSuccess | ¡Solicitud enviada! Ahora te llevamos a WhatsApp para continuar. | 200 | |
| footerText | "" → `${displayName} — Booking` | 80 | rendered as `© {year} footerText` |

---

### 5. `BOOKING_FIELD_CATALOGUE` (`booking-fields.ts`)

```ts
export type BookingFieldType = 'text'|'textarea'|'email'|'tel'|'date'|'time'|'integer'|'select'|'url'|'handle';
type Opt = { value: string; label: string };
export interface BookingFieldDef {
  key: string; type: BookingFieldType; group: 'contact'|'event'|'details';
  label: string; placeholder?: string; maxLength: number; min?: number; max?: number;
  options?: readonly Opt[]; autocomplete?: string;
  defaultEnabled: boolean; defaultRequired: boolean;
  locked?: 'enabledRequired'; contact?: 'name'|'email'|'phone';   // denormalization target
}
const o = (...v: [string, string][]) => v.map(([value, label]) => ({ value, label }));

export const BOOKING_FIELD_CATALOGUE = [
  { key:'fullName', type:'text', group:'contact', label:'Nombre completo', placeholder:'Tu nombre', maxLength:80, autocomplete:'name', defaultEnabled:true, defaultRequired:true, locked:'enabledRequired', contact:'name' },
  { key:'company',  type:'text', group:'contact', label:'Empresa / productora', maxLength:100, autocomplete:'organization', defaultEnabled:false, defaultRequired:false },
  { key:'email1', type:'email', group:'contact', label:'Email', placeholder:'tu@correo.com', maxLength:254, autocomplete:'email', defaultEnabled:true, defaultRequired:true, contact:'email' },
  { key:'email2', type:'email', group:'contact', label:'Email alterno', maxLength:254, defaultEnabled:false, defaultRequired:false },
  { key:'email3', type:'email', group:'contact', label:'Otro email', maxLength:254, defaultEnabled:false, defaultRequired:false },
  { key:'phone1', type:'tel', group:'contact', label:'Teléfono / WhatsApp', placeholder:'+57 300 000 0000', maxLength:20, autocomplete:'tel', defaultEnabled:false, defaultRequired:false, contact:'phone' },
  { key:'phone2', type:'tel', group:'contact', label:'Teléfono alterno', maxLength:20, defaultEnabled:false, defaultRequired:false },
  { key:'phone3', type:'tel', group:'contact', label:'Otro teléfono', maxLength:20, defaultEnabled:false, defaultRequired:false },
  { key:'address1', type:'text', group:'contact', label:'Dirección', maxLength:160, autocomplete:'street-address', defaultEnabled:false, defaultRequired:false },
  { key:'address2', type:'text', group:'contact', label:'Dirección alterna', maxLength:160, defaultEnabled:false, defaultRequired:false },
  { key:'contactPreference', type:'select', group:'contact', label:'¿Cómo prefieres que te contactemos?', maxLength:20, options:o(['whatsapp','WhatsApp'],['llamada','Llamada'],['email','Email']), defaultEnabled:false, defaultRequired:false },
  { key:'instagram', type:'handle', group:'contact', label:'Instagram (evento o productora)', placeholder:'@usuario', maxLength:31, defaultEnabled:false, defaultRequired:false },
  { key:'website', type:'url', group:'contact', label:'Sitio web', placeholder:'https://', maxLength:300, defaultEnabled:false, defaultRequired:false },
  { key:'eventName', type:'text', group:'event', label:'Nombre del evento', maxLength:100, defaultEnabled:false, defaultRequired:false },
  { key:'eventType', type:'select', group:'event', label:'Tipo de evento', maxLength:20, options:o(['club','Club / discoteca'],['festival','Festival'],['privado','Fiesta privada'],['corporativo','Corporativo'],['boda','Boda'],['bar','Bar / restaurante'],['cumpleanos','Cumpleaños'],['streaming','Streaming'],['otro','Otro']), defaultEnabled:false, defaultRequired:false },
  { key:'eventDate', type:'date', group:'event', label:'Fecha del evento', maxLength:10, min:0, max:730 /* days from todayBogota */, defaultEnabled:true, defaultRequired:false },
  { key:'eventTime', type:'time', group:'event', label:'Hora del set', maxLength:5, defaultEnabled:false, defaultRequired:false },
  { key:'setDuration', type:'select', group:'event', label:'Duración del set', maxLength:12, options:o(['1h','1 hora'],['1h30','1 h 30 min'],['2h','2 horas'],['3h','3 horas'],['4h+','4 horas o más'],['convenir','A convenir']), defaultEnabled:false, defaultRequired:false },
  { key:'city', type:'text', group:'event', label:'Ciudad', placeholder:'Ciudad, país', maxLength:100, autocomplete:'address-level2', defaultEnabled:true, defaultRequired:false },
  { key:'venue', type:'text', group:'event', label:'Lugar / venue', maxLength:100, defaultEnabled:false, defaultRequired:false },
  { key:'attendees', type:'integer', group:'event', label:'Asistentes esperados', maxLength:6, min:1, max:100000, defaultEnabled:false, defaultRequired:false },
  { key:'budget', type:'select', group:'event', label:'Presupuesto aproximado (COP)', maxLength:12, options:o(['lt1m','Menos de $1 M'],['1-3m','$1 M – $3 M'],['3-6m','$3 M – $6 M'],['6-10m','$6 M – $10 M'],['gt10m','Más de $10 M'],['convenir','Prefiero conversarlo']), defaultEnabled:false, defaultRequired:false },
  { key:'travelCovered', type:'select', group:'event', label:'¿Incluye transporte y hospedaje?', maxLength:12, options:o(['si','Sí'],['no','No'],['no_aplica','No aplica'],['convenir','A convenir']), defaultEnabled:false, defaultRequired:false },
  { key:'venueEquipment', type:'textarea', group:'details', label:'Equipo disponible en el venue', maxLength:1000, defaultEnabled:false, defaultRequired:false },
  { key:'referral', type:'select', group:'details', label:'¿Cómo nos conociste?', maxLength:16, options:o(['instagram','Instagram'],['tiktok','TikTok'],['recomendacion','Recomendación'],['evento','En un evento'],['google','Google'],['otro','Otro']), defaultEnabled:false, defaultRequired:false },
  { key:'message', type:'textarea', group:'details', label:'Detalles del evento', placeholder:'Tipo de evento, horario, duración del set, presupuesto, requisitos técnicos...', maxLength:2000, defaultEnabled:true, defaultRequired:false },
] as const satisfies readonly BookingFieldDef[];
```

Personal ID numbers (NIT/cédula) are deliberately left out of the catalogue, to collect less personal data.

**`validateBookingSubmission`: request body `{ fields: Record<string,string>, consent: true, hp: "", ft: <signed form token> }`**
- **Keys.** A key that is not enabled in the config → 400. A missing required key → 400.
- **Consent.** `consent` must be exactly `true`.
- **Anti-spam.** The honeypot `hp` must be empty. The form token `ft` must be between `minFillMs` and `maxFillMs` old.
- **Size.** `JSON.stringify(fields)` must be at most 16 KB.
- **Every value** goes through `cleanText`, then the maxLength check, then the rule for its type:

| type | rule |
|---|---|
| text | no newlines |
| textarea | `\r\n` → `\n`, at most 30 lines |
| email | lowercase; `^[^\s@]{1,64}@[^\s@]{1,189}\.[^\s@]{2,}$` |
| tel | `^\+?[0-9 ().-]{7,20}$` with 7–15 digits |
| date | `YYYY-MM-DD`, a real calendar date, from todayBogota to todayBogota + 730 |
| time | `^([01]\d\|2[0-3]):[0-5]\d$` |
| integer | `^\d{1,6}$`, within min/max |
| select | value must be one of the options |
| url | `URL` parse, https only; no IP host, localhost, port or userinfo |
| handle | `^@?[A-Za-z0-9._]{1,30}$`, normalized to `@x` |

**`validateFormConfig`** (runs when the DJ saves):
- Every key must be in the catalogue, with no duplicates.
- `required` is only allowed when `enabled` is true.
- `fullName` is forced to enabled and required.
- At least one of `email1` / `phone1` must be enabled and required.
- label ≤ 60 and placeholder ≤ 80, single line.
- `sortOrder` is rewritten to 0..n-1.

On profile creation, insert one row per catalogue field with the default values. When the catalogue grows, the read path merges the catalogue with the stored rows, so new fields appear as disabled.

The WhatsApp summary is built on the client after a 201 response: `bookingTitle` followed by lines of the form `label: value` for the non-empty values.

---

### 6. `SOCIAL_PLATFORMS` (`social-platforms.ts`)

**URL rules:**
- https only (http is upgraded).
- The host is lowercased and must be in the platform's allow-list. No port and no userinfo are allowed.
- Tracking parameters are stripped: `utm_*, si, igsh, igshid, fbclid, gclid, ref, ref_src, feature, share`, plus `p, c` for SoundCloud.
- Links render with `rel="noopener noreferrer nofollow ugc"`.
- Icons are local SVGs bundled in the web app (simple-icons). There is no icon CDN.

```ts
export const SOCIAL_PLATFORMS = {
  INSTAGRAM:        { label:'Instagram',        hosts:['instagram.com','www.instagram.com'] },
  SOUNDCLOUD:       { label:'SoundCloud',       hosts:['soundcloud.com','www.soundcloud.com','m.soundcloud.com','on.soundcloud.com'], extraStrip:['p','c'] },
  SPOTIFY:          { label:'Spotify',          hosts:['open.spotify.com','spotify.link'] },
  TIKTOK:           { label:'TikTok',           hosts:['tiktok.com','www.tiktok.com','vm.tiktok.com'] },
  YOUTUBE:          { label:'YouTube',          hosts:['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be'] },
  FACEBOOK:         { label:'Facebook',         hosts:['facebook.com','www.facebook.com','m.facebook.com','fb.me','fb.com'] },
  BEATPORT:         { label:'Beatport',         hosts:['beatport.com','www.beatport.com'] },
  MIXCLOUD:         { label:'Mixcloud',         hosts:['mixcloud.com','www.mixcloud.com','m.mixcloud.com'] },
  RESIDENT_ADVISOR: { label:'Resident Advisor', hosts:['ra.co','www.ra.co','residentadvisor.net','www.residentadvisor.net'] },
  X:                { label:'X',                hosts:['x.com','www.x.com','twitter.com','www.twitter.com'] },
  WHATSAPP:         { label:'WhatsApp',         hosts:['wa.me'], pathPattern:/^\/\d{8,15}$/ },
  APPLE_MUSIC:      { label:'Apple Music',      hosts:['music.apple.com'] },
  BANDCAMP:         { label:'Bandcamp',         hosts:['bandcamp.com'], hostSuffix:'.bandcamp.com' },
  TWITCH:           { label:'Twitch',           hosts:['twitch.tv','www.twitch.tv'] },
  THREADS:          { label:'Threads',          hosts:['threads.net','www.threads.net','threads.com','www.threads.com'] },
  LINKTREE:         { label:'Linktree',         hosts:['linktr.ee'] },
  WEBSITE:          { label:'Sitio web',        hosts:'*' },   // any public https FQDN; no IP literals
} as const;
```

---

### 7. `PALETTES` (`palettes.ts`)

The template hard-codes colours such as `rgba(249,115,22,…)`, `rgba(236,72,153,…)`, `rgba(15,23,42,…)`, `rgba(148,163,184,…)` and `rgba(248,250,252,…)`. The web port must replace each with `rgb(var(--accent-rgb) / .25)`, `--accent-2-rgb`, `--surface-rgb`, `--line-rgb` and `--text-rgb`. The `.btn-primary` text uses `--on-accent`.

```ts
export const PALETTES = {
  SUNSET:  { name:'Sunset (naranja/rosa)',   bg:'#020617', bgSoft:'#0b1120', card:'rgba(15,23,42,.98)', muted:'#9ca3af', text:'#f9fafb', accent:'#f97316', accent2:'#ec4899', border:'rgba(148,163,184,.55)', accentRgb:'249 115 22', accent2Rgb:'236 72 153', surfaceRgb:'15 23 42', lineRgb:'148 163 184', textRgb:'248 250 252', onAccent:'#ffffff', themeColor:'#0f172a' }, // DEFAULT = current page
  MIAMI:   { name:'Miami (rosa/violeta)',    bg:'#0b0614', bgSoft:'#140b24', card:'rgba(26,16,46,.98)', muted:'#a8a3c2', text:'#faf5ff', accent:'#ec4899', accent2:'#8b5cf6', border:'rgba(167,139,250,.45)', accentRgb:'236 72 153', accent2Rgb:'139 92 246', surfaceRgb:'26 16 46', lineRgb:'167 139 250', textRgb:'250 245 255', onAccent:'#ffffff', themeColor:'#140b24' },
  NEON:    { name:'Neón (cian/violeta)',     bg:'#020617', bgSoft:'#0b1120', card:'rgba(15,23,42,.98)', muted:'#9ca3af', text:'#f9fafb', accent:'#22d3ee', accent2:'#a855f7', border:'rgba(148,163,184,.55)', accentRgb:'34 211 238', accent2Rgb:'168 85 247', surfaceRgb:'15 23 42', lineRgb:'148 163 184', textRgb:'248 250 252', onAccent:'#020617', themeColor:'#0f172a' },
  ACID:    { name:'Acid (lima/esmeralda)',   bg:'#09090b', bgSoft:'#111113', card:'rgba(24,24,27,.98)', muted:'#a1a1aa', text:'#fafafa', accent:'#a3e635', accent2:'#10b981', border:'rgba(161,161,170,.5)', accentRgb:'163 230 53', accent2Rgb:'16 185 129', surfaceRgb:'24 24 27', lineRgb:'161 161 170', textRgb:'250 250 250', onAccent:'#09090b', themeColor:'#111113' },
  INFERNO: { name:'Inferno (rojo/ámbar)',    bg:'#0a0a0a', bgSoft:'#141414', card:'rgba(23,23,23,.98)', muted:'#a3a3a3', text:'#fafafa', accent:'#ef4444', accent2:'#f59e0b', border:'rgba(163,163,163,.5)', accentRgb:'239 68 68', accent2Rgb:'245 158 11', surfaceRgb:'23 23 23', lineRgb:'163 163 163', textRgb:'250 250 250', onAccent:'#0a0a0a', themeColor:'#141414' },
  OCEAN:   { name:'Deep Ocean (azul/turquesa)', bg:'#020617', bgSoft:'#0a1628', card:'rgba(15,23,42,.98)', muted:'#94a3b8', text:'#f8fafc', accent:'#3b82f6', accent2:'#14b8a6', border:'rgba(148,163,184,.55)', accentRgb:'59 130 246', accent2Rgb:'20 184 166', surfaceRgb:'15 23 42', lineRgb:'148 163 184', textRgb:'248 250 252', onAccent:'#020617', themeColor:'#0a1628' },
  GOLD:    { name:'Oro (ámbar/dorado)',      bg:'#0c0a09', bgSoft:'#1c1917', card:'rgba(28,25,23,.98)', muted:'#a8a29e', text:'#fafaf9', accent:'#f59e0b', accent2:'#eab308', border:'rgba(168,162,158,.5)', accentRgb:'245 158 11', accent2Rgb:'234 179 8', surfaceRgb:'28 25 23', lineRgb:'168 162 158', textRgb:'250 250 249', onAccent:'#0c0a09', themeColor:'#1c1917' },
  MONO:    { name:'Mono (blanco/gris)',      bg:'#000000', bgSoft:'#0a0a0a', card:'rgba(23,23,23,.98)', muted:'#a3a3a3', text:'#fafafa', accent:'#fafafa', accent2:'#a3a3a3', border:'rgba(163,163,163,.45)', accentRgb:'250 250 250', accent2Rgb:'163 163 163', surfaceRgb:'23 23 23', lineRgb:'163 163 163', textRgb:'250 250 250', onAccent:'#0a0a0a', themeColor:'#0a0a0a' },
} as const;
```

**Accessibility:** the default SUNSET keeps white text on the orange gradient to match the current page. That contrast is about 2.8:1, below the WCAG AA level of 4.5:1. The other palettes' `onAccent` values were chosen to maximize the lowest contrast across their gradient.

---

### 8. Slugs and usernames (`slug.ts`, `username.ts`)

**Slug rules:**
- Pattern: `SLUG_RE = /^(?!\d+$)(?!.*--)[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/`. That means 3–40 characters, lowercase ASCII and hyphens, starting and ending alphanumeric, no `--`, not all digits.
- Must not be in `RESERVED_SLUGS`.
- Must not start with `admin`, `api`, `fersua`, `www`, `static` or `media` followed by a hyphen or end of string.
- Must not equal another profile's slug or any `SlugRedirect.fromSlug`.
- The DJ can change the slug freely until approval. After that, once every 30 days. The old slug goes into `SlugRedirect`, which keeps at most 5 per profile.
- `suggestSlug(name)`: NFKD, strip accents, lowercase, `&` → `y`, other characters → `-`, collapse repeats, cut to 40.
- **Routing:** any path with uppercase letters or a `.html` ending gets a 301 to the lowercase path without `.html`, then is resolved against the slug or `SlugRedirect`.
- **Test:** every top-level route of the web router must appear in `RESERVED_SLUGS`.

```ts
export const RESERVED_SLUGS = new Set([
  // app routes / auth
  'admin','administrador','api','app','auth','login','logout','signin','signup','register','registro','ingresar','entrar','salir',
  'cuenta','account','panel','dashboard','perfil','profile','settings','ajustes','config','password','contrasena','recuperar',
  'reset','forgot','verify','verificar','me','new','nuevo','edit','editar','delete','preview',
  // assets / infra
  'static','assets','media','uploads','img','images','imagenes','css','js','fonts','favicon','robots','sitemap','manifest',
  'health','healthz','status','metrics','well-known','cdn','ws','socket','graphql','oauth','sso','callback','webhook','webhooks',
  // hostnames / mail
  'www','mail','email','smtp','imap','pop','ftp','beta','dev','test','staging','demo','root','localhost',
  'postmaster','hostmaster','webmaster','abuse','noreply','no-reply','security','seguridad',
  // content / legal
  'about','acerca','nosotros','contact','contacto','help','ayuda','support','soporte','faq','terms','terminos','condiciones',
  'privacy','privacidad','legal','habeas-data','politica-de-datos','tratamiento-de-datos','cookies','blog','news','noticias',
  'search','buscar','explore','explorar','home','inicio','index','booking','bookings','reservas','djs','dj','artistas','artists',
  'eventos','events','fechas','generos','genres','users','user','usuario','usuarios','system','sistema','moderator','moderador',
  'billing','pagos','checkout','null','undefined',
  // brand + legacy/other projects on the domain
  'fersua','fersuastudio','fersua-studio','fersuaestudio','studio','oficial','official',
  'allset','pedido','diannmakinne','molly','default','corporaciondestellos',
]);
```

**Username rules:**
- Pattern: `USERNAME_RE = /^(?=.{3,24}$)[a-z0-9](?:[a-z0-9]|[._](?=[a-z0-9]))*$/`. Input is lowercased first.
- `RESERVED_USERNAMES` = admin, administrator, administrador, root, system, sistema, soporte, support, moderator, fersua, fersuastudio, noreply, api, null, undefined.
- Only the admin bootstrap from `ADMIN_USERNAME` bypasses this list.
- The password must be 10 chars minimum and 72 bytes maximum (the bcrypt limit), and must not equal the username.

---

### 9. Seed

**Script order in `api/prisma/seed.ts`** (idempotent):
1. Upsert the genre list.
2. Bootstrap the admin from env. Create it only if no admin exists; never overwrite the password unless `ADMIN_FORCE_RESET=true`.
3. If `SEED_MACFLY=true`, import Mac Fly. Skip if the slug already exists.

**Genre seed list** (slug:name): house:House, deep-house:Deep House, tech-house:Tech House, techno:Techno, melodic-techno:Melodic Techno, hard-techno:Hard Techno, minimal-deep-tech:Minimal Deep Tech, minimal:Minimal, progressive-house:Progressive House, afro-house:Afro House, organic-house:Organic House, jackin-funky:Jackin & Funky, nu-disco:Disco / Nu Disco, indie-dance:Indie Dance, bass-house:Bass House, uk-garage:UK Garage, drum-and-bass:Drum & Bass, trance:Trance, psytrance:Psytrance, electro:Electro, latin-house:Latin House, guaracha:Guaracha, reggaeton:Reggaetón, crossover:Crossover, open-format:Open Format, hip-hop:Hip Hop, electronica:Electrónica.

**Seed media is prepared once, locally.** `scripts/prepare-seed-media.mjs` reads the files from `public_html`. It rotates, resizes to a 2560 px long side, saves JPEG at quality 85 and strips all metadata; photo-1 has Apple EXIF that may contain GPS. The output goes to `api/prisma/seed-assets/macflymikebran/*.jpg`, roughly 6–8 MB committed. The seed passes those files through the same `MediaService.ingest()` used for uploads.

**Mac Fly & Mike Bran: fields that change from the source**

| Area | Seed value | Source / reason |
|---|---|---|
| User | `username: 'macflymikebran'`, `email: null`, random password (discarded), `mustChangePassword: true` | You assign or reset credentials later from the admin panel. |
| slug | `macflymikebran` (recommended) | Legacy `/MacflyMikebran` only needs the lowercase 301. If you choose another slug, add `SlugRedirect{fromSlug:'macflymikebran'}`. |
| tagline | "Dúo de DJs de Medellín · House, Tech House & Minimal Deep Tech" | New text for the index card; needs your OK. |
| publicEmail | `null` | Pending your confirmation (question 3). |
| publicPhone | `'+573505209860'` | Replaces `REEMPLAZAR_TELEFONO` in the JSON-LD. |
| Profile SoundCloud link | `https://soundcloud.com/macfly-mike-bran` | Inferred from the track URL; needs confirmation. |
| Member SoundCloud links | Both members get the same track URL, `https://soundcloud.com/macfly-mike-bran/grood-taste-dj-contest-district-2025` | The long `?ref=…&si=…&utm_…` tracking query is stripped. |
| Legacy flyer pages | Host or web nginx: `/Eventos/MacflyMikeBran/*` → 301 `/macflymikebran#fechas` | |
| JSON-LD | `url` becomes the canonical `https://fersuastudio.com/macflymikebran` | Replaces the wrong `manafersua.net`. `genre` is built from the genres, `member` from the members, and `image` is the absolute og URL. |

**All other seed values:**

```ts
export const MACFLY_SEED = {
  user: { username: 'macflymikebran', email: null, mustChangePassword: true },
  profile: {
    slug: 'macflymikebran', displayName: 'Mike Bran & Macfly',
    tagline: 'Dúo de DJs de Medellín · House, Tech House & Minimal Deep Tech',
    seoDescription: 'Booking oficial de Mike Bran & Macfly — DJs. Shows, fechas y contacto.',   // meta description
    shareDescription: 'Contrataciones, próximas fechas y press kit.',                         // og:description
    city: 'Medellín', countryCode: 'CO', whatsappNumber: '573505209860',
    publicEmail: null, publicPhone: '+573505209860',
    palette: 'SUNSET', status: 'APPROVED', featured: true, sortOrder: 0,
    showGallery: true, showRider: true, showEvents: true, showOpenDateRow: true, formEnabled: true, formOpenWhatsapp: true,
    heroImage: 'img/header.JPEG' /* 4.1 MB Nikon */, cardImage: 'img/header.JPEG' /* CARD 4:5 crop */,
    ogImage: 'img/IMG_7641.PNG' /* 2532x1170, was relative og:image */,
  },
  texts: {
    navTag:'Booking', navArtists:'Artistas', navEvents:'Fechas', navBooking:'Solicitud',
    heroLabel:'DJs', heroTitle:'Electronic club show',
    heroSubtitle:'Mike Bran & Macfly son un dúo de DJs originarios de Medellín, dedicados a llevar energía y buen ritmo a cualquier tipo de escenario. Con una gran versatilidad horaria, ofrecen sets inmersivos cargados de groove y atmósferas electrónicas que conectan con el público desde el primer beat.',
    heroNote:'',   // source had it commented: "Respuesta rápida con info de cachet, disponibilidad, rider técnico y press kit."
    heroPrimaryCta:'WhatsApp Booking', heroWhatsappMessage:'Hola quiero cotizar booking', heroSecondaryCta:'Enviar solicitud',
    heroPhotoAlt:'Show de Mike Bran & Macfly', heroCaptionLeft:'Live club show', heroCaptionRight:'2024 / 2025',
    riderCardLabel:'Live Setup', riderCardTitle:'Specs', riderButton:'Rider Técnico' /* source typo "Tecnico" */, riderTitle:'',
    galleryCardLabel:'Media', galleryCardTitle:'Highlights', galleryButton:'Photos', galleryTitle:'Galería',
    artistsTitle:'Artistas', artistsSubtitle:'Bookea a cada DJ por separado o el show completo.',
    eventsTitle:'Fechas', eventsSubtitle:'Agenda actual y espacios abiertos para nuevas reservas.',
    eventsNote:'Para otras fechas o giras, envía tu idea de evento y coordinamos agenda completa.',
    eventCtaLabel:'Book', eventWhatsappMessage:'Quiero estar en el evento de {evento} ({fecha})',
    openDateLabel:'Disponible', openDateText:'Abrir nueva fecha', openDateCta:'Reservar', openDateWhatsappMessage:'',
    bookingTitle:'Solicitud de booking',
    bookingSubtitle:'Completa los datos básicos y te responderemos con la propuesta y condiciones.',
    bookingSubmit:'Enviar solicitud', bookingWhatsappButton:'Hablar por WhatsApp', bookingWhatsappMessage:'Hola quiero booking',
    bookingDisclaimer:'Al enviar aceptas ser contactado por email o WhatsApp con info de disponibilidad, cachet y rider técnico.',
    footerText:'Mike Bran & Macfly — Booking',
  },
  genres: ['house', 'tech-house', 'minimal-deep-tech', 'jackin-funky'],          // chip order as in source
  rider: ['DJM V10', 'ALLEN HEATH XONE 92/96', 'DJM 900NXS2', 'CDJ 3000', 'CDJ 2000 NEXUS 2', 'XDJ XZ/RX3', 'RMX 1000'],
  members: [
    { name:'Mike Bran', role:'House / Tech / Jackin · DJ',
      description:'Un sonido cargado de groove y energía, con atmósferas alegres y melodías emotivas que iluminan cualquier dancefloor.',
      photo:'img/Mikebran.jpg' /* 1.9 MB Nikon EXIF */,
      links:[ { platform:'INSTAGRAM', url:'https://www.instagram.com/mikebran_/' },
              { platform:'SOUNDCLOUD', url:'https://soundcloud.com/macfly-mike-bran/grood-taste-dj-contest-district-2025' } ] },
    { name:'Macfly', role:'Tech House / Minimal deep Tech / House · DJ',
      description:'Energía marcada por bajos firmes, capas sintéticas con atmósferas que generan tensión y movimiento.',
      photo:'img/Macfly.jpg' /* 853x1280, 65 KB – low res */,
      links:[ { platform:'INSTAGRAM', url:'https://www.instagram.com/macfly_ofc/' },
              { platform:'SOUNDCLOUD', url:'https://soundcloud.com/macfly-mike-bran/grood-taste-dj-contest-district-2025' } ] },
  ],
  profileLinks: [ { platform:'SOUNDCLOUD', url:'https://soundcloud.com/macfly-mike-bran' } ],   // inferred, confirm
  gallery: [1,2,3,4,5,6,7,8].map(n => ({ file:`img/photo-${n}.jpg`, alt:`Mike Bran & Macfly — foto ${n}` })),
  // sizes: p1 619 KB (Apple EXIF, maybe GPS), p2 118 KB, p3 28.3 MB, p4 23.4 MB, p5 10.0 MB, p6 17.2 MB, p7 16.5 MB, p8 13.2 MB
  form: [ // everything else disabled, catalogue order after these
    { key:'fullName',  enabled:true, required:true,  label:'Nombre y empresa / productora', placeholder:'Tu nombre' },
    { key:'email1',    enabled:true, required:true,  label:'Email', placeholder:'tu@correo.com' },
    { key:'eventDate', enabled:true, required:false, label:'Fecha del evento' },
    { key:'city',      enabled:true, required:false, label:'Ciudad / Lugar evento', placeholder:'Ciudad, país • Lugar evento' },
    { key:'message',   enabled:true, required:false, label:'Detalles del evento', placeholder:'Tipo de evento, horario, duración del set, presupuesto, requisitos técnicos...' },
  ],
};
```

**Events** (`ctaType: WHATSAPP`, `city: null`). All 9 dates are in the past relative to 2026-09-28, so they are archived automatically: they show only in the panel archive, not on the public page.

The HTML has no year. The default below follows the flyer filenames `…24012025` / `…25012025` and the caption "2024 / 2025". The evidence for 2025-11 → 2026-01 instead is the "district-2025" SoundCloud track and the Sunday dates right before the Colombian Monday holidays of 3 and 17 Nov 2025.

| date (default) | place | flyer (Eventos/MacflyMikeBran/IMG/) | source bug fixed |
|---|---|---|---|
| 2024-11-14 | Ramasound Garden | 14 Nov.jpg (899x1599) | — |
| 2024-11-16 | Paramount Records x Nakai Rooftop | 16 Nov.jpg | — |
| 2024-11-27 | Viuz | — | literal `{nombre del evento}` |
| 2024-11-29 | Grooveland x La terraza.deepink | — | literal `{nombre del evento}` |
| 2024-11-30 | Sonorama | 30 Nov.jpg (720x1280) | — |
| 2024-12-19 | Viuz | Viuz 19.jpg | — |
| 2024-12-26 | Baren | Baren 26 DIC.png (3240x4050 RGBA, 6.3 MB) | — |
| 2025-01-24 | Viuz | Viuz24012025.jpg | — |
| 2025-01-25 | Sonorama | Sonorama25012025.jpg | — |

**Not seeded:**
- The 3 events that are commented out in the HTML: 02 NOV Sonorama, 07 NOV Baren, 08 NOV Mijito Club (flyers 2/7/8 Nov.jpg).
- Flyers with no date: Juarez.jpg, Mak negron.jpg, Ramon Bedoya.jpg. `Plantilla.html` is just a template page.
- Unused images: header.jpg, MikeBran1.jpg, Mcfly1*.png, bg.jpg, all HEIC files, Diann*/makinne*. Anything from Allset, Diann & Makinne or Molly.

"Disponible / Abrir nueva fecha / Reservar" is not an event row; it is `showOpenDateRow` plus the `openDate*` text slots.

---

### 10. Questions for you

1. Should the Mac Fly slug stay `macflymikebran` (recommended) or change to something like `mikebran-macfly`, with a redirect from the old one?
2. Were the event years 2024–25 or 2025–26? Should the past dates be seeded as an archive or skipped? Either way, they need current 2026 dates before launch, or the "Fechas" section will only show "Disponible".
3. Should `fernando.pala.99@gmail.com` be published as the public booking email? It is currently exposed in the page's JSON-LD.
4. `Macfly.jpg` is low-resolution. Should the member photo come from `Mcfly1.png` instead? Should `MikeBran1.jpg` replace `Mikebran.jpg`?
5. Should the hero caption "2024 / 2025" be updated?
6. Are the budget ranges in COP, the catalogue fields, and a genre list that only the admin manages all acceptable?
7. Is keeping booking requests and audit logs for 24 months acceptable under Ley 1581?
8. The pages that are not migrated (`/DiannMakinne`, `/Molly`, `/Allset`, `/pedido`) will 404 once the apex domain moves to the VPS. Should they move to a Hostinger subdomain, or return 410?

### Critical Files for Implementation
- C:\Fernando\Desarrollo\hostinger\fersua-djs\api\prisma\schema.prisma (new)
- C:\Fernando\Desarrollo\hostinger\fersua-djs\packages\shared\src\ (new: limits.ts, text-slots.ts, booking-fields.ts, palettes.ts, slug.ts, social-platforms.ts)
- C:\Fernando\Desarrollo\hostinger\fersua-djs\api\prisma\seed.ts plus seed-data\macflymikebran.ts (new)
- C:\Fernando\Desarrollo\hostinger\fersua-djs\scripts\prepare-seed-media.mjs (new)
- C:\Fernando\Desarrollo\hostinger\public_html\MacflyMikebran.html (visual template and seed source; flyers in C:\Fernando\Desarrollo\hostinger\public_html\Eventos\MacflyMikeBran\IMG, photos in C:\Fernando\Desarrollo\hostinger\public_html\img)
- Reference conventions: C:\Fernando\Desarrollo\Personal\FersuaStore\HabitFer\api\prisma\schema.prisma, C:\Fernando\Desarrollo\Personal\FersuaStore\HabitFer\docker-compose.prod.yml