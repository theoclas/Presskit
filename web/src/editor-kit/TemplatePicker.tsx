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
  if (template === 'VERTEX') {
    return (
      <div
        aria-hidden="true"
        style={{
          height: 96,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          overflow: 'hidden',
          border: `1px solid ${p.border}`,
          background: p.bg,
        }}
      >
        <div
          style={{
            position: 'relative',
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            gap: 3,
            background: 'linear-gradient(0deg, #0b0b0c 30%, #4a4a4a)',
          }}
        >
          <div style={{ position: 'absolute', top: 0, right: '18%', width: '18%', height: '70%', background: p.accent, opacity: 0.8 }} />
          <div style={bar('80%', 9, p.text, { position: 'relative', borderRadius: 0 })} />
          <div style={{ display: 'flex', gap: 3, position: 'relative' }}>
            <div style={bar('16%', 9, p.accent, { borderRadius: 0 })} />
            <div style={bar('55%', 9, p.text, { borderRadius: 0 })} />
          </div>
          <div style={bar('45%', 7, p.accent, { marginTop: 3, position: 'relative', borderRadius: 0 })} />
        </div>
        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, borderLeft: `1px solid ${p.border}` }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <div style={bar('14%', 4, p.accent, { borderRadius: 0 })} />
              <div style={bar('60%', 6, p.text, { borderRadius: 0 })} />
            </div>
          ))}
          <div style={{ height: 4, marginTop: 'auto', background: `repeating-linear-gradient(-45deg, ${p.accent} 0 4px, ${p.bg} 4px 8px)` }} />
        </div>
      </div>
    );
  }
  if (template === 'HYPERWAVE') {
    const tile = (area: string, extra: CSSProperties = {}): CSSProperties => ({
      gridArea: area,
      borderRadius: 5,
      border: `1px solid rgb(${p.accentRgb} / .45)`,
      background: 'rgba(20,30,55,.85)',
      ...extra,
    });
    return (
      <div
        aria-hidden="true"
        style={{
          height: 96,
          borderRadius: 8,
          padding: 6,
          display: 'grid',
          gap: 4,
          gridTemplateColumns: '1.3fr 1fr 1fr',
          gridTemplateRows: '1fr 1fr 1fr',
          gridTemplateAreas: '"photo name name" "photo cta cta" "a b c"',
          background: `radial-gradient(circle at 90% 0%, rgb(${p.accentRgb} / .5), transparent 60%), ${p.bg}`,
        }}
      >
        <div style={tile('photo', { background: 'linear-gradient(160deg, #3a5a9a, #0b1328)' })} />
        <div style={tile('name', { display: 'flex', alignItems: 'center', padding: '0 6px' })}>
          <div style={bar('80%', 8, 'linear-gradient(180deg, #fff, #8996b0)')} />
        </div>
        <div style={tile('cta', { display: 'flex', alignItems: 'center', padding: '0 6px' })}>
          <div style={bar('55%', 8, 'transparent', { border: `1px solid ${p.accent2}`, boxShadow: `0 0 6px ${p.accent2}` })} />
        </div>
        <div style={tile('a')} />
        <div style={tile('b')} />
        <div style={tile('c')} />
      </div>
    );
  }
  if (template === 'NOIR') {
    return (
      <div aria-hidden="true" style={{ height: 96, borderRadius: 4, overflow: 'hidden', display: 'grid', gridTemplateRows: '58% 42%', border: `1px solid rgb(${p.accent2Rgb} / .5)` }}>
        <div
          style={{
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 4,
            background: `linear-gradient(90deg, #140d0f 40%, rgb(${p.accentRgb} / .8) 70%, #6b5a52)`,
          }}
        >
          <div style={bar('46%', 7, '#f4ece0')} />
          <div style={{ display: 'flex', gap: 3 }}>
            <div style={bar('7%', 7, p.accent2)} />
            <div style={bar('34%', 7, '#f4ece0')} />
          </div>
        </div>
        <div style={{ background: p.bg, padding: '6px 10px', display: 'grid', gridTemplateColumns: '18% 18% 1fr', gap: 5, alignItems: 'center' }}>
          <div style={{ height: '100%', background: '#8a7a70' }} />
          <div style={{ height: '100%', background: '#a99a8f' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={bar('40%', 5, p.text)} />
            <div style={bar('85%', 2, p.muted)} />
            <div style={bar('70%', 2, p.muted)} />
          </div>
        </div>
      </div>
    );
  }
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
