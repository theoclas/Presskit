import {
  addDays,
  formatLongDate,
  isValidDateOnly,
  LIMITS,
  normalizeHttpsUrl,
  todayBogota,
  type EditorEventDto,
  type EditorProfileDto,
  type EventCtaType,
  type EventInput,
  type MediaAssetDto,
} from '@fersua/shared';
import { CopyOutlined, DeleteOutlined, EditOutlined, EyeInvisibleOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Row,
  Space,
  Spin,
  Switch,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useMemo, useState } from 'react';
import { asList, describeError, http, useAfterSave } from '../api';
import { SAVED_MESSAGE, useFeedback } from '../feedback';
import { applyFieldErrors, countConfig, maxChars, nullIfEmpty, requiredText } from '../forms';
import { ImageUploader } from '../ImageUploader';
import { CTA_TYPE_LABELS, FIELD_ERROR_MESSAGES, SOCIAL_URL_ERROR_MESSAGES } from '../labels';
import { ImageThumb } from '../media';
import { editorKeys, useEditorScope } from '../scope';
import { useUnsavedChanges } from '../unsaved';

const E = LIMITS.events;
/** El api deja al admin cargar fechas pasadas (archivo), hasta 10 años atrás. */
const ADMIN_PAST_DAYS = 3650;

interface EventValues {
  date: string;
  startTime: string;
  title: string;
  venue: string;
  city: string;
  ctaType: EventCtaType;
  ctaUrl: string;
  ctaLabel: string;
  isHidden: boolean;
}

type EditorTarget = { mode: 'create'; from?: EditorEventDto } | { mode: 'edit'; event: EditorEventDto };

function useEvents(scope: 'upcoming' | 'past') {
  const { base } = useEditorScope();
  return useQuery({
    queryKey: editorKeys.events(base, scope),
    queryFn: async ({ signal }) =>
      asList<EditorEventDto>((await http.get(`${base}/events`, { params: { scope }, signal })).data),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function EventsSection({ profile }: { profile: EditorProfileDto }) {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const upcoming = useEvents('upcoming');
  const count = upcoming.data?.length ?? 0;
  const full = count >= E.upcomingMax;

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      {!profile.show.events ? (
        <Alert
          type="info"
          showIcon
          title="La sección de fechas está oculta"
          description="Actívala en «Perfil y textos → Secciones visibles» para que se vea en la página."
        />
      ) : null}
      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as 'upcoming' | 'past')}
        items={[
          {
            key: 'upcoming',
            label: `Próximas (${count}/${E.upcomingMax})`,
            children: (
              <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  disabled={full}
                  onClick={() => setTarget({ mode: 'create' })}
                >
                  {full ? `Máximo ${E.upcomingMax} fechas próximas` : 'Nueva fecha'}
                </Button>
                <EventList
                  query={upcoming}
                  empty="No hay fechas próximas. La página muestra solo la fila «Disponible»."
                  onEdit={(event) => setTarget({ mode: 'edit', event })}
                  onDuplicate={full ? undefined : (event) => setTarget({ mode: 'create', from: event })}
                />
              </Space>
            ),
          },
          {
            key: 'past',
            label: 'Archivadas',
            children: (
              <PastEvents
                onEdit={(event) => setTarget({ mode: 'edit', event })}
                onDuplicate={full ? undefined : (event) => setTarget({ mode: 'create', from: event })}
              />
            ),
          },
        ]}
      />
      {target ? <EventModal target={target} profile={profile} onClose={() => setTarget(null)} /> : null}
    </Space>
  );
}

/**
 * Archivo de fechas pasadas. El admin puede corregirlas (el api acepta fechas pasadas de su
 * parte); cualquiera puede duplicarlas como una fecha nueva (se elige otro día).
 */
