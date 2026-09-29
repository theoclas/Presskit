import { PALETTE_KEYS, PALETTES, type PaletteKey } from '@fersua/shared';
import { Radio } from 'antd';

interface Props {
  value?: PaletteKey;
  onChange?: (value: PaletteKey) => void;
  disabled?: boolean;
}

/** Tarjetas de paleta: fondo real, degradado de botón y los dos acentos por separado. */
export function PalettePicker({ value, onChange, disabled }: Props) {
  return (
    <Radio.Group
      value={value}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value as PaletteKey)}
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, width: '100%' }}
    >
      {PALETTE_KEYS.map((key) => {
        const p = PALETTES[key];
        const selected = value === key;
        return (
          // div y no label: el Radio de AntD ya trae su propio label (no se anidan).
          <div
            key={key}
            onClick={() => {
              if (!disabled && !selected) onChange?.(key);
            }}
            style={{
              display: 'block',
              borderRadius: 10,
              padding: 10,
              background: p.bg,
              color: p.text,
              border: `2px solid ${selected ? p.accent : 'rgba(148,163,184,.35)'}`,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >
            <div
              aria-hidden="true"
              style={{
                height: 34,
                borderRadius: 999,
                background: `linear-gradient(135deg, ${p.accent}, ${p.accent2})`,
                marginBottom: 8,
              }}
            />
            <div aria-hidden="true" style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: p.accent, display: 'inline-block' }} />
              <span style={{ width: 18, height: 18, borderRadius: '50%', background: p.accent2, display: 'inline-block' }} />
            </div>
            <Radio value={key} style={{ color: p.text, fontSize: 13 }}>
              {p.name}
            </Radio>
          </div>
        );
      })}
    </Radio.Group>
  );
}
