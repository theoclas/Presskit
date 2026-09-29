import {
  LEGAL_DOCS,
  LIMITS,
  SLUG_RE,
  cleanText,
  formatLongDate,
  isValidDateOnly,
  isValidEmail,
  isValidPhone,
  type TicketSubmitResultDto,
  type TicketType,
} from '@fersua/shared';
import { useState, type FormEvent } from 'react';
import { ApiError, publicApi } from '../../lib/publicApi';
import { TicketPrivacyNotice } from './PrivacyNotice';

type PqrsType = Extract<TicketType, 'PQRS_CONSULTA' | 'PQRS_RECLAMO' | 'SOLICITUD_DATOS_DJ'>;

const PQRS_TYPES: { value: PqrsType; label: string }[] = [
  { value: 'PQRS_CONSULTA', label: 'Consulta sobre mis datos personales' },
  { value: 'PQRS_RECLAMO', label: 'Reclamo: actualizar, corregir o suprimir mis datos' },
  { value: 'SOLICITUD_DATOS_DJ', label: 'Solicitud de datos de un DJ para presentar una queja' },
];

interface Props {
  /** 'pqrs' deja elegir el tipo; 'report' es siempre REPORTE_PERFIL. */
  mode: 'pqrs' | 'report';
  initialSlug?: string;
}

type Values = { type: TicketType; name: string; email: string; phone: string; profileSlug: string; subject: string; message: string };

/** Fecha límite legible; el api puede mandar 'YYYY-MM-DD' o un ISO completo. */
function formatDue(due: string): string {
  if (isValidDateOnly(due)) return formatLongDate(due);
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return due;
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long' }).format(d);
}

function validate(v: Values, needsSlug: boolean, consent: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  const name = cleanText(v.name);
  if (!name) e.name = 'Escribe tu nombre.';
  else if ([...name].length > LIMITS.ticket.nameMax) e.name = 'El nombre es demasiado largo.';
  if (!isValidEmail(v.email.trim())) e.email = 'Escribe un correo válido.';
  const phone = v.phone.trim();
  if (phone && !isValidPhone(phone)) e.phone = 'Revisa el teléfono.';
  if (needsSlug) {
    const slug = v.profileSlug.trim().toLowerCase();
    if (!slug) e.profileSlug = 'Indica el perfil (lo que va después de fersuastudio.com/).';
    else if (!SLUG_RE.test(slug)) e.profileSlug = 'Revisa la dirección del perfil.';
  }
  const subject = cleanText(v.subject);
  if (!subject) e.subject = 'Escribe el asunto.';
  else if ([...subject].length > LIMITS.ticket.subjectMax) e.subject = 'El asunto es demasiado largo.';
  const message = cleanText(v.message, { multiline: true });
  if (!message) e.message = 'Cuéntanos tu solicitud.';
  else if ([...message].length > LIMITS.ticket.messageMax) e.message = 'El mensaje es demasiado largo.';
  if (!consent) e.consent = 'Debes autorizar el tratamiento de tus datos para enviar la solicitud.';
  return e;
}

