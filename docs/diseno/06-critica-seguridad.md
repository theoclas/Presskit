# Adversarial security review: Fersua DJs designs (data model, backend, frontend, infra)

Severity levels are HIGH, MEDIUM and LOW. Each "Fix" is text ready to paste into the plan. I checked the reference code before writing this:
- HabitFer's `OriginGuard` checks the Origin header on every non-GET request, including public ones, and rejects a missing Origin in production. That is fine to reuse.
- The Dashboard's `07-seguridad-infra.md` confirms the earlier incident: Docker bypassed ufw, and MySQL was published with root/root credentials committed to the repo.

## A. Conflicts between the four designs that turn into vulnerabilities (lock these first)

| # | Conflict | Decision to lock |
|---|---|---|
| A1 | Backend uses cookie `__Secure-rt` with Path=/api/auth. Infra uses `COOKIE_NAME_PREFIX=__Host-`. Browsers reject a `__Host-` cookie whose Path is not `/`, so an implementer will "fix" it by dropping the prefix. | `__Host-rt`, Path=/, no Domain attribute (see H8). |
| A2 | Backend uses argon2id with passwords up to 128 characters. The data model and infra use bcrypt 12 with a 72-byte limit. bcrypt silently truncates at 72 bytes. | argon2id. Delete `BCRYPT_ROUNDS`. Passwords 10–128 characters, NFKC-normalized. |
| A3 | Data model stores IPs as an HMAC. Backend stores a raw `ip VarChar(45)` in RefreshToken, BookingRequest and AuditLog. | Store `HMAC-SHA256(IP_HASH_SECRET, ip)` everywhere in the DB (IPv6 hashed per /64). |
| A4 | Backend's web nginx uses `real_ip_header X-Forwarded-For` (recursive) with `trust proxy 1`. Infra uses `X-Real-IP` with `loopback,uniquelocal`. | Infra's approach, tightened as in M2. |
| A5 | Backend runs migrations in the api entrypoint with the full-privilege DB user. Infra uses a separate `migrate` service with a migrator user. | Infra's approach. The runtime DB user can only read and write rows. |
| A6 | Backend fetches the SEO template at runtime from `web:8081`. Infra bakes `api/shell/index.html` into the api image. | Infra's approach: no internal fetch and no extra listener. |
| A7 | The booking POST has three paths: `/public/djs/:slug/booking-requests` (backend), `/public/djs/:slug/bookings` (frontend), and the edge regex `^/api/public/[a-z0-9-]+/booking-requests$`, which matches neither. The strict `forms` rate limit therefore never applies. The form token is GET in one design and POST in another, and the owner routes are `me/dj` in one and `me/profile` in another. | One route table in `packages/shared/src/routes.ts`. A CI test asserts that the edge regexes match it. |
| A8 | Upload size limits disagree: api 15 MB, infra env 10 MB, edge 11m, host 12m, data model 16m. | api 15 MB; edge and host `client_max_body_size 16m`. |
| A9 | There are three different rate-limit tables. | A single `LIMITS.rate` in shared. Edge `limit_req` is only a coarse flood guard, set to at least 3x the app limits. |
| A10 | Media path is `/media` in one design and `/uploads` in another. Infra has `PUBLIC_URL` where the backend has `PUBLIC_BASE_URL`. Infra adds an unused `JWT_REFRESH_SECRET` (the refresh token is opaque). Infra's compose file is missing `BOOKING_FORM_SECRET`, `IP_HASH_SECRET` and `MFA_ENC_KEY`. Collation is `unicode_ci` in one design and `0900_ai_ci` in another. | `/media`, `PUBLIC_BASE_URL`, drop `JWT_REFRESH_SECRET`, add the missing secrets to compose, `.env.prod.example` and joi. Collation `utf8mb4_0900_ai_ci`, with `utf8mb4_bin` for opaque keys (M18). |
| A11 | The preview iframe needs `frame-ancestors 'self'`. Infra sends `X-Frame-Options DENY` and `'none'` on every response, and helmet adds a second CSP. | See L2. |
| A12 | Frontend lets DJs add 3 free-text genre tags. The data model allows only the admin-managed genre list. | Admin-managed list only. |

