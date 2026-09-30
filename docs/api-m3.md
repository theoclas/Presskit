# Contrato del api — M3 (registro y autoservicio de DJs)

Tipos nuevos: `packages/shared/src/owner-types.ts`. Se reutilizan los de M2 (`admin-types.ts`: `MeDto`, `SessionDto`, `EditorProfileDto`, inputs del editor, `BookingListItemDto`, `BookingDetailDto`, `Paginated`).

**Errores:** siempre `{ statusCode, code, message }`.

**Leyenda:** PUB = sin sesión · AUTH\* = con sesión, aunque haya contraseña temporal pendiente · OWN = rol USER.

**Cabecera `X-Requested-With: fersua`:** la exigen todas las mutaciones de auth (register, verify-email, resend, forgot, reset, accept-terms), como en M2.

## Auth (`/api/auth`)

| Método y ruta | Guard y límite | Entrada → salida y reglas |
|---|---|---|
| GET `/auth/registration` | PUB, cache 60 s | → `RegistrationStatusDto` (`open` = `REGISTRATION_OPEN`) |
| POST `/auth/register` | PUB, 5/h por IP; 20 correos de confirmación al día por IP (registros + reenvíos) | Ver "Registro" abajo. |
| POST `/auth/verify-email` | PUB, 10/h por IP | `VerifyEmailInput` → 204. Ver "Verificar el correo". |
| POST `/auth/resend-verification` | AUTH\*, 3/h por usuario; 20 al día por IP | → 202 (nuevo enlace, anula los anteriores). 409 `ALREADY_VERIFIED`. 429 si hoy ya no hay cupo de correo (no emite nada: el enlace anterior sigue sirviendo). |
| POST `/auth/forgot-password` | PUB, 5/h por IP; 3/h y 5 al día por usuario resuelto | Ver "Olvidé mi contraseña". |
| POST `/auth/reset-password` | PUB, 10/h por IP | Ver "Restablecer la contraseña". |
| POST `/auth/accept-terms` | AUTH\* (USER) | `AcceptTermsInput` → `MeDto`. Guarda las versiones y fechas vigentes. Si la cuenta nunca declaró la mayoría de edad (`MeDto.ageConfirmed` false: las crea el admin), exige `confirmAge: true` (400 `details.confirmAge`) y la guarda. |

