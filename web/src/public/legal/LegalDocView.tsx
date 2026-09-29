import type { ReactNode } from 'react';
import { PlaceholderText } from '../components/PlaceholderText';
import type { LegalSection } from './types';

interface Props {
  title: string;
  /** "Versión X · Última actualización: ..." (los documentos versionados). */
  meta?: string | null;
  intro?: string[];
  sections: LegalSection[];
  children?: ReactNode;
}

/** Documento legal como texto plano: TOC con anclas y marcadores [..] resaltados. */
export function LegalDocView({ title, meta, intro, sections, children }: Props) {
  return (
    <section className="legal-doc" aria-labelledby="legal-title">
      <h1 className="legal-title" id="legal-title">
        {title}
      </h1>
      {meta ? <p className="legal-meta">{meta}</p> : null}
      {intro?.map((p, i) => (
        <p className="legal-p" key={i}>
          <PlaceholderText text={p} />
        </p>
      ))}

      {sections.length > 2 ? (
        <nav className="legal-toc" aria-label="Contenido del documento">
          <h2 className="sec-title">Contenido</h2>
          <ul>
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {sections.map((s) => (
        <div className="legal-sec" id={s.id} key={s.id}>
          <h2 className="legal-h2">{s.title}</h2>
          {s.paragraphs?.map((p, i) => (
            <p className="legal-p" key={i}>
              <PlaceholderText text={p} />
            </p>
          ))}
          {s.bullets?.length ? (
            <ul className="legal-ul">
              {s.bullets.map((b, i) => (
                <li key={i}>
                  <PlaceholderText text={b} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
      {children}
    </section>
  );
}
