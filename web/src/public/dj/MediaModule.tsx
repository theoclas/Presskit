import type { ImageDto, PageTexts } from '@fersua/shared';
import type { Ref } from 'react';
import { GalleryGrid } from './GalleryGrid';
import { RiderList } from './RiderList';

export type MediaTab = 'photos' | 'rider';

interface Props {
  visible: boolean;
  activeTab: MediaTab;
  texts: PageTexts;
  displayName: string;
  gallery: ImageDto[] | null;
  riderItems: { name: string; note: string | null }[] | null;
  ref?: Ref<HTMLElement>;
}

/**
 * El módulo oculto de la plantilla (#media-module). Se muestra con el primer clic en una
 * pestaña del hero; las fotos de la galería no se piden hasta ese momento.
 */
export function MediaModule({ visible, activeTab, texts, displayName, gallery, riderItems, ref }: Props) {
  const label = activeTab === 'photos' ? texts.galleryTitle || texts.galleryButton : texts.riderTitle || texts.riderButton;
  return (
    <section
      ref={ref}
      id="media-module"
      className={visible ? 'media-module is-visible' : 'media-module'}
      tabIndex={-1}
      aria-label={label}
    >
      {gallery?.length ? (
        <div className={activeTab === 'photos' ? 'media-inner is-visible' : 'media-inner'} data-tab="photos">
          {texts.galleryTitle ? <h2 className="sec-title">{texts.galleryTitle}</h2> : null}
          {visible ? <GalleryGrid images={gallery} displayName={displayName} /> : null}
        </div>
      ) : null}
      {riderItems?.length ? (
        <div className={activeTab === 'rider' ? 'media-inner is-visible' : 'media-inner'} data-tab="presskit">
          {texts.riderTitle ? <h2 className="sec-title">{texts.riderTitle}</h2> : null}
          <RiderList items={riderItems} />
        </div>
      ) : null}
    </section>
  );
}
