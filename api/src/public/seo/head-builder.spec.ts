import { FALLBACK_TEMPLATE } from './shell-template.service';
import { escapeHtml, jsonForScript, truncate } from './html';
import {
  TITLE_MAX,
  defaultHead,
  indexHead,
  injectHead,
  profileHead,
  profileTitle,
  renderHead,
  robotsValue,
  type ProfileSeoInput,
} from './head-builder';

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const ctx = { publicUrl: 'https://booking.fersuastudio.com', seoIndexable: true };

const TEMPLATE = `<!doctype html>
<html lang="es-CO" data-palette="SUNSET" data-surface="public">
<head><meta charset="utf-8">
<!--app-head:start--><title>Por defecto</title><meta name="description" content="x"><!--app-head:end-->
<script type="module" src="/assets/index-abc.js"></script>
</head><body><div id="root"></div></body></html>`;

function evilProfile(text: string): ProfileSeoInput {
  return {
    slug: 'dj-malo',
    displayName: text,
    palette: 'NEON',
    seoDescription: text,
    heroSubtitle: null,
    tagline: null,
    ogImageUrl: 'https://booking.fersuastudio.com/media/p1/k1/og.jpg',
    heroAlt: text,
    genres: [text],
    members: [text],
    sameAs: ['https://www.instagram.com/dj/'],
    publicPhone: null,
    publicEmail: null,
    events: [{ name: text, date: '2026-11-14', time: '22:00', venue: text, city: text, url: null }],
  };
}

/** Todo el contenido del bloque JSON-LD debe ser JSON válido y devolver el texto original. */
function jsonLdOf(html: string): unknown {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('sin JSON-LD');
  return JSON.parse(m[1]!);
}

