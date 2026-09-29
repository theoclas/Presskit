# Contrato del api — M2 (auth + admin) y base de M3 (panel del DJ)

Tipos en `packages/shared/src/admin-types.ts` (y `api-types.ts` para lo público).

**Errores:** siempre `{ statusCode, code, message, details? }`. `message` va en español y nunca lleva los valores enviados.

**Guards globales, en este orden:** Throttler → Origin (las mutaciones exigen `Origin` = `PUBLIC_URL`) → JwtAuth (salvo `@Public()`) → MustChangePassword (salvo `@AllowPendingPasswordChange()`) → Roles.

**Alcance de perfiles:** `ProfileScopeGuard` + `@ScopedProfile()` en `api/src/common/scope/profile-scope.guard.ts`.

**Acciones destructivas del admin:** `@RequireStepUp()` exige la cabecera `X-Step-Up`.

**Leyenda de la columna Guard:**
- **PUB:** sin sesión.
- **AUTH\*:** con sesión, permitido aunque haya contraseña temporal pendiente.
- **AUTH:** con sesión normal.
- **ADM:** rol ADMIN.
- **ADM+SU:** ADMIN más step-up.
- **OWN:** rol USER sobre su propio perfil (M3).
- **[me|adm]:** el mismo controlador montado en `/api/me/profile/...` (OWN) y en `/api/admin/profiles/:profileId/...` (ADM).

## Auth (`/api/auth`)

**Cookie de refresh:** `__Host-rt` (HttpOnly, Secure, SameSite=Strict, Path=/, sin Domain). En desarrollo, con `COOKIE_SECURE=false`, se llama `rt` porque el prefijo `__Host-` exige Secure.

**Cabecera obligatoria:** `X-Requested-With: fersua` en refresh, logout, mfa y step-up.

**Access JWT:** HS256, 15 min, claims `sub`, `tv` y `sid`, con `iss`/`aud` fijos. La web lo guarda solo en memoria.

| Método y ruta | Guard | Entrada → salida |
|---|---|---|
| POST `/auth/login` | PUB, 10/15 min por IP | `LoginInput` → `LoginResultDto` + cookie (si no hay 2FA). Todo fallo: 401 `INVALID_CREDENTIALS`, con el mismo cuerpo y tiempo similar (hash ficticio). |
| POST `/auth/mfa` | PUB, 10/15 min por IP | `MfaVerifyInput` → `SessionDto` + cookie. `mfaToken` es un JWT de 5 min con propósito `mfa` (3 intentos). 401 `MFA_INVALID` / `MFA_TOKEN_EXPIRED`; 409 `AUTH_IN_PROGRESS` si hay otra verificación del mismo usuario en curso (no cuenta como fallo). |
| POST `/auth/refresh` | PUB (cookie) | → `SessionDto` + cookie rotada. 401 `REFRESH_INVALID` (y borra la cookie); 401 `REFRESH_RACE` dentro de la gracia de 10 s. |
| POST `/auth/logout` | PUB (cookie) | 204. Revoca la familia. |
| POST `/auth/logout-all` | AUTH\* | 204. `tokenVersion++` y revoca todas las familias. |
| GET `/auth/me` | AUTH\* | `MeDto` |
| POST `/auth/change-password` | AUTH\*, 5/15 min | `ChangePasswordInput` → `SessionDto`. Revoca las otras sesiones y limpia `mustChangePassword`. |
| POST `/auth/step-up` | AUTH (ADMIN), 5/15 min | `StepUpInput` → `StepUpDto`. 403 `STEP_UP_INVALID` (auditado); 409 `AUTH_IN_PROGRESS`. |
| POST `/auth/forgot-password`, `/auth/reset-password`, `/auth/register`, `/auth/verify-email` | PUB | **M3** |

**2FA del admin, por usuario (no solo por `mfaToken`):** cada código malo suma `User.mfaFailedCount` y se audita como `security.mfa_failed`; la contraseña correcta queda como `auth.mfa_challenge`. Desde el 3.er código malo seguido hay una pausa de 15·2^(n−3) min (máx. 4 h): el login con la contraseña correcta responde 429 `MFA_PAUSED` (con la hora) y los `mfaToken` vigentes dejan de servir. La cookie de dispositivo conocido salta la pausa, así el admin nunca queda afuera de su navegador (H6). Aviso por correo (`admin-mfa-failed`) en el primer fallo desde una red nueva y en cada pausa. Un ingreso completo, `admin:unlock`, `admin:reset-password` o `admin:reset-mfa` ponen el contador en 0.

