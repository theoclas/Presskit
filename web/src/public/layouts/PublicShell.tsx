import type { ReactNode } from 'react';
import { SiteNav } from '../components/SiteNav';
import { LegalFooter } from '../legal/LegalFooter';

interface Props {
  children: ReactNode;
  nav?: ReactNode;
}

/** Marco de las páginas de Fersua (index, legales, 404): .djp > .shell + pie legal. */
export function PublicShell({ children, nav }: Props) {
  return (
    <>
      <div className="djp">
        <div className="shell">
          {nav ?? <SiteNav />}
          <main id="main" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
      <LegalFooter />
    </>
  );
}
