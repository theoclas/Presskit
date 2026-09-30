import type { TextSlot } from '@fersua/shared';
import { UndoOutlined } from '@ant-design/icons';
import { Button, Form, Input, type FormInstance } from 'antd';
import { charCount, countConfig } from './forms';

/** Valida un texto de la plantilla como el api: largo en caracteres y solo las variables permitidas. */
export function textSlotProblem(slot: Pick<TextSlot, 'max' | 'placeholders'>, value: string): string | null {
  const v = value.trim();
  if (charCount(v) > slot.max) return `Máximo ${slot.max} caracteres.`;
  const braces = v.match(/\{[^}]*\}/g) ?? [];
  const bad = braces.filter((b) => !slot.placeholders?.includes(b));
  if (bad.length) {
    return slot.placeholders?.length
      ? `Solo puedes usar ${slot.placeholders.join(' y ')} entre llaves.`
      : 'Este texto no admite variables entre llaves.';
  }
  return null;
}

interface Props {
  slot: TextSlot;
  form: FormInstance;
  /** Texto que se ve cuando el valor por defecto se arma con el nombre (pie, descripción de foto). */
  derivedDefault?: string;
  disabled?: boolean;
  /** Se llama al restaurar (setFieldValue no dispara onValuesChange del Form). */
  onRestored?: () => void;
  /**
   * El DJ lo escribe él (p. ej. el título de la portada en su panel): el texto de la plantilla
   * es solo un ejemplo, no hay «Restaurar» y vacío no significa "automático".
   */
  ownText?: boolean;
}

/**
 * Un texto editable de la página con contador y «Restaurar valor por defecto».
 * Guardar el valor por defecto deja el texto en automático (se envía '' al api).
 */
export function TextSlotField({ slot, form, derivedDefault, disabled, onRestored, ownText }: Props) {
  const name = ['texts', slot.key];
  const value = (Form.useWatch(name, form) as string | undefined) ?? '';
  const canRestore = !ownText && !!slot.default && value.trim() !== slot.default;
  const hints = ownText
    ? ['Escríbelo tú: es lo primero que se ve en tu página y hace falta para enviarla a revisión.']
    : [
        slot.placeholders?.length ? `Puedes usar ${slot.placeholders.join(' y ')}.` : null,
        !slot.default && derivedDefault ? `Si lo dejas vacío se usa «${derivedDefault}».` : null,
        slot.default && !value.trim() ? 'Vacío = se usa el texto por defecto.' : null,
      ].filter(Boolean);
  const placeholder = ownText && slot.default ? `Ej.: ${slot.default}` : slot.default || derivedDefault || '';

  const extra =
    hints.length || canRestore ? (
      <span>
        {hints.join(' ')}
        {canRestore ? (
          <Button
            type="link"
            size="small"
            icon={<UndoOutlined />}
            disabled={disabled}
            style={{ paddingInline: hints.length ? 6 : 0 }}
            aria-label={`Restaurar valor por defecto de «${slot.label}»`}
            onClick={() => {
              form.setFields([{ name, value: slot.default, touched: true, errors: [] }]);
              onRestored?.();
            }}
          >
            Restaurar valor por defecto
          </Button>
        ) : null}
      </span>
    ) : undefined;

  return (
    <Form.Item
      name={name}
      label={slot.label}
      extra={extra}
      rules={[
        {
          validator: (_r, v: unknown) => {
            const problem = textSlotProblem(slot, typeof v === 'string' ? v : '');
            return problem ? Promise.reject(new Error(problem)) : Promise.resolve();
          },
        },
      ]}
    >
      {slot.multiline ? (
        <Input.TextArea
          autoSize={{ minRows: 3, maxRows: 10 }}
          placeholder={placeholder}
          disabled={disabled}
          count={countConfig(slot.max)}
        />
      ) : (
        <Input placeholder={placeholder} disabled={disabled} count={countConfig(slot.max)} />
      )}
    </Form.Item>
  );
}