**Registro** (`RegisterInput` → 201 `SessionDto` + cookie de refresh; la persona queda con sesión iniciada):
- 403 `REGISTRATION_CLOSED` si el registro está cerrado.
- Validación de campos:
  - Usuario: `validateUsername`, sin reservados.
  - Correo: `isValidEmail` (addr-spec estricto: nunca `<>,;:"()[]\` ni espacios), guardado en minúscula.
  - Contraseña: `validatePassword` con el usuario.
  - Las tres casillas deben venir en `true`.
- Honeypot `hp_x7` lleno → mismo 201 de apariencia, pero no se crea nada.
- 409 `USERNAME_TAKEN` / `EMAIL_TAKEN`. Se acepta, con el límite por IP.
- 429 si desde esa IP ya salieron 20 correos de confirmación en 24 h.
- 503 `REGISTRATION_BUSY` si hoy ya no hay cupo de correos de confirmación (no se crea la cuenta).
- Lo que se guarda:
  - rol USER;
  - `termsVersion` + `termsAcceptedAt`, `privacyVersion` + `privacyAcceptedAt` (de `LEGAL_DOCS`) y `ageConfirmedAt`.
- Envía el correo `verify-email`.
- Auditoría: `auth.register`.

**Verificar el correo** (`VerifyEmailInput` → 204):
- Token `EMAIL_VERIFY`: un solo uso, 48 h, se guarda con hash.
- El enlace es `${PUBLIC_URL}/verificar-correo#t=<token>`. La página exige un **clic explícito** para confirmar: así los escáneres de correo no lo validan solos.
- 400 `TOKEN_INVALID` (inválido, usado o vencido, siempre el mismo código).

**Olvidé mi contraseña** (`ForgotPasswordInput` → **202 siempre**, mismo cuerpo, sin revelar si la cuenta existe):
- Solo envía algo si la cuenta es USER, ACTIVE y tiene correo.
- Para el **ADMIN no envía nada**: su rescate es solo por CLI en el VPS.
- Token `PASSWORD_RESET`: un solo uso, 30 min, anula los anteriores. Solo se emite si el correo va a
  salir hoy (topes de MailService); si no, no se toca el enlace anterior.
- El admin, al dar una contraseña temporal o suspender la cuenta, anula los enlaces pendientes.
- El enlace es `${PUBLIC_URL}/restablecer#t=<token>`.
- El correo sale siempre al `user.email` guardado, nunca al texto que se escribió.

**Restablecer la contraseña** (`ResetPasswordInput` → 204):
- Aplica la política de contraseñas.
- Actualiza `tokenVersion++` y marca `emailVerifiedAt` (tener el buzón lo prueba).
- Limpia bloqueos, revoca todas las sesiones y envía el aviso `password-changed`.

**TermsGuard (global, después de MustChangePassword):** para rol USER, en `/api/me/**`, responde 403 `TERMS_ACCEPTANCE_REQUIRED` si `termsVersion` o `privacyVersion` difieren de `LEGAL_DOCS`. Quedan exentos `/api/auth/*` y `GET /api/auth/me`.

**`MeDto`** agrega `termsOutdated: boolean` (ver `admin-types.ts`) para que la web muestre la re-aceptación,
y `ageConfirmed: boolean` (false si la cuenta nunca declaró la mayoría de edad).

## Dueño (`/api/me`, OWN)

| Método y ruta | Reglas |
|---|---|
| GET `/me/genres` | → `OwnerGenreDto[]` (géneros activos) |
| GET `/me/profile/slug-availability?slug=` | → `SlugAvailabilityDto`. 30/min. |
| POST `/me/profile` | Onboarding: `OnboardingInput` → 201 `EditorProfileDto`. Ver abajo. |
| POST `/me/profile/submit` | Ya existe. Ver abajo. |
| POST `/me/profile/withdraw` | PENDING_REVIEW → DRAFT |
| GET `/me/profile/bookings?status=&page=` | → `Paginated<BookingListItemDto>`, solo de su perfil |
| GET `/me/profile/bookings/unread-count` | → `UnreadCountDto` |
| GET `/me/profile/bookings/:id` | → `BookingDetailDto`. La marca como leída. 404 si no es suya. |
| PATCH `/me/profile/bookings/:id` `{ status }` | NEW, READ, ARCHIVED o SPAM |
| DELETE `/me/profile/bookings/:id` | |

**Onboarding** (`POST /me/profile`):
- Controlador aparte, **sin** `ProfileScopeGuard`.
- 409 `PROFILE_EXISTS` si ya tiene perfil.
- Slug con `validateSlug`, único frente a perfiles y `SlugRedirect`.
- Nace DRAFT, con textos `{}` y `defaultFormConfig()`.
- **No** exige correo verificado.

**Enviar a revisión** (`POST /me/profile/submit`) exige, además de lo actual:
- correo verificado: si no, 403 `EMAIL_NOT_VERIFIED`;
- registro legal (art. 53): si no, 409 `LEGAL_INFO_REQUIRED`;
- el checklist `publishMissing` vacío: si no, 409 `PROFILE_INCOMPLETE`. En perfiles con dueño,
  `texts.heroTitle` tiene que ser un título propio (el de la plantilla no cuenta).

Al enviar, avisa al admin con el correo `profile-submitted-admin`.

**Reglas adicionales para el dueño:**
- **Tope de cambios (H3):** 60 cambios (todo método que no sea de lectura bajo `/api/me/profile/**`)
  cada 10 min por usuario; después, 429 `RATE_LIMITED`. El admin no tiene este tope.
- **Datos legales** (`PUT /me/profile/legal-info`): el dueño envía `truthful: true` (declara que son
  veraces; si no, 400 `details.truthful`) y queda en la auditoría (`declared: true`).
- **Slug:** si el perfil nunca se publicó, el slug viejo se libera (sin redirección); si ya se
  publicó, queda como redirección 301 (máx. 5).
- **Subir imágenes** (`POST /me/profile/media`) exige correo verificado: si no, 403 `EMAIL_NOT_VERIFIED`. Para el admin no cambia nada.
- **Todo el resto del editor** (`/me/profile/...`) ya existe desde M2 con el guard de alcance.
- `GET /me/profile/preview` ya existe. La web lo usa en `/_preview` para el dueño, sin parámetro.

## Correos (MailService, plantillas en `api/src/mail/mail-templates.ts`)

Nunca incluyen texto libre del público ni URLs que no sean de `PUBLIC_URL`. Solo salen a una dirección
simple (el parser de nodemailer tiene que leer exactamente esa) y con sobre SMTP explícito.

**Cupos diarios (en memoria, se reinician a las 00:00 UTC):** 300 en total; los avisos y las
confirmaciones paran en 250. Cupos propios: confirmar el correo 80 al día, enlaces de restablecer 100 al
día (y 5 por buzón), avisos de PQRS al admin sin tope propio (nunca los agotan los demás). Por buzón
(contando `dj+x@` como `dj@`) y por cupo, 10 al día; "tu contraseña cambió" y "tu correo cambió" tienen
cupo aparte de las demás alertas. Si un cupo global se agota, queda una fila `system.mail.cap_reached`
en la auditoría.

| Plantilla | Para | Contenido |
|---|---|---|
| `verify-email` | usuario | enlace a `/verificar-correo#t=` (48 h) |
| `reset-password` | usuario | enlace a `/restablecer#t=` (30 min) y "si no fuiste tú, ignóralo" |
| `booking-new-owner` | dueño con `notifyByEmail` y correo verificado | "Tienes una nueva solicitud de booking" y el enlace a `/panel/solicitudes`. Ningún dato del solicitante (plan M3). Máximo 5 por día por destinatario; desde ahí, un resumen. |
| `booking-digest-owner` | dueño que ayer pasó el tope de avisos y tiene solicitudes sin leer | "Tienes N solicitudes de booking sin leer" y el enlace al panel. |
| `profile-submitted-admin` | `ADMIN_NOTIFY_EMAIL` o el admin | nombre (sin `. @ : /`, no se vuelve enlace) y slug del perfil y enlace a `/admin/djs` |
| `profile-approved` / `profile-rejected` / `profile-suspended` | dueño | estado, motivo (texto del admin, escapado) y enlace a `/panel` |
| `draft-expiring` | dueño | "Tu borrador se borrará en 9 días por inactividad" |

## Tareas programadas (`@nestjs/schedule`, zona `America/Bogota`)

| Tarea | Regla |
|---|---|
| Borradores inactivos | DRAFT con `lastActivityAt` de más de 21 días: aviso `draft-expiring`, una sola vez. Más de 30 días: se borra el perfil (media incluida; no se borra el usuario). |
| Rechazados | REJECTED sin actividad en 30 días: se borra el perfil. |
| Usuarios sin verificar | Correo sin verificar después de 14 días y sin perfil (o con perfil DRAFT): se borra la cuenta. |
| Solicitudes (04:30) | Se borran las de más de 12 meses y las SPAM de más de 30 días. |
| Resumen de solicitudes (08:00) | `booking-digest-owner` a quien ayer (día UTC) recibió más de 5 solicitudes y tiene sin leer. |

Las tres purgas del dueño solo tocan lo que el DJ hizo por su cuenta: cuentas que pasaron por
`/registro` (mayoría de edad declarada) sin auditoría `admin.user.*`, y perfiles sin auditoría
`admin.profile.*` (salvo rechazar o leer el registro legal). Lo que el admin creó, editó, asignó o
administró nunca se purga solo.

Todo queda en auditoría.

## Web (rutas públicas ya reservadas en `APP_TOP_LEVEL_ROUTES`)

| Ruta | Qué hace |
|---|---|
| `/registro` | Formulario: usuario, correo, contraseña con ayudas, las 3 casillas con enlaces a `/terminos-artistas` y `/privacidad`, y el honeypot. Si está cerrado, muestra "El registro está cerrado por ahora". |
| `/verificar-correo` | Lee `#t=`, lo quita de la URL y muestra el botón "Confirmar mi correo". |
| `/recuperar` | Un campo "Usuario o correo" y un mensaje genérico. |
| `/restablecer` | Lee `#t=` y pide la contraseña nueva dos veces. |
| `/panel/*` (USER) | Panel del DJ. Ver abajo. |

**Panel del DJ (`/panel/*`):**
- **Re-aceptación de términos** si `termsOutdated`.
- **Banner de correo sin verificar**, con "Reenviar".
- **Onboarding** si no tiene perfil: nombre artístico, slug sugerido y disponibilidad en vivo.
- **Estado y checklist:**
  - banner de estado: Borrador, En revisión, Aprobado, Rechazado con motivo, Suspendido con motivo;
  - checklist `publishMissing`;
  - botones "Enviar a revisión" / "Retirar";
  - "Ver mi página" (solo aprobado) y "Vista previa".
- **Secciones del editor:** las del admin, con `EditorScopeProvider base="/me/profile" actor="owner" genresUrl="/me/genres"`, más "Datos legales".
- **Solicitudes:** bandeja con lista, detalle, estados y "Responder por WhatsApp/correo".
- **Cuenta:** cambiar contraseña y cerrar todas las sesiones.
