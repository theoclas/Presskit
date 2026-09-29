import { DEFAULT_PALETTE, LIMITS, type SessionDto } from '@fersua/shared';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { http } from '../lib/http';
import { usePalette } from '../lib/palette';
import { SITE_NAME, usePageTitle } from '../lib/usePageTitle';
import { PublicShell } from '../public/layouts/PublicShell';
import { useAuth } from './AuthProvider';
import { changePasswordErrorMessage } from './changePasswordErrors';
import { destinationAfterLogin, homeFor } from './destinations';
import { PasswordInput } from './PasswordInput';
import { checkNewPassword, passwordRules } from './passwordPolicy';
import './auth.css';

type Errors = Partial<Record<'current' | 'new' | 'confirm', string>>;

/** /cambiar-clave: obligatoria con contraseña temporal; también sirve para cambiarla a voluntad. */
export function ChangePasswordPage() {
  usePalette(DEFAULT_PALETTE);
  usePageTitle(`Cambiar contraseña · ${SITE_NAME}`);
  const { status, user, setSession, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');

  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (status === 'loading') {
    return (
      <PublicShell>
        <section className="auth-card" aria-busy="true">
          <p className="auth-status" role="status">
            Cargando…
          </p>
        </section>
      </PublicShell>
    );
  }
  if (status !== 'authenticated' || !user) return <Navigate to="/login" replace />;

  const forced = user.mustChangePassword;
  const rules = passwordRules(pw, { username: user.username, role: user.role });

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending) return;
    setAlert(null);
    const errs: Errors = {};
    if (!current) errs.current = forced ? 'Escribe la contraseña temporal.' : 'Escribe tu contraseña actual.';
    const policy = checkNewPassword(pw, { username: user.username, role: user.role });
    if (policy) errs.new = policy;
    else if (pw === current) errs.new = 'La contraseña nueva debe ser distinta de la actual.';
    if (!errs.new && confirm !== pw) errs.confirm = 'Las contraseñas no coinciden.';
    setErrors(errs);
    const first = (['current', 'new', 'confirm'] as const).find((k) => errs[k]);
    if (first) {
      document.getElementById(`cp-${first}`)?.focus();
      return;
    }
    setSending(true);
    try {
      const { data } = await http.post<SessionDto>('/auth/change-password', { currentPassword: current, newPassword: pw });
      setCurrent('');
      setPw('');
      setConfirm('');
      setSession(data);
      navigate(destinationAfterLogin(data.user, next), { replace: true });
    } catch (err) {
      const m = changePasswordErrorMessage(err);
      setCurrent('');
      if (m.field) setErrors({ [m.field]: m.message });
      else setAlert(m.message);
    } finally {
      setSending(false);
    }
  };

  const errId = (k: keyof Errors) => (errors[k] ? `cp-${k}-err` : undefined);

  return (
    <PublicShell>
      <section className="auth-card" aria-labelledby="cp-title">
        <h1 id="cp-title" className="auth-title">
          {forced ? 'Crea tu contraseña' : 'Cambiar contraseña'}
        </h1>
        <p className="auth-sub">
          {forced
            ? 'Estás usando una contraseña temporal. Elige una nueva para continuar; solo tú la conocerás.'
            : 'Al cambiarla se cerrarán tus otras sesiones abiertas.'}
        </p>
        <form noValidate onSubmit={onSubmit}>
          {/* Para que el gestor de contraseñas asocie la nueva al usuario correcto. */}
          <input type="text" name="username" autoComplete="username" value={user.username} readOnly hidden />

          <label htmlFor="cp-current">{forced ? 'Contraseña temporal' : 'Contraseña actual'}</label>
          <PasswordInput
            id="cp-current"
            name="current-password"
            autoComplete="current-password"
            maxLength={LIMITS.user.passwordMax}
            value={current}
            onChange={setCurrent}
            invalid={!!errors.current}
            describedBy={errId('current')}
          />
          {errors.current ? (
            <p className="field-error" id="cp-current-err">
              {errors.current}
            </p>
          ) : null}

          <label htmlFor="cp-new">Contraseña nueva</label>
          <PasswordInput
            id="cp-new"
            name="new-password"
            autoComplete="new-password"
            maxLength={LIMITS.user.passwordMax}
            value={pw}
            onChange={setPw}
            invalid={!!errors.new}
            describedBy={['cp-rules', errId('new')].filter(Boolean).join(' ')}
          />
          {errors.new ? (
            <p className="field-error" id="cp-new-err">
              {errors.new}
            </p>
          ) : null}
          <ul className="pw-rules" id="cp-rules" aria-label="Requisitos de la contraseña">
            {rules.map((r) => (
              <li key={r.key} data-ok={r.ok}>
                {r.label}
              </li>
            ))}
          </ul>

          <label htmlFor="cp-confirm">Repite la contraseña nueva</label>
          <PasswordInput
            id="cp-confirm"
            name="confirm-password"
            autoComplete="new-password"
            maxLength={LIMITS.user.passwordMax}
            value={confirm}
            onChange={setConfirm}
            invalid={!!errors.confirm}
            describedBy={errId('confirm')}
          />
          {errors.confirm ? (
            <p className="field-error" id="cp-confirm-err">
              {errors.confirm}
            </p>
          ) : null}

          {alert ? (
            <p className="form-alert" role="alert">
              {alert}
            </p>
          ) : null}
          <div className="auth-actions">
            <button className="btn btn-primary" type="submit" disabled={sending}>
              {sending ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </div>
        </form>
        <p className="auth-foot">
          {forced ? (
            // Con clave temporal no hay a dónde volver; sí se puede salir (equipo compartido).
            <button
              type="button"
              className="link-btn"
              onClick={async () => {
                await logout();
                navigate('/login', { replace: true });
              }}
            >
              Cerrar sesión
            </button>
          ) : (
            <Link to={homeFor(user)}>Volver</Link>
          )}
        </p>
      </section>
    </PublicShell>
  );
}

export default ChangePasswordPage;
