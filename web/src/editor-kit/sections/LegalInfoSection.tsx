import { DOC_TYPES, isValidPhone, LIMITS, normalizeDocNumber, type DocType, type LegalInfoDto, type LegalInfoInput } from '@fersua/shared';
import { DeleteOutlined, LockOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Checkbox, Col, Form, Input, Row, Select, Space, Spin, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { describeError, http, useAfterSave } from '../api';
import { SAVED_MESSAGE, useFeedback } from '../feedback';
import { applyFieldErrors, countConfig, maxChars, requiredText, useSyncedForm } from '../forms';
import { DOC_TYPE_LABELS, FIELD_ERROR_MESSAGES, formatDateTime } from '../labels';
import { SaveBar } from '../SaveBar';
import { editorKeys, useEditorScope } from '../scope';

const L = LIMITS.legalInfo;

interface LegalValues {
  legalName: string;
  docType: DocType;
  docNumber: string;
  address: string;
  phones: string[];
}

/** Decide normalizeDocNumber de shared (la misma función que usa el api); aquí solo el mensaje. */
export function docNumberProblem(docType: DocType, raw: string): string | null {
  const compact = raw.normalize('NFKC').replace(/[\s.-]/g, '');
  if (!compact) return 'Escribe el número de documento.';
  if (compact.length > L.docNumberMax) return `Máximo ${L.docNumberMax} caracteres.`;
  if (normalizeDocNumber(docType, raw) !== null) return null;
  const digitsOnly = docType === 'CC' || docType === 'NIT' || docType === 'PPT';
  return digitsOnly ? 'Solo números (sin puntos ni guiones), de 4 a 20 dígitos.' : 'Solo letras y números, de 4 a 20.';
}

function toValues(dto: LegalInfoDto): LegalValues {
  return {
    legalName: dto.legalName,
    docType: dto.docType,
    docNumber: dto.docNumber,
    address: dto.address,
    phones: dto.phones.length ? [...dto.phones] : [''],
  };
}

/**
 * Registro privado del art. 53 (Ley 1480): quién responde por el perfil. Solo lo ven el dueño
 * y el administrador; nunca sale en la página pública.
 */
export function LegalInfoSection() {
  const { base, actor } = useEditorScope();
  const query = useQuery({
    queryKey: editorKeys.legal(base),
    queryFn: async ({ signal }) => (await http.get<LegalInfoDto>(`${base}/legal-info`, { signal })).data,
    // Cada lectura del admin queda en la auditoría: no se vuelve a pedir en cada visita a la pestaña.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  if (query.isPending) return <Spin />;
  if (query.isError) {
    return (
      <Alert
        type="error"
        showIcon
        title={describeError(query.error).message}
        action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}
      />
    );
  }
  return <LegalInfoForm dto={query.data} actor={actor} />;
}

function LegalInfoForm({ dto, actor }: { dto: LegalInfoDto; actor: 'admin' | 'owner' }) {
  const { base } = useEditorScope();
  const { message } = useFeedback();
  const afterSave = useAfterSave();
  const initial = useMemo(() => toValues(dto), [dto]);
  const { form, dirty, onValuesChange, markSaved, discard } = useSyncedForm<LegalValues>(initial);
  const [saving, setSaving] = useState(false);
  const docType = (Form.useWatch('docType', form) as DocType | undefined) ?? initial.docType;

  const save = async (v: LegalValues) => {
    const body: LegalInfoInput = {
      legalName: v.legalName.trim(),
      docType: v.docType,
      docNumber: v.docNumber.trim(),
      address: v.address.trim(),
      phones: (v.phones ?? []).map((p) => (p ?? '').trim()).filter(Boolean),
      // El dueño declara la veracidad cada vez que guarda; el api la exige y la deja en la auditoría.
      ...(actor === 'owner' && (form.getFieldsValue(true) as { truthful?: unknown }).truthful === true ? { truthful: true as const } : {}),
    };
    setSaving(true);
    try {
      await http.put<LegalInfoDto>(`${base}/legal-info`, body);
      markSaved();
      // hasLegalInfo del perfil cambia (habilita «Aprobar»): se refresca todo el editor.
      await afterSave();
      message.success(SAVED_MESSAGE);
    } catch (err) {
      const e = describeError(err);
      applyFieldErrors(form, e.details, FIELD_ERROR_MESSAGES, (k) => {
        const m = /^phones\[(\d+)\]$/.exec(k);
        return m ? ['phones', Number(m[1])] : [k];
      });
      message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      size="small"
      title={
        <Space>
          <LockOutlined aria-hidden="true" />
          Datos legales del responsable
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title={
          actor === 'owner'
            ? 'Privado: solo lo ve el administrador (además de ti). Es obligatorio para enviar tu perfil a revisión (art. 53 Ley 1480).'
            : 'Privado: solo lo ven el dueño del perfil y el administrador. Requerido para publicar (art. 53 Ley 1480).'
        }
        description={
          actor === 'owner'
            ? 'Identifica a quien responde por las contrataciones de este perfil. Nunca aparece en tu página; solo se entrega a quien te contrató si presenta una queja, o a una autoridad.'
            : 'Identifica a quien responde por las contrataciones de este perfil. No aparece en la página pública.'
        }
      />
      {dto.updatedAt ? (
        <Typography.Paragraph type="secondary">Última actualización: {formatDateTime(dto.updatedAt)}</Typography.Paragraph>
      ) : (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title={
            actor === 'owner'
              ? 'Todavía no has cargado tus datos legales: sin ellos no puedes enviar tu perfil a revisión.'
              : 'Todavía no hay datos legales: el perfil no se puede aprobar.'
          }
        />
      )}
      <Form<LegalValues>
        form={form}
        layout="vertical"
        initialValues={initial}
        onValuesChange={onValuesChange}
        onFinish={(v) => void save(v)}
        autoComplete="off"
      >
        <Form.Item
          name="legalName"
          label="Nombre completo o razón social"
          rules={[requiredText('Escribe el nombre o la razón social.'), { min: 2, message: 'Mínimo 2 caracteres.' }, maxChars(L.legalNameMax)]}
        >
          <Input count={countConfig(L.legalNameMax)} />
        </Form.Item>
        <Row gutter={12}>
          <Col xs={24} sm={10}>
            <Form.Item name="docType" label="Tipo de documento" rules={[{ required: true, message: 'Elige el tipo.' }]}>
              <Select options={DOC_TYPES.map((d) => ({ value: d, label: DOC_TYPE_LABELS[d] }))} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={14}>
            <Form.Item
              name="docNumber"
              label="Número de documento"
              dependencies={['docType']}
              extra={docType === 'NIT' ? 'Con el dígito de verificación al final, sin guion.' : undefined}
              rules={[
                {
                  validator: (_r, v: unknown) => {
                    const problem = docNumberProblem(docType, typeof v === 'string' ? v : '');
                    return problem ? Promise.reject(new Error(problem)) : Promise.resolve();
                  },
                },
              ]}
            >
              <Input maxLength={32} inputMode={docType === 'CE' || docType === 'PASAPORTE' ? 'text' : 'numeric'} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          name="address"
          label="Dirección de notificación"
          rules={[requiredText('Escribe la dirección.'), { min: 5, message: 'Mínimo 5 caracteres.' }, maxChars(L.addressMax)]}
        >
          <Input count={countConfig(L.addressMax)} />
        </Form.Item>
        <Form.List
          name="phones"
          rules={[
            {
              validator: async (_r, phones: unknown) => {
                const list = Array.isArray(phones) ? phones.filter((p) => typeof p === 'string' && p.trim()) : [];
                if (!list.length) throw new Error('Escribe al menos un teléfono.');
              },
            },
          ]}
        >
          {(fields, { add, remove }, { errors }) => (
            <>
              <Typography.Text>Teléfonos de contacto (hasta {L.phonesMax})</Typography.Text>
              {fields.map((field, index) => (
                <Space key={field.key} align="start" style={{ display: 'flex', marginTop: 8 }}>
                  <Form.Item
                    name={field.name}
                    style={{ marginBottom: 0, minWidth: 220 }}
                    rules={[
                      {
                        validator: (_r, v: unknown) =>
                          typeof v === 'string' && v.trim() && (v.trim().length > L.phoneMax || !isValidPhone(v.trim()))
                            ? Promise.reject(new Error('Escribe un teléfono válido (7 a 15 dígitos).'))
                            : Promise.resolve(),
                      },
                    ]}
                  >
                    <Input aria-label={`Teléfono ${index + 1}`} inputMode="tel" maxLength={L.phoneMax} placeholder="+57 300 000 0000" />
                  </Form.Item>
                  {fields.length > 1 ? (
                    <Button icon={<DeleteOutlined />} aria-label={`Quitar teléfono ${index + 1}`} onClick={() => remove(field.name)} />
                  ) : null}
                </Space>
              ))}
              <Form.ErrorList errors={errors} />
              <Button
                style={{ marginTop: 8 }}
                icon={<PlusOutlined />}
                disabled={fields.length >= L.phonesMax}
                onClick={() => add('')}
              >
                Agregar teléfono
              </Button>
            </>
          )}
        </Form.List>
        {actor === 'owner' ? (
          // Declaración del dueño al guardar (docs/diseno/11 §2.4): se envía (truthful) y queda auditada.
          <Form.Item
            name="truthful"
            valuePropName="checked"
            style={{ marginTop: 16, marginBottom: 0 }}
            rules={[
              {
                validator: (_r, v: unknown) =>
                  v === true ? Promise.resolve() : Promise.reject(new Error('Marca la casilla para guardar tus datos.')),
              },
            ]}
          >
            <Checkbox>Declaro que estos datos son veraces y me obligo a mantenerlos actualizados.</Checkbox>
          </Form.Item>
        ) : null}
        <SaveBar dirty={dirty} saving={saving} onSave={() => form.submit()} onDiscard={discard} saveLabel="Guardar datos legales" />
      </Form>
    </Card>
  );
}