## B. Findings

### HIGH

**H1: Prisma ignores `undefined` in `where`, which bypasses the per-profile scope.**
- Attack: `findFirst({ where: { id, profileId: undefined } })` matches a row from any profile.
- It happens whenever `targetProfileId` is unset: a new route that misses the guard, a user with no profile, or the `admin/booking-requests` mount, which has no `:profileId`.
- Fix:
  - Enable `previewFeatures = ["strictUndefinedChecks"]` in `schema.prisma` so `undefined` throws.
  - `@TargetProfileId()` returns a branded `ScopedProfileId` type and throws if the value is not a non-empty string. Services accept only that type.
  - E2E test: a user with no profile gets 404 `NO_PROFILE` on every `/me/**` route and never receives data.

**H2: Mass assignment through nested payloads allows writes into other profiles.**
- `whitelist` and `forbidNonWhitelisted` do not check nested objects unless the property has `@ValidateNested({each:true})` plus `@Type(() => Dto)`.
- Affected payloads: `PUT rider {items}`, `PUT socials {links}`, `PUT members/:id/socials`, `PUT booking-form {fields}`, `texts`, and the booking `fields`.
- Attack: with `createMany({data: links.map(l => ({profileId, ...l}))})`, a `profileId`, `memberId` or `id` placed inside an array item overrides the scope.
- Fix:
  - Every array or object DTO gets `@ValidateNested`, `@Type` and `@ArrayMaxSize`.
  - Services copy fields explicitly. Never spread a DTO into Prisma `data` or `where`; add this to the review checklist and an ESLint rule.
  - For `texts` and booking `fields`, iterate over the catalogue keys with `Object.hasOwn`, build the output on `Object.create(null)`, and reject any other key, including `__proto__` and `constructor`.
  - E2E: `{items:[{text:'x',profileId:'<B>'}]}` must return 400.

**H3: Open registration can fill the shared VPS disk.**
- Attack: many accounts × a per-profile quota of 80–200 MB × DRAFT accounts that never get reviewed. The disk has 30 GB free and is shared with MySQL, HabitFer and the Dashboard. A full disk takes down every stack.
- Fix:
  - No uploads until the email is verified.
  - Quota of 25 MB / 20 assets for DRAFT, PENDING and REJECTED profiles; 150 MB for APPROVED.
  - A global media budget of about 8 GB, plus an `fs.statfs` check that refuses uploads when free disk is under 5 GB (503 `STORAGE_FULL` and an email to the admin).
  - Purge DRAFT profiles idle for 30 days (warn at day 21), REJECTED profiles after 30 days, and unverified users after 14 days whether or not they have a profile.
  - Owner edits capped at 60 mutations per 10 minutes per user; audit metadata capped at 2 KB.
  - Disk-usage alert in `status.sh` and monitoring.

**H4: Media of unapproved profiles is public, cached as immutable, and served from the owner's domain.**
- Attack: anyone can register, upload illegal or phishing images to a DRAFT profile, and share the `/media/...` URL. The files get a one-year immutable cache header on fersuastudio.com.
- Fix:
  - Split the volume into `private/` and `public/`. Uploads go to `private/<profileId>/`.
  - On approval, the service moves the profile folder to `public/` with `rename` (same volume, so it is atomic). On suspension or rejection it moves back; on deletion it is removed.
  - The edge mounts only the public part, read-only, using compose long-syntax `volume: {subpath: public}`.
  - Owner and admin previews load images through `GET /api/media/preview/:assetId/:variant?exp&sig`, an HMAC-signed URL valid for 1 hour and sent with `Cache-Control: private, no-store`. The frontend uses the `src` the API returns and never builds paths itself.
  - Add a "Reportar perfil" link in the public footer.

