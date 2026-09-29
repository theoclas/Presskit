import { LIMITS, type EditorGalleryItemDto, type EditorProfileDto, type MediaAssetDto } from '@fersua/shared';
import { DeleteOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Col, Input, Popconfirm, Row, Space, Typography } from 'antd';
import { useState, type ReactNode } from 'react';
import { describeError, http, useAfterSave } from '../api';
import { SAVED_MESSAGE, useFeedback } from '../feedback';
import { countConfig } from '../forms';
import { ImageUploader } from '../ImageUploader';
import { ImageThumb, MediaUsage } from '../media';
import { editorKeys, useEditorScope } from '../scope';
import { SortableList } from '../SortableList';
import { useUnsavedChanges } from '../unsaved';

export function PhotosSection({ profile }: { profile: EditorProfileDto }) {
  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <MediaUsage usage={profile.usage} />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <SingleImageCard
            profile={profile}
            field="heroImageId"
            kind="HERO"
            title="Foto principal (portada)"
            image={profile.heroImage}
            aspect="4 / 3"
            hint="Horizontal, desde 1200 px de ancho. También se usa al compartir el enlace."
          />
        </Col>
        <Col xs={24} lg={10}>
          <SingleImageCard
            profile={profile}
            field="cardImageId"
            kind="CARD"
            title="Foto de la tarjeta del inicio"
            image={profile.cardImage}
            aspect="4 / 5"
            hint="Vertical 4:5: se recorta al centro. Si no hay, la tarjeta usa la foto principal."
          />
        </Col>
      </Row>
      <GalleryCard profile={profile} />
    </Space>
  );
}

interface SingleProps {
  profile: EditorProfileDto;
  field: 'heroImageId' | 'cardImageId';
  kind: 'HERO' | 'CARD';
  title: string;
  image: MediaAssetDto | null;
  aspect: string;
  hint: string;
}

