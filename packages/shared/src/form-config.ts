import { BOOKING_FIELD_CATALOGUE, getBookingField, type BookingFieldDef } from './booking-fields';
import { LIMITS } from './limits';
import { cleanText, foldText } from './sanitize';

// Configuración del formulario de un DJ: lista ORDENADA de campos activos.
// Se guarda en DjProfile.bookingForm (JSON) y se reemplaza entera en cada guardado.
export interface FormFieldConfig {
  key: string;
  required: boolean;
  label?: string | null;
  placeholder?: string | null;
}

/** Campo listo para pintar: definición del catálogo + lo que el DJ personalizó. */
export interface ResolvedFormField {
  key: string;
  type: BookingFieldDef['type'];
  label: string;
  placeholder: string | null;
  required: boolean;
  maxLength: number;
  min?: number;
  max?: number;
  options?: readonly { value: string; label: string }[];
  autocomplete?: string;
}

export function defaultFormConfig(): FormFieldConfig[] {
  return BOOKING_FIELD_CATALOGUE.filter((f) => f.defaultEnabled).map((f) => ({
    key: f.key,
    required: f.defaultRequired,
  }));
}

/**
 * Palabras que un DJ no puede poner como etiqueta: evitan usar el formulario para pedir
 * datos de pago, claves o documentos.
 */
const LABEL_DENYLIST = [
  'tarjeta',
  'credito',
  'debito',
  'cvv',
  'cvc',
  'clave',
  'contrasena',
  'password',
  'pin',
  'cedula',
  'pasaporte',
  'cuenta bancaria',
  'numero de cuenta',
  'nequi',
  'daviplata',
  'codigo de verificacion',
  'codigo de seguridad',
  'otp',
  'token',
];

export function isLabelAllowed(label: string): boolean {
  const f = ` ${foldText(label).replace(/[^a-z0-9 ]+/g, ' ')} `;
  return !LABEL_DENYLIST.some((w) => f.includes(` ${w} `) || f.includes(` ${w}s `));
}

export type FormConfigError =
  | 'NOT_ARRAY'
  | 'TOO_MANY'
  | 'UNKNOWN_KEY'
  | 'DUPLICATE_KEY'
  | 'NAME_REQUIRED'
  | 'CONTACT_REQUIRED'
  | 'LABEL_TOO_LONG'
  | 'PLACEHOLDER_TOO_LONG'
  | 'LABEL_NOT_ALLOWED';

export interface FormConfigValidation {
  config: FormFieldConfig[];
  errors: { index: number; key?: string; error: FormConfigError }[];
}

/**
 * Reglas: claves del catálogo sin repetir; el nombre siempre activo y obligatorio;
 * al menos email1 o phone1 activo y obligatorio para poder responder.
 */
export function validateFormConfig(input: unknown): FormConfigValidation {
  const errors: FormConfigValidation['errors'] = [];
  const config: FormFieldConfig[] = [];
  if (!Array.isArray(input)) return { config, errors: [{ index: -1, error: 'NOT_ARRAY' }] };
  if (input.length > LIMITS.form.activeFieldsMax) errors.push({ index: -1, error: 'TOO_MANY' });

  const seen = new Set<string>();
  input.forEach((raw, index) => {
    const item = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const key = typeof item.key === 'string' ? item.key : '';
    const def = getBookingField(key);
    if (!def) return errors.push({ index, key, error: 'UNKNOWN_KEY' });
    if (seen.has(key)) return errors.push({ index, key, error: 'DUPLICATE_KEY' });
    seen.add(key);

    const label = item.label == null ? '' : cleanText(item.label);
    const placeholder = item.placeholder == null ? '' : cleanText(item.placeholder);
    if ([...label].length > LIMITS.form.labelMax) return errors.push({ index, key, error: 'LABEL_TOO_LONG' });
    if ([...placeholder].length > LIMITS.form.placeholderMax) {
      return errors.push({ index, key, error: 'PLACEHOLDER_TOO_LONG' });
    }
    if ((label && !isLabelAllowed(label)) || (placeholder && !isLabelAllowed(placeholder))) {
      return errors.push({ index, key, error: 'LABEL_NOT_ALLOWED' });
    }
    config.push({
      key,
      required: def.locked ? true : item.required === true,
      label: label || null,
      placeholder: placeholder || null,
    });
  });

  if (!config.some((f) => f.key === 'fullName')) errors.push({ index: -1, key: 'fullName', error: 'NAME_REQUIRED' });
  const contactOk = config.some((f) => (f.key === 'email1' || f.key === 'phone1') && f.required);
  if (!contactOk) errors.push({ index: -1, error: 'CONTACT_REQUIRED' });

  return { config, errors };
}

/** Lo guardado + el catálogo → campos para pintar. Ignora claves que ya no existen. */
export function resolveFormFields(stored: unknown): ResolvedFormField[] {
  const list = Array.isArray(stored) ? (stored as FormFieldConfig[]) : defaultFormConfig();
  const out: ResolvedFormField[] = [];
  const seen = new Set<string>();
  for (const cfg of list) {
    const def = cfg && typeof cfg.key === 'string' ? getBookingField(cfg.key) : undefined;
    if (!def || seen.has(def.key)) continue;
    seen.add(def.key);
    out.push({
      key: def.key,
      type: def.type,
      label: cfg.label || def.label,
      placeholder: cfg.placeholder || def.placeholder || null,
      required: def.locked ? true : cfg.required === true,
      maxLength: def.maxLength,
      min: def.min,
      max: def.max,
      options: def.options,
      autocomplete: def.autocomplete,
    });
  }
  return out;
}
