import { Fragment } from 'react';

const TOKEN_RE = /(\[[^\]\n]{1,60}\])/g;

/**
 * Pinta texto plano resaltando los marcadores pendientes ([NIT/CC], [CORREO]...).
 * Nada de HTML: se parte el string y cada trozo va como texto.
 */
export function PlaceholderText({ text }: { text: string }) {
  const parts = text.split(TOKEN_RE);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="ph">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