function PastEvents({ onEdit, onDuplicate }: { onEdit: (e: EditorEventDto) => void; onDuplicate?: (e: EditorEventDto) => void }) {
  const { actor } = useEditorScope();
  const past = useEvents('past');
  return (
    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        Las fechas que ya pasaron quedan aquí como archivo. No se muestran en la página.
        {onDuplicate ? ' Usa «Duplicar» para repetir una con otra fecha.' : ''}
      </Typography.Paragraph>
      <EventList
        query={past}
        empty="Todavía no hay fechas archivadas."
        onEdit={actor === 'admin' ? onEdit : undefined}
        onDuplicate={onDuplicate}
      />
    </Space>
  );
}

interface ListProps {
  query: ReturnType<typeof useEvents>;
  empty: string;
  readOnly?: boolean;
  onEdit?: (e: EditorEventDto) => void;
  onDuplicate?: (e: EditorEventDto) => void;
}

function EventList({ query, empty, readOnly, onEdit, onDuplicate }: ListProps) {
  const { base } = useEditorScope();
  const { message } = useFeedback();
  const afterSave = useAfterSave();
  const [deleting, setDeleting] = useState<string | null>(null);

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
  const events = query.data ?? [];
  if (!events.length) return <Empty description={empty} image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  const remove = async (event: EditorEventDto) => {
    setDeleting(event.id);
    try {
      await http.delete(`${base}/events/${encodeURIComponent(event.id)}`);
      await afterSave();
      message.success('Fecha borrada');
    } catch (err) {
      message.error(describeError(err).message);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Space orientation="vertical" size={10} style={{ width: '100%' }}>
      {events.map((event) => (
        <Card key={event.id} size="small">
          <Row gutter={[12, 8]} align="middle" wrap>
            <Col flex="none">
              <ImageThumb image={event.flyer} alt="" width={72} aspect="4 / 5" />
            </Col>
            <Col flex="auto" style={{ minWidth: 180 }}>
              <Space orientation="vertical" size={2}>
                <Typography.Text strong>
                  {formatLongDate(event.date)}
                  {event.startTime ? ` · ${event.startTime}` : ''}
                </Typography.Text>
                <Typography.Text>{[event.title, event.venue].filter(Boolean).join(' — ')}</Typography.Text>
                <Space size={4} wrap>
                  {event.city ? <Tag>{event.city}</Tag> : null}
                  <Tag color={event.ctaType === 'NONE' ? 'default' : 'blue'}>{CTA_TYPE_LABELS[event.ctaType]}</Tag>
                  {event.isHidden ? (
                    <Tag icon={<EyeInvisibleOutlined />} color="warning">
                      Oculta
                    </Tag>
                  ) : null}
                </Space>
              </Space>
            </Col>
            <Col flex="none">
              <Space wrap size={6}>
                {!readOnly && onEdit ? (
                  <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(event)}>
                    Editar
                  </Button>
                ) : null}
                {!readOnly && onDuplicate ? (
                  <Button size="small" icon={<CopyOutlined />} onClick={() => onDuplicate(event)}>
                    Duplicar
                  </Button>
                ) : null}
                <Popconfirm
                  title="¿Borrar esta fecha?"
                  okText="Borrar"
                  cancelText="Cancelar"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => remove(event)}
                >
                  <Button size="small" danger icon={<DeleteOutlined />} loading={deleting === event.id}>
                    Borrar
                  </Button>
                </Popconfirm>
              </Space>
            </Col>
          </Row>
        </Card>
      ))}
    </Space>
  );
}

function valuesFrom(event: EditorEventDto | undefined, keepDate: boolean): EventValues {
  return {
    date: event && keepDate ? event.date : '',
    startTime: event?.startTime ?? '',
    title: event?.title ?? '',
    venue: event?.venue ?? '',
    city: event?.city ?? '',
    ctaType: event?.ctaType ?? 'WHATSAPP',
    ctaUrl: event?.ctaUrl ?? '',
    ctaLabel: event?.ctaLabel ?? '',
    isHidden: event?.isHidden ?? false,
  };
}

