import { useEffect } from 'react';

export const SITE_NAME = 'Fersua Studio';

/** document.title por página (el api ya pone el <title> inicial para los buscadores). */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}