**Cookie de dispositivo conocido (`__Host-kd` / `kd`):** firmada sobre usuario + `tokenVersion`. Cambiar o restablecer la contraseña, cerrar todas las sesiones o suspender la cuenta (todo sube `tokenVersion`) invalida las cookies anteriores.

**Candados en proceso:** uno por flujo y usuario (login, mfa, step-up, cambio de contraseña): un login anónimo con el usuario del admin no puede hacer fallar su 2FA ni su step-up.

## Perfil y contenido `[me|adm]`

Las rutas son relativas a `/api/me/profile` o a `/api/admin/profiles/:profileId`. Todas escriben en `AuditLog`: el admin como `admin.profile.*` y el dueño como `profile.*`, solo con los nombres de los campos.

| Método y ruta | Entrada → salida |
|---|---|
| GET `` (raíz) | → `EditorProfileDto` (incluye `publishMissing`: lo que falta de la lista para publicar) |
| PATCH `` | `UpdateProfileInput` → `EditorProfileDto`. Los textos se validan con `validateTexts`; las imágenes deben ser del mismo perfil y del kind HERO/CARD. |
| GET `/preview` | → `PublicDjProfileDto` (cualquier estado; las imágenes privadas llevan URL firmada) |
| PUT `/slug` | `{ slug }` → `EditorProfileDto`. El slug viejo pasa a `SlugRedirect`. El dueño aprobado puede cambiarlo cada 30 días; el admin, sin límite. |
| PUT `/genres` | `{ genreIds: number[] }` (1-6, activos) |
| PUT `/socials` | `{ links: SocialLinkInput[] }` (máx. 10; URL normalizada con `normalizeSocialUrl`) |
| PUT `/rider` | `{ items: RiderItemInput[] }` (máx. 20) |
| PUT `/booking-form` | `{ fields: FormFieldConfig[] }`, validado con `validateFormConfig` |
| GET/POST `/members`, PATCH/DELETE `/members/:id`, PUT `/members/order` `{ ids }`, PUT `/members/:id/socials` `{ links }` | `MemberInput`, máx. 6 |
| GET `/events?scope=upcoming\|past`, POST `/events`, PATCH/DELETE `/events/:id` | `EventInput` → `EditorEventDto`. La fecha va de hoy (Bogotá) a +730 días; el admin puede poner fechas pasadas. |
| GET `/gallery`, POST `/gallery` `{ mediaId, alt? }`, PATCH `/gallery/:id` `{ alt }`, DELETE `/gallery/:id`, PUT `/gallery/order` `{ ids }` | máx. 24 |
| POST `/media` (multipart: `file`, `kind`) | → `MediaAssetDto`. 10 MB. Cuota: sin aprobar 25 MB/20; aprobado 100 MB/100. 413/415/409 `QUOTA_EXCEEDED`/503 `UPLOAD_BUSY`/`STORAGE_FULL`. **Antes de leer el cuerpo** (ProfileUploadInterceptor): Content-Length imposible → 413; sin cupo (3 subidas en el api, 2 por usuario) → 503 `UPLOAD_BUSY`; cuota llena → 409. En esos casos el cuerpo se descarta sin guardarlo. |
| DELETE `/media/:id` | 409 si está en uso |
| GET/PUT `/legal-info` | `LegalInfoInput` ↔ `LegalInfoDto` (art. 53, privado). Cada GET del admin se audita (`admin.profile.legal_info_view`, sin valores). |
| POST `/submit` (OWN, M3) | DRAFT/REJECTED → PENDING_REVIEW |

**Imágenes privadas:** GET `/api/media/preview/:assetId/:file?exp=&sig=` (HMAC de `BOOKING_FORM_SECRET`, 1 h, `Cache-Control: private, no-store`). Solo el api construye esas URLs.

## Admin (`/api/admin`, todo ADM)

