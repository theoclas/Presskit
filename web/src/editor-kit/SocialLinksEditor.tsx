import {
  LIMITS,
  normalizeSocialUrl,
  SOCIAL_PLATFORM_KEYS,
  SOCIAL_PLATFORMS,
  type EditorSocialLinkDto,
  type SocialLinkInput,
  type SocialPlatform,
} from '@fersua/shared';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Form, Input, Select, Space, Typography } from 'antd';
import type { ReactNode } from 'react';
import { SocialIcon } from '../public/components/SocialIcon';
import { SOCIAL_URL_ERROR_MESSAGES } from './labels';
import { countConfig } from './forms';
import { MoveButtons, moveItem } from './SortableList';

/** Fila editable (uid solo para React; no viaja al api). */
export interface SocialRow {
  uid: string;
  platform: SocialPlatform | null;
  url: string;
  label: string;
}

let uidSeq = 0;
const newUid = () => `s${Date.now().toString(36)}${(uidSeq++).toString(36)}`;

export function toSocialRows(links: readonly EditorSocialLinkDto[] | null | undefined): SocialRow[] {
  return (links ?? []).map((l) => ({ uid: l.id || newUid(), platform: l.platform, url: l.url, label: l.label ?? '' }));
}

export type SocialCheck = { ok: true; url: string } | { ok: false; message: string };

/** Misma normalización que el api (normalizeSocialUrl): el enlace de otra página no pasa. */
export function checkSocialInput(platform: SocialPlatform | null, raw: string): SocialCheck {
  if (!platform) return { ok: false, message: 'Elige la red social.' };
  if (!raw.trim()) return { ok: false, message: 'Escribe el enlace o el @usuario.' };
  const r = normalizeSocialUrl(platform, raw);
  return r.ok ? { ok: true, url: r.url } : { ok: false, message: SOCIAL_URL_ERROR_MESSAGES[r.error] };
}

export interface SocialRowsValidation {
  links: SocialLinkInput[];
  /** Mensaje por uid de fila. */
  errors: Record<string, string>;
}

/** Una fila por red; el sitio web admite 2 (igual que el api). */
export function perPlatformMax(platform: SocialPlatform): number {
  return platform === 'WEBSITE' ? 2 : 1;
}

export function validateSocialRows(rows: readonly SocialRow[], max: number): SocialRowsValidation {
  const errors: Record<string, string> = {};
  const links: SocialLinkInput[] = [];
  const perPlatform = new Map<SocialPlatform, number>();
  const urls = new Set<string>();
  rows.forEach((row, i) => {
    if (i >= max) {
      errors[row.uid] = `Máximo ${max} redes.`;
      return;
    }
    const check = checkSocialInput(row.platform, row.url);
    if (!check.ok) {
      errors[row.uid] = check.message;
      return;
    }
    const count = (perPlatform.get(row.platform!) ?? 0) + 1;
    perPlatform.set(row.platform!, count);
    if (count > perPlatformMax(row.platform!)) {
      errors[row.uid] = 'Esta red ya está en la lista.';
      return;
    }
    if (urls.has(check.url)) {
      errors[row.uid] = 'Este enlace está repetido.';
      return;
    }
    urls.add(check.url);
    const label = row.label.trim();
    if ([...label].length > LIMITS.social.labelMax) {
      errors[row.uid] = `El texto del enlace admite máximo ${LIMITS.social.labelMax} caracteres.`;
      return;
    }
    links.push({ platform: row.platform!, url: check.url, label: row.platform === 'WEBSITE' && label ? label : null });
  });
  return { links, errors };
}

/** Comparación para saber si hay cambios sin guardar. */
export function socialRowsKey(rows: readonly SocialRow[]): string {
  return JSON.stringify(rows.map((r) => [r.platform, r.url.trim(), r.label.trim()]));
}

const PLATFORM_OPTIONS = SOCIAL_PLATFORM_KEYS.map((k) => ({ value: k, label: SOCIAL_PLATFORMS[k].label }));

/** Nombre de la red con el mismo ícono que se verá en la página pública. */
function platformLabel(platform: SocialPlatform, label: ReactNode): ReactNode {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <SocialIcon platform={platform} size={16} />
      {label}
    </span>
  );
}

