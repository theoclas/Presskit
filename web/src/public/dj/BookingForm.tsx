import {
  BOOKING_CONSENT_TEXT,
  BOOKING_ERROR_MESSAGES,
  CONTACT_PORTAL_NOTICE,
  LEGAL_DOCS,
  LIMITS,
  bookingDateRange,
  todayBogota,
  validateBookingSubmission,
  type BookingFieldError,
  type BookingSubmitResultDto,
  type PageTexts,
  type ResolvedFormField,
} from '@fersua/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ApiError, publicApi } from '../../lib/publicApi';
import { safeHttpsUrl } from '../../lib/safeUrl';
import { useFormToken } from '../../lib/useFormToken';
import { isWhatsappUrl, openWhatsApp } from '../../lib/whatsapp';
import { BookingPrivacyNotice } from '../legal/PrivacyNotice';
import { BookingField, fieldId } from './BookingField';

export interface BookingFormProps {
  slug: string;
  /** Para el aviso de privacidad ("…solo para entregarla a {displayName}"). */
  displayName: string;
  fields: ResolvedFormField[];
  texts: PageTexts;
  consentText?: string | null;
  privacyUrl?: string | null;
  portalNotice?: string | null;
  /** URL wa.me del botón "Hablar por WhatsApp" (la arma el api). */
  whatsappUrl?: string | null;
  /** En la vista previa del editor el formulario no se envía. */
  preview?: boolean;
}

const CONSENT_ID = 'bf-consent';
const CONSENT_REQUIRED = 'Debes autorizar el tratamiento de tus datos para enviar la solicitud.';
const PRIVACY_PHRASE = 'Política de Tratamiento de Datos Personales';
// El token vale 2 h en el servidor; se renueva antes para no fallar justo al enviar.
const TOKEN_REFRESH_MS = LIMITS.booking.tokenMaxAgeMs - 15 * 60 * 1000;

const FIELD_MESSAGE: Record<string, string> = BOOKING_ERROR_MESSAGES;

function fieldMessage(code: string): string {
  return FIELD_MESSAGE[code] ?? 'Revisa este campo.';
}

/** Solo rutas internas (/privacidad) o https: el enlace de la política nunca puede ser otra cosa. */
function resolvePrivacyUrl(url: string | null | undefined): string {
  if (url && /^\/[a-z0-9-]{1,40}$/.test(url)) return url;
  return safeHttpsUrl(url) ?? LEGAL_DOCS.privacy.path;
}