| Método y ruta | Notas |
|---|---|
| GET `/stats` | `AdminStatsDto` (incluye `approvedWithoutLegal`: perfiles públicos sin registro del art. 53, máx. 10) |
| GET `/profiles?status=&q=&featured=&page=&pageSize=` | `Paginated<AdminProfileListItemDto>` |
| POST `/profiles` | `{ slug, displayName, userId? }` → `EditorProfileDto` (DRAFT, textos y formulario por defecto) |
| POST `/profiles/:id/approve` | Solo si existe `DjLegalInfo` (409 `LEGAL_INFO_REQUIRED`). Pasa la media a pública. |
| POST `/profiles/:id/reject` `{ reason }`, `/suspend` `{ reason }`, `/reinstate` | Motivo de 10 a 500 caracteres. Suspender pasa la media a privada. Reactivar exige el registro legal, igual que aprobar (409 `LEGAL_INFO_REQUIRED`). |
| PATCH `/profiles/:id/feature` | `{ featured, featuredRank? }` |
| PATCH `/profiles/:id/owner` | ADM+SU. `{ userId \| null }`: solo usuarios USER **activos** sin perfil (409 `USER_NOT_ELIGIBLE`). |
| DELETE `/profiles/:id` | ADM+SU. `{ confirm: slug }`. Borra filas (también sus solicitudes) y carpeta de media. 409 `PROFILE_HAS_OPEN_TICKETS` si hay un `REPORTE_PERFIL` o `SOLICITUD_DATOS_DJ` abierto sobre el perfil. El `DjLegalInfo` **no** se borra: queda con `profileId` NULL, `closedAt` y el slug/nombre de ese momento, y el job diario lo purga 12 meses después. |
| GET `/users?q=&status=&page=` | `Paginated<AdminUserDto>` |
| POST `/users` | `CreateUserInput` → `TemporaryPasswordDto` (se muestra una vez) |
| POST `/users/:id/reset-password` | ADM+SU → `TemporaryPasswordDto` (72 h, `mustChangePassword`, revoca sesiones) |
| PATCH `/users/:id` | ADM+SU. `{ email: string \| null }` (la clave es obligatoria; null o '' lo quita) → `AdminUserDto`. Queda sin verificar, 409 `EMAIL_TAKEN`, auditado como `admin.user.email` (sin correos) y aviso `email-changed` al correo anterior. |
| POST `/users/:id/suspend`, `/reactivate`, `/unlock`, `/revoke-sessions` | El admin no puede actuar sobre sí mismo. Con la cuenta suspendida, su perfil aprobado deja de verse en público. |
| DELETE `/users/:id` | ADM+SU. `{ confirm: username }`. Su perfil queda sin dueño y, si estaba aprobado, se suspende en la misma transacción (si no, quedaría público sin dueño). |
| GET `/bookings?profileId=&status=&q=&from=&to=&page=` | `Paginated<BookingListItemDto>` |
| GET `/bookings/:id` | `BookingDetailDto`. Se audita como `admin.booking.view`. |
| PATCH `/bookings/:id` `{ status }` · DELETE `/bookings/:id` | |
| GET `/tickets?status=&type=&page=` · GET/PATCH `/tickets/:id` | `TicketDto`, `UpdateTicketInput`. Orden: vencidos primero. Días hábiles = lunes a viernes sin festivos de Colombia (calculados en shared). Cada ticket nuevo avisa al admin por correo (`admin-new-ticket`: tipo, radicado y vencimiento, sin texto del público) a `ADMIN_NOTIFY_EMAIL` o al correo del admin. |
| GET `/audit-logs?action=&actor=&profileId=&from=&to=&page=` | `Paginated<AuditLogDto>` |
| GET/POST/PATCH `/genres`, DELETE `/genres/:id` | `GenreAdminDto`. Borrar un género en uso da 409; en ese caso se desactiva. |

**Mismo contrato para el dueño (M3):** GET `/api/me/profile/bookings…`, igual que el admin pero limitado a su perfil.

## CLI (`node dist/cli/main.js <comando>`, dentro del contenedor api)

| Comando | Qué hace |
|---|---|
| `admin:create` | Pide por TTY el usuario (por defecto `fersua`), el correo y la contraseña **oculta, dos veces, mínimo 12**. Crea el ADMIN (`adminSlot=true`) y configura el TOTP: imprime la URI `otpauth://` y un QR en la terminal, pide un código para confirmar e imprime una sola vez 10 códigos de recuperación. Falla si ya existe un admin. Para pruebas acepta `--password-stdin` y `--totp-secret-out <archivo>`, nunca la contraseña por argumento. |
| `admin:reset-password` | Pide la contraseña nueva por TTY y revoca las sesiones. |
| `admin:unlock` | Desbloquea la cuenta (contraseña y pausa del 2FA). |
| `admin:reset-mfa` | Genera un TOTP nuevo con su QR y códigos de recuperación. |
