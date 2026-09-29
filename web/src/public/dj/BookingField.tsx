import type { ResolvedFormField } from '@fersua/shared';
import type { ChangeEvent } from 'react';

interface Props {
  field: ResolvedFormField;
  value: string;
  error?: string;
  dateRange: { min: string; max: string };
  onChange: (key: string, value: string) => void;
}

export const fieldId = (key: string) => `bf-${key}`;

/** Un campo del catálogo fijo con el tipo de input, teclado y autocompletado correctos. */
export function BookingField({ field, value, error, dateRange, onChange }: Props) {
  const id = fieldId(field.key);
  const errId = `${id}-err`;
  const common = {
    id,
    name: field.key,
    value,
    required: field.required,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': error ? errId : undefined,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange(field.key, e.target.value),
  };
  const placeholder = field.placeholder ?? undefined;
  const autoComplete = field.autocomplete;

  let control;
  switch (field.type) {
    case 'textarea':
      control = <textarea {...common} maxLength={field.maxLength} placeholder={placeholder} />;
      break;
    case 'select':
      control = (
        <select {...common}>
          <option value="">{placeholder ?? 'Selecciona una opción'}</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    case 'email':
      control = (
        <input
          {...common}
          type="email"
          inputMode="email"
          autoCapitalize="off"
          spellCheck={false}
          autoComplete={autoComplete}
          maxLength={field.maxLength}
          placeholder={placeholder}
        />
      );
      break;
    case 'tel':
      control = (
        <input
          {...common}
          type="tel"
          inputMode="tel"
          autoComplete={autoComplete}
          maxLength={field.maxLength}
          placeholder={placeholder}
        />
      );
      break;
    case 'date':
      control = <input {...common} type="date" min={dateRange.min} max={dateRange.max} />;
      break;
    case 'time':
      control = <input {...common} type="time" />;
      break;
    case 'integer':
      control = (
        <input
          {...common}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={field.maxLength}
          placeholder={placeholder}
        />
      );
      break;
    case 'url':
      control = (
        <input
          {...common}
          type="url"
          inputMode="url"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={field.maxLength}
          placeholder={placeholder}
        />
      );
      break;
    case 'handle':
      control = (
        <input
          {...common}
          type="text"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={field.maxLength}
          placeholder={placeholder}
        />
      );
      break;
    default:
      control = (
        <input
          {...common}
          type="text"
          autoComplete={autoComplete}
          maxLength={field.maxLength}
          placeholder={placeholder}
        />
      );
  }

  return (
    <>
      <label htmlFor={id}>
        {field.label}
        {field.required ? (
          <span className="req" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {control}
      {error ? (
        <p className="field-error" id={errId}>
          {error}
        </p>
      ) : null}
    </>
  );
}
