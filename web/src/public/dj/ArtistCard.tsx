import type { PublicMemberDto } from '@fersua/shared';
import { IMAGE_SIZES, ResponsiveImage } from '../components/ResponsiveImage';
import { SocialLinks } from './SocialLinks';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => (w[0] ?? '').toUpperCase())
    .join('');
}

export function ArtistCard({ member }: { member: PublicMemberDto }) {
  return (
    <article className="artist-card">
      {member.photo ? (
        <div className="artist-photo">
          <ResponsiveImage image={member.photo} sizes={IMAGE_SIZES.member} alt={member.photo.alt || member.name} />
        </div>
      ) : (
        <div className="artist-photo artist-photo--empty" aria-hidden="true">
          {initials(member.name)}
        </div>
      )}
      <div>
        <h3 className="artist-name">{member.name}</h3>
        {member.role ? <div className="artist-role">{member.role}</div> : null}
        {member.description ? <p className="artist-desc">{member.description}</p> : null}
        {/* Vacío a propósito, como en la plantilla: su margin-bottom (6px, flex, no colapsa) separa las redes. */}
        <div className="pill-row" />
        <SocialLinks links={member.socials} ownerName={member.name} />
      </div>
    </article>
  );
}
