import {
  BOOKING_FIELD_CATALOGUE,
  BOOKING_FIELD_GROUP_LABELS,
  getBookingField,
  LIMITS,
  validateFormConfig,
  type BookingFieldDef,
  type BookingFieldGroup,
  type FormConfigValidation,
  type FormFieldConfig,
} from '@fersua/shared';
import { DeleteOutlined, LockOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Form, Input, Row, Space, Switch, Tag, Typography } from 'antd';
import { countConfig } from './forms';
import { FORM_CONFIG_ERROR_MESSAGES } from './labels';
import { MoveButtons, moveItem } from './SortableList';

const TYPE_LABELS: Record<BookingFieldDef['type'], string> = {
  text: 'Texto',
  textarea: 'Texto largo',
  email: 'Email',
  tel: 'Teléfono',
  date: 'Fecha',
  time: 'Hora',
  integer: 'Número',
  select: 'Lista',
  url: 'Enlace',
  handle: '@usuario',
};

/** Tipos que muestran un texto de ejemplo dentro del campo. */
const HAS_PLACEHOLDER = new Set<BookingFieldDef['type']>(['text', 'textarea', 'email', 'tel', 'integer', 'url', 'handle']);

const GROUPS = Object.keys(BOOKING_FIELD_GROUP_LABELS) as BookingFieldGroup[];

export function formConfigIssues(config: readonly FormFieldConfig[]): FormConfigValidation['errors'] {
  return validateFormConfig(config).errors;
}

/** Lo que se envía al api: sin etiquetas vacías y con el nombre siempre obligatorio. */
export function cleanFormConfig(config: readonly FormFieldConfig[]): FormFieldConfig[] {
  return config.map((f) => {
    const def = getBookingField(f.key);
    const label = (f.label ?? '').trim();
    const placeholder = (f.placeholder ?? '').trim();
    return {
      key: f.key,
      required: def?.locked ? true : f.required === true,
      label: label || null,
      placeholder: placeholder || null,
    };
  });
}

interface Props {
  value: FormFieldConfig[];
  onChange: (next: FormFieldConfig[]) => void;
  disabled?: boolean;
}

/**
 * Izquierda: campos activos en orden (etiqueta, ejemplo, obligatorio). Derecha: el catálogo fijo.
 * Las reglas son las de validateFormConfig (las mismas del api) y se muestran en vivo.
 */
