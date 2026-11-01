import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { macflyProfile } from '../src/dev-fixtures/macfly';
import { COMPACT_SUBTITLE_MAX, DjHero } from '../src/public/dj/DjHero';

function hero(heroSubtitle: string) {
  const { container } = render(
    <DjHero
      displayName="Fersua DJ"
      texts={{ ...macflyProfile.texts, heroSubtitle }}
      genres={[]}
      socials={[]}
      heroImage={macflyProfile.heroImage}
      heroWhatsappUrl={null}
      showBookingLink={false}
      miniCards={<div className="hero-mini" />}
    />,
  );
  return container.querySelector('header.hero')!;
}

describe('DjHero', () => {
  afterEach(cleanup);

  it('con una descripción larga (como la de Mac Fly, 286) conserva el hero de la plantilla', () => {
    const macfly =
      'Mike Bran & Macfly son un dúo de DJs originarios de Medellín, dedicados a llevar energía y buen ritmo a cualquier tipo de escenario. Con una gran versatilidad horaria, ofrecen sets inmersivos cargados de groove y atmósferas electrónicas que conectan con el público desde el primer beat.';
    expect(hero(macfly).classList.contains('hero--compact')).toBe(false);
  });

  it('sin descripción o con una corta, el hero es compacto (no estira las tarjetas)', () => {
    expect(hero('').classList.contains('hero--compact')).toBe(true);
    expect(hero('quieres lo mejor de lo best').classList.contains('hero--compact')).toBe(true);
    expect(hero('x'.repeat(COMPACT_SUBTITLE_MAX)).classList.contains('hero--compact')).toBe(false);
  });
});