interface Props {
  value: SocialRow[];
  onChange: (rows: SocialRow[]) => void;
  max?: number;
  disabled?: boolean;
  /** Muestra los errores aunque la fila no se haya tocado (después de intentar guardar). */
  showAllErrors?: boolean;
}

/** Lista de redes: plataforma + enlace o @usuario, con validación en vivo. */
export function SocialLinksEditor({ value, onChange, max = LIMITS.social.perProfileMax, disabled, showAllErrors }: Props) {
  const update = (uid: string, change: Partial<SocialRow>) =>
    onChange(value.map((r) => (r.uid === uid ? { ...r, ...change } : r)));
  const remove = (uid: string) => onChange(value.filter((r) => r.uid !== uid));
  const add = () => onChange([...value, { uid: newUid(), platform: null, url: '', label: '' }]);
  const { errors } = validateSocialRows(value, max);

  return (
    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
      {value.length === 0 ? <Typography.Text type="secondary">Todavía no hay redes.</Typography.Text> : null}
      {value.map((row, index) => {
        const def = row.platform ? SOCIAL_PLATFORMS[row.platform] : null;
        const check = checkSocialInput(row.platform, row.url);
        // Una fila recién agregada no se marca en rojo hasta que escriban algo (o intenten guardar).
        const error = errors[row.uid] && (row.url.trim() || showAllErrors) ? errors[row.uid] : null;
        const normalized = !error && check.ok && check.url !== row.url.trim() ? check.url : null;
        const others = value.filter((r) => r.uid !== row.uid);
        const isFull = (p: SocialPlatform) => others.filter((r) => r.platform === p).length >= perPlatformMax(p);
        const platformName = def?.label ?? `red ${index + 1}`;
        return (
          <div
            key={row.uid}
            style={{ border: '1px solid rgba(148,163,184,.3)', borderRadius: 8, padding: 12 }}
            data-testid="social-row"
          >
            <Space wrap align="start" style={{ width: '100%' }}>
              <Select
                aria-label="Red social"
                placeholder="Red social"
                style={{ width: 180 }}
                value={row.platform ?? undefined}
                disabled={disabled}
                options={PLATFORM_OPTIONS.map((o) => ({ ...o, disabled: isFull(o.value) }))}
                onChange={(platform: SocialPlatform) => update(row.uid, { platform })}
                showSearch={{ optionFilterProp: 'label' }}
                optionRender={(o) => platformLabel(o.value as SocialPlatform, o.label)}
                labelRender={(o) => (o.value ? platformLabel(o.value as SocialPlatform, o.label) : o.label)}
              />
              <Form.Item
                style={{ margin: 0, minWidth: 240, flex: 1 }}
                validateStatus={error ? 'error' : undefined}
                help={error ?? (normalized ? `Se guardará como: ${normalized}` : undefined)}
              >
                <Input
                  aria-label={`Enlace de ${platformName}`}
                  placeholder={def?.handleUrl ? '@usuario o enlace' : 'https://…'}
                  value={row.url}
                  disabled={disabled}
                  maxLength={LIMITS.social.urlMax}
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  onChange={(e) => update(row.uid, { url: e.target.value })}
                />
              </Form.Item>
              <MoveButtons
                index={index}
                count={value.length}
                disabled={disabled}
                name={platformName}
                onMove={(from, to) => onChange(moveItem(value, from, to))}
              />
              <Button
                icon={<DeleteOutlined />}
                aria-label={`Quitar ${platformName}`}
                disabled={disabled}
                onClick={() => remove(row.uid)}
              />
            </Space>
            {row.platform === 'WEBSITE' ? (
              <Input
                style={{ marginTop: 8, maxWidth: 320 }}
                aria-label="Texto del enlace"
                placeholder="Texto del enlace (opcional)"
                value={row.label}
                disabled={disabled}
                count={countConfig(LIMITS.social.labelMax)}
                onChange={(e) => update(row.uid, { label: e.target.value })}
              />
            ) : null}
          </div>
        );
      })}
      <Button icon={<PlusOutlined />} onClick={add} disabled={disabled || value.length >= max}>
        Agregar red
      </Button>
      {value.length >= max ? (
        <Typography.Text type="secondary">Llegaste al máximo de {max} redes.</Typography.Text>
      ) : null}
    </Space>
  );
}
