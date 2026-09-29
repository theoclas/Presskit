import type { PageTexts } from '@fersua/shared';
import type { MediaTab } from './MediaModule';

interface Props {
  texts: PageTexts;
  hasRider: boolean;
  hasGallery: boolean;
  activeTab: MediaTab;
  moduleVisible: boolean;
  onTab: (tab: MediaTab) => void;
  onPrefetchGallery?: () => void;
}

/** Las dos tarjetitas del hero (rider y fotos). Cada una se oculta si su contenido está vacío. */
export function HeroMiniCards({ texts, hasRider, hasGallery, activeTab, moduleVisible, onTab, onPrefetchGallery }: Props) {
  if (!hasRider && !hasGallery) return null;
  return (
    <div className="hero-mini">
      {hasRider ? (
        <div className="mini-card">
          <div className="mini-label">{texts.riderCardLabel}</div>
          <div className="mini-title">{texts.riderCardTitle}</div>
          <div className="mini-tabs">
            <button
              type="button"
              className={activeTab === 'rider' ? 'media-tab-btn is-active' : 'media-tab-btn'}
              aria-controls="media-module"
              aria-expanded={moduleVisible && activeTab === 'rider'}
              onClick={() => onTab('rider')}
            >
              {texts.riderButton}
            </button>
          </div>
        </div>
      ) : null}
      {hasGallery ? (
        <div className="mini-card">
          <div className="mini-label">{texts.galleryCardLabel}</div>
          <div className="mini-title">{texts.galleryCardTitle}</div>
          <div className="mini-tabs">
            <button
              type="button"
              className={activeTab === 'photos' ? 'media-tab-btn is-active' : 'media-tab-btn'}
              aria-controls="media-module"
              aria-expanded={moduleVisible && activeTab === 'photos'}
              onClick={() => onTab('photos')}
              onPointerEnter={onPrefetchGallery}
              onTouchStart={onPrefetchGallery}
              onFocus={onPrefetchGallery}
            >
              {texts.galleryButton}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
