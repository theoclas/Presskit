# Documentos legales (versión breve, Colombia)

Aquí hay una copia legible de los textos legales del sitio. El texto que se publica sale de
`web/src/public/legal/content/*.ts`; estos `.md` sirven para revisarlos o pasárselos a un
abogado. Si cambias uno, cambia el otro.

| Documento | Página | Archivo TS | Copia |
|---|---|---|---|
| Política de Tratamiento de Datos Personales | `/privacidad` | `content/privacidad.ts` | `politica-privacidad-v2026-09.md` |
| Términos y Condiciones de Uso | `/terminos` | `content/terminos.ts` | `terminos-v2026-09.md` |
| Términos para Artistas | `/terminos-artistas` | `content/terminos-artistas.ts` | `terminos-artistas-v2026-09.md` |
| PQRS y Habeas Data | `/pqrs` | `content/pqrs.ts` | `pqrs-v2026-09.md` |
| Reportar contenido (texto corto, sin versión) | `/reportar` | `content/reportar.ts` | — |

Los avisos de privacidad breves que van junto a cada formulario (booking, PQRS y reporte) están en
`web/src/public/legal/PrivacyNotice.tsx` y toman los mismos marcadores. Son borrador: revísalos con el resto.

## Antes del lanzamiento: marcadores por llenar

Todos están en un solo archivo, `web/src/public/legal/operator.ts`, y los documentos los
toman de ahí:

- `legalName`: `[NOMBRE O RAZÓN SOCIAL]` (persona natural o empresa responsable).
- `docLabel`: `[NIT/CC]`: escribe `NIT` o `C.C.`.
- `docNumber`: `[NÚMERO]`.
- `address`: `[DIRECCIÓN]`: dirección de notificaciones.
- `email`: `[CORREO DE CONTACTO]`: el correo que atiende PQRS y habeas data.
- `phone`: `[TELÉFONO]`.
- `city`: ya viene como `Medellín, Colombia`; cámbialo si no aplica.

Confirma también dos datos que el texto da por hechos:

- Que Hostinger presta el servidor (VPS) y el correo, y que la copia externa cifrada de los
  respaldos va a Google Drive. Si cambias de proveedor (p. ej. a Backblaze B2), edita la sección 5
  de la política **antes** de activar la copia en el VPS.
- Que los plazos de conservación siguen siendo 12 meses para solicitudes y 14 días / 8 semanas
  para respaldos, contando la copia externa (`scripts/backup.sh` y `scripts/offsite-backup.sh`
  están ajustados a ese plazo). Si cambian en el código o en los backups, edita la sección 8 de la
  política.

`OPERATOR_HAS_PLACEHOLDERS` (en `operator.ts`) vale `true` mientras quede algún corchete. Sirve
para mostrar un aviso en desarrollo o para frenar el despliegue a producción.

## Cómo funcionan las versiones

1. La versión de cada documento vive en `packages/shared/src/legal.ts` (`LEGAL_DOCS`). El
   formulario de booking guarda `CONSENT_VERSION` (la de la política) y el registro de artistas
   guarda la de los términos que se aceptaron.
2. Si cambias el fondo de un documento: sube su `version` en `LEGAL_DOCS`, cambia el
   `updatedAt` en el `.ts` y la fecha que aparece en la sección de vigencia, y crea la copia
   nueva aquí (por ejemplo `politica-privacidad-v2027-01.md`), dejando la anterior como
   historial.
3. Cuando sube la versión de los Términos para Artistas, el panel les pide aceptarlos de nuevo al
   entrar. Avísales por correo antes de que empiece a aplicar.
4. Las correcciones de redacción que no cambian el fondo (una tilde, un error de tipeo) no
   necesitan una versión nueva.

## Revisión de un abogado (opcional, recomendable)

Los textos siguen la Ley 1581 de 2012, el Decreto 1377 de 2013 (compilado en el Decreto 1074
de 2015) y el art. 53 de la Ley 1480 de 2011, en versión corta. No reemplazan una asesoría. Antes
de crecer vale la pena una revisión, sobre todo de estos puntos:

- Cuánto tiempo guardar el registro de oferente de un DJ que cierra su cuenta (hoy 12 meses).
- La cláusula de los Términos para Artistas en la que el DJ responde por el contenido que sube.
- Si hace falta decir en qué país está el servidor (transmisión internacional de datos).

Los análisis completos están en `docs/diseno/07` a `11`.
