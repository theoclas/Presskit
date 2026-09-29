// Términos y Condiciones de Uso para visitantes. Punto clave: Fersua es un portal de
// contacto (art. 53 de la Ley 1480 de 2011). Nada de exclusiones absolutas de
// responsabilidad: serían nulas por el art. 43 de la misma ley.
import { CONTACT_PORTAL_NOTICE, LEGAL_DOCS, LIMITS } from '@fersua/shared';
import { OPERATOR } from '../operator';
import type { LegalDoc } from '../types';

const PQRS_PATH = LEGAL_DOCS.pqrs.path;

export const termsDoc: LegalDoc = {
  key: 'terms',
  title: LEGAL_DOCS.terms.title,
  version: LEGAL_DOCS.terms.version,
  updatedAt: '2026-09-29',
  intro: [
    `Estos términos aplican a quien visita ${OPERATOR.brand} o envía una solicitud de booking. Léelos antes de usar los formularios. Tus datos personales se tratan según la ${LEGAL_DOCS.privacy.title} (${LEGAL_DOCS.privacy.path}).`,
  ],
  sections: [
    {
      id: 'que-es',
      title: '1. Qué es Fersua Studio',
      paragraphs: [
        `${OPERATOR.brand} es una plataforma, operada por ${OPERATOR.legalName} (${OPERATOR.docLabel} ${OPERATOR.docNumber}), donde DJs y artistas publican su página y reciben solicitudes de booking.`,
      ],
    },
    {
      id: 'portal',
      title: '2. Somos un portal de contacto',
      paragraphs: [CONTACT_PORTAL_NOTICE],
      bullets: [
        'Tampoco fija los precios de los DJs ni firma contratos en su nombre.',
        'El contrato (precio, fecha, condiciones, anticipos y cancelaciones) lo acuerdas directamente con el DJ.',
        'Tus derechos como consumidor (información, calidad, garantía y retracto cuando aplique) los ejerces frente al DJ.',
        `Cada DJ registra en privado sus datos de identificación: nombre o razón social, documento, dirección y teléfono. Si contrataste a un DJ y quieres presentarle una queja, pídelos en ${PQRS_PATH} y te los entregamos, como lo exige el art. 53 de la Ley 1480 de 2011.`,
        'Fersua Studio no decide las diferencias entre tú y el DJ. Puedes acudir a la Superintendencia de Industria y Comercio (www.sic.gov.co).',
      ],
    },
    {
      id: 'solicitudes',
      title: '3. Solicitudes de booking',
      bullets: [
        `Lo que envías llega al DJ elegido y al administrador de la plataforma, y se guarda hasta ${LIMITS.retention.bookingMonths} meses.`,
        'Enviar una solicitud no es una reserva: el DJ decide si responde y en qué condiciones.',
        'Si decides continuar por WhatsApp, se abre la aplicación de Meta con un resumen que tú envías desde tu cuenta.',
        'Da información veraz. No incluyas datos de otras personas sin su permiso, ni datos sensibles o de menores de edad.',
        'Debes ser mayor de edad y, si escribes a nombre de una empresa, tener autorización para hacerlo.',
      ],
    },
    {
      id: 'uso',
      title: '4. Uso aceptable',
      paragraphs: ['No está permitido:'],
      bullets: [
        'Enviar spam, solicitudes falsas o hacerte pasar por otra persona.',
        'Intentar vulnerar la seguridad de la plataforma, automatizar envíos o extraer datos de forma masiva.',
        'Usar los datos o el contenido de los DJs para fines distintos a contactarlos.',
        'Usar la plataforma para cualquier fin ilegal.',
      ],
    },
    {
      id: 'propiedad',
      title: '5. Propiedad intelectual',
      paragraphs: [
        `La marca, el diseño y el código de ${OPERATOR.brand} pertenecen a su titular. Las fotos, logos, textos y la música enlazada en cada página son de sus DJs o de terceros: no los copies ni los uses sin su permiso.`,
        'Si crees que un contenido infringe tus derechos, repórtalo en /reportar.',
      ],
    },
    {
      id: 'responsabilidad',
      title: '6. Responsabilidad',
      bullets: [
        'Hacemos lo razonable para mantener la plataforma disponible y segura, pero puede tener interrupciones o fallas.',
        'La información de cada página la publica su DJ, que responde por su exactitud y por el servicio que presta.',
        'Los enlaces a sitios de terceros (redes sociales, plataformas de música, WhatsApp) se rigen por sus propias condiciones.',
        `Lo anterior es sin perjuicio de las obligaciones legales de ${OPERATOR.brand} como portal de contacto y de su responsabilidad por dolo o culpa grave. Nada de estos términos limita los derechos que te da la ley.`,
      ],
    },
    {
      id: 'cambios',
      title: '7. Cambios',
      paragraphs: [
        'Podemos actualizar estos términos. La nueva versión se publica en esta página con su fecha. Lo que ya enviaste se rige por la versión vigente cuando lo enviaste.',
      ],
    },
    {
      id: 'ley',
      title: '8. Ley aplicable y contacto',
      paragraphs: [
        'Estos términos se rigen por las leyes de Colombia. Cualquier controversia se resolverá ante los jueces competentes según la ley colombiana, sin perjuicio de tu derecho a acudir a la SIC.',
        `Contacto: ${OPERATOR.email} o la página ${PQRS_PATH}.`,
      ],
    },
  ],
};

export default termsDoc;
