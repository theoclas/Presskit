import { LIMITS, type EditorMemberDto, type EditorProfileDto, type MediaAssetDto, type MemberInput } from '@fersua/shared';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Col, Divider, Form, Input, Popconfirm, Row, Space, Typography } from 'antd';
import { useMemo, useState, type ReactNode } from 'react';
import { describeError, http, useAfterSave } from '../api';
import { SAVED_MESSAGE, useFeedback } from '../feedback';
import { applyFieldErrors, countConfig, maxChars, nullIfEmpty, requiredText, useSyncedForm } from '../forms';
import { ImageUploader } from '../ImageUploader';
import { FIELD_ERROR_MESSAGES } from '../labels';
import { ImageThumb, MediaUsage } from '../media';
import { editorKeys, useEditorScope } from '../scope';
import { SocialLinksEditor, socialRowsKey, toSocialRows, validateSocialRows, type SocialRow } from '../SocialLinksEditor';
import { SortableList } from '../SortableList';
import { useUnsavedChanges } from '../unsaved';

interface MemberValues {
  name: string;
  role: string;
  description: string;
}

const M = LIMITS.members;

function MemberFields() {
  return (
    <>
      <Form.Item name="name" label="Nombre" rules={[requiredText('Escribe el nombre.'), maxChars(M.nameMax)]}>
        <Input count={countConfig(M.nameMax)} autoComplete="off" />
      </Form.Item>
      <Form.Item name="role" label="Rol (opcional)" rules={[maxChars(M.roleMax)]} extra="P. ej. «DJ / Productor».">
        <Input count={countConfig(M.roleMax)} />
      </Form.Item>
      <Form.Item name="description" label="Descripción (opcional)" rules={[maxChars(M.descriptionMax)]}>
        <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} count={countConfig(M.descriptionMax)} />
      </Form.Item>
    </>
  );
}

export function MembersSection({ profile }: { profile: EditorProfileDto }) {
  const { base } = useEditorScope();
  const client = useQueryClient();
  const { message } = useFeedback();
  const afterSave = useAfterSave();
  const [adding, setAdding] = useState(false);
  const members = profile.members;
  const full = members.length >= M.max;

  const reorder = async (next: EditorMemberDto[]) => {
    const key = editorKeys.profile(base);
    const previous = client.getQueryData<EditorProfileDto>(key);
    if (previous) client.setQueryData<EditorProfileDto>(key, { ...previous, members: next });
    try {
      await http.put(`${base}/members/order`, { ids: next.map((m) => m.id) });
      await afterSave();
    } catch (err) {
      if (previous) client.setQueryData(key, previous);
      message.error(describeError(err).message);
    }
  };

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        Hasta {M.max} integrantes. Se muestran en este orden en la sección de artistas.
      </Typography.Paragraph>
      <MediaUsage usage={profile.usage} />
      {members.length ? (
        <SortableList
          items={members}
          getId={(m) => m.id}
          getName={(m) => m.name}
          onReorder={(next) => void reorder(next)}
          renderItem={(member, ctx) => <MemberCard member={member} moveButtons={ctx.moveButtons} />}
        />
      ) : (
        <Typography.Text type="secondary">Todavía no hay integrantes.</Typography.Text>
      )}
      {adding ? (
        <NewMemberCard onDone={() => setAdding(false)} />
      ) : (
        <Button icon={<PlusOutlined />} disabled={full} onClick={() => setAdding(true)}>
          {full ? `Máximo ${M.max} integrantes` : 'Agregar integrante'}
        </Button>
      )}
    </Space>
  );
}

function NewMemberCard({ onDone }: { onDone: () => void }) {
  const { base } = useEditorScope();
  const { message } = useFeedback();
  const afterSave = useAfterSave();
  const [form] = Form.useForm<MemberValues>();
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  useUnsavedChanges(touched);

  const create = async (values: MemberValues) => {
    setSaving(true);
    const body: MemberInput = {
      name: values.name.trim(),
      role: nullIfEmpty(values.role),
      description: nullIfEmpty(values.description),
    };
    try {
      await http.post<EditorMemberDto>(`${base}/members`, body);
      setTouched(false);
      await afterSave();
      message.success('Integrante agregado. Ahora puedes subir su foto.');
      onDone();
    } catch (err) {
      const e = describeError(err);
      applyFieldErrors(form, e.details, FIELD_ERROR_MESSAGES);
      message.error(e.message);
      setSaving(false);
    }
  };

  return (
    <Card title="Nuevo integrante" size="small">
      <Form<MemberValues>
        form={form}
        layout="vertical"
        initialValues={{ name: '', role: '', description: '' }}
        onValuesChange={() => setTouched(true)}
        onFinish={(v) => void create(v)}
      >
        <MemberFields />
        <Space>
          <Button type="primary" htmlType="submit" loading={saving}>
            Agregar
          </Button>
          <Button
            onClick={() => {
              setTouched(false);
              onDone();
            }}
            disabled={saving}
          >
            Cancelar
          </Button>
        </Space>
      </Form>
    </Card>
  );
}

