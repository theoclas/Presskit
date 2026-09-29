import type { PageTexts, PublicMemberDto } from '@fersua/shared';
import { ArtistCard } from './ArtistCard';

interface Props {
  texts: PageTexts;
  members: PublicMemberDto[];
}

export function ArtistsSection({ texts, members }: Props) {
  return (
    <section id="artistas" aria-labelledby="artistas-title">
      <h2 className="sec-title" id="artistas-title">
        {texts.artistsTitle}
      </h2>
      {texts.artistsSubtitle ? <div className="sec-sub">{texts.artistsSubtitle}</div> : null}
      <div className="artists-list">
        {members.map((m) => (
          <ArtistCard key={m.id} member={m} />
        ))}
      </div>
    </section>
  );
}
