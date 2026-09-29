import type { FormFieldConfig, PaletteKey, PageTexts, SocialPlatform } from '@fersua/shared';

// Contenido de la semilla de Mike Bran & Macfly (docs/diseno/01-modelo-datos.md §9, MACFLY_SEED),
// adaptado a las claves reales de PAGE_TEXT_SLOTS y a las decisiones del plan (docs/00-plan.md):
// slug "macfly-mike-bran" con redirección desde "macflymikebran", sin dueño, aprobado y destacado.
// Las fotos salen de api/seed-assets/macfly-mike-bran (ver scripts/prepare-seed-media.mjs);
// cada imagen se referencia por su nombre lógico en manifest.json.

export interface SeedLink {
  platform: SocialPlatform;
  /** URL tal como estaba en el sitio viejo: la seed la normaliza (quita rastreo, fuerza https). */
  url: string;
}

export interface SeedMember {
  name: string;
  role: string;
  description: string;
  photo: string;
  links: SeedLink[];
}

export interface SeedEvent {
  /** 'YYYY-MM-DD' en Bogotá. */
  date: string;
  venue: string;
  flyer: string | null;
}

// El track de SoundCloud del sitio viejo, con todos sus parámetros de rastreo (se limpian al guardar).
const SC_TRACK =
  'https://soundcloud.com/macfly-mike-bran/grood-taste-dj-contest-district-2025?ref=clipboard&p=a&c=0&si=51eceaabfa6848e69cdb71021d066717&utm_source=clipboard&utm_medium=text&utm_campaign=social_sharing';

export interface MacflySeed {
  profile: {
    slug: string;
    legacySlug: string;
    displayName: string;
    tagline: string;
    seoDescription: string;
    city: string;
    countryCode: string;
    whatsappNumber: string;
    publicEmail: string | null;
    publicPhone: string;
    palette: PaletteKey;
    featured: boolean;
    featuredRank: number;
  };
  texts: Partial<PageTexts>;
  genres: string[];
  rider: string[];
  members: SeedMember[];
  profileLinks: SeedLink[];
  gallery: { image: string; alt: string }[];
  bookingForm: FormFieldConfig[];
  events: SeedEvent[];
}