export function FormConfigEditor({ value, onChange, disabled }: Props) {
  const issues = formConfigIssues(value);
  const rowErrors = new Map<number, string[]>();
  const globalErrors: string[] = [];
  for (const e of issues) {
    const msg = FORM_CONFIG_ERROR_MESSAGES[e.error];
    if (e.index >= 0) rowErrors.set(e.index, [...(rowErrors.get(e.index) ?? []), msg]);
    else if (!globalErrors.includes(msg)) globalErrors.push(msg);
  }
  const used = new Set(value.map((f) => f.key));
  const full = value.length >= LIMITS.form.activeFieldsMax;

  const update = (index: number, change: Partial<FormFieldConfig>) =>
    onChange(value.map((f, i) => (i === index ? { ...f, ...change } : f)));
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  const add = (def: BookingFieldDef) => {
    if (used.has(def.key) || full) return;
    onChange([...value, { key: def.key, required: def.locked ? true : false, label: null, placeholder: null }]);
  };

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={14}>
        <Card title={`Campos activos (${value.length}/${LIMITS.form.activeFieldsMax})`} size="small">
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            {globalErrors.length ? (
              <Alert
                type="error"
                showIcon
                role="alert"
                title="Antes de guardar"
                description={
                  <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                    {globalErrors.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                }
              />
            ) : null}
            {value.map((field, index) => {
              const def = getBookingField(field.key);
              const name = def?.label ?? field.key;
              const locked = !!def?.locked;
              const errors = rowErrors.get(index);
              return (
                <div
                  key={field.key}
                  data-testid={`form-field-${field.key}`}
                  style={{ border: '1px solid rgba(148,163,184,.3)', borderRadius: 8, padding: 12 }}
                >
                  <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space wrap size={6}>
                      <Typography.Text strong>{name}</Typography.Text>
                      {def ? <Tag>{TYPE_LABELS[def.type]}</Tag> : <Tag color="red">No existe</Tag>}
                      {locked ? (
                        <Tag icon={<LockOutlined />} color="blue">
                          Siempre activo
                        </Tag>
                      ) : null}
                    </Space>
                    <Space wrap size={6}>
                      <MoveButtons
                        index={index}
                        count={value.length}
                        name={name}
                        disabled={disabled}
                        onMove={(from, to) => onChange(moveItem(value, from, to))}
                      />
                      <Button
                        size="small"
                        icon={<DeleteOutlined />}
                        aria-label={`Quitar ${name}`}
                        disabled={disabled || locked}
                        onClick={() => remove(index)}
                      />
                    </Space>
                  </Space>
                  {def ? (
                    <Row gutter={[8, 0]} style={{ marginTop: 8 }}>
                      <Col xs={24} md={HAS_PLACEHOLDER.has(def.type) ? 12 : 24}>
                        <Form.Item label="Etiqueta" style={{ marginBottom: 8 }} layout="vertical">
                          <Input
                            aria-label={`Etiqueta de ${name}`}
                            placeholder={def.label}
                            value={field.label ?? ''}
                            disabled={disabled}
                            count={countConfig(LIMITS.form.labelMax)}
                            onChange={(e) => update(index, { label: e.target.value })}
                          />
                        </Form.Item>
                      </Col>
                      {HAS_PLACEHOLDER.has(def.type) ? (
                        <Col xs={24} md={12}>
                          <Form.Item label="Texto de ejemplo" style={{ marginBottom: 8 }} layout="vertical">
                            <Input
                              aria-label={`Texto de ejemplo de ${name}`}
                              placeholder={def.placeholder ?? ''}
                              value={field.placeholder ?? ''}
                              disabled={disabled}
                              count={countConfig(LIMITS.form.placeholderMax)}
                              onChange={(e) => update(index, { placeholder: e.target.value })}
                            />
                          </Form.Item>
                        </Col>
                      ) : null}
                    </Row>
                  ) : null}
                  <Space size={8}>
                    <Switch
                      size="small"
                      aria-label={`${name} obligatorio`}
                      checked={locked || field.required}
                      disabled={disabled || locked || !def}
                      onChange={(required) => update(index, { required })}
                    />
                    <Typography.Text>Obligatorio</Typography.Text>
                  </Space>
                  {errors?.map((m) => (
                    <Typography.Paragraph key={m} type="danger" style={{ margin: '6px 0 0' }} role="alert">
                      {m}
                    </Typography.Paragraph>
                  ))}
                </div>
              );
            })}
            <Alert
              type="info"
              showIcon
              title="Casilla de autorización de datos"
              description="Siempre visible, no editable: la exige la ley de datos personales y va al final del formulario."
            />
          </Space>
        </Card>
      </Col>
      <Col xs={24} lg={10}>
        <Card title="Catálogo de campos" size="small">
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            {full ? (
              <Typography.Text type="secondary">Llegaste al máximo de {LIMITS.form.activeFieldsMax} campos.</Typography.Text>
            ) : null}
            {GROUPS.map((group) => (
              <div key={group}>
                <Typography.Title level={5} style={{ marginTop: 0 }}>
                  {BOOKING_FIELD_GROUP_LABELS[group]}
                </Typography.Title>
                <Space wrap size={[6, 6]}>
                  {(BOOKING_FIELD_CATALOGUE as readonly BookingFieldDef[])
                    .filter((f) => f.group === group)
                    .map((f) => (
                      <Button
                        key={f.key}
                        size="small"
                        icon={<PlusOutlined />}
                        disabled={disabled || used.has(f.key) || full}
                        onClick={() => add(f)}
                        aria-label={used.has(f.key) ? `${f.label} (ya está en el formulario)` : `Agregar ${f.label}`}
                      >
                        {f.label}
                      </Button>
                    ))}
                </Space>
              </div>
            ))}
          </Space>
        </Card>
      </Col>
    </Row>
  );
}