function MemberCard({ member, moveButtons }: { member: EditorMemberDto; moveButtons: ReactNode }) {
  const { base } = useEditorScope();
  const { message } = useFeedback();
  const afterSave = useAfterSave();
  const url = `${base}/members/${encodeURIComponent(member.id)}`;
  const initial = useMemo<MemberValues>(
    () => ({ name: member.name, role: member.role ?? '', description: member.description ?? '' }),
    [member.name, member.role, member.description],
  );
  const { form, dirty, onValuesChange, markSaved, discard } = useSyncedForm<MemberValues>(initial);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async (values: MemberValues) => {
    const patch: Partial<MemberInput> = {};
    if (values.name.trim() !== initial.name) patch.name = values.name.trim();
    if ((values.role ?? '').trim() !== initial.role) patch.role = nullIfEmpty(values.role);
    if ((values.description ?? '').trim() !== initial.description) patch.description = nullIfEmpty(values.description);
    if (!Object.keys(patch).length) {
      discard();
      return;
    }
    setSaving(true);
    try {
      await http.patch<EditorMemberDto>(url, patch);
      markSaved();
      await afterSave();
      message.success(SAVED_MESSAGE);
    } catch (err) {
      const e = describeError(err);
      applyFieldErrors(form, e.details, FIELD_ERROR_MESSAGES);
      message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const setPhoto = async (asset: MediaAssetDto | null) => {
    await http.patch<EditorMemberDto>(url, { photoId: asset ? asset.id : null });
    await afterSave();
    message.success(asset ? 'Foto actualizada' : 'Foto quitada');
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await http.delete(url);
      await afterSave();
      message.success('Integrante borrado');
    } catch (err) {
      message.error(describeError(err).message);
      setDeleting(false);
    }
  };

  return (
    <Card
      size="small"
      title={member.name}
      extra={
        <Space size={6}>
          {moveButtons}
          <Popconfirm
            title={`¿Borrar a ${member.name}?`}
            description="También se borran su foto y sus redes."
            okText="Borrar"
            cancelText="Cancelar"
            okButtonProps={{ danger: true }}
            onConfirm={() => remove()}
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={deleting} aria-label={`Borrar a ${member.name}`} />
          </Popconfirm>
        </Space>
      }
    >
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Space orientation="vertical" size={8} style={{ width: '100%' }}>
            <ImageThumb image={member.photo} alt={member.name} width="100%" aspect="1 / 1" />
            <ImageUploader
              kind="MEMBER"
              onUploaded={(asset) => setPhoto(asset)}
              buttonLabel={member.photo ? 'Cambiar foto' : 'Subir foto'}
              hint="Cuadrada o vertical, desde 500 px."
            />
            {member.photo ? (
              <Popconfirm
                title="¿Quitar la foto?"
                okText="Quitar"
                cancelText="Cancelar"
                onConfirm={() => setPhoto(null).catch((err) => message.error(describeError(err).message))}
              >
                <Button size="small" danger>
                  Quitar foto
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        </Col>
        <Col xs={24} md={16}>
          <Form<MemberValues>
            form={form}
            layout="vertical"
            initialValues={initial}
            onValuesChange={onValuesChange}
            onFinish={(v) => void save(v)}
          >
            <MemberFields />
            <Space>
              <Button type="primary" htmlType="submit" loading={saving} disabled={!dirty}>
                Guardar integrante
              </Button>
              <Button onClick={discard} disabled={!dirty || saving}>
                Descartar
              </Button>
            </Space>
          </Form>
          <Divider titlePlacement="start" plain>
            Redes de {member.name}
          </Divider>
          <MemberSocials member={member} />
        </Col>
      </Row>
    </Card>
  );
}

function MemberSocials({ member }: { member: EditorMemberDto }) {
  const { base } = useEditorScope();
  const { message } = useFeedback();
  const afterSave = useAfterSave();
  const saved = useMemo(() => toSocialRows(member.socials), [member.socials]);
  const [rows, setRows] = useState<SocialRow[]>(saved);
  const [lastSaved, setLastSaved] = useState(saved);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  if (lastSaved !== saved) {
    setLastSaved(saved);
    if (socialRowsKey(rows) === socialRowsKey(lastSaved)) setRows(saved);
  }
  const dirty = socialRowsKey(rows) !== socialRowsKey(saved);
  useUnsavedChanges(dirty);

  const save = async () => {
    const { links, errors } = validateSocialRows(rows, LIMITS.social.perMemberMax);
    if (Object.keys(errors).length) {
      setShowErrors(true);
      message.error('Revisa los enlaces marcados.');
      return;
    }
    setSaving(true);
    try {
      await http.put(`${base}/members/${encodeURIComponent(member.id)}/socials`, { links });
      setShowErrors(false);
      await afterSave();
      message.success(SAVED_MESSAGE);
    } catch (err) {
      message.error(describeError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
      <SocialLinksEditor value={rows} onChange={setRows} max={LIMITS.social.perMemberMax} showAllErrors={showErrors} />
      <Space>
        <Button type="primary" onClick={() => void save()} loading={saving} disabled={!dirty}>
          Guardar redes
        </Button>
        <Button onClick={() => setRows(saved)} disabled={!dirty || saving}>
          Descartar
        </Button>
      </Space>
    </Space>
  );
}
