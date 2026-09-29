import { SOCIAL_PLATFORMS, type SocialLinkDto } from '@fersua/shared';
import { EXTERNAL_REL, safeHttpsUrl } from '../../lib/safeUrl';
import { SocialIcon } from '../components/SocialIcon';

interface Props {
  links: SocialLinkDto[];
  className?: string;
  /** Para el aria-label cuando el texto visible es solo la plataforma. */
  ownerName?: string;
}

export function SocialLinks({ links, className, ownerName }: Props) {
  const items = links
    .map((l) => ({ ...l, href: safeHttpsUrl(l.url) }))
    .filter((l): l is SocialLinkDto & { href: string } => !!l.href);
  if (!items.length) return null;
  return (
    <div className={className ? `socials ${className}` : 'socials'}>
      {items.map((l, i) => {
        const label = l.label?.trim() || SOCIAL_PLATFORMS[l.platform]?.label || 'Enlace';
        return (
          <a
            key={`${l.platform}-${i}`}
            href={l.href}
            target="_blank"
            rel={EXTERNAL_REL}
            aria-label={ownerName ? `${label} de ${ownerName} (se abre en otra pestaña)` : undefined}
          >
            <SocialIcon platform={l.platform} />
            {label}
          </a>
        );
      })}
    </div>
  );
}
