import type { MediaAsset } from '@prisma/client';
import { WA_URL_RE, resolveTexts, type ImageDto } from '@fersua/shared';
import type { CardProfile, ProfileDetail } from './public-profile.query';
import { buildEventCta, mapCard, mapProfile, mapSocials, sortCardProfiles, type ImageMapper } from './public.mappers';

const images: ImageMapper = {
  toImageDto: (asset: MediaAsset | null | undefined, alt?: string | null): ImageDto | null =>
    asset ? { id: asset.id, width: 100, height: 100, alt: alt ?? null, variants: [{ w: 100, h: 100, url: `/media/${asset.storageKey}/100.webp` }] } : null,
  ogUrl: () => null,
};

const texts = resolveTexts(
  { eventWhatsappMessage: 'Quiero estar en el evento de {evento} ({fecha}) {otro}', eventCtaLabel: 'Book' },
  'Mike Bran & Macfly',
);

function textOf(url: string): string {
  return decodeURIComponent(url.split('?text=')[1] ?? '');
}

describe('buildEventCta', () => {
  it('WHATSAPP: texto armado y codificado en el servidor, sin placeholders sobrantes', () => {
    const cta = buildEventCta(
      { ctaType: 'WHATSAPP', ctaUrl: null, ctaLabel: null, title: 'Grooveland & La terraza #1 ?x=1', venue: 'Viuz' },
      '2026-11-29',
      texts,
      '573505209860',
    );
    expect(cta).not.toBeNull();
    expect(cta!.label).toBe('Book');
    expect(cta!.url).toMatch(WA_URL_RE);
    // &, # y ? viajan codificados: no parten la URL.
    expect(cta!.url.split('?')).toHaveLength(2);
    expect(cta!.url).not.toContain('#');
    const text = textOf(cta!.url);
    expect(text).toBe('Quiero estar en el evento de Grooveland & La terraza #1 ?x=1 (29 de noviembre de 2026)');
    expect(text).not.toMatch(/[{}]/);
  });

  it('sin título usa el venue; nunca manda {nombre del evento} literal', () => {
    const legacy = resolveTexts({ eventWhatsappMessage: 'Hola {nombre del evento} {evento}' }, 'X');
    const cta = buildEventCta({ ctaType: 'WHATSAPP', ctaUrl: null, ctaLabel: 'Reservar', title: null, venue: 'Viuz' }, '2026-11-27', legacy, '573505209860');
    expect(cta!.label).toBe('Reservar');
    expect(textOf(cta!.url)).toBe('Hola Viuz');
  });

  it('WHATSAPP sin número del perfil → sin botón', () => {
    expect(buildEventCta({ ctaType: 'WHATSAPP', ctaUrl: null, ctaLabel: null, title: null, venue: 'V' }, '2026-11-27', texts, null)).toBeNull();
  });

  it('URL: solo https válida, normalizada', () => {
    const ok = buildEventCta({ ctaType: 'URL', ctaUrl: 'http://tickets.example.com/evento?utm_source=ig', ctaLabel: 'Boletas', title: null, venue: 'V' }, '2026-11-27', texts, null);
    expect(ok).toEqual({ type: 'URL', label: 'Boletas', url: 'https://tickets.example.com/evento' });
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'https://localhost/x', 'https://127.0.0.1/', '']) {
      expect(buildEventCta({ ctaType: 'URL', ctaUrl: bad, ctaLabel: null, title: null, venue: 'V' }, '2026-11-27', texts, null)).toBeNull();
    }
  });

  it('NONE → null', () => {
    expect(buildEventCta({ ctaType: 'NONE', ctaUrl: 'https://x.com', ctaLabel: null, title: null, venue: 'V' }, '2026-11-27', texts, '573505209860')).toBeNull();
  });
});

describe('mapSocials', () => {
  it('etiqueta del catálogo y URL revalidada; lo que no pasa las reglas no se publica', () => {
    const out = mapSocials([
      { platform: 'INSTAGRAM', url: 'https://www.instagram.com/mikebran_/?igsh=abc', label: null },
      { platform: 'INSTAGRAM', url: 'https://evil.com/mikebran', label: null },
      { platform: 'SOUNDCLOUD', url: 'javascript:alert(1)', label: null },
      { platform: 'WEBSITE', url: 'https://macfly.example.com', label: 'Press kit' },
    ]);
    expect(out).toEqual([
      { platform: 'INSTAGRAM', label: 'Instagram', url: 'https://www.instagram.com/mikebran_/' },
      { platform: 'WEBSITE', label: 'Press kit', url: 'https://macfly.example.com/' },
    ]);
  });
});

function asset(id: string): MediaAsset {
  return { id, storageKey: `p1/${id}` } as MediaAsset;
}

