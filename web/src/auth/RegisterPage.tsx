import {
  DEFAULT_PALETTE,
  LEGAL_DOCS,
  LIMITS,
  REGISTER_CONSENTS,
  normalizeEmail,
  normalizeUsername,
  type RegisterInput,
} from '@fersua/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { usePalette } from '../lib/palette';
import { RegisterPrivacyNotice } from '../public/legal/PrivacyNotice';
import { SITE_NAME, usePageTitle } from '../lib/usePageTitle';
import { AuthCard, AuthStatusCard } from './AuthCard';
import { useAuth } from './AuthProvider';
import { destinationAfterLogin } from './destinations';
import { PasswordInput } from './PasswordInput';
import { passwordRules } from './passwordPolicy';
import {
  EMPTY_REGISTER_VALUES,
  USERNAME_HINT,
  firstRegisterError,
  registerFailure,
  validateRegister,
  type RegisterErrors,
  type RegisterField,
  type RegisterValues,
} from './registerForm';
import { REGISTRATION_QUERY_KEY, useRegistrationStatus } from './registration';
import './auth.css';

const FIELD_ID: Record<RegisterField, string> = {
  username: 'reg-username',
  email: 'reg-email',
  password: 'reg-password',
  confirm: 'reg-confirm',
  acceptTerms: 'reg-terms',
  acceptPrivacy: 'reg-privacy',
  confirmAge: 'reg-age',
};

/** /registro: crear la cuenta de DJ (queda con sesión iniciada y va a /panel). */
export function RegisterPage() {
  usePalette(DEFAULT_PALETTE);
  usePageTitle(`Crear cuenta · ${SITE_NAME}`);
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const registration = useRegistrationStatus();

  // Con sesión (recién registrado o ya la tenía) se va a su área: el DJ a /panel.
  useEffect(() => {
    if (status === 'authenticated' && user) navigate(destinationAfterLogin(user, null), { replace: true });
  }, [status, user, navigate]);

  if (status !== 'anonymous') return <AuthStatusCard text={status === 'loading' ? 'Cargando…' : 'Entrando…'} />;
  if (registration.isPending) return <AuthStatusCard text="Cargando…" />;
  if (registration.isError) {
    return (
      <AuthCard titleId="reg-title" title="Crea tu cuenta">
        <p className="form-alert" role="alert">
          No pudimos cargar el registro. Revisa tu conexión e intenta de nuevo.
        </p>
        <div className="auth-actions">
          <button type="button" className="btn btn-primary" onClick={() => void registration.refetch()}>
            Reintentar
          </button>
        </div>
      </AuthCard>
    );
  }
  if (!registration.data.open) return <RegistrationClosed />;
  return <RegisterForm onClosed={() => queryClient.setQueryData(REGISTRATION_QUERY_KEY, { open: false })} />;
}

function RegistrationClosed() {
  return (
    <AuthCard titleId="reg-title" title="Crea tu cuenta">
      <p className="auth-notice" role="status">
        El registro está cerrado por ahora.
      </p>
      <p className="auth-sub">Si ya tienes una cuenta, ingresa con tu usuario y tu contraseña.</p>
      <div className="auth-actions">
        <Link className="btn btn-primary" to="/login">
          Ingresar
        </Link>
      </div>
      <p className="auth-foot">
        <Link to="/">Volver al inicio</Link>
      </p>
    </AuthCard>
  );
}

/** Texto de la casilla con el nombre del documento enlazado (se abre en otra pestaña). */
function ConsentText({ text, phrase, href, version }: { text: string; phrase: string; href: string; version: string }) {
  const at = text.indexOf(phrase);
  const link = (label: string): ReactNode => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
  return (
    <>
      {at < 0 ? (
        <>
          {text} {link(phrase)}
        </>
      ) : (
        <>
          {text.slice(0, at)}
          {link(phrase)}
          {text.slice(at + phrase.length)}
        </>
      )}{' '}
      <span className="consent-version">(versión {version})</span>
    </>
  );
}

