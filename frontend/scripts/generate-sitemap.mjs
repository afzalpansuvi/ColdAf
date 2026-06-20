// Generates public/sitemap.xml from the help article manifest.
// Run manually after adding/removing help articles:  node scripts/generate-sitemap.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { helpManifest } from '../src/pages/help/manifest.js';

const SITE = 'https://coldaf.ataflexsolutions.com';
const today = new Date().toISOString().slice(0, 10);

const urls = [
  { loc: `${SITE}/help`, priority: '0.8', changefreq: 'weekly' },
  ...helpManifest.articles.map((a) => ({
    loc: `${SITE}/help/${a.slug}`,
    priority: '0.6',
    changefreq: 'monthly',
  })),
];

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls
    .map(
      (u) =>
        `  <url>\n` +
        `    <loc>${u.loc}</loc>\n` +
        `    <lastmod>${today}</lastmod>\n` +
        `    <changefreq>${u.changefreq}</changefreq>\n` +
        `    <priority>${u.priority}</priority>\n` +
        `  </url>`
    )
    .join('\n') +
  `\n</urlset>\n`;

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/sitemap.xml');
writeFileSync(out, xml, 'utf8');
console.log(`Wrote ${urls.length} URLs to ${out}`);
