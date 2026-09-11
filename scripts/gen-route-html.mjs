import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOG_POSTS } from '../src/data/posts.js';
import { PAGE_PATHS } from '../src/utils/routes.js';
import { metadataForRoute } from '../src/data/routeMetadata.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const shell = readFileSync(join(dist, 'index.html'), 'utf8');
const routes = [
  ...Object.keys(PAGE_PATHS).map((page) => ({ page, article: null })),
  ...BLOG_POSTS.map((article) => ({ page: 'article', article })),
];

const escape = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function replaceMeta(html, selector, value) {
  const escaped = escape(value);
  const pattern = selector.startsWith('property=')
    ? new RegExp(`(<meta\\s+property="${selector.slice(9)}"\\s+content=")[^"]*("\\s*/?>)`)
    : new RegExp(`(<meta\\s+name="${selector.slice(5)}"\\s+content=")[^"]*("\\s*/?>)`);
  return html.replace(pattern, `$1${escaped}$2`);
}

for (const { page, article } of routes) {
  const meta = metadataForRoute(page, article);
  let html = shell.replace(/<title>[^<]*<\/title>/, `<title>${escape(meta.title)}</title>`);
  html = replaceMeta(html, 'name=description', meta.description);
  html = replaceMeta(html, 'property=og:title', meta.title);
  html = replaceMeta(html, 'property=og:description', meta.description);
  html = replaceMeta(html, 'property=og:type', meta.type);
  html = replaceMeta(html, 'property=og:url', meta.canonical);
  html = replaceMeta(html, 'property=og:image', meta.image);
  html = replaceMeta(html, 'name=twitter:title', meta.title);
  html = replaceMeta(html, 'name=twitter:description', meta.description);
  html = replaceMeta(html, 'name=twitter:image', meta.image);
  html = html.replace(/(<link\s+rel="canonical"\s+href=")[^"]*("\s*\/?>)/, `$1${escape(meta.canonical)}$2`);

  const url = new URL(meta.canonical);
  if (url.pathname === '/') {
    writeFileSync(join(dist, 'index.html'), html);
  } else {
    const target = join(dist, url.pathname.slice(1), 'index.html');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, html);
  }
}

console.log(`route HTML: ${routes.length} pages`);
