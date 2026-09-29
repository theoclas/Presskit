import {
  DEFAULT_PALETTE,
  isValidEmail,
  isValidPhone,
  LIMITS,
  PAGE_TEXT_SLOTS,
  validateSlug,
  validateTexts,
  type EditorProfileDto,
  type PaletteKey,
  type TextGroup,
  type TextSlot,
  type UpdateProfileInput,
} from '@fersua/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Collapse, Form, Input, Row, Select, Space, Switch, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { asList, describeError, http, useAfterSave } from '../api';
import { SAVED_MESSAGE, useFeedback } from '../feedback';
import { applyFieldErrors, countConfig, maxChars, nullIfEmpty, requiredText, useSyncedForm } from '../forms';
import {
  FIELD_ERROR_MESSAGES,
  PROFILE_STATUS_LABELS,
  SLUG_ERROR_MESSAGES,
  TEXT_ERROR_MESSAGES,
  TEXT_GROUP_LABELS,
} from '../labels';
import { PalettePicker } from '../PalettePicker';
import { SaveBar } from '../SaveBar';
import { editorKeys, useEditorScope } from '../scope';
import { TextSlotField } from '../TextSlotField';
import { useUnsavedChanges } from '../unsaved';

type ShowFlags = EditorProfileDto['show'];

export interface ProfileFormValues {
  displayName: string;
  tagline: string;
  city: string;
  seoDescription: string;
  palette: PaletteKey;
  whatsappNumber: string;
  publicEmail: string;
  publicPhone: string;
  show: ShowFlags;
  formOpenWhatsapp: boolean;
  notifyByEmail: boolean;
  texts: Record<string, string>;
}

const SLOTS = PAGE_TEXT_SLOTS as readonly TextSlot[];
const GROUP_ORDER = Object.keys(TEXT_GROUP_LABELS) as TextGroup[];

const SHOW_LABELS: Record<keyof ShowFlags, string> = {
  gallery: 'Galería de fotos',
  rider: 'Rider técnico',
  events: 'Sección de fechas',
  openDateRow: 'Fila «Disponible» en fechas',
  form: 'Formulario de solicitud',
};

/** Valores del formulario: lo guardado, y el texto por defecto donde no hay nada guardado. */
export function profileFormValues(p: EditorProfileDto): ProfileFormValues {
  const texts: Record<string, string> = {};
  for (const slot of SLOTS) {
    const stored = (p.texts as Record<string, string | undefined>)[slot.key];
    texts[slot.key] = typeof stored === 'string' && stored !== '' ? stored : slot.default;
  }
  return {
    displayName: p.displayName,
    tagline: p.tagline ?? '',
    city: p.city ?? '',
    seoDescription: p.seoDescription ?? '',
    palette: p.palette ?? DEFAULT_PALETTE,
    whatsappNumber: p.whatsappNumber ?? '',
    publicEmail: p.publicEmail ?? '',
    publicPhone: p.publicPhone ?? '',
    show: { ...p.show },
    formOpenWhatsapp: p.formOpenWhatsapp,
    notifyByEmail: p.notifyByEmail,
    texts,
  };
}

/** Solo los textos que cambiaron. Volver al texto por defecto se envía como '' (automático). */
export function buildTextsPatch(initial: Record<string, string>, current: Record<string, string>): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const slot of SLOTS) {
    const before = (initial[slot.key] ?? '').trim();
    const now = (current[slot.key] ?? '').trim();
    if (before === now) continue;
    patch[slot.key] = now === slot.default ? '' : now;
  }
  return patch;
}

export function onlyDigits(v: string): string {
  return v.replace(/\D+/g, '');
}

