import type { ImageDto } from '@fersua/shared';
import { IMAGE_SIZES, ResponsiveImage } from '../components/ResponsiveImage';

interface Props {
  image: ImageDto;
  alt: string;
  captionLeft: string;
  captionRight: string;
}

export function HeroPhoto({ image, alt, captionLeft, captionRight }: Props) {
  return (
    <div className="hero-photo">
      <ResponsiveImage image={image} sizes={IMAGE_SIZES.hero} alt={image.alt || alt} priority />
      {captionLeft || captionRight ? (
        <div className="hero-photo-caption">
          <span>{captionLeft}</span>
          <span>{captionRight}</span>
        </div>
      ) : null}
    </div>
  );
}
