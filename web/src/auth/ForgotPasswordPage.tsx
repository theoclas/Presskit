import { DEFAULT_PALETTE, LIMITS, type ForgotPasswordInput } from '@fersua/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { apiError, http } from '../lib/http';
import { usePalette } from '../lib/palette';
import { SITE_NAME, usePageTitle } from '../lib/usePageTitle';
import { AuthCard } from './AuthCard';
import './auth.css';

/** Siempre el mismo texto, exista o no la cuenta: la página no revela qué usuarios hay. */
export const FORGOT_GENERIC_MESSAGE =
  'Si los datos coinciden con una cuenta, enviaremos un enlace al correo registrado. Revisa tu bandeja de entrada (y la de spam): el enlace vence en 30 minutos.';

const IDENTIFIER_MAX = Math.max(LIMITS.user.emailMax, LIMITS.user.usernameMax);

/** /recuperar: un solo campo, "Usuario o correo". */
export function ForgotPasswordPage() {
  usePalette(DEFAULT_PALETTE);
  usePageTitle(`Recuperar contraseña · ${SITE_NAME}`);
  const [identifier, setIdentifier] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending) return;
    setAlert(null);
    const value = identifier.trim();
    if (!value) {
      setFieldError('Escribe tu usuario o tu correo.');
      document.getElementById('fp-identifier')?.focus();
      return;
    }
    setFieldError(null);
    setSending(true);
    try {
      await http.post('/auth/forgot-password', { identifier: value } satisfies ForgotPasswordInput);
      setSent(true);
    } catch (err) {
      const apiErr = apiError(err);
      // Sin respuesta del servidor no se envió nada: decirlo. El límite por IP no revela
      // ninguna cuenta. Cualquier otra respuesta muestra el mismo mensaje genérico.
      if (apiErr.code === 'NETWORK') setAlert(apiErr.message);
      else if (apiErr.code === 'RATE_LIMITED' || apiErr.statusCode === 429) {
        setAlert('Hiciste demasiados intentos. Espera un rato antes de volver a intentarlo.');
      } else setSent(true);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <AuthCard titleId="fp-title" title="Revisa tu correo">
        <p className="auth-notice" role="status">
          {FORGOT_GENERIC_MESSAGE}
        </p>
        <div className="auth-actions">
          <Link className="btn btn-primary" to="/login">
            Volver a ingresar
          </Link>
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setSent(false);
              setIdentifier('');
            }}
          >
            Probar con otro usuario o correo
          </button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard titleId="fp-title" title="Recuperar contraseña">
      <p className="auth-sub">
        Escribe tu usuario o el correo de tu cuenta. Te enviaremos un enlace para crear una contraseña nueva.
      </p>
      <form noValidate onSubmit={onSubmit}>
        <label htmlFor="fp-identifier">Usuario o correo</label>
        <input
          id="fp-identifier"
          name="identifier"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={IDENTIFIER_MAX}
          value={identifier}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? 'fp-identifier-err' : undefined}
          onChange={(e) => {
            setIdentifier(e.target.value);
            if (fieldError) setFieldError(null);
          }}
        />
        {fieldError ? (
          <p className="field-error" id="fp-identifier-err">
            {fieldError}
          </p>
        ) : null}
        {alert ? (
          <p className="form-alert" role="alert">
            {alert}
          </p>
        ) : null}
        <div className="auth-actions">
          <button className="btn btn-primary" type="submit" disabled={sending} aria-busy={sending || undefined}>
            {sending ? 'Enviando…' : 'Enviar enlace'}
          </button>
        </div>
      </form>
      <p className="auth-foot">
        <Link to="/login">Volver a ingresar</Link>
      </p>
    </AuthCard>
  );
}

export default ForgotPasswordPage;