export const MACFLY_SEED: MacflySeed = {
  profile: {
    slug: 'macfly-mike-bran',
    legacySlug: 'macflymikebran',
    displayName: 'Mike Bran & Macfly',
    tagline: 'Dúo de DJs de Medellín · House, Tech House & Minimal Deep Tech',
    seoDescription: 'Booking oficial de Mike Bran & Macfly — DJs. Shows, fechas y contacto.',
    city: 'Medellín',
    countryCode: 'CO',
    whatsappNumber: '573505209860',
    publicEmail: null,
    publicPhone: '+573505209860',
    palette: 'SUNSET',
    featured: true,
    featuredRank: 1,
  },

  // Solo claves de PAGE_TEXT_SLOTS. Las que no están (eventsEmpty, bookingSuccess) usan el
  // valor por defecto del catálogo.
  texts: {
    navTag: 'Booking',
    navArtists: 'Artistas',
    navEvents: 'Fechas',
    navBooking: 'Solicitud',
    heroLabel: 'DJs',
    heroTitle: 'Electronic club show',
    heroSubtitle:
      'Mike Bran & Macfly son un dúo de DJs originarios de Medellín, dedicados a llevar energía y buen ritmo a cualquier tipo de escenario. Con una gran versatilidad horaria, ofrecen sets inmersivos cargados de groove y atmósferas electrónicas que conectan con el público desde el primer beat.',
    // En el sitio viejo la nota estaba comentada: se deja vacía (no se muestra).
    heroNote: '',
    heroPrimaryCta: 'WhatsApp Booking',
    heroWhatsappMessage: 'Hola quiero cotizar booking',
    heroSecondaryCta: 'Enviar solicitud',
    heroPhotoAlt: 'Show de Mike Bran & Macfly',
    heroCaptionLeft: 'Live club show',
    heroCaptionRight: '2024 / 2025',
    riderCardLabel: 'Live Setup',
    riderCardTitle: 'Specs',
    riderButton: 'Rider Técnico',
    riderTitle: '',
    galleryCardLabel: 'Media',
    galleryCardTitle: 'Highlights',
    galleryButton: 'Photos',
    galleryTitle: 'Galería',
    artistsTitle: 'Artistas',
    artistsSubtitle: 'Bookea a cada DJ por separado o el show completo.',
    eventsTitle: 'Fechas',
    eventsSubtitle: 'Agenda actual y espacios abiertos para nuevas reservas.',
    eventsNote: 'Para otras fechas o giras, envía tu idea de evento y coordinamos agenda completa.',
    eventCtaLabel: 'Book',
    // Corrige el bug del sitio viejo, que mandaba "{nombre del evento}" literal.
    eventWhatsappMessage: 'Quiero estar en el evento de {evento} ({fecha})',
    openDateLabel: 'Disponible',
    openDateText: 'Abrir nueva fecha',
    openDateCta: 'Reservar',
    // Vacío a propósito: el sitio viejo abría wa.me sin texto en esta fila.
    openDateWhatsappMessage: '',
    bookingTitle: 'Solicitud de booking',
    bookingSubtitle: 'Completa los datos básicos y te responderemos con la propuesta y condiciones.',
    bookingSubmit: 'Enviar solicitud',
    bookingWhatsappButton: 'Hablar por WhatsApp',
    bookingWhatsappMessage: 'Hola quiero booking',
    // Misma línea visual que el sitio viejo, pero informativa: "Al enviar aceptas…" era un
    // consentimiento por clic, que no vale (Res. SIC 76538). La autorización es la casilla.
    bookingDisclaimer: 'Te contactaremos por email o WhatsApp con info de disponibilidad, cachet y rider técnico.',
    footerText: 'Mike Bran & Macfly — Booking',
  },

  /** Orden de los chips, como en el sitio viejo. */
  genres: ['house', 'tech-house', 'minimal-deep-tech', 'jackin-funky'],

  rider: ['DJM V10', 'ALLEN HEATH XONE 92/96', 'DJM 900NXS2', 'CDJ 3000', 'CDJ 2000 NEXUS 2', 'XDJ XZ/RX3', 'RMX 1000'],

  members: [
    {
      name: 'Mike Bran',
      role: 'House / Tech / Jackin · DJ',
      description:
        'Un sonido cargado de groove y energía, con atmósferas alegres y melodías emotivas que iluminan cualquier dancefloor.',
      photo: 'member-mikebran',
      links: [
        { platform: 'INSTAGRAM', url: 'https://www.instagram.com/mikebran_/' },
        { platform: 'SOUNDCLOUD', url: SC_TRACK },
      ],
    },
    {
      name: 'Macfly',
      role: 'Tech House / Minimal deep Tech / House · DJ',
      description: 'Energía marcada por bajos firmes, capas sintéticas con atmósferas que generan tensión y movimiento.',
      photo: 'member-macfly',
      links: [
        { platform: 'INSTAGRAM', url: 'https://www.instagram.com/macfly_ofc/' },
        { platform: 'SOUNDCLOUD', url: SC_TRACK.replace('51eceaabfa6848e69cdb71021d066717', '774cd4d73f774ccc81f74fe19129d612') },
      ],
    },
  ],

  // Vacío hasta que Fernando confirme el SoundCloud del dúo (el diseño lo marcaba "inferido").
  // La página original no tenía redes del perfil en el hero: solo las de cada integrante.
  profileLinks: [],

  gallery: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ image: `gallery-${n}`, alt: `Mike Bran & Macfly — foto ${n}` })),

  // Formulario del sitio viejo. Todo lo demás del catálogo queda apagado.
  bookingForm: [
    { key: 'fullName', required: true, label: 'Nombre y empresa / productora', placeholder: 'Tu nombre' },
    { key: 'email1', required: true, label: 'Email', placeholder: 'tu@correo.com' },
    { key: 'eventDate', required: false, label: 'Fecha del evento' },
    { key: 'city', required: false, label: 'Ciudad / Lugar evento', placeholder: 'Ciudad, país • Lugar evento' },
    {
      key: 'message',
      required: false,
      label: 'Detalles del evento',
      placeholder: 'Tipo de evento, horario, duración del set, presupuesto, requisitos técnicos...',
    },
  ],

  // Nov 2025 – ene 2026: todas pasadas a la fecha del lanzamiento, así que quedan como archivo
  // (no salen en la página pública). 27 y 29 de noviembre no tienen flyer.
  events: [
    { date: '2025-11-14', venue: 'Ramasound Garden', flyer: 'flyer-2025-11-14' },
    { date: '2025-11-16', venue: 'Paramount Records x Nakai Rooftop', flyer: 'flyer-2025-11-16' },
    { date: '2025-11-27', venue: 'Viuz', flyer: null },
    { date: '2025-11-29', venue: 'Grooveland x La terraza.deepink', flyer: null },
    { date: '2025-11-30', venue: 'Sonorama', flyer: 'flyer-2025-11-30' },
    { date: '2025-12-19', venue: 'Viuz', flyer: 'flyer-2025-12-19' },
    { date: '2025-12-26', venue: 'Baren', flyer: 'flyer-2025-12-26' },
    { date: '2026-01-24', venue: 'Viuz', flyer: 'flyer-2026-01-24' },
    { date: '2026-01-25', venue: 'Sonorama', flyer: 'flyer-2026-01-25' },
  ],
};