/** Parche con solo los campos que cambiaron (nunca estado, dueño ni destacado). */
export function buildProfilePatch(initial: ProfileFormValues, values: ProfileFormValues): UpdateProfileInput {
  const patch: UpdateProfileInput = {};
  if (values.displayName.trim() !== initial.displayName.trim()) patch.displayName = values.displayName.trim();
  const optional = ['tagline', 'city', 'seoDescription', 'publicEmail', 'publicPhone'] as const;
  for (const key of optional) {
    if ((values[key] ?? '').trim() !== (initial[key] ?? '').trim()) patch[key] = nullIfEmpty(values[key]);
  }
  if (onlyDigits(values.whatsappNumber ?? '') !== onlyDigits(initial.whatsappNumber ?? '')) {
    patch.whatsappNumber = onlyDigits(values.whatsappNumber ?? '') || null;
  }
  if (values.palette !== initial.palette) patch.palette = values.palette;
  const show: Partial<ShowFlags> = {};
  for (const key of Object.keys(SHOW_LABELS) as (keyof ShowFlags)[]) {
    if (!!values.show?.[key] !== !!initial.show[key]) show[key] = !!values.show?.[key];
  }
  if (Object.keys(show).length) patch.show = show;
  if (!!values.formOpenWhatsapp !== !!initial.formOpenWhatsapp) patch.formOpenWhatsapp = !!values.formOpenWhatsapp;
  if (!!values.notifyByEmail !== !!initial.notifyByEmail) patch.notifyByEmail = !!values.notifyByEmail;
  const texts = buildTextsPatch(initial.texts, values.texts ?? {});
  if (Object.keys(texts).length) patch.texts = texts;
  return patch;
}

const WHATSAPP_RULES = [
  {
    validator: (_r: unknown, v: unknown) => {
      const digits = onlyDigits(typeof v === 'string' ? v : '');
      if (!digits) return Promise.resolve();
      if (digits.length < LIMITS.profile.whatsappDigitsMin || digits.length > LIMITS.profile.whatsappDigitsMax) {
        return Promise.reject(
          new Error(`Escribe de ${LIMITS.profile.whatsappDigitsMin} a ${LIMITS.profile.whatsappDigitsMax} dígitos, con el indicativo del país.`),
        );
      }
      return Promise.resolve();
    },
  },
  {
    warningOnly: true,
    validator: (_r: unknown, v: unknown) => {
      const digits = onlyDigits(typeof v === 'string' ? v : '');
      return digits.length === 10 && digits.startsWith('3')
        ? Promise.reject(new Error('Parece un celular colombiano sin el 57 al inicio.'))
        : Promise.resolve();
    },
  },
];

