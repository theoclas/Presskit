// Política de Tratamiento de Datos Personales (Ley 1581 de 2012; Decreto 1377 de 2013,
// compilado en el Decreto 1074 de 2015). Versión corta: cubre el contenido mínimo del
// art. 13 del Decreto 1377 sin muros de texto. Si cambias el fondo, sube la versión en
// LEGAL_DOCS (shared) y el updatedAt, y actualiza docs/legal/politica-privacidad-*.md.
import { LEGAL_DOCS, LIMITS, PQRS_DEADLINE_BUSINESS_DAYS } from '@fersua/shared';
import { OPERATOR } from '../operator';
import type { LegalDoc } from '../types';

const PQRS_PATH = LEGAL_DOCS.pqrs.path;
const BOOKING_MONTHS = LIMITS.retention.bookingMonths;
const R = LIMITS.retention;

export const privacyDoc: LegalDoc = {
  key: 'privacy',
  title: LEGAL_DOCS.privacy.title,
  version: LEGAL_DOCS.privacy.version,
  updatedAt: '2026-09-29',
  intro: [
    `${OPERATOR.brand} es una plataforma donde DJs y artistas publican su página y reciben solicitudes de booking. Aquí te contamos qué datos personales tratamos, para qué y cómo puedes ejercer tus derechos, conforme a la Ley 1581 de 2012 y al Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015).`,
  ],
  sections: [
    {
      id: 'responsable',
      title: '1. Responsable',
      paragraphs: [
        `El responsable del tratamiento es ${OPERATOR.legalName}, ${OPERATOR.docLabel} ${OPERATOR.docNumber}, quien opera ${OPERATOR.brand}. La administración de la plataforma es el área que atiende consultas y reclamos.`,
      ],
      bullets: [
        `Dirección: ${OPERATOR.address}, ${OPERATOR.city}.`,
        `Correo: ${OPERATOR.email}.`,
        `Teléfono: ${OPERATOR.phone}.`,
        `Canal de PQRS y habeas data: la página ${PQRS_PATH} de este sitio.`,
      ],
    },
    {
      id: 'datos',
      title: '2. Qué datos tratamos',
      bullets: [
        'Artistas (DJs): correo, usuario y contraseña (guardada con un algoritmo de un solo sentido), nombre artístico y el contenido de su página (textos, fotos, flyers, enlaces y fechas). También el registro de oferente: nombre o razón social, documento, dirección de notificaciones y teléfonos, que no se publica.',
        'Personas que aparecen en las fotos que sube un artista, como integrantes del grupo o público.',
        'Quien pide un booking: nombre, teléfono o WhatsApp, correo si lo das, ciudad, fecha y detalles del evento, y lo que escribas en el mensaje.',
        'Quien envía una PQRS o un reporte: nombre, correo, teléfono si lo das y el mensaje.',
        'Datos técnicos: la IP de quien envía un formulario se guarda solo como una huella cifrada (HMAC) para frenar el spam. Aun así la tratamos como dato personal. El servidor guarda registros técnicos por poco tiempo.',
        'Quien solo navega las páginas públicas: no lo identificamos ni usamos cookies de seguimiento.',
        'Datos sensibles: una foto en la que se reconoce a una persona puede serlo. Entregarlos es opcional y no usamos reconocimiento facial. Por favor no escribas datos sensibles ni datos de menores de edad en los formularios.',
      ],
    },
    {
      id: 'finalidades',
      title: '3. Para qué los usamos',
      bullets: [
        'Crear y administrar la cuenta del artista, revisar su página y publicarla. El artista decide publicarla en internet y puede despublicarla cuando quiera.',
        'Entregar cada solicitud de booking al artista elegido para que te contacte sobre ese evento.',
        'Abrir WhatsApp con un resumen de tu solicitud, si decides continuar por ese medio.',
        'Atender PQRS, reportes de contenido y solicitudes de habeas data.',
        'Entregar los datos de identificación de un artista a quien lo contrató y quiere presentar una queja, o a una autoridad (art. 53 de la Ley 1480 de 2011).',
        'Proteger la plataforma contra spam, abuso y fraude, y cumplir obligaciones legales.',
        'Enviar correos necesarios para el servicio: verificación de cuenta, recuperación de contraseña y avisos de cambios. No enviamos publicidad ni vendemos datos.',
      ],
    },
    {
      id: 'roles',
      title: '4. Quién responde por qué',
      bullets: [
        `${OPERATOR.brand} es responsable de la plataforma y de las bases de datos que la hacen funcionar.`,
        'Frente a las solicitudes de booking, la plataforma actúa como encargada: las recibe, las guarda y las entrega al artista elegido.',
        'Cada artista responde por el uso que haga de las solicitudes que recibe. Solo puede usarlas para responder esa solicitud, nunca para publicidad.',
      ],
    },
    {
      id: 'proveedores',
      title: '5. Con quién se comparten',
      paragraphs: ['No vendemos ni alquilamos datos personales. Solo los compartimos con:'],
      bullets: [
        'El artista al que va dirigida tu solicitud.',
        'Hostinger, que nos presta el servidor (VPS) donde viven la plataforma, la base de datos y los respaldos, y el servicio de correo. Actúa como encargado y puede alojar los datos fuera de Colombia. Al autorizar el tratamiento aceptas esta transmisión.',
        'Google (Google Drive), donde guardamos una copia de los respaldos para no perderlos si falla el servidor. La copia se cifra antes de salir del servidor y Google no puede leerla. Actúa como encargado y puede guardarla fuera de Colombia.',
        'WhatsApp (Meta), solo si tú decides abrirlo: el mensaje lo envías tú desde tu cuenta y Meta lo trata según sus propias políticas.',
        'Las autoridades, cuando la ley lo exija.',
      ],
    },
    {
      id: 'derechos',
      title: '6. Tus derechos',
      paragraphs: ['Según el art. 8 de la Ley 1581 de 2012, puedes:'],
      bullets: [
        'Conocer, actualizar y rectificar tus datos.',
        'Pedir prueba de la autorización que nos diste.',
        'Saber cómo hemos usado tus datos.',
        'Revocar la autorización y pedir que borremos tus datos, cuando no exista un deber legal o contractual de conservarlos.',
        'Consultar tus datos gratis, al menos una vez al mes y cada vez que cambie esta política.',
        'Presentar quejas ante la Superintendencia de Industria y Comercio (SIC), después de haber hecho tu consulta o reclamo ante nosotros.',
      ],
    },
    {
      id: 'procedimiento',
      title: '7. Cómo ejercerlos y en qué plazos',
      paragraphs: [
        `Escríbenos desde la página ${PQRS_PATH} o al correo ${OPERATOR.email}. Cuéntanos tu nombre, cómo contactarte y qué pides. Podemos pedirte que confirmes tu identidad antes de entregar o cambiar datos.`,
      ],
      bullets: [
        `Consultas: respondemos en máximo ${PQRS_DEADLINE_BUSINESS_DAYS.PQRS_CONSULTA} días hábiles. Si no alcanzamos, te explicamos por qué y respondemos dentro de los 5 días hábiles siguientes.`,
        `Reclamos (corregir, actualizar, borrar o revocar): máximo ${PQRS_DEADLINE_BUSINESS_DAYS.PQRS_RECLAMO} días hábiles, prorrogables hasta 8 días hábiles más con aviso. Si falta información te la pedimos dentro de los 5 días siguientes; si no la envías en 2 meses, entendemos que desististe.`,
        'Mientras un reclamo está en trámite, marcamos tus datos con la leyenda "reclamo en trámite".',
      ],
    },
    {
      id: 'conservacion',
      title: '8. Cuánto tiempo guardamos los datos',
      bullets: [
        `Solicitudes de booking: ${BOOKING_MONTHS} meses desde que se envían; después se borran.`,
        'Cuenta y página del artista: mientras la cuenta esté activa. Al cerrarla se borran; el registro de oferente se guarda hasta 12 meses más para atender posibles quejas.',
        `Cuentas y perfiles sin uso: si no confirmas tu correo en ${R.unverifiedUserDays} días, borramos la cuenta y lo que hayas empezado a armar. Un borrador sin cambios en ${R.draftIdleDays} días (te avisamos por correo a los ${R.draftWarnDays}) y un perfil rechazado sin cambios en ${R.rejectedIdleDays} días se borran con sus fotos y su registro de oferente, que nunca se publicó; tu cuenta no se borra.`,
        `Solicitudes marcadas como spam: ${R.spamDays} días.`,
        'PQRS y reportes: el tiempo necesario para atenderlos y poder demostrar que se atendieron.',
        'Respaldos (en el servidor y en la copia cifrada de Google Drive): las copias diarias duran 14 días y las semanales 8 semanas. Por eso un dato borrado puede tardar hasta 8 semanas en desaparecer de todos los respaldos.',
        'Registros técnicos del servidor: 14 días.',
      ],
    },
    {
      id: 'seguridad',
      title: '9. Seguridad',
      paragraphs: [
        'Usamos conexión cifrada (HTTPS), contraseñas guardadas con un algoritmo de un solo sentido, la IP solo como huella cifrada, acceso restringido por roles y respaldos periódicos. Ningún sistema es infalible: si ocurre un incidente que afecte tus datos, lo reportaremos a la SIC y te avisaremos cuando corresponda.',
      ],
    },
    {
      id: 'menores',
      title: '10. Menores de edad',
      paragraphs: [
        'La plataforma no está dirigida a menores de edad. Solo los mayores de 18 años pueden registrarse como artistas, y no se permite publicar fotos de menores. Si detectamos datos de un menor, los retiramos.',
      ],
    },
    {
      id: 'cookies',
      title: '11. Cookies',
      paragraphs: [
        'Solo usamos cookies esenciales: una cookie de sesión que mantiene iniciada la sesión de artistas y administradores. No usamos cookies de analítica ni de publicidad; por eso no mostramos un banner de cookies.',
        'Si en el futuro agregamos cookies de analítica o publicidad, te pediremos tu consentimiento antes de activarlas.',
      ],
    },
    {
      id: 'vigencia',
      title: '12. Cambios y vigencia',
      paragraphs: [
        `Esta política rige desde el 29 de septiembre de 2026 (versión ${LEGAL_DOCS.privacy.version}) y se mantiene mientras funcione la plataforma. Si hacemos un cambio importante lo avisaremos en esta página, y por correo a los artistas, antes de que aplique. Si cambia la finalidad del tratamiento, pediremos una nueva autorización.`,
      ],
    },
  ],
};

export default privacyDoc;
