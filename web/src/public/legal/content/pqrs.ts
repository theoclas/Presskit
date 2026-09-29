// Texto de la página /pqrs (va encima del formulario). Los plazos salen de shared para
// que coincidan con los vencimientos que calcula la api.
import { LEGAL_DOCS, PQRS_DEADLINE_BUSINESS_DAYS } from '@fersua/shared';
import { OPERATOR } from '../operator';
import type { LegalDoc } from '../types';

const D = PQRS_DEADLINE_BUSINESS_DAYS;

export const pqrsDoc: LegalDoc = {
  key: 'pqrs',
  title: LEGAL_DOCS.pqrs.title,
  version: LEGAL_DOCS.pqrs.version,
  updatedAt: '2026-09-29',
  intro: [
    'Aquí puedes enviarnos peticiones, quejas, reclamos y sugerencias (PQRS), ejercer tus derechos sobre tus datos personales (habeas data) o reportar contenido.',
  ],
  sections: [
    {
      id: 'tipos',
      title: '1. Qué puedes enviar',
      bullets: [
        'Consulta: preguntas sobre la plataforma o sobre qué datos tuyos tenemos.',
        'Reclamo: corregir, actualizar o borrar tus datos, revocar tu autorización o quejarte del funcionamiento de la plataforma.',
        'Solicitud de datos de un DJ: si contrataste a un DJ y quieres presentarle una queja, te entregamos sus datos de identificación (art. 53 de la Ley 1480 de 2011).',
        'Reporte de contenido: una página o foto que infringe derechos, es falsa o es ilegal. También puedes usar "Reportar este perfil" en cada página de DJ.',
      ],
    },
    {
      id: 'quejas-dj',
      title: '2. Quejas contra un DJ',
      paragraphs: [
        `Las quejas por el servicio de un DJ (precio, cumplimiento, calidad) se resuelven con el DJ, porque ${OPERATOR.brand} es solo un portal de contacto y no decide esas diferencias. Te entregamos sus datos para que puedas reclamarle, y también puedes acudir a la Superintendencia de Industria y Comercio (www.sic.gov.co).`,
      ],
    },
    {
      id: 'como',
      title: '3. Cómo presentarla',
      paragraphs: [`Usa el formulario de esta página o escribe a ${OPERATOR.email}. Incluye:`],
      bullets: [
        'Tu nombre y un correo para responderte (el teléfono es opcional).',
        'El tipo de solicitud y qué pides, con los hechos que la explican.',
        'Si es sobre un DJ, el nombre o el enlace de su página.',
        'Si es sobre una solicitud de booking que enviaste, la fecha aproximada en que la enviaste.',
      ],
    },
    {
      id: 'identidad',
      title: '4. Verificación',
      paragraphs: [
        'Antes de entregar o cambiar datos personales podemos pedirte que confirmes tu identidad. Si actúas en nombre de otra persona, debes demostrar que la representas.',
      ],
    },
    {
      id: 'plazos',
      title: '5. Plazos de respuesta',
      paragraphs: ['Contamos días hábiles desde que recibimos tu solicitud completa.'],
      bullets: [
        `Consultas: ${D.PQRS_CONSULTA} días hábiles, prorrogables 5 más con aviso.`,
        `Reclamos: ${D.PQRS_RECLAMO} días hábiles, prorrogables 8 más con aviso. Si falta información te la pedimos dentro de 5 días; si no llega en 2 meses, entendemos que desististe.`,
        `Solicitud de datos de un DJ: ${D.SOLICITUD_DATOS_DJ} días hábiles.`,
        `Reportes de contenido: ${D.REPORTE_PERFIL} días hábiles. Si es urgente (contenido ilegal o con menores), lo retiramos de inmediato.`,
      ],
    },
    {
      id: 'despues',
      title: '6. Qué pasa después',
      bullets: [
        'Al enviar el formulario recibes un número de radicado y la fecha límite de respuesta.',
        'Revisamos tu caso, te pedimos más información si hace falta y te respondemos al correo que nos diste.',
        'Si es un reclamo sobre tus datos, los marcamos como "reclamo en trámite" mientras lo resolvemos.',
        'Si no quedas conforme con la respuesta, puedes presentar una queja ante la SIC.',
      ],
    },
    {
      id: 'contacto',
      title: '7. Datos de contacto',
      bullets: [
        `Responsable: ${OPERATOR.legalName}, ${OPERATOR.docLabel} ${OPERATOR.docNumber}.`,
        `Correo: ${OPERATOR.email}.`,
        `Dirección: ${OPERATOR.address}, ${OPERATOR.city}.`,
        `Teléfono: ${OPERATOR.phone}.`,
      ],
    },
  ],
};

export default pqrsDoc;
