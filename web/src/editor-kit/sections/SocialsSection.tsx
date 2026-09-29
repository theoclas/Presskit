import { LIMITS, type EditorProfileDto } from '@fersua/shared';
import { Card, Space, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { describeError, http, useAfterSave } from '../api';
import { SAVED_MESSAGE, useFeedback } from '../feedback';
import { SaveBar } from '../SaveBar';
import { useEditorScope } from '../scope';
import { SocialLinksEditor, socialRowsKey, toSocialRows, validateSocialRows, type SocialRow } from '../SocialLinksEditor';
import { useUnsavedChanges } from '../unsaved';

/** Redes del perfil (las que salen en la portada). Las de cada integrante van en «Integrantes». */
export function SocialsSection({ profile }: { profile: EditorProfileDto }) {
  const { base } = useEditorScope();
  const { message } = useFeedback();
  const afterSave = useAfterSave();
  const saved = useMemo(() => toSocialRows(profile.socials), [profile.socials]);
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
    const { links, errors } = validateSocialRows(rows, LIMITS.social.perProfileMax);
    if (Object.keys(errors).length) {
      setShowErrors(true);
      message.error('Revisa los enlaces marcados.');
      return;
    }
    setSaving(true);
    try {
      const { data } = await http.put<EditorProfileDto>(`${base}/socials`, { links });
      setShowErrors(false);
      await afterSave(data);
      message.success(SAVED_MESSAGE);
    } catch (err) {
      message.error(describeError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title={`Redes del perfil (${rows.length}/${LIMITS.social.perProfileMax})`} size="small">
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          Pega el enlace del perfil o escribe el @usuario (Instagram, TikTok, SoundCloud, X…). Solo se aceptan
          enlaces de la red elegida.
        </Typography.Paragraph>
        <SocialLinksEditor value={rows} onChange={setRows} max={LIMITS.social.perProfileMax} showAllErrors={showErrors} />
        <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onDiscard={() => setRows(saved)} />
      </Space>
    </Card>
  );
}
