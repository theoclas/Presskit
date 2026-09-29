// Catálogo FIJO de campos del formulario de booking. El DJ solo elige cuáles mostrar,
// si son obligatorios, su etiqueta y su orden. No existen campos inventados por el DJ.
// Sin cédula ni NIT: se pide lo mínimo (Ley 1581, principio de finalidad).

export type BookingFieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'tel'
  | 'date'
  | 'time'
  | 'integer'
  | 'select'
  | 'url'
  | 'handle';

export type BookingFieldGroup = 'contact' | 'event' | 'details';

export interface BookingFieldOption {
  value: string;
  label: string;
}

export interface BookingFieldDef {
  key: string;
  type: BookingFieldType;
  group: BookingFieldGroup;
  label: string;
  placeholder?: string;
  maxLength: number;
  min?: number;
  max?: number;
  options?: readonly BookingFieldOption[];
  autocomplete?: string;
  defaultEnabled: boolean;
  defaultRequired: boolean;
  /** Siempre activo y obligatorio (el nombre). */
  locked?: boolean;
  /** Columna desnormalizada de BookingRequest que alimenta. */
  contact?: 'name' | 'email' | 'phone' | 'eventDate';
}

const o = (...pairs: [string, string][]): BookingFieldOption[] => pairs.map(([value, label]) => ({ value, label }));

export const BOOKING_FIELD_GROUP_LABELS: Record<BookingFieldGroup, string> = {
  contact: 'Contacto',
  event: 'Evento',
  details: 'Otros detalles',
};

