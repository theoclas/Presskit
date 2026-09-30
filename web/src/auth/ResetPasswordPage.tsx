import { DEFAULT_PALETTE, LIMITS, type ResetPasswordInput } from '@fersua/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { apiError, endLocalSession, http } from '../lib/http';
import { usePalette } from '../lib/palette';
import { SITE_NAME, usePageTitle } from '../lib/usePageTitle';
import { AuthCard } from './AuthCard';
import { useAuth } from './AuthProvider';
import { useLinkToken, useNoReferrer } from './linkToken';
import { PasswordInput } from './PasswordInput';
import { checkNewPassword, passwordRules } from './passwordPolicy';
import './auth.css';

type Phase = 'form' | 'done' | 'invalid';
type Errors = Partial<Record<'new' | 'confirm', string>>;

// Solo los DJs recuperan por correo (el admin, por CLI en el VPS): la política es la de USER.
const POLICY = { username: '', role: 'USER' } as const;

/** /restablecer#t=<token>: contraseña nueva dos veces. El token vale 30 minutos y un solo uso. */
export function ResetPasswordPage() {
  usePalette(DEFAULT_PALETTE);
  usePageTitle(`Nueva contraseña · ${SITE_NAME}`);
  useNoReferrer();
  const token = useLinkToken();
  const { status } = useAuth();
  const [phase, setPhase] = useState<Phase>(token ? 'form' : 'invalid');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Sin el usuario no se puede comprobar "no contiene tu usuario": esa regla la revisa el api.
  const rules = passwordRules(pw, POLICY).filter((r) => r.key !== 'username');

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending || !token) return;
    setAlert(null);
    const errs: Errors = {};
    if (!pw) errs.new = 'Escribe la contraseña nueva.';
    else {
      const policy = checkNewPassword(pw, POLICY);
      if (policy) errs.new = policy;
    }
    if (!errs.new && confirm !== pw) errs.confirm = 'Las contraseñas no coinciden.';
    setErrors(errs);
    const first = (['new', 'confirm'] as const).find((k) => errs[k]);
    if (first) {
      document.getElementById(`rp-${first}`)?.focus();
      return;
    }
    setSending(true);
    try {
      await http.post('/auth/reset-password', { token, newPassword: pw } satisfies ResetPasswordInput);
      setPw('');
      setConfirm('');
      setPhase('done');
      // El api cerró todas las sesiones de la cuenta: si esta pestaña tenía una, ya no sirve.
      if (status === 'authenticated') endLocalSession();
    } catch (err) {
      const apiErr = apiError(err);
      if (apiErr.code === 'TOKEN_INVALID' || apiErr.details?.token) {
        setPw('');
        setConfirm('');
        setPhase('invalid');
      } else if (apiErr.code.startsWith('PASSWORD_') || apiErr.details?.newPassword) {
        setErrors({ new: apiErr.message || 'La contraseña nueva no cumple las reglas.' });
        document.getElementById('rp-new')?.focus();
      } else if (apiErr.code === 'RATE_LIMITED' || apiErr.statusCode === 429) {
        setAlert('Hiciste demasiados intentos. Espera un rato antes de volver a intentarlo.');
      } else if (apiErr.code === 'NETWORK' || apiErr.statusCode >= 500) {
        setAlert(apiErr.message);
      } else {
        setAlert('No pudimos cambiar tu contraseña. Pide un enlace nuevo e intenta otra vez.');
      }
    } finally {
      setSending(false);
    }
  };

  if (phase === 'done') {
    return (
      <AuthCard titleId="rp-title" title="Contraseña cambiada">
        <p className="auth-notice" role="status">
          Listo, tu contraseña quedó cambiada. Por seguridad cerramos tus sesiones abiertas en todos los equipos.
        </p>
        <div className="auth-actions">
          <Link className="btn btn-primary" to="/login">
            Ingresar
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (phase === 'invalid') {
    return (
      <AuthCard titleId="rp-title" title="Nueva contraseña">
        <p className="form-alert" role="alert">
          Este enlace no es válido o ya venció.
        </p>
        <p className="auth-sub">Los enlaces sirven una sola vez y vencen a los 30 minutos. Pide uno nuevo.</p>
        <div className="auth-actions">
          <Link className="btn btn-primary" to="/recuperar">
            Pedir un enlace nuevo
          </Link>
        </div>
      </AuthCard>
    );
  }

  const errId = (k: keyof Errors) => (errors[k] ? `rp-${k}-err` : undefined);

  return (
    <AuthCard titleId="rp-title" title="Nueva contraseña">
      <p className="auth-sub">Elige una contraseña nueva para tu cuenta. Al guardarla se cerrarán tus sesiones abiertas.</p>
      <form noValidate onSubmit={onSubmit}>
        <label htmlFor="rp-new">Contraseña nueva</label>
        <PasswordInput
          id="rp-new"
          name="new-password"
          autoComplete="new-password"
          maxLength={LIMITS.user.passwordMax}
          value={pw}
          onChange={setPw}
          invalid={!!errors.new}
          describedBy={['rp-rules', errId('new')].filter(Boolean).join(' ')}
        />
        {errors.new ? (
          <p className="field-error" id="rp-new-err">
            {errors.new}
          </p>
        ) : null}
        <ul className="pw-rules" id="rp-rules" aria-label="Requisitos de la contraseña">
          {rules.map((r) => (
            <li key={r.key} data-ok={r.ok}>
              {r.label}
            </li>
          ))}
          <li>No uses tu nombre de usuario</li>
        </ul>

        <label htmlFor="rp-confirm">Repite la contraseña nueva</label>
        <PasswordInput
          id="rp-confirm"
          name="confirm-password"
          autoComplete="new-password"
          maxLength={LIMITS.user.passwordMax}
          value={confirm}
          onChange={setConfirm}
          invalid={!!errors.confirm}
          describedBy={errId('confirm')}
        />
        {errors.confirm ? (
          <p className="field-error" id="rp-confirm-err">
            {errors.confirm}
          </p>
        ) : null}

        {alert ? (
          <p className="form-alert" role="alert">
            {alert}
          </p>
        ) : null}
        <div className="auth-actions">
          <button className="btn btn-primary" type="submit" disabled={sending} aria-busy={sending || undefined}>
            {sending ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </div>
      </form>
      <p className="auth-foot">
        <Link to="/login">Volver a ingresar</Link>
      </p>
    </AuthCard>
  );
}

export default ResetPasswordPage;
