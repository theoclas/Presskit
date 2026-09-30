import { DEFAULT_PALETTE, LIMITS } from '@fersua/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { apiError } from '../lib/http';
import { usePalette } from '../lib/palette';
import { SITE_NAME, usePageTitle } from '../lib/usePageTitle';
import { PublicShell } from '../public/layouts/PublicShell';
import { useAuth } from './AuthProvider';
import { destinationAfterLogin } from './destinations';
import { PasswordInput } from './PasswordInput';
import { useRegistrationStatus } from './registration';
import './auth.css';

const GENERIC_LOGIN_ERROR = 'Usuario o contraseña incorrectos';

function loginErrorMessage(e: unknown): string {
  const err = apiError(e);
  // Solo tras la contraseña correcta: pausa del 2FA por varios códigos malos (trae la hora).
  if (err.code === 'MFA_PAUSED') return err.message;
  if (err.code === 'RATE_LIMITED' || err.statusCode === 429) {
    return 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.';
  }
  // El api solo dice "suspendida" después de una contraseña correcta.
  if (err.code === 'ACCOUNT_SUSPENDED') return 'Tu cuenta está suspendida. Si crees que es un error, escríbenos.';
  // Igual, solo tras la contraseña correcta: el admin sin 2FA la configura en el servidor.
  if (err.code === 'MFA_SETUP_REQUIRED') return err.message;
  if (err.code === 'NETWORK') return err.message;
  if (err.statusCode >= 500) return 'El servidor no respondió bien. Intenta de nuevo en un momento.';
  // Cualquier otro fallo, el mismo mensaje: no revela si el usuario existe.
  return GENERIC_LOGIN_ERROR;
}

/** Códigos de recuperación: 'abcd efgh' o 'ABCDEFGH' -> 'ABCD-EFGH'. */
export function normalizeRecoveryCode(input: string): string {
  const compact = input.replace(/\s+/g, '').toUpperCase();
  const m = /^([A-Z0-9]{4})-?([A-Z0-9]{4})$/.exec(compact);
  return m ? `${m[1]}-${m[2]}` : compact;
}

type Step = { kind: 'password' } | { kind: 'mfa'; mfaToken: string };

