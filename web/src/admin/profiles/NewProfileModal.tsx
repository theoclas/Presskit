import { LIMITS, suggestSlug, validateSlug, type EditorProfileDto } from '@fersua/shared';
import { Alert, Form, Input, Modal, Space, Typography } from 'antd';
import { useState } from 'react';
import { useFeedback } from '../../editor-kit/feedback';
import { charCount, countConfig } from '../../editor-kit/forms';
import { SLUG_ERROR_MESSAGES } from '../../editor-kit/labels';
import { apiError, http } from '../../lib/http';
import { errorMessage } from '../errors';
import { useRefreshProfile } from './api';

interface Props {
  onClose: () => void;
  onCreated: (profile: EditorProfileDto) => void;
}

/** Nombre → dirección sugerida (se puede editar) con la misma validación del api. */
export function NewProfileModal({ onClose, onCreated }: Props) {
  const { message } = useFeedback();
  const refresh = useRefreshProfile();
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [slugServerError, setSlugServerError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const name = displayName.trim();
  const nameProblem = !name
    ? 'Escribe el nombre artístico.'
    : charCount(name) < LIMITS.profile.displayNameMin
      ? `Mínimo ${LIMITS.profile.displayNameMin} caracteres.`
      : charCount(name) > LIMITS.profile.displayNameMax
        ? `Máximo ${LIMITS.profile.displayNameMax} caracteres.`
        : null;
  const slugValue = slug.trim().toLowerCase();
  const slugCode = slugValue ? validateSlug(slugValue) : 'FORMAT';
  const slugProblem = slugServerError ?? (slugCode ? SLUG_ERROR_MESSAGES[slugCode] : null);

  const onName = (v: string) => {
    setDisplayName(v);
    if (!slugEdited) {
      setSlug(v.trim() ? suggestSlug(v) : '');
      setSlugServerError(null);
    }
  };

  const submit = async () => {
    setTouched(true);
    if (nameProblem || slugProblem || sending) return;
    setSending(true);
    setError(null);
    try {
      const { data } = await http.post<EditorProfileDto>('/admin/profiles', { slug: slugValue, displayName: name });
      await refresh(data.id);
      message.success('Perfil creado como borrador');
      onCreated(data);
    } catch (e) {
      const err = apiError(e);
      // Slug reservado o con formato inválido llegan como VALIDATION_FAILED con details.slug.
      if (err.code === 'SLUG_TAKEN' || err.details?.slug) {
        setSlugServerError(errorMessage(e));
      } else {
        setError(errorMessage(e));
      }
      setSending(false);
    }
  };

  return (
    <Modal
      open
      title="Nuevo perfil de DJ"
      okText="Crear borrador"
      cancelText="Cancelar"
      confirmLoading={sending}
      onOk={() => void submit()}
      onCancel={onClose}
      mask={{ closable: false }}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        Se crea como borrador con los textos y el formulario por defecto. No es público hasta que lo apruebes.
      </Typography.Paragraph>
      <Form layout="vertical" onFinish={() => void submit()}>
        <Form.Item
          label="Nombre artístico"
          required
          validateStatus={touched && nameProblem ? 'error' : undefined}
          help={touched && nameProblem ? nameProblem : undefined}
        >
          <Input
            autoFocus
            value={displayName}
            onChange={(e) => onName(e.target.value)}
            count={countConfig(LIMITS.profile.displayNameMax)}
            autoComplete="off"
          />
        </Form.Item>
        <Form.Item
          label="Dirección de la página"
          required
          validateStatus={(touched || slugEdited) && slugProblem ? 'error' : undefined}
          help={(touched || slugEdited) && slugProblem ? slugProblem : undefined}
          extra={slugValue && !slugProblem ? `Quedará en fersuastudio.com/${slugValue}` : undefined}
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
                setSlugEdited(true);
                setSlugServerError(null);
                setSlug(e.target.value.toLowerCase());
              }}
            />
          </Space.Compact>
        </Form.Item>
        {/* Enter en cualquier campo crea el perfil. */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </Form>
      {error ? <Alert type="error" showIcon title={error} /> : null}
    </Modal>
  );
}