function SingleImageCard({ field, kind, title, image, aspect, hint }: SingleProps) {
  const { base } = useEditorScope();
  const { message } = useFeedback();
  const afterSave = useAfterSave();
  const [removing, setRemoving] = useState(false);

  // El api libera la foto anterior al reemplazarla: aquí solo se asocia la nueva.
  const attach = async (asset: MediaAssetDto) => {
    const { data } = await http.patch<EditorProfileDto>(base, { [field]: asset.id });
    await afterSave(data);
    message.success('Foto actualizada');
  };

  const remove = async () => {
    setRemoving(true);
    try {
      const { data } = await http.patch<EditorProfileDto>(base, { [field]: null });
      await afterSave(data);
      message.success('Foto quitada');
    } catch (err) {
      message.error(describeError(err).message);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card title={title} size="small">
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <ImageThumb
          image={image}
          alt={title}
          width="100%"
          aspect={aspect}
          fit={kind === 'CARD' ? 'cover' : 'contain'}
          // La tarjeta 4:5 a todo el ancho de la columna quedaría altísima.
          style={{ maxWidth: kind === 'CARD' ? 260 : 560 }}
        />
        <ImageUploader kind={kind} onUploaded={attach} buttonLabel={image ? 'Cambiar foto' : 'Subir foto'} hint={hint} />
        {image ? (
          <Popconfirm
            title="¿Quitar esta foto?"
            description="La página dejará de mostrarla."
            okText="Quitar"
            cancelText="Cancelar"
            okButtonProps={{ danger: true }}
            onConfirm={() => remove()}
          >
            <Button danger icon={<DeleteOutlined />} loading={removing}>
              Quitar foto
            </Button>
          </Popconfirm>
        ) : null}
      </Space>
    </Card>
  );
}

function GalleryCard({ profile }: { profile: EditorProfileDto }) {
  const { base } = useEditorScope();
  const client = useQueryClient();
  const { message } = useFeedback();
  const afterSave = useAfterSave();
  const items = profile.gallery;
  const free = Math.max(0, LIMITS.gallery.max - items.length);

  const attach = async (asset: MediaAssetDto) => {
    await http.post(`${base}/gallery`, { mediaId: asset.id });
    await afterSave();
  };

  // Orden optimista: se ve al instante y vuelve atrás si el api lo rechaza.
  const reorder = async (next: EditorGalleryItemDto[]) => {
    const key = editorKeys.profile(base);
    const previous = client.getQueryData<EditorProfileDto>(key);
    if (previous) client.setQueryData<EditorProfileDto>(key, { ...previous, gallery: next });
    try {
      await http.put(`${base}/gallery/order`, { ids: next.map((g) => g.id) });
      await afterSave();
    } catch (err) {
      if (previous) client.setQueryData(key, previous);
      message.error(describeError(err).message);
    }
  };

  return (
    <Card title={`Galería (${items.length}/${LIMITS.gallery.max})`} size="small">
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <ImageUploader
          kind="GALLERY"
          multiple
          maxFiles={free}
          onUploaded={attach}
          buttonLabel="Subir fotos"
          hint={free ? `Puedes subir ${free} más. Arrástralas o usa Subir/Bajar para ordenarlas.` : 'La galería está llena.'}
        />
        {items.length ? (
          <SortableList
            items={items}
            getId={(g) => g.id}
            getName={(_g, i) => `foto ${i + 1}`}
            onReorder={(next) => void reorder(next)}
            draggable
            layout="grid"
            gridMin={170}
            renderItem={(item, ctx) => (
              <GalleryItem item={item} index={ctx.index} handle={ctx.handle} moveButtons={ctx.moveButtons} />
            )}
          />
        ) : (
          <Typography.Text type="secondary">Todavía no hay fotos en la galería.</Typography.Text>
        )}
      </Space>
    </Card>
  );
}

function GalleryItem({
  item,
  index,
  handle,
  moveButtons,
}: {
  item: EditorGalleryItemDto;
  index: number;
  handle: ReactNode;
  moveButtons: ReactNode;
}) {
  const { base } = useEditorScope();
  const { message } = useFeedback();
  const afterSave = useAfterSave();
  const saved = item.alt ?? '';
  const [alt, setAlt] = useState(saved);
  const [lastSaved, setLastSaved] = useState(saved);
  const [busy, setBusy] = useState(false);
  if (lastSaved !== saved) {
    setLastSaved(saved);
    if (alt === lastSaved) setAlt(saved);
  }
  const changed = alt.trim() !== saved.trim();
  useUnsavedChanges(changed);

  const saveAlt = async () => {
    if (!changed || busy) return;
    if ([...alt.trim()].length > LIMITS.gallery.altMax) {
      message.error(`La descripción admite máximo ${LIMITS.gallery.altMax} caracteres.`);
      return;
    }
    setBusy(true);
    try {
      await http.patch(`${base}/gallery/${encodeURIComponent(item.id)}`, { alt: alt.trim() || null });
      await afterSave();
      message.success(SAVED_MESSAGE);
    } catch (err) {
      message.error(describeError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await http.delete(`${base}/gallery/${encodeURIComponent(item.id)}`);
      await afterSave();
      message.success('Foto borrada');
    } catch (err) {
      message.error(describeError(err).message);
      setBusy(false);
    }
  };

  return (
    <div style={{ border: '1px solid rgba(148,163,184,.3)', borderRadius: 8, padding: 8, height: '100%' }}>
      <ImageThumb image={item.image} alt={alt || `Foto ${index + 1}`} width="100%" aspect="1 / 1" />
      <Input
        size="small"
        style={{ marginTop: 8 }}
        aria-label={`Descripción de la foto ${index + 1}`}
        placeholder="Descripción (opcional)"
        value={alt}
        count={countConfig(LIMITS.gallery.altMax)}
        onChange={(e) => setAlt(e.target.value)}
        onBlur={() => void saveAlt()}
        onPressEnter={() => void saveAlt()}
        disabled={busy}
      />
      <Space size={4} wrap style={{ marginTop: 8, width: '100%', justifyContent: 'space-between' }}>
        <Space size={2}>
          {handle}
          {moveButtons}
        </Space>
        <Popconfirm
          title="¿Borrar esta foto de la galería?"
          okText="Borrar"
          cancelText="Cancelar"
          okButtonProps={{ danger: true }}
          onConfirm={() => remove()}
        >
          <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Borrar la foto ${index + 1}`} loading={busy} />
        </Popconfirm>
      </Space>
    </div>
  );
}