describe('mapProfile', () => {
  const profile = {
    id: 'p1',
    slug: 'macfly-mike-bran',
    displayName: 'Mike Bran & Macfly',
    tagline: null,
    seoDescription: null,
    city: 'Medellín',
    whatsappNumber: '573505209860',
    publicEmail: null,
    publicPhone: null,
    palette: 'SUNSET',
    texts: { heroWhatsappMessage: 'Hola quiero cotizar booking', openDateWhatsappMessage: '' },
    bookingForm: [{ key: 'fullName', required: true, label: 'Nombre y empresa / productora' }, { key: 'email1', required: true }],
    showGallery: true,
    showRider: false,
    showEvents: true,
    showOpenDateRow: true,
    formEnabled: true,
    formOpenWhatsapp: true,
    heroImage: asset('hero'),
    updatedAt: new Date('2026-09-28T12:00:00Z'),
    genres: [{ genre: { slug: 'house', name: 'House' } }],
    members: [{ id: 'm1', name: 'Mike Bran', role: 'DJ', description: null, photo: null, socialLinks: [] }],
    socialLinks: [],
    gallery: [{ alt: null, media: asset('g1') }],
    riderItems: [{ name: 'CDJ 3000', note: null }],
    events: [
      {
        id: 'e1',
        date: new Date('2026-11-14T00:00:00.000Z'),
        startTime: null,
        title: null,
        venue: 'Ramasound Garden',
        city: null,
        flyer: null,
        ctaType: 'WHATSAPP',
        ctaUrl: null,
        ctaLabel: null,
      },
    ],
  } as unknown as ProfileDetail;

  it('arma el DTO público completo', () => {
    const dto = mapProfile(profile, images);
    expect(dto.texts.heroPhotoAlt).toBe('Show de Mike Bran & Macfly');
    expect(dto.heroImage?.alt).toBe('Show de Mike Bran & Macfly');
    expect(dto.gallery[0]!.alt).toBe('Mike Bran & Macfly — foto 1');
    expect(dto.show).toEqual({ gallery: true, rider: false, events: true, openDateRow: true, form: true });
    expect(dto.whatsapp.heroUrl).toBe('https://wa.me/573505209860?text=Hola%20quiero%20cotizar%20booking');
    expect(dto.whatsapp.openDateUrl).toBe('https://wa.me/573505209860');
    expect(dto.bookingForm.fields.map((f) => f.key)).toEqual(['fullName', 'email1']);
    expect(dto.bookingForm.fields[0]!.label).toBe('Nombre y empresa / productora');
    expect(dto.bookingForm.privacyUrl).toBe('/privacidad');
    expect(dto.bookingForm.consentVersion).toMatch(/\S/);
    // La fecha @db.Date no se corre al día anterior.
    expect(dto.events[0]).toMatchObject({ date: '2026-11-14', dateLabel: '14 NOV', cta: { type: 'WHATSAPP', label: 'Book' } });
    // Ningún enlace armado lleva placeholders sin reemplazar.
    const urls = [dto.whatsapp.heroUrl, dto.whatsapp.openDateUrl, dto.whatsapp.bookingUrl, ...dto.events.map((e) => e.cta?.url)];
    for (const url of urls) expect(decodeURIComponent(url ?? '')).not.toMatch(/[{}]/);
  });

  it('sin número de WhatsApp válido no hay enlaces', () => {
    const dto = mapProfile({ ...profile, whatsappNumber: '123' } as ProfileDetail, images);
    expect(dto.whatsapp).toEqual({ heroUrl: null, openDateUrl: null, bookingUrl: null });
    expect(dto.events[0]!.cta).toBeNull();
  });
});

describe('index', () => {
  const card = (slug: string, o: Partial<{ featured: boolean; featuredRank: number; approvedAt: Date | null; next: string | null }>) =>
    ({
      slug,
      displayName: slug,
      tagline: null,
      city: null,
      palette: 'SUNSET',
      featured: o.featured ?? false,
      featuredRank: o.featuredRank ?? 100,
      approvedAt: o.approvedAt ?? null,
      cardImage: null,
      heroImage: asset(`h-${slug}`),
      genres: [],
      events: o.next ? [{ date: new Date(`${o.next}T00:00:00.000Z`), venue: 'V' }] : [],
    }) as unknown as CardProfile;

  it('orden: destacados, rank, próxima fecha (sin fecha al final), aprobados recientes', () => {
    const sorted = sortCardProfiles([
      card('sin-fecha-viejo', { approvedAt: new Date('2026-01-01') }),
      card('con-fecha-lejana', { next: '2026-12-20' }),
      card('destacado-2', { featured: true, featuredRank: 2 }),
      card('sin-fecha-nuevo', { approvedAt: new Date('2026-09-01') }),
      card('con-fecha-cercana', { next: '2026-10-01' }),
      card('destacado-1', { featured: true, featuredRank: 1 }),
    ]).map((c) => c.slug);
    expect(sorted).toEqual(['destacado-1', 'destacado-2', 'con-fecha-cercana', 'con-fecha-lejana', 'sin-fecha-nuevo', 'sin-fecha-viejo']);
  });

  it('la tarjeta usa la foto del hero si no hay foto de tarjeta', () => {
    const dto = mapCard(card('dj', { next: '2026-10-01' }), images);
    expect(dto.cardImage?.id).toBe('h-dj');
    expect(dto.nextEvent).toEqual({ date: '2026-10-01', dateLabel: '01 OCT', venue: 'V' });
    // No destacado: sin foto horizontal.
    expect(dto.heroImage).toBeNull();
  });

  it('los destacados llevan también la foto horizontal del hero (para el hero del index)', () => {
    const dto = mapCard(card('top', { featured: true }), images);
    expect(dto.heroImage?.id).toBe('h-top');
  });
});