describe('escapado del shell SEO', () => {
  const payloads = ['$&', "$'", '$`', '$1', '</script><script>alert(1)</script>', `"><img src=x onerror=alert(1)>`, `a${LS}b${PS}c`, "O'Neil & \"Co\""];

  it.each(payloads)('el texto %p no rompe el HTML ni la plantilla', (text) => {
    const html = injectHead(TEMPLATE, renderHead(profileHead(ctx, evilProfile(text))), 'NEON');

    // La plantilla queda intacta alrededor del bloque (los patrones $ no se interpretaron).
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<script type="module" src="/assets/index-abc.js"></script>');
    expect(html.match(/<!--app-head:start-->/g)).toHaveLength(1);
    expect(html.match(/<!--app-head:end-->/g)).toHaveLength(1);
    expect(html).not.toContain('Por defecto');

    // Solo existen los <script> esperados: el JSON-LD y el módulo de la app.
    expect(html.match(/<script/g)).toHaveLength(2);
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    expect(html).not.toContain('<img');
    expect(html).not.toContain(LS);
    expect(html).not.toContain(PS);

    // El JSON-LD se puede leer y conserva el texto exacto.
    const ld = jsonLdOf(html) as { name: string; event: { name: string }[] };
    expect(ld.event[0]!.name).toBe(text);
    expect(ld.name).toBe(text);
  });

  it('escapeHtml cubre las cinco entidades', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('jsonForScript escapa < > & y los separadores de línea', () => {
    const out = jsonForScript({ a: `</script>&${LS}${PS}` });
    expect(out).toBe('{"a":"\\u003c/script\\u003e\\u0026\\u2028\\u2029"}');
    expect(JSON.parse(out)).toEqual({ a: `</script>&${LS}${PS}` });
  });

  it('cambia data-palette sin tocar el resto del <html>', () => {
    const html = injectHead(TEMPLATE, '<title>x</title>', 'OCEAN');
    expect(html).toContain('<html lang="es-CO" data-palette="OCEAN" data-surface="public">');
  });

  it('una paleta desconocida vuelve a SUNSET', () => {
    const html = injectHead(TEMPLATE, '<title>x</title>', 'EVIL"><x' as never);
    expect(html).toContain('data-palette="SUNSET"');
  });

  it('sin marcadores, el bloque va antes de </head>', () => {
    const html = injectHead('<html data-palette="SUNSET"><head></head><body></body></html>', '<title>$&</title>', 'MONO');
    expect(html).toBe(
      '<html data-palette="MONO"><head><!--app-head:start-->\n<title>$&</title>\n<!--app-head:end-->\n</head><body></body></html>',
    );
  });

  it('la plantilla mínima tiene marcadores y paleta', () => {
    const html = injectHead(FALLBACK_TEMPLATE, '<title>ok</title>', 'GOLD');
    expect(html).toContain('data-palette="GOLD"');
    expect(html).toContain('<!--app-head:start-->\n<title>ok</title>\n<!--app-head:end-->');
  });
});

describe('head de un perfil', () => {
  const base: ProfileSeoInput = {
    slug: 'macfly-mike-bran',
    displayName: 'Mike Bran & Macfly',
    palette: 'SUNSET',
    seoDescription: null,
    heroSubtitle: 'Dúo de DJs de Medellín. '.repeat(20),
    tagline: null,
    ogImageUrl: 'https://booking.fersuastudio.com/media/p1/k1/og.jpg',
    heroAlt: 'Show de Mike Bran & Macfly',
    genres: ['House', 'Tech House'],
    members: ['Mike Bran', 'Macfly'],
    sameAs: ['https://soundcloud.com/macfly-mike-bran'],
    publicPhone: '+573505209860',
    publicEmail: null,
    events: [],
  };

  it('title, description recortada, canonical, OG y JSON-LD MusicGroup', () => {
    const head = renderHead(profileHead(ctx, base));
    expect(head).toContain('<title>Mike Bran &amp; Macfly — Booking | Fersua Studio</title>');
    expect(head).toContain('<link rel="canonical" href="https://booking.fersuastudio.com/macfly-mike-bran">');
    expect(head).toContain('<meta property="og:type" content="profile">');
    expect(head).toContain('<meta property="og:locale" content="es_CO">');
    expect(head).toContain('<meta property="og:image" content="https://booking.fersuastudio.com/media/p1/k1/og.jpg">');
    expect(head).toContain('<meta property="og:image:width" content="1200">');
    expect(head).toContain('<meta property="og:image:height" content="630">');
    expect(head).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(head).toContain('<meta name="theme-color" content="#0f172a">');
    expect(head).toContain('<meta name="robots" content="index, follow, max-image-preview:large">');

    const description = /<meta name="description" content="([^"]*)">/.exec(head)![1]!;
    expect([...description].length).toBeLessThanOrEqual(155);
    expect(description.endsWith('…')).toBe(true);

    const ld = jsonLdOf(`<script type="application/ld+json">${/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(head)![1]}</script>`) as Record<string, unknown>;
    expect(ld['@type']).toBe('MusicGroup');
    expect(ld.genre).toEqual(['House', 'Tech House']);
    expect(ld.member).toEqual([
      { '@type': 'Person', name: 'Mike Bran' },
      { '@type': 'Person', name: 'Macfly' },
    ]);
    expect(ld.contactPoint).toEqual({ '@type': 'ContactPoint', contactType: 'booking', telephone: '+573505209860' });
    expect(ld).not.toHaveProperty('event');
  });

  it('sin teléfono ni correo públicos no hay contactPoint (nada de REEMPLAZAR_TELEFONO)', () => {
    const head = renderHead(profileHead(ctx, { ...base, publicPhone: null }));
    expect(head).not.toContain('contactPoint');
  });

  it('SEO_INDEXABLE=false → noindex, nofollow', () => {
    const head = renderHead(profileHead({ ...ctx, seoIndexable: false }, base));
    expect(head).toContain('<meta name="robots" content="noindex, nofollow">');
  });

  it('el title nunca pasa de 70 caracteres', () => {
    const title = profileTitle('N'.repeat(60));
    expect([...title].length).toBeLessThanOrEqual(TITLE_MAX);
    expect(title.endsWith(' — Booking | Fersua Studio')).toBe(true);
  });

  it('eventos como MusicEvent con hora de Colombia', () => {
    const head = renderHead(
      profileHead(ctx, {
        ...base,
        events: [{ name: 'Sonorama', date: '2026-11-14', time: '22:00', venue: 'Sonorama', city: 'Medellín', url: null }],
      }),
    );
    expect(head).toContain('"startDate":"2026-11-14T22:00:00-05:00"');
    expect(head).toContain('"@type":"MusicEvent"');
  });
});

describe('otros heads', () => {
  it('index: Organization + ItemList y canonical a /', () => {
    const head = renderHead(indexHead(ctx, { djs: [{ slug: 'macfly-mike-bran', displayName: 'Mike Bran & Macfly' }], ogImageUrl: null }));
    expect(head).toContain('<title>Fersua Studio · Booking de DJs</title>');
    expect(head).toContain('<link rel="canonical" href="https://booking.fersuastudio.com/">');
    expect(head).toContain('"@type":"ItemList"');
    expect(head).toContain('"url":"https://booking.fersuastudio.com/macfly-mike-bran"');
    expect(head).toContain('<meta name="twitter:card" content="summary">');
  });

  it('rutas de la app y 404: noindex, sin canonical', () => {
    const app = renderHead(defaultHead(ctx, 'app'));
    expect(app).toContain('<meta name="robots" content="noindex">');
    expect(app).not.toContain('canonical');
    expect(renderHead(defaultHead(ctx, 'notFound'))).toContain('<title>Página no encontrada · Fersua Studio</title>');
  });

  it('robotsValue', () => {
    expect(robotsValue(false, true)).toBe('noindex, nofollow');
    expect(robotsValue(true, false)).toBe('noindex');
  });

  it('truncate no parte emojis', () => {
    expect(truncate('ab🎧🎧🎧', 4)).toBe('ab🎧…');
  });
});