export function TicketForm({ mode, initialSlug = '' }: Props) {
  const [values, setValues] = useState<Values>({
    type: mode === 'report' ? 'REPORTE_PERFIL' : 'PQRS_CONSULTA',
    name: '',
    email: '',
    phone: '',
    profileSlug: SLUG_RE.test(initialSlug) ? initialSlug : '',
    subject: mode === 'report' ? 'Reporte de perfil' : '',
    message: '',
  });
  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<TicketSubmitResultDto | null>(null);

  const needsSlug = values.type === 'REPORTE_PERFIL' || values.type === 'SOLICITUD_DATOS_DJ';
  const set = (key: keyof Values) => (e: { target: { value: string } }) => {
    const value = e.target.value;
    setValues((prev) => ({ ...prev, [key]: value }));
  };
  const fieldProps = (key: keyof Values) => ({
    id: `tk-${key}`,
    name: key,
    value: values[key],
    onChange: set(key),
    'aria-invalid': errors[key] ? (true as const) : undefined,
    'aria-describedby': errors[key] ? `tk-${key}-err` : undefined,
  });
  const err = (key: string) =>
    errors[key] ? (
      <p className="field-error" id={`tk-${key}-err`}>
        {errors[key]}
      </p>
    ) : null;

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending) return;
    setAlert(null);
    const errs = validate(values, needsSlug, consent);
    setErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) {
      document.getElementById(first === 'consent' ? 'tk-consent' : `tk-${first}`)?.focus();
      return;
    }
    setSending(true);
    try {
      const phone = values.phone.trim();
      const res = await publicApi.submitTicket({
        type: values.type,
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        ...(phone ? { phone } : {}),
        ...(needsSlug ? { profileSlug: values.profileSlug.trim().toLowerCase() } : {}),
        subject: values.subject.trim(),
        message: values.message.trim(),
        consent: true,
        ...(hp ? { hp_x7: hp } : {}),
      });
      setDone(res);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.statusCode === 429 || error.code === 'RATE_LIMITED') {
          setAlert('Has enviado varias solicitudes seguidas. Intenta de nuevo en unos minutos.');
        } else if (error.details && Object.keys(error.details).length) {
          const mapped: Record<string, string> = {};
          for (const key of Object.keys(error.details)) {
            if (key in values || key === 'consent') mapped[key] = 'Revisa este campo.';
          }
          setErrors(mapped);
          setAlert('Revisa los campos marcados.');
        } else {
          setAlert(error.message);
        }
      } else {
        setAlert('Ocurrió un error inesperado. Intenta de nuevo.');
      }
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="booking-success" role="status">
        <p>
          Recibimos tu solicitud. Radicado: <strong>{done.id}</strong>.
        </p>
        <p>Te responderemos al correo que indicaste a más tardar el {formatDue(done.dueDate)}.</p>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit}>
      {mode === 'pqrs' ? (
        <>
          <label htmlFor="tk-type">Tipo de solicitud</label>
          <select {...fieldProps('type')}>
            {PQRS_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </>
      ) : null}

      {needsSlug ? (
        <>
          <label htmlFor="tk-profileSlug">
            Perfil (dirección después de fersuastudio.com/)<span className="req" aria-hidden="true">*</span>
          </label>
          <input
            {...fieldProps('profileSlug')}
            type="text"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={LIMITS.profile.slugMax}
            placeholder="nombre-del-dj"
            required
          />
          {err('profileSlug')}
        </>
      ) : null}

      <label htmlFor="tk-name">
        Nombre<span className="req" aria-hidden="true">*</span>
      </label>
      <input {...fieldProps('name')} type="text" autoComplete="name" maxLength={LIMITS.ticket.nameMax} required />
      {err('name')}

      <label htmlFor="tk-email">
        Correo<span className="req" aria-hidden="true">*</span>
      </label>
      <input
        {...fieldProps('email')}
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={LIMITS.user.emailMax}
        required
      />
      {err('email')}

      <label htmlFor="tk-phone">Teléfono (opcional)</label>
      <input {...fieldProps('phone')} type="tel" inputMode="tel" autoComplete="tel" maxLength={20} />
      {err('phone')}

      <label htmlFor="tk-subject">
        Asunto<span className="req" aria-hidden="true">*</span>
      </label>
      <input {...fieldProps('subject')} type="text" maxLength={LIMITS.ticket.subjectMax} required />
      {err('subject')}

      <label htmlFor="tk-message">
        {mode === 'report' ? '¿Qué contenido quieres reportar y por qué?' : 'Mensaje'}
        <span className="req" aria-hidden="true">*</span>
      </label>
      <textarea {...fieldProps('message')} maxLength={LIMITS.ticket.messageMax} required />
      {err('message')}

      <div className="hp-field" aria-hidden="true">
        <label htmlFor="tk-hp_x7">No completes este campo</label>
        <input
          id="tk-hp_x7"
          type="text"
          name="hp_x7"
          tabIndex={-1}
          autoComplete="off"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
        />
      </div>

      <label className="consent" htmlFor="tk-consent">
        <input
          id="tk-consent"
          type="checkbox"
          checked={consent}
          required
          aria-invalid={errors.consent ? true : undefined}
          aria-describedby={errors.consent ? 'tk-consent-err' : undefined}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (e.target.checked) setErrors(({ consent: _drop, ...rest }) => rest);
          }}
        />
        <span>
          Autorizo el tratamiento de mis datos para gestionar esta solicitud, según la{' '}
          <a href={LEGAL_DOCS.privacy.path} target="_blank" rel="noopener">
            Política de Tratamiento de Datos Personales
          </a>
          .
        </span>
      </label>
      {err('consent')}

      <div className="form-footer">
        <button className="btn btn-primary" type="submit" disabled={sending} aria-busy={sending || undefined}>
          {sending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
      <div aria-live="polite">
        {alert ? (
          <p className="form-alert" role="alert">
            {alert}
          </p>
        ) : null}
      </div>
      <TicketPrivacyNotice mode={mode} />
      <p className="small">Los campos con * son obligatorios.</p>
    </form>
  );
}