**H5: Once a profile is approved, edits to fields that route contacts or money go live instantly.**
- Attack: someone who takes over an account, or a dishonest DJ, swaps `whatsappNumber`, an event `ctaUrl`, the WEBSITE or LINKTREE URLs, `publicEmail`, or the form labels. Bookings and deposits go to a scammer under the Fersua brand, or a third party's WhatsApp number is flooded.
- Fix: define a SENSITIVE field set: whatsappNumber, publicEmail, publicPhone, `ctaUrl`, WEBSITE/LINKTREE links, form labels and placeholders, slug and displayName. For these:
  - Changes require the current password (step-up, valid 5 minutes).
  - The account email is notified, with a "no fui yo" link that freezes the profile.
  - The change is highlighted in the admin feed with a one-click revert.
  - whatsappNumber, publicEmail and a changed `ctaUrl` host stay `PENDING_CHANGE` for 24 hours or until the admin approves (owner question 1).
  - Texts, dates and photos stay live immediately.

**H6: Account lockout is a targeted DoS, and it can lock out the only admin.**
- Attack: 5 failures from any source lock the account for up to 4 hours. Usernames are guessable: the seed username `macflymikebran` equals the public slug.
- Fix:
  - Count failures per (userId, ipHash /64) and per userId. After 5, lock only that user/source pair.
  - Add a per-user soft cap of 30 failures per hour. A browser holding a valid known-device cookie `__Host-kd` still gets through (`__Host-kd` = HMAC(userId, random), valid 90 days, set on successful login; the OWASP device-cookie pattern).
  - Never hard-lock the ADMIN account; it relies on TOTP plus per-IP limits.
  - Add CLI `admin.js unlock <username>`.
  - Seed username must not equal the slug (e.g. `mbm-<random>`). The UI warns DJs when their username equals their slug.

**H7: The single admin is a single point of total compromise.**
- Attack: admin recovery by email means that taking over the owner's Gmail gives the attacker all personal data and every DJ account.
- Fix, in phase 1 rather than phase 2:
  - Mandatory TOTP for the admin (secret encrypted with AES-GCM using `MFA_ENC_KEY`, plus 10 hashed recovery codes).
  - `forgot-password` for role ADMIN returns the usual 202 but sends nothing. Admin recovery is only through the VPS CLI.
  - Step-up (password plus TOTP within 5 minutes) for: deleting a user or profile, resetting another user's password, transferring ownership, and bulk actions.
  - Email the owner on every admin login from a new ipHash or user agent.

