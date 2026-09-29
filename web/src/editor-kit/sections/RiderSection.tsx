import { LIMITS, type EditorProfileDto, type EditorRiderItemDto, type RiderItemInput } from '@fersua/shared';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { describeError, http, useAfterSave } from '../api';
import { SAVED_MESSAGE, useFeedback } from '../feedback';
import { charCount, countConfig } from '../forms';
import { SaveBar } from '../SaveBar';
import { useEditorScope } from '../scope';
import { SortableList } from '../SortableList';
import { useUnsavedChanges } from '../unsaved';

const R = LIMITS.rider;

interface RiderRow {
  uid: string;
  name: string;
  note: string;
}

let seq = 0;
const newUid = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

function toRows(items: readonly EditorRiderItemDto[]): RiderRow[] {
  return items.map((i) => ({ uid: i.id || newUid(), name: i.name, note: i.note ?? '' }));
}

const rowsKey = (rows: readonly RiderRow[]) => JSON.stringify(rows.map((r) => [r.name.trim(), r.note.trim()]));

export function riderRowError(row: Pick<RiderRow, 'name' | 'note'>): string | null {
  if (!row.name.trim()) return 'Escribe el equipo o quita la fila.';
  if (charCount(row.name.trim()) > R.nameMax) return `El nombre admite máximo ${R.nameMax} caracteres.`;
  if (charCount(row.note.trim()) > R.noteMax) return `La nota admite máximo ${R.noteMax} caracteres.`;
  return null;
}

export function RiderSection({ profile }: { profile: EditorProfileDto }) {
  const { base } = useEditorScope();
  const { message } = useFeedback();
  const afterSave = useAfterSave();
  const saved = useMemo(() => toRows(profile.riderItems), [profile.riderItems]);
  const [rows, setRows] = useState<RiderRow[]>(saved);
  const [lastSaved, setLastSaved] = useState(saved);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  if (lastSaved !== saved) {
    setLastSaved(saved);
    if (rowsKey(rows) === rowsKey(lastSaved)) setRows(saved);
  }
  const dirty = rowsKey(rows) !== rowsKey(saved);
  useUnsavedChanges(dirty);

  const update = (uid: string, change: Partial<RiderRow>) => setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...change } : r)));

  const save = async () => {
    const invalid = rows.some((r) => riderRowError(r));
    if (invalid) {
      setShowErrors(true);
      message.error('Revisa las filas marcadas.');
      return;
    }
    const items: RiderItemInput[] = rows.map((r) => ({ name: r.name.trim(), note: r.note.trim() || null }));
    setSaving(true);
    try {
      const { data } = await http.put<EditorProfileDto>(`${base}/rider`, { items });
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
    <Card title={`Rider técnico (${rows.length}/${R.max})`} size="small">
      <Space orientation="vertical" size={12} style={{ width: '100%' }}>
        {!profile.show.rider ? (
          <Alert type="info" showIcon title="El rider está oculto en «Perfil y textos → Secciones visibles»." />
        ) : null}
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          Un equipo por fila, p. ej. «CDJ-3000 ×2» con la nota «o CDJ-2000NXS2».
        </Typography.Paragraph>
        {rows.length ? (
          <SortableList
            items={rows}
            getId={(r) => r.uid}
            getName={(r, i) => r.name.trim() || `fila ${i + 1}`}
            onReorder={setRows}
            renderItem={(row, ctx) => {
              const error = showErrors || row.name ? riderRowError(row) : null;
              return (
                <Form.Item
                  style={{ margin: 0 }}
                  validateStatus={error && (showErrors || row.name.trim()) ? 'error' : undefined}
                  help={error && (showErrors || row.name.trim()) ? error : undefined}
                >
                  <Space wrap align="start" style={{ width: '100%' }}>
                    <Input
                      aria-label={`Equipo ${ctx.index + 1}`}
                      placeholder="Equipo"
                      value={row.name}
                      count={countConfig(R.nameMax)}
                      style={{ minWidth: 220 }}
                      onChange={(e) => update(row.uid, { name: e.target.value })}
                    />
                    <Input
                      aria-label={`Nota del equipo ${ctx.index + 1}`}
                      placeholder="Nota (opcional)"
                      value={row.note}
                      count={countConfig(R.noteMax)}
                      style={{ minWidth: 200 }}
                      onChange={(e) => update(row.uid, { note: e.target.value })}
                    />
                    {ctx.moveButtons}
                    <Button
                      icon={<DeleteOutlined />}
                      aria-label={`Quitar ${row.name.trim() || `fila ${ctx.index + 1}`}`}
                      onClick={() => setRows((prev) => prev.filter((r) => r.uid !== row.uid))}
                    />
                  </Space>
                </Form.Item>
              );
            }}
          />
        ) : (
          <Typography.Text type="secondary">Todavía no hay equipos en el rider.</Typography.Text>
        )}
        <Button
          icon={<PlusOutlined />}
          disabled={rows.length >= R.max}
          onClick={() => setRows((prev) => [...prev, { uid: newUid(), name: '', note: '' }])}
        >
          {rows.length >= R.max ? `Máximo ${R.max} equipos` : 'Agregar equipo'}
        </Button>
        <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onDiscard={() => setRows(saved)} />
      </Space>
    </Card>
  );
}
