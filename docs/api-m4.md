# Contrato del api — M4 (endurecimiento)

Lo que cambia sobre `docs/api-m2.md` y `docs/api-m3.md`. Tipos en `packages/shared/src/api-types.ts`
(público) y `admin-types.ts` (admin). Migración: `20260930120000_m4_hardening` (`Ticket.isSpam`,
`BookingRequest.ownerDeletedAt` y sus índices).

## Formulario de PQRS y reportes (público)

| Método y ruta | Guard | Entrada → salida |
|---|---|---|
| GET `/api/public/tickets/token` | PUB, 30/10 min por IP | → `TicketTokenDto { token }`. `Cache-Control: no-store`; el edge nunca lo guarda. |
| POST `/api/public/tickets` | PUB, 5/h por IP | `TicketSubmitDto` (ahora con `token`) → 201 `TicketSubmitResultDto { id, dueDate }` |

- **Token:** el mismo esquema HMAC que el de booking (`FormTokenService`, antes `BookingTokenService`),
  con propósito propio: un token de booking no sirve aquí ni al revés. Vale desde 2 s hasta 2 h y una
  sola vez. Errores 400: `FORM_TOKEN_INVALID`, `FORM_TOO_FAST`, `FORM_EXPIRED`, `FORM_TOKEN_USED`; sin
  token, `VALIDATION_FAILED`. `FORM_TOO_FAST` no gasta el token.
- **Spam:** solo el honeypot (`hp_x7`) se guarda con `isSpam=true`, con la misma respuesta 201 y
  **sin** aviso al admin. Pasados 10 de una misma IP en 24 h, el honeypot ya no se guarda (radicado
  falso).
- **Topes de 24 h** (10 sin spam por IP o 200 sin spam en total): 429 `RATE_LIMITED` con el correo
  de contacto como alternativa, sin guardar nada. Una PQRS tiene plazo legal: nunca se guarda en
  silencio donde el admin no la ve. El spam de una IP no cuenta para el tope de esa IP (un bot detrás
  de la misma IP no le cierra el paso a una persona).
- **Techo:** con 1.000 tickets en 24 h (spam incluido) ya no se guarda nada: 429 para una persona y un
  radicado falso para el honeypot.
- El log solo lleva id, tipo, slug y si fue spam (`ticket.created id=… type=… spam=HONEYPOT`), o el
  tope que se pasó (`ticket.cap reason=CAP_IP type=…`).

## Tickets (admin)

- `TicketDto.isSpam: boolean` (honeypot o marcado por el admin).
- GET `/api/admin/tickets/:id` de una `SOLICITUD_DATOS_DJ` suma `matchingBookings: number | null`:
  cuántas solicitudes de booking a ese DJ traen el mismo correo que el ticket (sin distinguir
  mayúsculas; solo el conteo). `null` si el perfil ya no existe; ausente en los demás tipos y en la
  lista.
- GET `/api/admin/tickets`: sin `spam` (o `spam=false`) oculta el spam; `spam=true` muestra solo el
  spam; otro valor, 400.
- PATCH `/api/admin/tickets/:id`: acepta `isSpam?: boolean` (`status` sigue siendo obligatorio).
- POST `/api/admin/tickets/:id/disclose-dj` (**ADM+SU**, cabecera `X-Step-Up`), cuerpo
  `DiscloseDjInput { confirmed: true }` (el admin declara que verificó que quien pide contrató al DJ;
  sin él, 400 `VALIDATION_FAILED`) → 200 `DiscloseDjResultDto { record: AdminLegalRecordDto;
  responseTemplate: string }`:
  - solo en tickets `SOLICITUD_DATOS_DJ`: 409 `TICKET_NOT_DATA_REQUEST`, `TICKET_IS_SPAM`,
    `TICKET_REJECTED` o `LEGAL_RECORD_MISSING`; 404 si no existe; 403 `STEP_UP_REQUIRED`;
  - un ticket `OPEN` pasa a `IN_PROGRESS` (auditado como `admin.ticket.update`);
  - cada entrega se audita como `admin.legal.disclose` con
    `{ ticketId, state, verifiedBy: 'email-match' | 'manual', matchingBookings }`, sin datos personales;
  - `responseTemplate` es texto plano para copiar al correo del solicitante (no se envía solo);
  - con el perfil ya borrado responde 409 `LEGAL_RECORD_MISSING`: no busca el registro conservado
    por el slug (un slug liberado puede ser de otro DJ después); el admin lo busca a mano en
    «Registros legales».
- Estadísticas: `openTickets` y `overdueTickets` (la insignia) no cuentan spam; nuevo `spamTickets`
  (spam de los últimos 30 días). Los tickets spam abiertos no frenan el borrado de un perfil.

## Registros del art. 53 (admin)

| Método y ruta | Guard | Entrada → salida |
|---|---|---|
| GET `/api/admin/legal-records?state=active\|closed&q=&page=&pageSize=` | ADM | → `Paginated<AdminLegalRecordListItemDto>` |
| GET `/api/admin/legal-records/:id` | **ADM+SU**, 30/10 min | → `AdminLegalRecordDto` |

- La lista no trae documento, dirección ni teléfonos. `q` busca en el nombre o razón social y en el
  slug o nombre del perfil, nunca en el número de documento. Orden: los cerrados primero (el más
  reciente arriba) y luego los activos por última edición.
- El detalle suma `docType`, `docNumber`, `address` y `phones`, pide step-up (cabecera `X-Step-Up`;
  sin ella, 403 `STEP_UP_REQUIRED`) y se audita como `admin.legal.view` con `{ state }`: una fila por
  admin y registro cada 10 minutos.

## Solicitudes de booking

- `BookingListItemDto` y `BookingDetailDto` suman `ownerDeleted: boolean` (siempre `false` en la
  bandeja del DJ).
- DELETE `/api/me/profile/bookings/:id` ahora es **borrado suave**: 204, y repetirlo da 204 sin otra
  auditoría. Desde ahí la lista, el conteo, las no leídas, el detalle y el PATCH del DJ la ignoran
  (404). El admin la sigue viendo, marcada. El DELETE del admin sigue siendo definitivo y la purga de
  12 meses borra todo.
- El resumen "N solicitudes sin leer" y el `newBookings` del admin no cuentan las que el DJ borró.

## CLI

- `ops:alert --kind <tipo> [--detail "<texto>"] [--resolved]`: aviso de operación al admin (lo usa
  `scripts/watchdog.sh`). Tipos fijos; el detalle es una línea de hasta 200 caracteres sin `@` ni
  `://`. Máximo 20 avisos **entregados** en 24 h (contados en la auditoría, `system.ops_alert`
  con `delivered: true`; los fallidos no cuentan). Sale con 1 si el correo no salió, para que el
  vigilante reintente (como mucho una vez por hora por tipo). Guía: `docs/08-monitoreo.md`.
