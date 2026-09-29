import { todayBogota } from '@fersua/shared';
import { escapeXml } from './html';

// sitemap.xml y robots.txt. Las URLs absolutas salen solo de PUBLIC_URL, nunca del header Host
// (si no, cualquiera podría hacer que el sitemap apunte a otro dominio).

export function buildSitemap(publicUrl: string, profiles: { slug: string; updatedAt: Date }[]): string {
  const urls = [
    `  <url><loc>${escapeXml(`${publicUrl}/`)}</loc></url>`,
    ...profiles.map(
      (p) =>
        `  <url><loc>${escapeXml(`${publicUrl}/${p.slug}`)}</loc><lastmod>${todayBogota(p.updatedAt)}</lastmod></url>`,
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function buildRobots(publicUrl: string, seoIndexable: boolean): string {
  if (!seoIndexable) return 'User-agent: *\nDisallow: /\n';
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /panel',
    'Disallow: /admin',
    'Disallow: /api/',
    '',
    `Sitemap: ${publicUrl}/sitemap.xml`,
    '',
  ].join('\n');
}
