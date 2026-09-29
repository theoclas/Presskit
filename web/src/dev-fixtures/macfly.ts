// Datos de ejemplo SOLO para tests (nunca se importan desde el bundle público).
// Siguen la forma de PublicDjProfileDto con el contenido de MACFLY_SEED.
import {
  BOOKING_CONSENT_TEXT,
  CONSENT_VERSION,
  CONTACT_PORTAL_NOTICE,
  resolveFormFields,
  resolveTexts,
  type ImageDto,
  type PublicDjCardDto,
  type PublicDjProfileDto,
} from '@fersua/shared';

const img = (id: string, w: number, h: number, widths: number[], alt: string | null = null): ImageDto => ({
  id,
  width: w,
  height: h,
  alt,
  variants: widths.map((vw) => ({ w: vw, h: Math.round((h * vw) / w), url: `/media/prof1/${id}/${vw}.webp` })),
});

const texts = resolveTexts(
  {
    heroSubtitle:
      'Mike Bran & Macfly son un dúo de DJs originarios de Medellín, dedicados a llevar energía y buen ritmo a cualquier tipo de escenario.',
    heroCaptionRight: '2024 / 2025',
    riderButton: 'Rider Técnico',
    artistsSubtitle: 'Bookea a cada DJ por separado o el show completo.',
    eventsNote: 'Para otras fechas o giras, envía tu idea de evento y coordinamos agenda completa.',
    bookingTitle: 'Solicitud de booking',
  },
  'Mike Bran & Macfly',
);

export const macflyProfile: PublicDjProfileDto = {
  slug: 'macfly-mike-bran',
  displayName: 'Mike Bran & Macfly',
  palette: 'SUNSET',
  texts,
  heroImage: img('hero', 1440, 960, [480, 960, 1440], 'Show de Mike Bran & Macfly'),
  genres: [
    { slug: 'house', name: 'House' },
    { slug: 'tech-house', name: 'Tech House' },
    { slug: 'minimal-deep-tech', name: 'Minimal Deep Tech' },
    { slug: 'jackin-funky', name: 'Jackin & Funky' },
  ],
  // Como la semilla: sin redes del perfil en el hero (la página original no las tenía).
  socials: [],
  members: [
    {
      id: 'm1',
      name: 'Mike Bran',
      role: 'House / Tech / Jackin · DJ',
      description: 'Un sonido cargado de groove y energía.',
      photo: img('mike', 480, 640, [240, 480]),
      socials: [{ platform: 'INSTAGRAM', label: 'Instagram', url: 'https://www.instagram.com/mikebran_/' }],
    },
    {
      id: 'm2',
      name: 'Macfly',
      role: 'Tech House / Minimal deep Tech / House · DJ',
      description: 'Energía marcada por bajos firmes.',
      photo: null,
      socials: [],
    },
  ],
  riderItems: [
    { name: 'DJM V10', note: null },
    { name: 'CDJ 3000', note: null },
  ],
  gallery: [img('g1', 1600, 1067, [480, 960, 1600]), img('g2', 1600, 1067, [480, 960, 1600])],
  events: [
    {
      id: 'e1',
      date: '2026-11-14',
      dateLabel: '14 NOV',
      time: null,
      title: null,
      venue: 'Ramasound Garden',
      city: 'Medellín',
      flyer: null,
      cta: {
        type: 'WHATSAPP',
        label: 'Book',
        url: 'https://wa.me/573505209860?text=Quiero%20estar%20en%20el%20evento',
      },
    },
  ],
  show: { gallery: true, rider: true, events: true, openDateRow: true, form: true },
  whatsapp: {
    heroUrl: 'https://wa.me/573505209860?text=Hola%20quiero%20cotizar%20booking',
    openDateUrl: 'https://wa.me/573505209860',
    bookingUrl: 'https://wa.me/573505209860?text=Hola%20quiero%20booking',
  },
  bookingForm: {
    fields: resolveFormFields([
      { key: 'fullName', required: true, label: 'Nombre y empresa / productora', placeholder: 'Tu nombre' },
      { key: 'email1', required: true, label: 'Email', placeholder: 'tu@correo.com' },
      { key: 'eventDate', required: false, label: 'Fecha del evento' },
      { key: 'city', required: false, label: 'Ciudad / Lugar evento' },
      { key: 'message', required: false, label: 'Detalles del evento' },
    ]),
    consentText: BOOKING_CONSENT_TEXT,
    consentVersion: CONSENT_VERSION,
    privacyUrl: '/privacidad',
    portalNotice: CONTACT_PORTAL_NOTICE,
  },
  updatedAt: '2026-09-28T00:00:00.000Z',
};

export const macflyCard: PublicDjCardDto = {
  slug: 'macfly-mike-bran',
  displayName: 'Mike Bran & Macfly',
  tagline: 'Dúo de DJs de Medellín · House, Tech House & Minimal Deep Tech',
  city: 'Medellín',
  palette: 'SUNSET',
  featured: true,
  cardImage: img('card', 800, 1000, [400, 800]),
  heroImage: macflyProfile.heroImage,
  genres: macflyProfile.genres,
  nextEvent: null,
};
