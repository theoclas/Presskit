import type { PageTexts } from '@fersua/shared';

interface Props {
  displayName: string;
  texts: PageTexts;
  showArtists: boolean;
  showEvents: boolean;
  showBooking: boolean;
}

export function DjNav({ displayName, texts, showArtists, showEvents, showBooking }: Props) {
  return (
    <nav className="nav" aria-label="Secciones">
      <div className="nav-left">
        <div className="brand">{displayName}</div>
        {texts.navTag ? <div className="nav-tag">{texts.navTag}</div> : null}
      </div>
      <div className="nav-links">
        {showArtists ? <a href="#artistas">{texts.navArtists}</a> : null}
        {showEvents ? <a href="#fechas">{texts.navEvents}</a> : null}
        {showBooking ? <a href="#booking">{texts.navBooking}</a> : null}
      </div>
    </nav>
  );
}