export function ProfileSection({ profile }: { profile: EditorProfileDto }) {
  const { base } = useEditorScope();
  const { message } = useFeedback();
  const afterSave = useAfterSave();
  const initial = useMemo(() => profileFormValues(profile), [profile]);
  const { form, dirty, onValuesChange, markSaved, discard } = useSyncedForm<ProfileFormValues>(initial);
  const displayName = (Form.useWatch('displayName', form) as string | undefined) ?? profile.displayName;
  const [openGroups, setOpenGroups] = useState<string[]>([]);

  /** Los textos con error pueden estar en un panel cerrado: se abren para que se vean. */
  const revealErrors = (names: (string | number)[][]) => {
    const groups = new Set(openGroups);
    for (const name of names) {
      if (name[0] !== 'texts') continue;
      const slot = SLOTS.find((s) => s.key === name[1]);
      if (slot) groups.add(slot.group);
    }
    setOpenGroups([...groups]);
  };

  const save = useMutation({
    mutationFn: async (patch: UpdateProfileInput) => (await http.patch<EditorProfileDto>(base, patch)).data,
  });

  const onSave = async () => {
    let values: ProfileFormValues;
    try {
      await form.validateFields();
      values = form.getFieldsValue(true) as ProfileFormValues;
    } catch (err) {
      const fields = (err as { errorFields?: { name: (string | number)[] }[] }).errorFields ?? [];
      revealErrors(fields.map((f) => f.name));
      message.error('Revisa los campos marcados.');
      return;
    }
    const patch = buildProfilePatch(initial, values);
    if (patch.texts) {
      // Misma validación que el api antes de enviar.
      const check = validateTexts(patch.texts);
      const keys = Object.keys(check.errors);
      if (keys.length) {
        form.setFields(keys.map((k) => ({ name: ['texts', k], errors: [TEXT_ERROR_MESSAGES[check.errors[k]!]] })));
        revealErrors(keys.map((k) => ['texts', k]));
        message.error('Revisa los textos marcados.');
        return;
      }
    }
    if (!Object.keys(patch).length) {
      markSaved();
      discard();
      return;
    }
    try {
      const updated = await save.mutateAsync(patch);
      markSaved();
      await afterSave(updated);
      message.success(SAVED_MESSAGE);
    } catch (err) {
      const e = describeError(err);
      // details llega como { 'texts.heroTitle': 'TOO_LONG', displayName: 'REQUIRED' }.
      if (applyFieldErrors(form, e.details, FIELD_ERROR_MESSAGES)) {
        revealErrors(Object.keys(e.details ?? {}).map((k) => k.split('.')));
      }
      message.error(e.message);
    }
  };

  const collapseItems = GROUP_ORDER.map((group) => ({
    key: group,
    label: TEXT_GROUP_LABELS[group],
    forceRender: true,
    children: SLOTS.filter((s) => s.group === group).map((slot) => (
      <TextSlotField
        key={slot.key}
        slot={slot}
        form={form}
        onRestored={onValuesChange}
        derivedDefault={
          slot.key === 'heroPhotoAlt'
            ? `Show de ${displayName}`
            : slot.key === 'footerText'
              ? `${displayName} — Booking`
              : undefined
        }
      />
    )),
  }));

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Form<ProfileFormValues>
        form={form}
        layout="vertical"
        initialValues={initial}
        onValuesChange={onValuesChange}
        onFinish={() => void onSave()}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} xl={12}>
            <Card title="Datos básicos" size="small">
              <Form.Item
                name="displayName"
                label="Nombre artístico"
                rules={[
                  requiredText('Escribe el nombre artístico.'),
                  { min: LIMITS.profile.displayNameMin, message: `Mínimo ${LIMITS.profile.displayNameMin} caracteres.` },
                  maxChars(LIMITS.profile.displayNameMax),
                ]}
              >
                <Input count={countConfig(LIMITS.profile.displayNameMax)} autoComplete="off" />
              </Form.Item>
              <Form.Item name="tagline" label="Frase corta (tarjeta del inicio)" rules={[maxChars(LIMITS.profile.taglineMax)]}>
                <Input count={countConfig(LIMITS.profile.taglineMax)} />
              </Form.Item>
              <Form.Item name="city" label="Ciudad" rules={[maxChars(LIMITS.profile.cityMax)]}>
                <Input count={countConfig(LIMITS.profile.cityMax)} autoComplete="off" />
              </Form.Item>
              <Form.Item
                name="seoDescription"
                label="Descripción para Google y al compartir el enlace"
                rules={[maxChars(LIMITS.profile.seoDescriptionMax)]}
              >
                <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} count={countConfig(LIMITS.profile.seoDescriptionMax)} />
              </Form.Item>
            </Card>
          </Col>
          <Col xs={24} xl={12}>
            <Card title="Contacto" size="small">
              <Form.Item
                name="whatsappNumber"
                label="WhatsApp de booking"
                extra="Con el indicativo del país, p. ej. 57 300 123 4567. Lo usan los botones de WhatsApp de la página."
                rules={WHATSAPP_RULES}
              >
                <Input inputMode="tel" autoComplete="off" placeholder="57 300 123 4567" maxLength={24} />
              </Form.Item>
              <Form.Item
                name="publicEmail"
                label="Correo público (opcional)"
                extra="Solo lo leen los buscadores (datos estructurados); no se muestra en la página."
                rules={[
                  maxChars(LIMITS.user.emailMax),
                  {
                    validator: (_r, v: unknown) =>
                      typeof v === 'string' && v.trim() && !isValidEmail(v.trim().toLowerCase())
                        ? Promise.reject(new Error('Escribe un correo válido.'))
                        : Promise.resolve(),
                  },
                ]}
              >
                <Input inputMode="email" autoComplete="off" />
              </Form.Item>
              <Form.Item
                name="publicPhone"
                label="Teléfono público (opcional)"
                extra="Solo lo leen los buscadores (datos estructurados); no se muestra en la página."
                rules={[
                  {
                    validator: (_r, v: unknown) =>
                      typeof v === 'string' && v.trim() && !isValidPhone(v.trim())
                        ? Promise.reject(new Error('Escribe un teléfono válido (7 a 15 dígitos).'))
                        : Promise.resolve(),
                  },
                ]}
              >
                <Input inputMode="tel" autoComplete="off" maxLength={20} />
              </Form.Item>
              <Form.Item name="formOpenWhatsapp" valuePropName="checked" style={{ marginBottom: 8 }}>
                <SwitchRow label="Al enviar el formulario, abrir WhatsApp con el resumen" />
              </Form.Item>
              <Form.Item name="notifyByEmail" valuePropName="checked" style={{ marginBottom: 0 }}>
                <SwitchRow label="Avisar por correo cada solicitud nueva al dueño (se activa con el panel de DJs; por ahora no se envían)" />
              </Form.Item>
            </Card>
          </Col>
          <Col xs={24}>
            <Card title="Paleta de colores" size="small">
              <Form.Item name="palette" style={{ marginBottom: 0 }}>
                <PalettePicker />
              </Form.Item>
            </Card>
          </Col>
          <Col xs={24}>
            <Card title="Secciones visibles" size="small">
              <Row gutter={[16, 8]}>
                {(Object.keys(SHOW_LABELS) as (keyof ShowFlags)[]).map((key) => (
                  <Col xs={24} md={12} key={key}>
                    <Form.Item name={['show', key]} valuePropName="checked" style={{ marginBottom: 0 }}>
                      <SwitchRow label={SHOW_LABELS[key]} />
                    </Form.Item>
                  </Col>
                ))}
              </Row>
              <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
                Una sección sin contenido (sin fotos, sin rider…) no se muestra aunque esté encendida.
              </Typography.Paragraph>
            </Card>
          </Col>
          <Col xs={24}>
            <Card title="Textos de la página" size="small">
              <Collapse
                items={collapseItems}
                size="small"
                activeKey={openGroups}
                onChange={(keys) => setOpenGroups(Array.isArray(keys) ? keys.map(String) : [String(keys)])}
              />
            </Card>
          </Col>
        </Row>
        <SaveBar dirty={dirty} saving={save.isPending} onSave={() => void onSave()} onDiscard={discard} sticky />
      </Form>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <SlugCard profile={profile} />
        </Col>
        <Col xs={24} xl={12}>
          <GenresCard profile={profile} />
        </Col>
      </Row>
    </Space>
  );
}