export const BOOKING_FIELD_CATALOGUE = [
  { key: 'fullName', type: 'text', group: 'contact', label: 'Nombre completo', placeholder: 'Tu nombre', maxLength: 80, autocomplete: 'name', defaultEnabled: true, defaultRequired: true, locked: true, contact: 'name' },
  { key: 'company', type: 'text', group: 'contact', label: 'Empresa / productora', maxLength: 100, autocomplete: 'organization', defaultEnabled: false, defaultRequired: false },
  { key: 'email1', type: 'email', group: 'contact', label: 'Email', placeholder: 'tu@correo.com', maxLength: 254, autocomplete: 'email', defaultEnabled: true, defaultRequired: true, contact: 'email' },
  { key: 'email2', type: 'email', group: 'contact', label: 'Email alterno', maxLength: 254, defaultEnabled: false, defaultRequired: false },
  { key: 'email3', type: 'email', group: 'contact', label: 'Otro email', maxLength: 254, defaultEnabled: false, defaultRequired: false },
  { key: 'phone1', type: 'tel', group: 'contact', label: 'Teléfono / WhatsApp', placeholder: '+57 300 000 0000', maxLength: 20, autocomplete: 'tel', defaultEnabled: false, defaultRequired: false, contact: 'phone' },
  { key: 'phone2', type: 'tel', group: 'contact', label: 'Teléfono alterno', maxLength: 20, defaultEnabled: false, defaultRequired: false },
  { key: 'phone3', type: 'tel', group: 'contact', label: 'Otro teléfono', maxLength: 20, defaultEnabled: false, defaultRequired: false },
  { key: 'address1', type: 'text', group: 'contact', label: 'Dirección', maxLength: 160, autocomplete: 'street-address', defaultEnabled: false, defaultRequired: false },
  { key: 'address2', type: 'text', group: 'contact', label: 'Dirección alterna', maxLength: 160, defaultEnabled: false, defaultRequired: false },
  { key: 'contactPreference', type: 'select', group: 'contact', label: '¿Cómo prefieres que te contactemos?', maxLength: 20, options: o(['whatsapp', 'WhatsApp'], ['llamada', 'Llamada'], ['email', 'Email']), defaultEnabled: false, defaultRequired: false },
  { key: 'instagram', type: 'handle', group: 'contact', label: 'Instagram (evento o productora)', placeholder: '@usuario', maxLength: 31, defaultEnabled: false, defaultRequired: false },
  { key: 'website', type: 'url', group: 'contact', label: 'Sitio web', placeholder: 'https://', maxLength: 300, defaultEnabled: false, defaultRequired: false },
  { key: 'eventName', type: 'text', group: 'event', label: 'Nombre del evento', maxLength: 100, defaultEnabled: false, defaultRequired: false },
  { key: 'eventType', type: 'select', group: 'event', label: 'Tipo de evento', maxLength: 20, options: o(['club', 'Club / discoteca'], ['festival', 'Festival'], ['privado', 'Fiesta privada'], ['corporativo', 'Corporativo'], ['boda', 'Boda'], ['bar', 'Bar / restaurante'], ['cumpleanos', 'Cumpleaños'], ['streaming', 'Streaming'], ['otro', 'Otro']), defaultEnabled: false, defaultRequired: false },
  { key: 'eventDate', type: 'date', group: 'event', label: 'Fecha del evento', maxLength: 10, min: 0, max: 730, defaultEnabled: true, defaultRequired: false, contact: 'eventDate' },
  { key: 'eventTime', type: 'time', group: 'event', label: 'Hora del set', maxLength: 5, defaultEnabled: false, defaultRequired: false },
  { key: 'setDuration', type: 'select', group: 'event', label: 'Duración del set', maxLength: 12, options: o(['1h', '1 hora'], ['1h30', '1 h 30 min'], ['2h', '2 horas'], ['3h', '3 horas'], ['4h+', '4 horas o más'], ['convenir', 'A convenir']), defaultEnabled: false, defaultRequired: false },
  { key: 'city', type: 'text', group: 'event', label: 'Ciudad', placeholder: 'Ciudad, país', maxLength: 100, autocomplete: 'address-level2', defaultEnabled: true, defaultRequired: false },
  { key: 'venue', type: 'text', group: 'event', label: 'Lugar / venue', maxLength: 100, defaultEnabled: false, defaultRequired: false },
  { key: 'attendees', type: 'integer', group: 'event', label: 'Asistentes esperados', maxLength: 6, min: 1, max: 100000, defaultEnabled: false, defaultRequired: false },
  { key: 'budget', type: 'select', group: 'event', label: 'Presupuesto aproximado (COP)', maxLength: 12, options: o(['lt1m', 'Menos de $1 M'], ['1-3m', '$1 M – $3 M'], ['3-6m', '$3 M – $6 M'], ['6-10m', '$6 M – $10 M'], ['gt10m', 'Más de $10 M'], ['convenir', 'Prefiero conversarlo']), defaultEnabled: false, defaultRequired: false },
  { key: 'travelCovered', type: 'select', group: 'event', label: '¿Incluye transporte y hospedaje?', maxLength: 12, options: o(['si', 'Sí'], ['no', 'No'], ['no_aplica', 'No aplica'], ['convenir', 'A convenir']), defaultEnabled: false, defaultRequired: false },
  { key: 'venueEquipment', type: 'textarea', group: 'details', label: 'Equipo disponible en el venue', maxLength: 1000, defaultEnabled: false, defaultRequired: false },
  { key: 'referral', type: 'select', group: 'details', label: '¿Cómo nos conociste?', maxLength: 16, options: o(['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['recomendacion', 'Recomendación'], ['evento', 'En un evento'], ['google', 'Google'], ['otro', 'Otro']), defaultEnabled: false, defaultRequired: false },
  { key: 'message', type: 'textarea', group: 'details', label: 'Detalles del evento', placeholder: 'Tipo de evento, horario, duración del set, presupuesto, requisitos técnicos...', maxLength: 2000, defaultEnabled: true, defaultRequired: false },
] as const satisfies readonly BookingFieldDef[];

export type BookingFieldKey = (typeof BOOKING_FIELD_CATALOGUE)[number]['key'];

const FIELD_BY_KEY: ReadonlyMap<string, BookingFieldDef> = new Map(
  BOOKING_FIELD_CATALOGUE.map((f) => [f.key, f as BookingFieldDef]),
);

export function getBookingField(key: string): BookingFieldDef | undefined {
  return FIELD_BY_KEY.get(key);
}