function RegisterForm({ onClosed }: { onClosed: () => void }) {
  const { register } = useAuth();
  const [values, setValues] = useState<RegisterValues>(EMPTY_REGISTER_VALUES);
  const [hp, setHp] = useState('');
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [noSession, setNoSession] = useState(false);
  const [emailTaken, setEmailTaken] = useState(false);

  const username = normalizeUsername(values.username);
  const rules = passwordRules(values.password, { username, role: 'USER' });

  const set = <K extends RegisterField>(key: K, value: RegisterValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (key === 'email') setEmailTaken(false);
    // Al corregir un campo desaparece su error (el resto se revisa al enviar).
    setErrors((errs) => {
      if (!errs[key]) return errs;
      const next = { ...errs };
      delete next[key];
      return next;
    });
  };

  const focusField = (field: RegisterField) => document.getElementById(FIELD_ID[field])?.focus();

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending) return;
    setAlert(null);
    const errs = validateRegister(values);
    setErrors(errs);
    const first = firstRegisterError(errs);
    if (first) {
      focusField(first);
      return;
    }
    const body: RegisterInput = {
      username,
      email: normalizeEmail(values.email),
      password: values.password,
      acceptTerms: true,
      acceptPrivacy: true,
      confirmAge: true,
      ...(hp ? { hp_x7: hp } : {}),
    };
    setSending(true);
    try {
      const session = await register(body);
      // La contraseña no se queda en memoria más de lo necesario.
      setValues(EMPTY_REGISTER_VALUES);
      // Con sesión, RegisterPage navega a /panel cuando AuthProvider la marca.
      if (!session) setNoSession(true);
    } catch (err) {
      const f = registerFailure(err);
      if (f.kind === 'closed') {
        onClosed();
        return;
      }
      if (f.kind === 'field') {
        setErrors({ [f.field]: f.message });
        setEmailTaken(!!f.emailTaken);
        focusField(f.field);
      } else {
        setAlert(f.message);
      }
    } finally {
      setSending(false);
    }
  };

  if (noSession) {
    return (
      <AuthCard titleId="reg-title" title="Crea tu cuenta">
        <p className="auth-notice" role="status">
          Recibimos tu registro. Ingresa con tu usuario y tu contraseña.
        </p>
        <div className="auth-actions">
          <Link className="btn btn-primary" to="/login">
            Ingresar
          </Link>
        </div>
      </AuthCard>
    );
  }

  const errId = (k: RegisterField) => (errors[k] ? `${FIELD_ID[k]}-err` : undefined);
  const describedBy = (...ids: (string | undefined)[]) => ids.filter(Boolean).join(' ') || undefined;
  const fieldError = (k: RegisterField) =>
    errors[k] ? (
      <p className="field-error" id={`${FIELD_ID[k]}-err`}>
        {errors[k]}
      </p>
    ) : null;

  const consent = (
    key: 'acceptTerms' | 'acceptPrivacy' | 'confirmAge',
    name: string,
    text: ReactNode,
  ) => (
    <>
      <label className="consent" htmlFor={FIELD_ID[key]}>
        <input
          id={FIELD_ID[key]}
          type="checkbox"
          name={name}
          required
          checked={values[key]}
          aria-invalid={errors[key] ? true : undefined}
          aria-describedby={errId(key)}
          onChange={(e) => set(key, e.target.checked)}
        />
        <span>{text}</span>
      </label>
      {fieldError(key)}
    </>
  );

  return (
    <AuthCard titleId="reg-title" title="Crea tu cuenta">
      <p className="auth-sub">
        Crea tu cuenta de artista para armar tu página de booking. La revisamos antes de publicarla.
      </p>
      <form noValidate onSubmit={onSubmit}>
        <label htmlFor={FIELD_ID.username}>Usuario</label>
        <input
          id={FIELD_ID.username}
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={LIMITS.user.usernameMax}
          value={values.username}
          aria-invalid={errors.username ? true : undefined}
          aria-describedby={describedBy('reg-username-hint', errId('username'))}
          onChange={(e) => set('username', e.target.value.toLowerCase())}
        />
        <p className="auth-hint" id="reg-username-hint">
          {USERNAME_HINT}
        </p>
        {fieldError('username')}

        <label htmlFor={FIELD_ID.email}>Correo</label>
        <input
          id={FIELD_ID.email}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={LIMITS.user.emailMax}
          value={values.email}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describedBy('reg-email-hint', errId('email'))}
          onChange={(e) => set('email', e.target.value)}
        />
        <p className="auth-hint" id="reg-email-hint">
          Te enviaremos un enlace para confirmarlo. Sirve para recuperar tu contraseña y no se publica.
        </p>
        {fieldError('email')}
        {emailTaken && errors.email ? (
          <p className="auth-hint">
            <Link to="/login">Ingresar</Link> · <Link to="/recuperar">Recuperar mi contraseña</Link>
          </p>
        ) : null}

        <label htmlFor={FIELD_ID.password}>Contraseña</label>
        <PasswordInput
          id={FIELD_ID.password}
          name="new-password"
          autoComplete="new-password"
          maxLength={LIMITS.user.passwordMax}
          value={values.password}
          onChange={(v) => set('password', v)}
          invalid={!!errors.password}
          describedBy={describedBy('reg-rules', errId('password'))}
        />
        {fieldError('password')}
        <ul className="pw-rules" id="reg-rules" aria-label="Requisitos de la contraseña">
          {rules.map((r) => (
            <li key={r.key} data-ok={r.ok}>
              {r.label}
            </li>
          ))}
        </ul>

        <label htmlFor={FIELD_ID.confirm}>Repite la contraseña</label>
        <PasswordInput
          id={FIELD_ID.confirm}
          name="confirm-password"
          autoComplete="new-password"
          maxLength={LIMITS.user.passwordMax}
          value={values.confirm}
          onChange={(v) => set('confirm', v)}
          invalid={!!errors.confirm}
          describedBy={errId('confirm')}
        />
        {fieldError('confirm')}

        {/* Honeypot: los humanos no lo ven ni lo alcanzan con Tab. */}
        <div className="hp-field" aria-hidden="true">
          <label htmlFor="reg-hp_x7">No completes este campo</label>
          <input
            id="reg-hp_x7"
            type="text"
            name="hp_x7"
            tabIndex={-1}
            autoComplete="off"
            value={hp}
            onChange={(e) => setHp(e.target.value)}
          />
        </div>

        <RegisterPrivacyNotice />
        <div className="auth-consents">
          {consent(
            'acceptTerms',
            'acceptTerms',
            <ConsentText
              text={REGISTER_CONSENTS.terms}
              phrase={LEGAL_DOCS.artistTerms.title}
              href={LEGAL_DOCS.artistTerms.path}
              version={LEGAL_DOCS.artistTerms.version}
            />,
          )}
          {consent(
            'acceptPrivacy',
            'acceptPrivacy',
            <ConsentText
              text={REGISTER_CONSENTS.data}
              phrase={LEGAL_DOCS.privacy.title}
              href={LEGAL_DOCS.privacy.path}
              version={LEGAL_DOCS.privacy.version}
            />,
          )}
          {consent('confirmAge', 'confirmAge', REGISTER_CONSENTS.age)}
        </div>

        {alert ? (
          <p className="form-alert" role="alert">
            {alert}
          </p>
        ) : null}
        <div className="auth-actions">
          <button className="btn btn-primary" type="submit" disabled={sending} aria-busy={sending || undefined}>
            {sending ? 'Creando tu cuenta…' : 'Crear cuenta'}
          </button>
        </div>
      </form>
      <p className="auth-note">
        Solo usamos una cookie técnica para mantener tu sesión. <Link to="/privacidad#cookies">Cookies</Link>
      </p>
      <p className="auth-foot">
        ¿Ya tienes una cuenta? <Link to="/login">Ingresa</Link>
      </p>
    </AuthCard>
  );
}

export default RegisterPage;
