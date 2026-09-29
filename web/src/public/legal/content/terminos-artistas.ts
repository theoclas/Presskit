// Términos para Artistas (DJs con cuenta). Se aceptan con la casilla del registro y se
// piden de nuevo cuando sube la versión en LEGAL_DOCS.artistTerms.
import { LEGAL_DOCS } from '@fersua/shared';
import { OPERATOR } from '../operator';
import type { LegalDoc } from '../types';

const PQRS_PATH = LEGAL_DOCS.pqrs.path;

export const artistTermsDoc: LegalDoc = {
  key: 'artistTerms',
  title: LEGAL_DOCS.artistTerms.title,
  version: LEGAL_DOCS.artistTerms.version,
  updatedAt: '2026-09-29',
  intro: [
    `Estos términos aplican a los DJs y artistas que crean una cuenta en ${OPERATOR.brand}. Los aceptas al marcar la casilla del registro. Complementan los ${LEGAL_DOCS.terms.title} (${LEGAL_DOCS.terms.path}) y la ${LEGAL_DOCS.privacy.title} (${LEGAL_DOCS.privacy.path}).`,
  ],
  sections: [
    {
      id: 'servicio',
      title: '1. Qué ofrece la plataforma',
      bullets: [
        'Una página pública con tu perfil, fotos, música, fechas y un formulario de booking.',
        `${OPERATOR.brand} es un portal de contacto: no cobra comisión por tus contrataciones, no fija tus precios, no recibe pagos y no firma contratos en tu nombre.`,
        'El contrato con cada cliente es entre tú y él. Tú respondes por el servicio, el precio, las garantías, el retracto cuando aplique y los demás deberes de ley frente a consumidores.',
      ],
    },
    {
      id: 'registro',
      title: '2. Registro y cuenta',
      bullets: [
        'Debes ser mayor de 18 años. Si detectamos que no lo eres, cerramos la cuenta.',
        'Un usuario corresponde a una sola cuenta de DJ o artista, con una sola página.',
        'La información que entregues debe ser veraz y estar actualizada.',
        'Cuida tu contraseña: respondes por lo que se haga con tu cuenta. Avísanos si sospechas un acceso indebido.',
      ],
    },
    {
      id: 'oferente',
      title: '3. Registro de oferente (datos legales)',
      bullets: [
        'Antes de que aprobemos tu página debes llenar la sección "Datos legales": nombre o razón social, tipo y número de documento, dirección de notificaciones y teléfonos. Sin este registro tu página no se publica.',
        'Estos datos no se publican. Solo los ve el administrador, y se entregan a quien te haya contratado y quiera presentar una queja, o a una autoridad, como lo exige el art. 53 de la Ley 1480 de 2011.',
        'Debes mantenerlos actualizados.',
      ],
    },
    {
      id: 'aprobacion',
      title: '4. Aprobación, rechazo y suspensión',
      bullets: [
        'Revisamos cada página antes de publicarla. Podemos pedirte cambios o rechazarla, explicándote el motivo.',
        'Podemos suspender o despublicar una página por información falsa, contenido prohibido, reportes fundados, mal uso de las solicitudes o falta del registro de oferente.',
        'Salvo casos urgentes (contenido ilegal o riesgo para terceros), te avisaremos antes y tendrás 5 días hábiles para responder.',
      ],
    },
    {
      id: 'contenido',
      title: '5. Tu contenido y la licencia',
      bullets: [
        'Sigues siendo el dueño de tu contenido: textos, fotos, flyers, logos y enlaces a tu música.',
        `Le das a ${OPERATOR.brand} una licencia gratuita y no exclusiva para alojarlo, adaptarlo técnicamente (tamaños y formatos) y mostrarlo en la plataforma y en las vistas previas cuando se comparte un enlace. Dura mientras esté publicado y el tiempo técnico necesario para borrarlo.`,
        'No es una cesión: no vendemos tu contenido ni lo usamos para publicidad de terceros.',
        'Garantizas que tienes los derechos sobre las fotos, flyers, logos y música enlazada, y la autorización de las personas que aparecen en ellos (integrantes, público y fotógrafos). Si alguien reclama por contenido que no tenías derecho a publicar, respondes tú frente a esa persona.',
      ],
    },
    {
      id: 'prohibido',
      title: '6. Contenido prohibido',
      bullets: [
        'Contenido de otros sin su autorización.',
        'Fotos de menores de edad.',
        'Contenido sexual, violento, discriminatorio o que incite al odio.',
        'Información falsa o engañosa, como hacerte pasar por otro artista o anunciar fechas que no existen.',
        'Datos personales de otras personas, como teléfonos o documentos.',
        'Enlaces a estafas, malware o sitios engañosos.',
      ],
    },
    {
      id: 'solicitudes',
      title: '7. Solicitudes que recibes',
      bullets: [
        'Los datos de quien te escribe solo puedes usarlos para responder esa solicitud y gestionar ese evento.',
        'No los uses para publicidad, no los vendas ni los compartas. Guárdalos de forma segura y bórralos cuando ya no los necesites.',
        'Tú respondes por el uso que hagas de esos datos.',
        `Si alguien te pide conocer, corregir o borrar sus datos, reenvíanos la solicitud por ${PQRS_PATH}.`,
      ],
    },
    {
      id: 'pagos',
      title: '8. Pagos',
      paragraphs: [
        `${OPERATOR.brand} no recibe, retiene ni procesa pagos entre tú y tus clientes. Anticipos, facturas, impuestos y cancelaciones los manejas directamente con ellos.`,
      ],
    },
    {
      id: 'reportes',
      title: '9. Reportes y retiro de contenido',
      bullets: [
        'Cualquier persona puede reportar una página en /reportar.',
        'Si un reporte parece fundado, podemos ocultar el contenido mientras lo revisamos. Te avisamos y puedes responder en 5 días hábiles.',
        'El contenido claramente ilegal, en especial si involucra menores, se retira de inmediato y se denuncia ante las autoridades.',
        `${OPERATOR.brand} no decide disputas de fondo sobre derechos de autor o de imagen; eso corresponde a las autoridades competentes.`,
      ],
    },
    {
      id: 'terminacion',
      title: '10. Terminación',
      bullets: [
        `Puedes cerrar tu cuenta cuando quieras, escribiéndonos por ${PQRS_PATH} o a ${OPERATOR.email}.`,
        'Al cerrarla se borran tu página, tus fotos y tus solicitudes. El registro de oferente se conserva hasta 12 meses para atender posibles quejas.',
        'Podemos cerrar una cuenta por incumplimiento grave o repetido de estos términos.',
      ],
    },
    {
      id: 'cambios',
      title: '11. Cambios en estos términos',
      paragraphs: [
        'Si estos términos cambian, publicaremos una nueva versión, te avisaremos por correo y en tu panel, y te pediremos aceptarla de nuevo al entrar. Si no la aceptas, puedes cerrar tu cuenta sin ningún costo.',
      ],
    },
    {
      id: 'ley',
      title: '12. Responsabilidad y ley aplicable',
      paragraphs: [
        `${OPERATOR.brand} no responde por el servicio que prestas ni por los acuerdos con tus clientes. Esto es sin perjuicio de su responsabilidad por dolo o culpa grave y de los derechos que la ley no permite renunciar.`,
        'Estos términos se rigen por las leyes de Colombia.',
      ],
    },
  ],
};

export default artistTermsDoc;
