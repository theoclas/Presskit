import { DEFAULT_PALETTE, type VerifyEmailInput } from '@fersua/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { apiError, http } from '../lib/http';
import { usePalette } from '../lib/palette';
import { SITE_NAME, usePageTitle } from '../lib/usePageTitle';
import { AuthCard } from './AuthCard';
import { useAuth } from './AuthProvider';
import { useLinkToken, useNoReferrer } from './linkToken';
import './auth.css';

type Phase = 'ready' | 'sending' | 'done' | 'invalid';

/**
 * /verificar-correo#t=<token>. Pide un clic explícito en "Confirmar mi correo": los escáneres
 * de los correos abren los enlaces (y hasta ejecutan JS) y no deben confirmar la cuenta solos.
 */
export function VerifyEmailPage() {
  usePalette(DEFAULT_PALETTE);
  usePageTitle(`Confirmar correo · ${SITE_NAME}`);
  useNoReferrer();
  const token = useLinkToken();
  const { status, refreshMe } = useAuth();
  const [phase, setPhase] = useState<Phase>(token ? 'ready' : 'invalid');
  const [alert, setAlert] = useState<string | null>(null);

  const confirm = async () => {
    if (!token || phase !== 'ready') return;
    setAlert(null);
    setPhase('sending');
    try {
      await http.post('/auth/verify-email', { token } satisfies VerifyEmailInput);
      setPhase('done');
      // Si tiene la sesión abierta en este navegador, el panel ve el correo ya confirmado.
      if (status === 'authenticated') refreshMe().catch(() => undefined);
    } catch (err) {
      const e = apiError(err);
      if (e.code === 'TOKEN_INVALID' || e.statusCode === 400) {
        setPhase('invalid');
        return;
      }
      setPhase('ready');
      if (e.code === 'RATE_LIMITED' || e.statusCode === 429) {
        setAlert('Hiciste demasiados intentos. Espera un rato antes de volver a intentarlo.');
      } else if (e.code === 'NETWORK' || e.statusCode >= 500) {
        setAlert(e.message);
      } else {
        setAlert('No pudimos confirmar tu correo. Intenta de nuevo en un momento.');
      }
    }
  };

  if (phase === 'done') {
    return (
      <AuthCard titleId="ve-title" title="Correo confirmado">
        <p className="auth-notice" role="status">
          ¡Listo! Tu correo quedó confirmado.
        </p>
        <p className="auth-sub">Ya puedes subir fotos y enviar tu página a revisión desde tu panel.</p>
        <div className="auth-actions">
          <Link className="btn btn-primary" to="/panel">
            Ir a mi panel
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (phase === 'invalid') {
    return (
      <AuthCard titleId="ve-title" title="Confirma tu correo">
        <p className="form-alert" role="alert">
          Este enlace no es válido, ya se usó o venció.
        </p>
        <p className="auth-sub">Desde tu panel puedes pedir un enlace nuevo. Llega a tu correo y vale 48 horas.</p>
        <div className="auth-actions">
          <Link className="btn btn-primary" to="/panel">
            Ir a mi panel
          </Link>
        </div>
      </AuthCard>
    );
  }

  const sending = phase === 'sending';
  return (
    <AuthCard titleId="ve-title" title="Confirma tu correo">
      <p className="auth-sub">Toca el botón para confirmar que este correo es tuyo.</p>
      {alert ? (
        <p className="form-alert" role="alert">
          {alert}
        </p>
      ) : null}
      <div className="auth-actions">
        <button type="button" className="btn btn-primary" disabled={sending} aria-busy={sending || undefined} onClick={confirm}>
          {sending ? 'Confirmando…' : 'Confirmar mi correo'}
        </button>
      </div>
      <p className="auth-foot">
        <Link to="/panel">Ir a mi panel</Link>
      </p>
    </AuthCard>
  );
}

export default VerifyEmailPage;