function EventModal({ target, profile, onClose }: { target: EditorTarget; profile: EditorProfileDto; onClose: () => void }) {
  const { base, actor } = useEditorScope();
  const { message, modal } = useFeedback();
  const afterSave = useAfterSave();
  const source = target.mode === 'edit' ? target.event : target.from;
  const initial = useMemo(() => valuesFrom(source, target.mode === 'edit'), [source, target.mode]);
  const [form] = Form.useForm<EventValues>();
  const [flyer, setFlyer] = useState<MediaAssetDto | null>(source?.flyer ?? null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const ctaType = Form.useWatch('ctaType', form) ?? initial.ctaType;
  useUnsavedChanges(touched);

  const today = todayBogota();
  const minDate = actor === 'admin' ? addDays(today, -ADMIN_PAST_DAYS) : today;
  const maxDate = addDays(today, E.maxDaysAhead);
  const flyerChanged = (flyer?.id ?? null) !== (target.mode === 'edit' ? (target.event.flyer?.id ?? null) : null);

  const close = () => {
    if (!touched && !flyerChanged) return onClose();
    modal.confirm({
      title: '¿Descartar los cambios de esta fecha?',
      okText: 'Descartar',
      okButtonProps: { danger: true },
      cancelText: 'Seguir editando',
      onOk: () => {
        setTouched(false);
        onClose();
      },
    });
  };

  const submit = async (v: EventValues) => {
    let ctaUrl: string | null = null;
    if (v.ctaType === 'URL') {
      const r = normalizeHttpsUrl(v.ctaUrl ?? '');
      if (!r.ok) {
        form.setFields([{ name: 'ctaUrl', errors: [SOCIAL_URL_ERROR_MESSAGES[r.error]] }]);
        return;
      }
      ctaUrl = r.url;
    }
    const body: EventInput = {
      date: v.date,
      startTime: nullIfEmpty(v.startTime),
      title: nullIfEmpty(v.title),
      venue: v.venue.trim(),
      city: nullIfEmpty(v.city),
      flyerId: flyer?.id ?? null,
      ctaType: v.ctaType,
      ctaUrl,
      ctaLabel: v.ctaType === 'NONE' ? null : nullIfEmpty(v.ctaLabel),
      isHidden: !!v.isHidden,
    };
    setSaving(true);
    try {
      if (target.mode === 'edit') {
        await http.patch<EditorEventDto>(`${base}/events/${encodeURIComponent(target.event.id)}`, body);
      } else {
        await http.post<EditorEventDto>(`${base}/events`, body);
      }
      setTouched(false);
      await afterSave();
      message.success(target.mode === 'edit' ? SAVED_MESSAGE : 'Fecha agregada');
      onClose();
    } catch (err) {
      const e = describeError(err);
      applyFieldErrors(form, e.details, FIELD_ERROR_MESSAGES);
      message.error(e.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={target.mode === 'edit' ? 'Editar fecha' : target.from ? 'Duplicar fecha' : 'Nueva fecha'}
      okText={target.mode === 'edit' ? 'Guardar cambios' : 'Agregar fecha'}
      cancelText="Cancelar"
      onOk={() => form.submit()}
      onCancel={close}
      confirmLoading={saving}
      mask={{ closable: false }}
      width={640}
      destroyOnHidden
    >
      {target.mode === 'create' && target.from ? (
        <Alert type="info" showIcon title="Elige la fecha nueva; el resto se copió de la original." style={{ marginBottom: 12 }} />
      ) : null}
      <Form<EventValues>
        form={form}
        layout="vertical"
        initialValues={initial}
        onValuesChange={() => setTouched(true)}
        onFinish={(v) => void submit(v)}
      >
        <Row gutter={12}>
          <Col xs={24} sm={14}>
            <Form.Item
              name="date"
              label="Fecha"
              rules={[
                { required: true, message: 'Elige la fecha.' },
                {
                  validator: (_r, v: unknown) => {
                    if (!v) return Promise.resolve();
                    if (!isValidDateOnly(v)) return Promise.reject(new Error('Fecha no válida.'));
                    if (v > maxDate) return Promise.reject(new Error('Máximo 2 años hacia adelante.'));
                    if (v < minDate) {
                      return Promise.reject(new Error(actor === 'admin' ? 'La fecha es demasiado antigua.' : 'La fecha ya pasó.'));
                    }
                    return Promise.resolve();
                  },
                },
              ]}
              extra={actor === 'admin' ? 'Como administrador puedes cargar fechas pasadas (quedan en el archivo).' : undefined}
            >
              <Input type="date" min={minDate} max={maxDate} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={10}>
            <Form.Item
              name="startTime"
              label="Hora (opcional)"
              rules={[{ pattern: /^([01]\d|2[0-3]):[0-5]\d$/, message: 'Hora no válida (HH:MM).' }]}
            >
              <Input type="time" step={300} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="title" label="Nombre del evento (opcional)" rules={[maxChars(E.titleMax)]}>
          <Input count={countConfig(E.titleMax)} />
        </Form.Item>
        <Row gutter={12}>
          <Col xs={24} sm={14}>
            <Form.Item name="venue" label="Lugar" rules={[requiredText('Escribe el lugar.'), maxChars(E.venueMax)]}>
              <Input count={countConfig(E.venueMax)} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={10}>
            <Form.Item name="city" label="Ciudad (opcional)" rules={[maxChars(E.cityMax)]}>
              <Input count={countConfig(E.cityMax)} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="Flyer (opcional)">
          <Space align="start" wrap>
            <ImageThumb image={flyer} alt="Flyer" width={96} aspect="4 / 5" fit="contain" />
            <Space orientation="vertical" size={6}>
              <ImageUploader
                kind="FLYER"
                buttonLabel={flyer ? 'Cambiar flyer' : 'Subir flyer'}
                hint="Se muestra completo, sin recortes."
                onUploaded={(asset) => setFlyer(asset)}
              />
              {flyer ? (
                <Button size="small" danger onClick={() => setFlyer(null)}>
                  Quitar flyer
                </Button>
              ) : null}
            </Space>
          </Space>
        </Form.Item>
        <Form.Item name="ctaType" label="Botón de la fecha">
          <Radio.Group
            optionType="button"
            options={(Object.keys(CTA_TYPE_LABELS) as EventCtaType[]).map((k) => ({ value: k, label: CTA_TYPE_LABELS[k] }))}
          />
        </Form.Item>
        {ctaType === 'WHATSAPP' && !profile.whatsappNumber ? (
          <Alert
            type="warning"
            showIcon
            title="Este perfil no tiene número de WhatsApp: el botón no se mostrará hasta configurarlo en «Perfil y textos»."
            style={{ marginBottom: 12 }}
          />
        ) : null}
        {ctaType === 'URL' ? (
          <Form.Item
            name="ctaUrl"
            label="Enlace (boletas o evento)"
            rules={[
              { required: true, whitespace: true, message: 'Escribe el enlace.' },
              {
                validator: (_r, v: unknown) => {
                  if (typeof v !== 'string' || !v.trim()) return Promise.resolve();
                  const r = normalizeHttpsUrl(v);
                  return r.ok ? Promise.resolve() : Promise.reject(new Error(SOCIAL_URL_ERROR_MESSAGES[r.error]));
                },
              },
            ]}
          >
            <Input inputMode="url" placeholder="https://" maxLength={E.ctaUrlMax} autoCapitalize="off" spellCheck={false} />
          </Form.Item>
        ) : null}
        {ctaType !== 'NONE' ? (
          <Form.Item name="ctaLabel" label="Texto del botón (opcional)" rules={[maxChars(E.ctaLabelMax)]}>
            <Input
              count={countConfig(E.ctaLabelMax)}
              placeholder={(profile.texts as Record<string, string | undefined>).eventCtaLabel || 'Book'}
            />
          </Form.Item>
        ) : null}
        <Form.Item name="isHidden" valuePropName="checked" style={{ marginBottom: 0 }}>
          <HiddenSwitch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function HiddenSwitch({ checked, onChange }: { checked?: boolean; onChange?: (v: boolean) => void }) {
  return (
    <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
      <Switch size="small" checked={!!checked} onChange={(v) => onChange?.(v)} />
      <span>Ocultar de la página (queda guardada)</span>
    </label>
  );
}