/** Switch con su texto al lado (recibe checked/onChange de Form.Item). */
function SwitchRow({ label, checked, onChange }: { label: string; checked?: boolean; onChange?: (v: boolean) => void }) {
  return (
    <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
      <Switch size="small" checked={!!checked} onChange={(v) => onChange?.(v)} />
      <span>{label}</span>
    </label>
  );
}

function SlugCard({ profile }: { profile: EditorProfileDto }) {
  const { base, actor } = useEditorScope();
  const { message, modal } = useFeedback();
  const afterSave = useAfterSave();
  const [slug, setSlug] = useState(profile.slug);
  const [serverError, setServerError] = useState<string | null>(null);
  const [lastProfileSlug, setLastProfileSlug] = useState(profile.slug);
  if (lastProfileSlug !== profile.slug) {
    // Llegó otro slug del servidor: se toma, salvo que haya uno escrito sin guardar.
    setLastProfileSlug(profile.slug);
    if (slug.trim().toLowerCase() === lastProfileSlug) setSlug(profile.slug);
  }
  const value = slug.trim().toLowerCase();
  const changed = value !== profile.slug;
  const localError = changed ? validateSlug(value) : null;
  useUnsavedChanges(changed);

  const mutation = useMutation({
    mutationFn: async (next: string) => (await http.put<EditorProfileDto>(`${base}/slug`, { slug: next })).data,
  });

  const confirm = () => {
    if (!changed || localError) return;
    modal.confirm({
      title: 'Cambiar la dirección de la página',
      content: (
        <>
          <p>
            La página pasará de <strong>/{profile.slug}</strong> a <strong>/{value}</strong>.
          </p>
          <p>
            Los enlaces viejos redirigirán a la nueva dirección (se guardan hasta {LIMITS.profile.maxSlugRedirects}{' '}
            direcciones anteriores), pero conviene actualizar la bio de Instagram y los enlaces compartidos.
          </p>
          {actor === 'owner' ? <p>Solo puedes cambiarla una vez cada {LIMITS.profile.slugChangeCooldownDays} días.</p> : null}
        </>
      ),
      okText: 'Cambiar dirección',
      cancelText: 'Cancelar',
      onOk: async () => {
        setServerError(null);
        try {
          const updated = await mutation.mutateAsync(value);
          await afterSave(updated);
          message.success('Dirección actualizada');
        } catch (err) {
          const e = describeError(err);
          setServerError(e.message);
        }
      },
    });
  };

  return (
    <Card title="Dirección de la página" size="small">
      <Form layout="vertical" onFinish={confirm}>
        <Form.Item
          label="Dirección"
          validateStatus={localError || serverError ? 'error' : undefined}
          help={localError ? SLUG_ERROR_MESSAGES[localError] : serverError ?? undefined}
          extra={
            profile.status === 'APPROVED'
              ? 'Los enlaces viejos redirigirán a la nueva dirección.'
              : `El perfil está en «${PROFILE_STATUS_LABELS[profile.status]}»: la página todavía no es pública.`
          }
        >
          <Space.Compact style={{ width: '100%' }}>
            <Input value="fersuastudio.com/" disabled style={{ width: 150 }} aria-hidden="true" tabIndex={-1} />
            <Input
              aria-label="Dirección de la página"
              value={slug}
              maxLength={LIMITS.profile.slugMax}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => {
                setServerError(null);
                setSlug(e.target.value.toLowerCase());
              }}
            />
          </Space.Compact>
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" disabled={!changed || !!localError} loading={mutation.isPending}>
            Cambiar dirección
          </Button>
          <Button disabled={!changed} onClick={() => setSlug(profile.slug)}>
            Descartar
          </Button>
        </Space>
      </Form>
    </Card>
  );
}

