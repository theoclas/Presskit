import type { EditorProfileDto, FormFieldConfig } from '@fersua/shared';
import { Alert, Space } from 'antd';
import { useMemo, useState } from 'react';
import { describeError, http, useAfterSave } from '../api';
import { SAVED_MESSAGE, useFeedback } from '../feedback';
import { cleanFormConfig, FormConfigEditor, formConfigIssues } from '../FormConfigEditor';
import { SaveBar } from '../SaveBar';
import { useEditorScope } from '../scope';
import { useUnsavedChanges } from '../unsaved';

const configKey = (c: readonly FormFieldConfig[]) => JSON.stringify(cleanFormConfig(c));

export function BookingFormSection({ profile }: { profile: EditorProfileDto }) {
  const { base } = useEditorScope();
  const { message } = useFeedback();
  const afterSave = useAfterSave();
  const saved = profile.bookingForm;
  const [config, setConfig] = useState<FormFieldConfig[]>(saved);
  const [lastSaved, setLastSaved] = useState(saved);
  const [saving, setSaving] = useState(false);
  if (lastSaved !== saved) {
    setLastSaved(saved);
    if (configKey(config) === configKey(lastSaved)) setConfig(saved);
  }
  const dirty = configKey(config) !== configKey(saved);
  const issues = useMemo(() => formConfigIssues(config), [config]);
  useUnsavedChanges(dirty);

  const save = async () => {
    if (issues.length) {
      message.error('Corrige lo marcado en el formulario antes de guardar.');
      return;
    }
    setSaving(true);
    try {
      const { data } = await http.put<EditorProfileDto>(`${base}/booking-form`, { fields: cleanFormConfig(config) });
      await afterSave(data);
      message.success(SAVED_MESSAGE);
    } catch (err) {
      message.error(describeError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
      {!profile.show.form ? (
        <Alert type="info" showIcon title="El formulario está oculto en «Perfil y textos → Secciones visibles»." />
      ) : null}
      <FormConfigEditor value={config} onChange={setConfig} />
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => void save()}
        onDiscard={() => setConfig(saved)}
        disabled={issues.length > 0}
        sticky
      />
    </Space>
  );
}
