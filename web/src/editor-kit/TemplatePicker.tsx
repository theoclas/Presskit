import { PALETTES, TEMPLATE_KEYS, TEMPLATES, type TemplateKey } from '@fersua/shared';
import { Radio } from 'antd';
import type { CSSProperties } from 'react';

interface Props {
  value?: TemplateKey;
  onChange?: (value: TemplateKey) => void;
  disabled?: boolean;
}

/** Tarjetas de plantilla: un boceto de la portada con su paleta sugerida, nombre y descripción. */
export function TemplatePicker({ value, onChange, disabled }: Props) {
  return (
    <Radio.Group
      value={value}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value as TemplateKey)}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12, width: '100%' }}
    >
      {TEMPLATE_KEYS.map((key) => {
        const t = TEMPLATES[key];
        const p = PALETTES[t.suggestedPalette];
        const selected = value === key;
        return (
          // div y no label: el Radio de AntD ya trae su propio label (no se anidan).
          <div
            key={key}
            onClick={() => {
              if (!disabled && !selected) onChange?.(key);
            }}
            style={{
              borderRadius: 10,
              padding: 10,
              background: p.bg,
              color: p.text,
              border: `2px solid ${selected ? p.accent : 'rgba(148,163,184,.35)'}`,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            <TemplateSketch template={key} />
            <Radio value={key} style={{ color: p.text, fontSize: 14, fontWeight: 600, marginTop: 8 }}>
              {t.name}
            </Radio>
            <div style={{ fontSize: 12, lineHeight: 1.4, opacity: 0.75, marginTop: 4 }}>{t.description}</div>
          </div>
        );
      })}
    </Radio.Group>
  );
}

const bar = (width: string, height: number, background: string, extra: CSSProperties = {}): CSSProperties => ({
  width,
  height,
  background,
  borderRadius: 2,
  ...extra,
});

/** Boceto de la portada de cada plantilla (decorativo). */
function TemplateSketch({ template }: { template: TemplateKey }) {
  const p = PALETTES[TEMPLATES[template].suggestedPalette];
  if (template === 'GROOVE') {
    return (
      <div
        aria-hidden="true"
        style={{
          height: 96,
          borderRadius: 8,
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 4,
          background: `radial-gradient(circle at 72% 40%, rgb(${p.accentRgb} / .55), transparent 38%), radial-gradient(circle at 95% 0%, rgb(${p.accent2Rgb} / .8), transparent 55%), linear-gradient(90deg, ${p.bg} 30%, rgb(${p.accent2Rgb} / .35))`,
          border: `1px solid rgb(${p.accent2Rgb} / .45)`,
        }}
      >
        <div style={bar('58%', 10, p.text, { transform: 'skewX(-12deg)' })} />
        <div style={{ display: 'flex', gap: 4 }}>
          <div style={bar('9%', 10, p.accent, { transform: 'skewX(-12deg)' })} />
          <div style={bar('40%', 10, p.text, { transform: 'skewX(-12deg)' })} />
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
          <div style={bar('30%', 9, p.accent)} />
          <div style={bar('26%', 9, 'transparent', { border: `1px solid ${p.text}` })} />
        </div>
      </div>
    );
  }
  if (template === 'SIGNAL') {
    return (
      <div
        aria-hidden="true"
        style={{
          height: 96,
          borderRadius: 6,
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          gap: 4,
          background: 'linear-gradient(90deg, rgba(0,0,0,.92) 35%, rgba(0,0,0,.25)), linear-gradient(135deg, #555, #1a1a1a 60%, #3a3a3a)',
          border: '1px solid rgba(255,255,255,.08)',
        }}
      >
        <div style={bar('30%', 3, p.accent)} />
        <div style={bar('62%', 11, p.text)} />
        <div style={bar('48%', 11, p.text)} />
        <div style={bar('34%', 9, p.accent, { marginTop: 4, borderRadius: 1 })} />
      </div>
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{
        height: 96,
        borderRadius: 12,
        padding: 8,
        display: 'grid',
        gridTemplateColumns: '1.3fr 1fr',
        gap: 8,
        background: `radial-gradient(circle at 0% 0%, rgb(${p.accentRgb} / .35), transparent 60%), ${p.bgSoft}`,
        border: `1px solid ${p.border}`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5 }}>
        <div style={bar('40%', 3, p.muted)} />
        <div style={bar('85%', 8, p.text)} />
        <div style={bar('70%', 3, p.muted)} />
        <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
          <div style={bar('42%', 9, `linear-gradient(135deg, ${p.accent}, ${p.accent2})`, { borderRadius: 999 })} />
          <div style={bar('36%', 9, 'transparent', { borderRadius: 999, border: `1px solid ${p.border}` })} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateRows: '1.3fr 1fr', gap: 5 }}>
        <div style={{ borderRadius: 8, background: 'linear-gradient(135deg, #64748b, #1e293b)' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          <div style={{ borderRadius: 6, border: `1px solid ${p.border}` }} />
          <div style={{ borderRadius: 6, border: `1px solid ${p.border}` }} />
        </div>
      </div>
    </div>
  );
}