**H8: Sibling subdomains can plant a refresh cookie ("cookie tossing").**
- `dashboard.` and `corporaciondestellos.` (a client's site) are same-site with the apex, so SameSite gives no protection.
- Attack: an XSS on either subdomain sets `__Secure-rt; Domain=fersuastudio.com; Path=/api/auth`. That enables login CSRF (the victim ends up editing the attacker's DJ account) or forced logouts.
- Fix:
  - Use `__Host-rt` (Secure, Path=/, no Domain). Sibling subdomains cannot set it.
  - Because Path=/ sends the cookie everywhere, the edge sets `proxy_set_header Cookie ""` on the shell/page locations and on `/api/public/`.
  - Keep the `X-Requested-With` header and the Origin check on refresh and logout.
  - pino redacts the cookie header.

### MEDIUM

**M1: Parallel login attempts race the lockout counter.**
- Attack: `failedLoginCount++` is read-modify-write, and the lock is checked before the password is verified. N parallel requests are all verified before the counter moves.
- Fix:
  - An in-process mutex allowing one verification in flight per userId. Other attempts run the dummy hash and get the generic 401.
  - Increment atomically (`{increment:1}`) and decide the lock from the returned value.
  - An argon2 semaphore: at most 4 hashes at once, a queue of 20, then 503. Each hash uses 19 MiB, inside a 512 MB container.

**M2: Getting the real client IP right, and throttling fairly.**

Risks:
- If any location forgets `proxy-api.conf`, `req.ip` becomes the edge's IP and every visitor shares one bucket ("5 registrations per hour for the whole internet").
- If AAAA points at the VPS, per-address limits on IPv6 are trivial to bypass.
- Colombian mobile carriers use CGNAT, so a whole venue shares one IPv4 address. Per-IP limits (login, booking, edge `pages 5r/s`) would block real users.

Fix:
- Pin the compose subnets: `edge` 172.30.90.0/24, `backend` 172.30.91.0/24.
- Edge: `set_real_ip_from 172.30.90.1; set_real_ip_from 127.0.0.1; real_ip_header X-Real-IP`. Host nginx keeps overwriting X-Forwarded-For.
- api: `trust proxy` = the edge subnet only.
- A custom `getTracker`: IPv6 addresses are keyed by /64. In production, a private or loopback `req.ip` logs `real-ip-missing` and uses its own bucket.
- Combine generous per-IP limits with per-target limits (per username, per slug). Escalate to Turnstile instead of a hard 429.
- A CI job starts edge plus api and asserts that `req.ip` equals the X-Real-IP sent (echo route available only in the test environment).
- Document: if Cloudflare is ever put in front, switch to `CF-Connecting-IP` and the Cloudflare ranges.

**M3: Page floods on a single vCPU.**
- Every `/:slug` load, and every random slug, hits the DB through the shell render.
- Fix:
  - Edge `proxy_cache` microcache on tmpfs (20 MB): 10 s for 200 and 5 s for 404, for `/`, `/:slug` and `/api/public/djs*`. Bypass it when an `Authorization` header is present, and never cache a response that sets a cookie.
  - `limit_req pages` at 20 r/s with burst 100, plus `limit_conn` of 30 per IP.

**M4: Booking anti-spam has gaps.**

Attacks:
- The form token can be replayed for its whole lifetime.
- The 50-per-day profile cap returns 429, so a spammer can shut down a DJ's bookings for the day.
- A honeypot named `website` is autofilled by browsers and silently discarded, which loses real bookings. The name also clashes with the catalogue key `website`.

Fix:
- Token = HMAC of {slug, iat, nonce}. The nonce is single-use (a `FormNonce` table or an LRU of 10k entries), valid from 5 s to 2 h.
- Over the cap, accept the request, store it as `SPAM` or quarantined, and challenge with Turnstile. Do not return 429.
- Honeypot uses a non-semantic name (e.g. `hp_x7`), `autocomplete=off` and `tabindex=-1`. Hits are stored as SPAM with a 7-day TTL instead of being dropped.
- The Idempotency-Key is scoped to (profileId, ipHash) with a 24-hour TTL.

**M5: Relabeling form fields to harvest sensitive data.**
- Attack: a DJ relabels a field "Número de tarjeta", "Contraseña de Instagram" or "Cédula".
- Fix:
  - An accent-folded denylist for labels and placeholders (tarjeta, credito, cvv, cvc, clave, contrasena, password, pin, cedula, pasaporte, cuenta bancaria, nequi, daviplata, codigo de verificacion…) returning 400 `LABEL_NOT_ALLOWED`.
  - Label changes go through the H5 admin feed.
  - Any submitted value containing a 13–19 digit sequence that passes the Luhn check is rejected.

**M6: Email as an abuse channel, with one shared sending quota.**

Attacks:
- New-booking emails carry attacker-written text and URLs, signed by our DKIM. That is phishing sent as fersuastudio.com.
- Forgot-password, verification and notification emails can exhaust Hostinger's daily sending limit, so real reset emails fail and the mailbox may be suspended.
- `evil.com` is a valid username and gets auto-linked inside verification emails.

Fix:
- Notification emails carry no free text or URLs from the public. Content: "Nueva solicitud de <first 40 characters of the sanitized name> — ver en tu panel", with the link built from `PUBLIC_BASE_URL`.
- The mail queue has:
  - a global daily budget of about 70% of the plan's limit;
  - priorities: security mail first, then verification, then notifications;
  - at most 5 emails per recipient per day;
  - reset emails capped at 3 per hour and 10 per day per resolved userId;
  - a digest when there are more than 5 notifications per hour.
- No usernames in verification emails. Mail always goes to the DB `user.email`, never to the typed identifier. Use the latest nodemailer 7.x.

**M7: The SEO shell can be broken by `String.replace` patterns.**
- Attack: `template.replace(marker, html)` interprets `$&`, `` $` ``, `$'` and `$<n>` inside user text, splicing pieces of the template in and breaking out of attribute or script contexts.
- Fix:
  - Use `template.replace(marker, () => html)` or split/join.
  - Context-specific encoders: attribute values escape `"'&<>`; JSON inside script tags escapes `<>&` and U+2028/U+2029.
  - Unit tests for `$'`, `$&`, `"><script>`, `</script>` and U+2028 in every slot.

**M8: Open redirect in path normalization.**
- Attack: a generic "lowercase the path and strip `.html`" rule, working on the raw `$request_uri`, turns `//Evil.com` into `Location: //evil.com`.
- Fix:
  - Redirect only when the path matches `^/[A-Za-z0-9-]{1,60}(\.html)?/?$`.
  - `Location` is always `'/' + slug` (from the DB or a validated segment).
  - Tests for `//Evil.com`, `/%2F%2Fevil.com`, `/\evil.com`.

**M9: Deep links can leak another profile's data.**
- Attack: `/:slug/fecha/:eventId` (server-side og:image and the flyer dialog) could show another profile's flyer, even from a DRAFT profile.
- Fix:
  - Query with `where: {id, profileId: visibleProfile.id, isHidden:false}`.
  - One `PublicProfileResolver` (APPROVED profile and ACTIVE user) used by every public endpoint, including the booking token and the booking POST.

**M10: The image decoders are an attack surface (the libwebp bug CVE-2023-4863 was exploited in the wild).**
- Fix:
  - sharp options `{limitInputPixels:40e6, failOn:'error', pages:1, animated:false}`. Never set `unlimited:true`.
  - `.timeout({seconds:20})`, `concurrency(1)`, one decode at a time with a queue of 5, then 503.
  - Read `metadata()` first and reject oversized dimensions before decoding.
  - sharp updates go through a Dependabot fast lane (security PRs merged the same day).
- Recommended if RAM allows (otherwise phase 2): a separate `imgproc` container with `network_mode: none`, no secrets, a read-only filesystem and 384m of memory, talking to the api over a unix socket on a shared volume. This also moves sharp's memory out of the api container.

**M11: Access tokens outlive logout, and the refresh grace window can be abused.**
- Attack 1: logout revokes the refresh family, but an issued access token stays valid for up to 15 minutes.
- Attack 2: with a 20-second grace window, an attacker who uses a stolen cookie first keeps the session alive.
- Fix:
  - `JwtStrategy` also checks that the token's `sid` family is not revoked, in the same DB query as the tokenVersion check.
  - Grace window of 10 seconds. If the successor token has already been used, treat it as reuse and revoke the family. More than 2 RACE responses per family also revokes it and writes an audit entry.
  - The client retries once, only after reading the BroadcastChannel token.

**M12: Personal data minimization and retention.**
- IPs are stored only as HMAC.
- User agents are truncated to 120 characters and kept only in Session, not in BookingRequest.
- Host and edge nginx logs are kept 14 days, and the privacy policy says so.
- Booking retention: 12 months (recommended) or 24 (owner decision).
- The policy states backup retention (14 days of nightly dumps, 8 weeks of weekly ones).
- Admin views of booking details are audited as `admin.booking.view`.
- Any future CSV export escapes cells starting with `=+-@`.

**M13: Habeas data requirements (Ley 1581/2012, Decreto 1377/2013).**
- `/privacidad` names the data controller (name, NIT or CC, address, `privacidad@` email).
- It lists purposes, the data subject's rights, and the response deadlines: 10 business days for queries, 15 for claims.
- It declares transmissions to Hostinger Mail, WhatsApp (initiated by the user) and Cloudflare (if Turnstile is used), plus retention periods.
- Roles: Fersua Studio is the controller for the platform; each DJ is the controller for their own inbox, with the platform acting as processor.
- DJ terms include a confidentiality clause. Store `termsVersion` and `termsAcceptedAt`; the backend's User model is missing them.
- The consent checkbox is unchecked by default. Each published version is kept in `docs/legal/politica-<v>.md` as proof.
- Deletion requests from people who are not users are handled through the admin search by contactEmail or phone, and audited.
- DJs must be 18 or older, and declare they hold the rights to the member photos they upload.
- The owner confirms whether registration in the RNBD applies (only above the asset threshold).

**M14: Admin and seed secrets.**
- Leaks in the current designs:
  - `docker compose run -e ADMIN_PASSWORD="$AP"` exposes the value in the process argv (`/proc/*/cmdline`) and in the container config.
  - The backend's rescue path reads `ADMIN_PASSWORD` from env, so it would linger in `.env`.
  - A leftover `ADMIN_FORCE_RESET=true` resets the admin on every seed run.
- Fix:
  - `dist/cli/admin.js create|reset-password|unlock|disable-mfa` runs with `docker compose run --rm -it` and prompts on the TTY with hidden input.
  - `ADMIN_*` variables never appear in `.env`, compose or joi.
  - Remove the force-reset flag.
  - The seed DJ user gets an unusable hash and no password is printed. The admin resets it at handover.

**M15: Supply chain.**
- Lockfile plus `npm ci` only.
- Dependabot `cooldown: default-days: 5` (security updates exempt), with no auto-merge.
- GitHub Actions pinned by commit SHA; `permissions: contents: read`; run `npm audit signatures`.
- Base images pinned by digest.
- Minimum versions: multer ≥ 2.0.2 (through `@nestjs/platform-express` 11.1.x), latest sharp 0.34.x and latest nodemailer 7.x.
- gitleaks also as a local pre-commit hook. The Dashboard already committed root/root once.

**M16: `ProfileScopeGuard`.**
- Decide between admin and owner by the matched route prefix (`/api/admin/`), not by whether a param is present.
- Owner mounts ignore params, query and body when resolving scope.
- `admin/booking-requests` gets its own admin-only controller.
- `PATCH owner` requires the target user's role to be USER.
- The route-guard matrix test runs in CI and blocks merges.

**M17: Collation on case-sensitive values.**
- `utf8mb4_0900_ai_ci` compares base64url keys case-insensitively, which loses entropy and causes false unique conflicts. It also folds accents in emails (`josé@` equals `jose@`).
- Fix: hashes and keys are hex-only or use `utf8mb4_bin`. Email local parts are ASCII only; domains are converted to punycode and lowercased.

**M18: Docker and host exposure.**
- A CI script fails if any service other than `edge` publishes a port, or if the edge port is not bound to `127.0.0.1:`.
- Keep Docker at version 28 or later: it blocks LAN neighbours from reaching loopback-published ports.
- Host nginx gets a `default_server` on 80/443 that returns 444.
- The api never uses `req.hostname` or the Host header to build URLs (enforced by ESLint).
- Note for the owner: `deploy` is in the docker group, which is equivalent to root. SSH to it must be key-only, and pm2 apps should not run as `deploy`.

### LOW

- **L1:** `.dockerignore` patterns only apply at the repo root, so `.env*` and `node_modules` miss the files under `api/` and `web/`. Use `**/.env*`, `!**/*.example`, `**/node_modules`, `**/*.pem`, `**/*.key`, `**/.uploads`, `backups`, `.git`.
- **L2:** One component owns the HTML CSP: the edge.
  - Helmet: `contentSecurityPolicy:false` for HTML; JSON responses keep `default-src 'none'`.
  - `frame-ancestors 'self'` only on `location = /_preview`; `'none'` plus `X-Frame-Options DENY` everywhere else.
  - Add `/.well-known/security.txt` as an exception to the `/\.` deny rule.
- **L3:** Email verification needs an explicit click. Mail scanners run JavaScript and would otherwise auto-verify an address an attacker typed in.
- **L4:** Drop `GET /auth/username-available`. Login returns `ACCOUNT_SUSPENDED` only after a correct password. `EMAIL_TAKEN` on register is acceptable at 5 per hour per IP.
- **L5:** Off-site backups are encrypted (restic). The fallback `scp` copy is encrypted with `age` first. `.env` is never included in backups.
- **L6:** The app DB user gets only SELECT and INSERT on `AuditLog`, through a `grants.sql` that the `migrate` service runs after migrations. The audit purge runs through the ops CLI. Every audit event is also written to the pino log.
- **L7:** Slugs of DRAFT profiles idle for 30 days are released by the purge, so they can't be squatted. The admin can also release slugs.
- **L8:** Frontend:
  - `sessionStorage` keeps only `{id, sentAt}`, plus the wa.me URL for 15 minutes.
  - `build.sourcemap:false`.
  - No Swagger in production.
  - The temporary password is removed from the React Query cache when the modal closes.
- **L9:** Focal-point values are validated as integers from 0 to 100.
- **L10:** The server sets the hint cookie `fs_session=1` (Secure, SameSite=Lax), and it carries no data.
- **L11:** A CAA record is optional, and only after confirming which CA Hostinger uses for its services. At decommission, remove DNS records that still point to the shared-hosting IP (dangling records).
- **L12:** A test derives the reserved slugs from the router, covering `_preview`, `restablecer`, `cambiar-clave`, `verificar-correo`, `recuperar`, `fecha`, `privacidad`, `terminos` and `reportar`.

## C. Security tests that must block CI

- **Routing and scope:**
  - Route-guard matrix.
  - Tenant isolation per resource, including injecting `profileId`, `memberId`, `id` or `__proto__` inside nested payloads (expect 400).
  - Every `/me/**` route called by a user with no profile returns 404 (H1).
- **Proxy and edge:**
  - Real client IP through the edge.
  - Edge regexes match the shared route table.
  - Private media returns 404 through the edge.
- **Rendering:**
  - SEO escaping with `$'` and `$&`.
  - Open-redirect cases.
  - Deep-link scoping.
- **Upload fixtures:** each must be rejected or neutralized:
  - JPEG+HTML polyglot, SVG, HEIC;
  - animated WebP or APNG;
  - a PNG declaring 20000x20000 pixels;
  - a progressive JPEG with many scans (must hit the timeout);
  - GPS EXIF must be stripped.
- **Auth:**
  - 50 parallel wrong passwords cause at most 5 verifications.
  - The known-device cookie bypasses a pair lock.
  - Refresh reuse after the grace window revokes the family.
  - A revoked `sid` makes the access token return 401.
  - Forgot-password for the admin sends nothing.
  - Destructive admin actions without step-up return 403.
- **Seed assets:** no image under `api/seed-assets/**` has EXIF data. This matters because git history is permanent and photo-1 carries Apple EXIF that may include GPS.
- **Compose lint:** only the edge publishes a port, on loopback only, and there are no `ADMIN_*` variables.
- **Blocking scans:** gitleaks, and `npm audit --omit=dev --audit-level=high`.

## D. Security questions for the owner

1. For sensitive-field changes, which option: notify only, hold for 24 hours, or require admin approval? Recommended: hold WhatsApp number and URL changes.
2. Admin TOTP from day 1, and no email-based recovery for the admin account? Recommended: yes to both.
3. Use Turnstile adaptively on registration and the booking form? If yes, it must be declared in the privacy policy.
4. What identity goes into the policy as data controller (name, NIT, address, contact email), and should bookings be kept 12 or 24 months?
5. Should DJ accounts require age 18 or older?

### Critical Files for Implementation
- C:\Fernando\Desarrollo\hostinger\fersua-djs\api\src\common\guards\profile-scope.guard.ts (with `api\prisma\schema.prisma`: strictUndefinedChecks, collations, hashed IPs)
- C:\Fernando\Desarrollo\hostinger\fersua-djs\api\src\auth\ (`auth.service.ts`, `lockout.service.ts`, `tokens\refresh-token.service.ts`, admin TOTP)
- C:\Fernando\Desarrollo\hostinger\fersua-djs\api\src\media\ (`image-pipeline.service.ts`, `storage.service.ts`: private/public split, signed preview URLs, quotas, disk guard)
- C:\Fernando\Desarrollo\hostinger\fersua-djs\deploy\edge\default.conf and C:\Fernando\Desarrollo\hostinger\fersua-djs\docker-compose.prod.yml (real-IP chain, pinned subnets, subpath mount, microcache, rate-limit regexes)
- C:\Fernando\Desarrollo\hostinger\fersua-djs\api\src\seo\head-builder.ts (replacer-function templating, escaping, redirect validation)
- Reference: C:\Fernando\Desarrollo\Personal\FersuaStore\HabitFer\api\src\common\guards\origin.guard.ts