export function LoginPage() {
  usePalette(DEFAULT_PALETTE);
  usePageTitle(`Ingresar · ${SITE_NAME}`);
  const { status, user, login, verifyMfa } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');

  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  // "Crea tu cuenta" solo si el registro está abierto (si la consulta falla, no se muestra).
  const registrationOpen = useRegistrationStatus().data?.open === true;

  // Con sesión (recién ingresó o ya la tenía) se va a su área; `next` pasa por isSafeNextPath.
  useEffect(() => {
    if (status === 'authenticated' && user) navigate(destinationAfterLogin(user, next), { replace: true });
  }, [status, user, next, navigate]);

  useEffect(() => {
    if (step.kind === 'mfa') codeRef.current?.focus();
  }, [step.kind, useRecovery]);

  const onPasswordSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending) return;
    setAlert(null);
    const u = username.trim();
    if (!u || !password) {
      setAlert('Escribe tu usuario y tu contraseña.');
      return;
    }
    setSending(true);
    try {
      const res = await login(u, password);
      // La contraseña no se queda en memoria más de lo necesario.
      setPassword('');
      if ('mfaRequired' in res) {
        setCode('');
        setUseRecovery(false);
        setStep({ kind: 'mfa', mfaToken: res.mfaToken });
      }
      // Sin 2FA: el efecto de arriba navega cuando AuthProvider marca la sesión.
    } catch (err) {
      setPassword('');
      setAlert(loginErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const onMfaSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending || step.kind !== 'mfa') return;
    setAlert(null);
    const value = useRecovery ? normalizeRecoveryCode(code) : code.replace(/\s+/g, '');
    if (useRecovery ? !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(value) : !/^\d{6}$/.test(value)) {
      setAlert(useRecovery ? 'El código de recuperación tiene el formato XXXX-XXXX.' : 'El código tiene 6 dígitos.');
      return;
    }
    setSending(true);
    try {
      await verifyMfa(step.mfaToken, value);
    } catch (err) {
      const apiErr = apiError(err);
      setCode('');
      if (apiErr.code === 'MFA_PAUSED') {
        // Varios códigos malos seguidos: el api pausa el 2FA un rato (menos en este navegador si ya entraste antes).
        setStep({ kind: 'password' });
        setAlert(apiErr.message);
      } else if (apiErr.code === 'AUTH_IN_PROGRESS') {
        // Doble envío: no es un código malo, el mismo código sigue sirviendo.
        setAlert('Estamos revisando otro intento. Espera un momento y vuelve a intentarlo.');
      } else if (apiErr.code === 'RATE_LIMITED' || apiErr.statusCode === 429) {
        setAlert('Demasiados intentos. Espera unos minutos antes de volver a intentarlo.');
      } else if (apiErr.code === 'NETWORK' || apiErr.statusCode >= 500) {
        setAlert(apiErr.message);
      } else if (/TOKEN|EXPIRED/.test(apiErr.code)) {
        // El paso de 2FA dura 5 minutos (o se agotaron sus 3 intentos): hay que volver a escribir la contraseña.
        setStep({ kind: 'password' });
        setAlert(apiErr.message || 'Se agotó el tiempo para escribir el código. Ingresa de nuevo.');
      } else {
        setAlert('El código no es correcto. Revisa tu app e intenta de nuevo.');
      }
    } finally {
      setSending(false);
    }
  };

  if (status === 'loading' || status === 'authenticated') {
    return (
      <PublicShell>
        <section className="auth-card" aria-busy="true">
          <p className="auth-status" role="status">
            {status === 'loading' ? 'Cargando…' : 'Entrando…'}
          </p>
        </section>
      </PublicShell>
    );
  }

  if (step.kind === 'mfa') {
    return (
      <PublicShell>
        <section className="auth-card" aria-labelledby="mfa-title">
          <h1 id="mfa-title" className="auth-title">
            Verificación
          </h1>
          <p className="auth-sub">
            {useRecovery
              ? 'Escribe uno de tus códigos de recuperación. Cada código sirve una sola vez.'
              : 'Escribe el código de 6 dígitos de tu app de autenticación.'}
          </p>
          <form noValidate onSubmit={onMfaSubmit}>
            {useRecovery ? (
              <>
                <label htmlFor="mfa-recovery">Código de recuperación</label>
                <input
                  ref={codeRef}
                  id="mfa-recovery"
                  name="recovery-code"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={9}
                  placeholder="XXXX-XXXX"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </>
            ) : (
              <>
                <label htmlFor="mfa-code">Código de 6 dígitos</label>
                <input
                  ref={codeRef}
                  id="mfa-code"
                  className="code-input"
                  name="one-time-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </>
            )}
            {alert ? (
              <p className="form-alert" role="alert">
                {alert}
              </p>
            ) : null}
            <div className="auth-actions">
              <button className="btn btn-primary" type="submit" disabled={sending}>
                {sending ? 'Verificando…' : 'Verificar'}
              </button>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setCode('');
                  setAlert(null);
                  setUseRecovery((v) => !v);
                }}
              >
                {useRecovery ? 'Usar el código de la app' : 'Usar un código de recuperación'}
              </button>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setCode('');
                  setAlert(null);
                  setStep({ kind: 'password' });
                }}
              >
                Volver
              </button>
            </div>
          </form>
        </section>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <section className="auth-card" aria-labelledby="login-title">
        <h1 id="login-title" className="auth-title">
          Ingresar
        </h1>
        <p className="auth-sub">Entra con tu usuario y tu contraseña de Fersua Studio.</p>
        <form noValidate onSubmit={onPasswordSubmit}>
          <label htmlFor="login-username">Usuario</label>
          <input
            id="login-username"
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={64}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <label htmlFor="login-password">Contraseña</label>
          <PasswordInput
            id="login-password"
            name="password"
            autoComplete="current-password"
            maxLength={LIMITS.user.passwordMax}
            value={password}
            onChange={setPassword}
          />
          {alert ? (
            <p className="form-alert" role="alert">
              {alert}
            </p>
          ) : null}
          <div className="auth-actions">
            <button className="btn btn-primary" type="submit" disabled={sending}>
              {sending ? 'Ingresando…' : 'Ingresar'}
            </button>
            <Link className="link-btn" to="/recuperar">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
        </form>
        {registrationOpen ? (
          <p className="auth-foot">
            ¿Todavía no tienes cuenta? <Link to="/registro">Crea tu cuenta</Link>
          </p>
        ) : null}
        <p className="auth-note">
          Solo usamos una cookie técnica para mantener tu sesión. <Link to="/privacidad#cookies">Cookies</Link>
        </p>
        <p className="auth-foot">
          <Link to="/">Volver al inicio</Link>
        </p>
      </section>
    </PublicShell>
  );
}

export default LoginPage;