interface GenreOption {
  id: number;
  name: string;
  isActive?: boolean;
}

function GenresCard({ profile }: { profile: EditorProfileDto }) {
  const { base, genresUrl } = useEditorScope();
  const { message } = useFeedback();
  const afterSave = useAfterSave();
  const savedIds = useMemo(() => profile.genres.map((g) => g.id), [profile.genres]);
  const [ids, setIds] = useState<number[]>(savedIds);
  const [lastSaved, setLastSaved] = useState(savedIds);
  if (lastSaved !== savedIds) {
    setLastSaved(savedIds);
    if (ids.join(',') === lastSaved.join(',')) setIds(savedIds);
  }
  const changed = ids.join(',') !== savedIds.join(',');
  useUnsavedChanges(changed);

  const genres = useQuery({
    queryKey: editorKeys.genres(genresUrl ?? ''),
    queryFn: async ({ signal }) => asList<GenreOption>((await http.get(genresUrl!, { signal })).data),
    enabled: !!genresUrl,
    staleTime: 5 * 60_000,
  });

  const mutation = useMutation({
    mutationFn: async (genreIds: number[]) => (await http.put(`${base}/genres`, { genreIds })).data as unknown,
  });

  if (!genresUrl) {
    return (
      <Card title="Géneros" size="small">
        <Typography.Text>{profile.genres.map((g) => g.name).join(' · ') || 'Sin géneros'}</Typography.Text>
      </Card>
    );
  }

  const options = (genres.data ?? [])
    .filter((g) => g.isActive !== false || savedIds.includes(g.id))
    .map((g) => ({ value: g.id, label: g.isActive === false ? `${g.name} (inactivo)` : g.name }));
  const tooFew = ids.length < LIMITS.genres.perProfileMin;

  const onSave = async () => {
    try {
      const res = await mutation.mutateAsync(ids);
      await afterSave(res as EditorProfileDto);
      message.success(SAVED_MESSAGE);
    } catch (err) {
      message.error(describeError(err).message);
    }
  };

  return (
    <Card title="Géneros" size="small">
      {genres.isError ? <Alert type="error" showIcon title="No pudimos cargar la lista de géneros." /> : null}
      <Form layout="vertical">
        <Form.Item
          label={`Elige de ${LIMITS.genres.perProfileMin} a ${LIMITS.genres.perProfileMax}`}
          validateStatus={tooFew ? 'error' : undefined}
          help={tooFew ? 'Elige al menos un género.' : undefined}
        >
          <Select
            mode="multiple"
            aria-label="Géneros"
            value={ids}
            options={options}
            loading={genres.isPending}
            maxCount={LIMITS.genres.perProfileMax}
            showSearch={{ optionFilterProp: 'label' }}
            onChange={(v: number[]) => setIds(v)}
            placeholder="Elige los géneros"
          />
        </Form.Item>
        <Space>
          <Button type="primary" onClick={() => void onSave()} disabled={!changed || tooFew} loading={mutation.isPending}>
            Guardar géneros
          </Button>
          <Button disabled={!changed} onClick={() => setIds(savedIds)}>
            Descartar
          </Button>
        </Space>
      </Form>
    </Card>
  );
}
