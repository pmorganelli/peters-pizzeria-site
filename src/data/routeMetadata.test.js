import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { metadataForRoute, SITE_URL, DEFAULT_SOCIAL_IMAGE } from './routeMetadata.js';
import { BLOG_POSTS } from './posts.js';
import { PAGE_PATHS } from '../utils/routes.js';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../public');
const shipped = (url) => existsSync(join(PUBLIC_DIR, url.replace(SITE_URL, '')));

describe('social images', () => {
  // A social scraper fetches og:image directly — it does not run the app, does
  // not take part in responsive selection, and will not follow a
  // /_vercel/image transform. So the URL has to name a file that is actually
  // deployed. Only photos/large and photos/static are symlinked into
  // public/photos; the camera originals under photos/ are not, and a bare
  // /photos/<file> path 404s into the SPA fallback. That is invisible from the
  // app, which is why this asserts against the filesystem rather than against
  // the string shape.
  it('ships the default social image', () => {
    expect(shipped(`${SITE_URL}${DEFAULT_SOCIAL_IMAGE}`)).toBe(true);
  });

  it.each(BLOG_POSTS.filter((post) => post.img).map((post) => [post.title, post]))(
    'ships the social image for %s',
    (_title, post) => {
      const { image } = metadataForRoute('article', post);
      expect(image.startsWith(SITE_URL)).toBe(true);
      expect(shipped(image)).toBe(true);
    },
  );

  it('gives every page an absolute image URL', () => {
    for (const page of Object.keys(PAGE_PATHS)) {
      const { image } = metadataForRoute(page);
      expect(image.startsWith(`${SITE_URL}/`)).toBe(true);
      expect(shipped(image)).toBe(true);
    }
  });
});
