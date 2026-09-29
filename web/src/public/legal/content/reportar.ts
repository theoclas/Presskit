// Texto corto de la página /reportar (?perfil=<slug>). No es un LegalDoc versionado:
// solo explica qué pasa con el reporte, encima del formulario.
import { PQRS_DEADLINE_BUSINESS_DAYS } from '@fersua/shared';
import type { LegalSection } from '../types';

export interface ReportPageContent {
  title: string;
  intro: string[];
  sections: LegalSection[];
}

export const reportPage: ReportPageContent = {
  title: 'Reportar contenido',
  intro: [
    'Si una página o una foto infringe tus derechos (por ejemplo, usa tu imagen o tu trabajo sin permiso), suplanta a alguien, es falsa o es ilegal, cuéntanos.',
  ],
  sections: [
    {
      id: 'que-incluir',
      title: 'Qué incluir',
      bullets: [
        'El perfil o la foto que reportas.',
        'Por qué lo reportas y, si reclamas un derecho propio, cómo se relaciona contigo.',
        'Tu nombre y un correo para responderte.',
      ],
    },
    {
      id: 'que-pasa',
      title: 'Qué pasa después',
      bullets: [
        `Revisamos el reporte en máximo ${PQRS_DEADLINE_BUSINESS_DAYS.REPORTE_PERFIL} días hábiles y te respondemos al correo que nos diste.`,
        'Si parece fundado, podemos ocultar el contenido mientras el artista responde.',
        'El contenido claramente ilegal, en especial si involucra menores, se retira de inmediato y se denuncia.',
        'No decidimos disputas de fondo sobre derechos de autor o de imagen; eso corresponde a las autoridades competentes.',
      ],
    },
  ],
};

export default reportPage;