function ConsentText({ text, href }: { text: string; href: string }) {
  const at = text.indexOf(PRIVACY_PHRASE);
  const link = (label: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
  if (at < 0) {
    return (
      <>
        {text} {link('Ver política de datos')}
      </>
    );
  }
  return (
    <>
      {text.slice(0, at)}
      {link(PRIVACY_PHRASE)}
      {text.slice(at + PRIVACY_PHRASE.length)}
    </>
  );
}

type Status = 'idle' | 'sending' | 'done';

export function BookingForm({
  slug,
  displayName,
  fields,
  texts,
  consentText,
  privacyUrl,
  portalNotice,
  whatsappUrl,
  preview = false,
}: BookingFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<BookingSubmitResultDto | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  const dateRange = useMemo(() => bookingDateRange(todayBogota()), []);
  const fieldKeys = useMemo(() => new Set(fields.map((f) => f.key)), [fields]);

  const fetchToken = useCallback(() => publicApi.getBookingToken(slug).then(({ token }) => token), [slug]);
  const formToken = useFormToken({ formRef, fetchToken, refreshMs: TOKEN_REFRESH_MS, enabled: !preview });
  const { ensureToken } = formToken;

  useEffect(() => {
    if (status === 'done') successRef.current?.focus();
  }, [status]);

  const setValue = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const focusFirstError = (errs: Record<string, string>) => {
    const first = fields.find((f) => errs[f.key]);
    const id = first ? fieldId(first.key) : errs.consent ? CONSENT_ID : null;
    if (id) document.getElementById(id)?.focus();
  };

  // El DJ puede renombrar el botón: los avisos citan el texto que el visitante ve.
  const submitLabel = `«${texts.bookingSubmit}»`;

  const handleApiError = (err: unknown) => {
    if (!(err instanceof ApiError)) {
      setAlert({ kind: 'error', text: 'Ocurrió un error inesperado. Intenta de nuevo.' });
      return;
    }
    switch (err.code) {
      case 'FORM_TOO_FAST':
        setAlert({ kind: 'info', text: `Espera un segundo y vuelve a presionar ${submitLabel}.` });
        return;
      case 'FORM_EXPIRED':
      case 'FORM_TOKEN_USED':
      case 'FORM_TOKEN_INVALID':
        formToken.renew();
        setAlert({ kind: 'info', text: `El formulario se renovó. Vuelve a presionar ${submitLabel}.` });
        return;
      default:
        break;
    }
    if (err.statusCode === 429 || err.code === 'RATE_LIMITED') {
      setAlert({ kind: 'error', text: 'Has enviado varias solicitudes seguidas. Intenta de nuevo en unos minutos.' });
      return;
    }
    if (err.isNetwork) {
      // El token no se gastó: los datos siguen en el formulario y basta con volver a enviar.
      setAlert({ kind: 'error', text: `${err.message} Tus datos siguen aquí: vuelve a presionar ${submitLabel}.` });
      return;
    }
    formToken.renew();
    const fieldErrors: Record<string, string> = {};
    for (const [key, code] of Object.entries(err.details ?? {})) {
      if (fieldKeys.has(key)) fieldErrors[key] = fieldMessage(code);
      else if (key === 'consent') fieldErrors.consent = CONSENT_REQUIRED;
    }
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      setAlert({ kind: 'error', text: 'Revisa los campos marcados.' });
      focusFirstError(fieldErrors);
      return;
    }
    setAlert({ kind: 'error', text: err.message || 'No se pudo enviar la solicitud. Intenta de nuevo.' });
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status === 'sending') return;
    setAlert(null);

    const payload: Record<string, string> = {};
    for (const f of fields) {
      const v = (values[f.key] ?? '').trim();
      if (v) payload[f.key] = v;
    }
    // Misma validación que el servidor (que sigue siendo la autoridad).
    const check = validateBookingSubmission(fields, payload, todayBogota());
    const errs: Record<string, string> = {};
    for (const [key, code] of Object.entries(check.errors)) errs[key] = BOOKING_ERROR_MESSAGES[code as BookingFieldError];
    if (!consent) errs.consent = CONSENT_REQUIRED;
    setErrors(errs);
    if (Object.keys(errs).length) {
      setAlert({ kind: 'error', text: 'Revisa los campos marcados.' });
      focusFirstError(errs);
      return;
    }
    if (preview) {
      setAlert({ kind: 'info', text: 'Vista previa: el formulario no se envía.' });
      return;
    }

    setStatus('sending');
    try {
      const token = await ensureToken();
      const res = await publicApi.submitBooking(slug, {
        fields: payload,
        consent: true,
        token,
        ...(hp ? { hp_x7: hp } : {}),
      });
      formToken.discard();
      setResult(res);
      setStatus('done');
      if (res.whatsappUrl) openWhatsApp(res.whatsappUrl);
    } catch (err) {
      setStatus('idle');
      handleApiError(err);
    }
  };

  if (status === 'done' && result) {
    const wa = isWhatsappUrl(result.whatsappUrl) ? result.whatsappUrl : null;
    return (
      <div className="booking-success" role="status" tabIndex={-1} ref={successRef}>
        <p>{wa ? texts.bookingSuccess : 'Tu solicitud fue enviada. Te contactaremos pronto.'}</p>
        {wa ? (
          <a className="btn btn-primary" href={wa} target="_blank" rel="noopener noreferrer">
            Abrir WhatsApp
          </a>
        ) : null}
      </div>
    );
  }

  const bookingWa = isWhatsappUrl(whatsappUrl) ? whatsappUrl : null;
  const sending = status === 'sending';

  return (
    <form
      id="booking-form"
      ref={formRef}
      noValidate
      onSubmit={onSubmit}
      onFocus={preview ? undefined : () => void ensureToken().catch(() => undefined)}
      aria-describedby="bf-legend"
    >
      {fields.map((f) => (
        <BookingField
          key={f.key}
          field={f}
          value={values[f.key] ?? ''}
          error={errors[f.key]}
          dateRange={dateRange}
          onChange={setValue}
        />
      ))}

      {/* Honeypot: los humanos no lo ven ni lo alcanzan con Tab. */}
      <div className="hp-field" aria-hidden="true">
        <label htmlFor="bf-hp_x7">No completes este campo</label>
        <input
          id="bf-hp_x7"
          type="text"
          name="hp_x7"
          tabIndex={-1}
          autoComplete="off"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
        />
      </div>

      <label className="consent" htmlFor={CONSENT_ID}>
        <input
          id={CONSENT_ID}
          type="checkbox"
          name="consent"
          required
          checked={consent}
          aria-invalid={errors.consent ? true : undefined}
          aria-describedby={errors.consent ? `${CONSENT_ID}-err` : undefined}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (e.target.checked) setErrors(({ consent: _drop, ...rest }) => rest);
          }}
        />
        <span>
          <ConsentText text={consentText || BOOKING_CONSENT_TEXT} href={resolvePrivacyUrl(privacyUrl)} />
        </span>
      </label>
      {errors.consent ? (
        <p className="field-error" id={`${CONSENT_ID}-err`}>
          {errors.consent}
        </p>
      ) : null}

      <div className="form-footer">
        <button className="btn btn-primary" type="submit" disabled={sending} aria-busy={sending || undefined}>
          {sending ? 'Enviando…' : texts.bookingSubmit}
        </button>
        {bookingWa ? (
          <a className="btn btn-secondary" href={bookingWa} target="_blank" rel="noopener noreferrer">
            {texts.bookingWhatsappButton}
          </a>
        ) : null}
      </div>

      <div aria-live="polite">
        {alert ? (
          <p className={alert.kind === 'info' ? 'form-alert form-alert--info' : 'form-alert'} role={alert.kind === 'error' ? 'alert' : undefined}>
            {alert.text}
          </p>
        ) : null}
      </div>

      {texts.bookingDisclaimer ? <p className="small">{texts.bookingDisclaimer}</p> : null}
      <p className="small">{portalNotice || CONTACT_PORTAL_NOTICE}</p>
      <BookingPrivacyNotice displayName={displayName} opensWhatsapp={!!bookingWa} />
      <p className="small legend" id="bf-legend">
        Los campos con * son obligatorios.
      </p>
    </form>
  );
}
