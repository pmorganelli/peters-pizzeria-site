// Writes public/sitemap.xml from the same route table the app navigates with,
// so a new blog post or page can't quietly go missing from it. Runs on every
// build (see package.json's prebuild).
//
// Imports src/utils/routes.js directly — that module is plain JS with no React
// or GSAP in its import graph, which is the reason src/utils exists.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PAGE_PATHS, articlePath } from '../src/utils/routes.js';
import { BLOG_POSTS } from '../src/data/posts.js';

const SITE = 'https://peters-pizzeria-site.vercel.app';

// Staff-only or single-use pages. /order and /status are left in: both are
// things a customer might reasonably search for or be linked to.
const PRIVATE_PAGES = new Set(['admin', 'nights', 'studio']);

const urls = [
  ...Object.entries(PAGE_PATHS)
    .filter(([page]) => !PRIVATE_PAGES.has(page))
    .map(([page, path]) => ({ path, priority: page === 'home' ? '1.0' : '0.8' })),
  ...BLOG_POSTS.map((post) => ({ path: articlePath(post), priority: '0.6' })),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    ({ path, priority }) => `  <url>
    <loc>${SITE}${path}</loc>
    <priority>${priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sitemap.xml');
writeFileSync(out, xml);
console.log(`sitemap.xml: ${urls.length} urls`);
