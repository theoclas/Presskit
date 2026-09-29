import { useState } from 'react';

interface Props {
  id: string;
  name: string;
  autoComplete: 'current-password' | 'new-password';
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  invalid?: boolean;
  describedBy?: string;
}

/** Campo de contraseña con botón "Mostrar" (sin AntD: va en el chunk liviano del login). */
export function PasswordInput({ id, name, autoComplete, value, onChange, maxLength, invalid, describedBy }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="pw-field">
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={maxLength}
        value={value}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="pw-toggle"
        aria-controls={id}
        aria-pressed={visible}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? 'Ocultar' : 'Mostrar'}
      </button>
    </div>
  );
}
