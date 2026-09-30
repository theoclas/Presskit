import { LEGAL_DOCS, LIMITS } from '@fersua/shared';
import { PlaceholderText } from '../components/PlaceholderText';
import { OPERATOR } from './operator';

// Aviso de privacidad breve junto a cada formulario público (D1377 art. 15; L1581 art. 12).
// Texto fijo de la plataforma: el DJ no lo puede editar ni ocultar. Los datos del responsable
// salen de OPERATOR y se resaltan mientras sigan como marcadores. Borrador: que lo confirme
// un abogado o Fernando al llenar los marcadores (docs/legal/README.md).

function responsible(): string {
  return `${OPERATOR.legalName} (${OPERATOR.docLabel} ${OPERATOR.docNumber}, ${OPERATOR.email}), responsable de ${OPERATOR.brand}`;
}

/** Enlaces normales (no <Link>): se abren en otra pestaña para no perder lo escrito. */
function RightsLinks() {
  return (
    <>
      Puedes conocer, actualizar, rectificar y suprimir tus datos y revocar la autorización en{' '}
      <a href={LEGAL_DOCS.pqrs.path} target="_blank" rel="noopener">
        PQRS y habeas data
      </a>
      . No incluyas datos sensibles ni de menores de edad.{' '}
      <a href={LEGAL_DOCS.privacy.path} target="_blank" rel="noopener">
        Política completa
      </a>
      .
    </>
  );
}

export function BookingPrivacyNotice({ displayName, opensWhatsapp }: { displayName: string; opensWhatsapp: boolean }) {
  const months = LIMITS.retention.bookingMonths;
  const text =
    `Aviso de privacidad: ${responsible()}, tratará los datos de esta solicitud solo para entregarla a ${displayName} ` +
    `y gestionar tu contacto sobre este evento. La guardamos hasta ${months} meses y la ven ${displayName} ` +
    'y el administrador de la plataforma. ' +
    (opensWhatsapp ? 'Si continúas, se abrirá WhatsApp (servicio de Meta) con un resumen que tú envías desde tu cuenta. ' : '');
  return (
    <p className="small privacy-notice">
      <PlaceholderText text={text} />
      <RightsLinks />
    </p>
  );
}

/**
 * Registro de artistas (/registro): para qué usamos los datos de la cuenta, en el momento de
 * autorizar (L1581 art. 12; D1377 art. 5), incluidos los borrados automáticos.
 */
export function RegisterPrivacyNotice() {
  const R = LIMITS.retention;
  const text =
    `Aviso de privacidad: ${responsible()}, usará tu usuario, tu correo y lo que publiques para crear y administrar tu cuenta, ` +
    'publicar tu página cuando la aprobemos, enviarte correos del servicio y, si alguien que te contrató presenta una queja, ' +
    'entregarle tu registro de oferente (art. 53 Ley 1480). Tu página no es pública hasta que la aprobemos. ' +
    `Si no confirmas tu correo en ${R.unverifiedUserDays} días, borramos la cuenta; un borrador sin cambios en ${R.draftIdleDays} días ` +
    `(te avisamos antes por correo) y un perfil rechazado sin cambios en ${R.rejectedIdleDays} días también se borran. `;
  return (
    <p className="small privacy-notice">
      <PlaceholderText text={text} />
      <RightsLinks />
    </p>
  );
}

export function TicketPrivacyNotice({ mode }: { mode: 'pqrs' | 'report' }) {
  const purpose = mode === 'report' ? 'revisar este reporte y responderte' : 'tramitar esta solicitud y responderte';
  const text =
    `Aviso de privacidad: ${responsible()}, usará estos datos solo para ${purpose} por correo. ` +
    'Los guardamos el tiempo necesario para atenderla y poder demostrar que se atendió. ';
  return (
    <p className="small privacy-notice">
      <PlaceholderText text={text} />
      <RightsLinks />
    </p>
  );
}
