import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  OPTIMIZER_WIDTHS,
  DEFAULT_QUALITY,
  LIGHTBOX_QUALITY,
  SOURCE_TIER,
  sourceSrc,
  staticSrc,
  optimizedUrl,
  buildSrcSet,
  photoSrc,
  photoSrcSet,
  responsiveImg,
} from './photos';

// The Image Optimization API rejects any `w` or `q` not listed in vercel.json,
// and the failure only ever shows up in production. These tests are the reason
// the two files can't drift.
const vercelConfig = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

describe('vercel.json image config agrees with the app', () => {
  it('allows every width the app asks for', () => {
    for (const w of OPTIMIZER_WIDTHS) {
      expect(vercelConfig.images.sizes, `width ${w} missing from images.sizes`).toContain(w);
    }
  });

  it('allows every quality the app asks for', () => {
    for (const q of [DEFAULT_QUALITY, LIGHTBOX_QUALITY]) {
      expect(vercelConfig.images.qualities, `quality ${q} missing from images.qualities`).toContain(q);
    }
  });

  it('allow-lists the source tier the helpers actually point at', () => {
    const patterns = vercelConfig.images.localPatterns.map((p) => new RegExp(p.pathname));
    const source = sourceSrc('/photos/team.jpg');
    expect(source).toBe(`/photos/${SOURCE_TIER}/team.jpg`);
    expect(patterns.some((re) => re.test(source)), `no localPattern matches ${source}`).toBe(true);
  });

  it('does not allow-list anything outside the source tier', () => {
    const patterns = vercelConfig.images.localPatterns.map((p) => new RegExp(p.pathname));
    for (const path of ['/photos/team.jpg', '/photos/static/pizza-ooni.jpg', '/api/orders']) {
      expect(patterns.some((re) => re.test(path)), `${path} should not be optimizable`).toBe(false);
    }
  });

  it('emits modern formats', () => {
    expect(vercelConfig.images.formats).toContain('image/avif');
  });
});

describe('path rewriting', () => {
  it('rewrites a plain photo path onto the source tier', () => {
    expect(sourceSrc('/photos/bambinoPictures/vitoSlice.jpeg'))
      .toBe(`/photos/${SOURCE_TIER}/bambinoPictures/vitoSlice.jpeg`);
  });

  it('rewrites onto the static tier for opt-out images', () => {
    expect(staticSrc('/photos/pizza-ooni.jpg')).toBe('/photos/static/pizza-ooni.jpg');
  });

  it('leaves a URL with no /photos/ segment untouched', () => {
    // Community wall photos live on Blob storage. Passing one through here is a
    // caller bug, but it must not mangle the URL into something unfetchable.
    const blob = 'https://abc123.public.blob.vercel-storage.com/slices/xyz.jpg';
    expect(sourceSrc(blob)).toBe(blob);
    expect(staticSrc(blob)).toBe(blob);
  });
});

describe('optimizedUrl', () => {
  it('percent-encodes the source path so it survives as a query value', () => {
    expect(optimizedUrl('/photos/large/team.jpg', 640, 75))
      .toBe('/_vercel/image?url=%2Fphotos%2Flarge%2Fteam.jpg&w=640&q=75');
  });

  it('defaults to the standard quality', () => {
    expect(optimizedUrl('/photos/large/team.jpg', 320)).toContain(`&q=${DEFAULT_QUALITY}`);
  });
});

describe('buildSrcSet', () => {
  it('pairs each candidate with its width descriptor', () => {
    const set = buildSrcSet('/photos/team.jpg', [320, 640]).split(', ');
    expect(set).toHaveLength(2);
    expect(set[0].endsWith(' 320w')).toBe(true);
    expect(set[1].endsWith(' 640w')).toBe(true);
  });

  it('points every candidate at the source tier', () => {
    for (const candidate of buildSrcSet('/photos/team.jpg', [320, 640]).split(', ')) {
      expect(candidate).toContain(encodeURIComponent(`/photos/${SOURCE_TIER}/team.jpg`));
    }
  });

  it('carries the requested quality onto every candidate', () => {
    for (const candidate of buildSrcSet('/photos/team.jpg', [640, 960], LIGHTBOX_QUALITY).split(', ')) {
      expect(candidate).toContain(`&q=${LIGHTBOX_QUALITY}`);
    }
  });

  it('drops a width the optimizer would reject rather than emitting a 400', () => {
    const set = buildSrcSet('/photos/team.jpg', [640, 999]);
    expect(set).not.toContain('999');
    expect(set.split(', ')).toHaveLength(1);
  });
});

describe('photoSrcSet without an optimizer', () => {
  it('omits the attribute instead of repeating one file under several descriptors', () => {
    // No `window` in this environment, so this is the localhost/dev path. Three
    // identical URLs labelled 320w/640w/960w would make the browser infer a
    // density and lay the image out at a fraction of its real size.
    expect(photoSrcSet('/photos/team.jpg', [320, 640, 960])).toBeUndefined();
  });
});

describe('responsiveImg', () => {
  // These assertions only mean anything on the optimizer path, and the helpers
  // decide that from the hostname — so stand up a non-local `window` for this
  // block. Without it srcSet is omitted and `src` carries no `w` to check.
  beforeEach(() => {
    globalThis.window = { location: { hostname: 'peterspizzeria.com' } };
  });
  afterEach(() => {
    delete globalThis.window;
  });

  const widthOf = (url) => Number(new URL(url, 'https://x').searchParams.get('w'));

  it('passes the slot description through as sizes', () => {
    const { sizes } = responsiveImg('/photos/team.jpg', '(max-width: 768px) 50vw, 25vw', [320, 640]);
    expect(sizes).toBe('(max-width: 768px) 50vw, 25vw');
  });

  it('offers every requested width as a candidate', () => {
    const { srcSet } = responsiveImg('/photos/team.jpg', '25vw', [320, 640, 960]);
    expect(srcSet.split(', ').map((c) => widthOf(c.split(' ')[0]))).toEqual([320, 640, 960]);
  });

  it('picks its fallback from the requested widths', () => {
    const { src } = responsiveImg('/photos/team.jpg', '25vw', [320, 640, 960]);
    expect(widthOf(src)).toBe(640);
  });

  it('never falls back to a width the optimizer would reject', () => {
    // 800 is not in OPTIMIZER_WIDTHS. buildSrcSet drops it from the candidate
    // list, but `src` is a separate URL that skips that filter — and a bad `w`
    // is a production-only 400, invisible in dev, in tests and in the build.
    const { src, srcSet } = responsiveImg('/photos/team.jpg', '25vw', [800]);
    expect(srcSet).toBe('');
    expect(OPTIMIZER_WIDTHS).toContain(widthOf(src));
  });

  it('carries the requested quality onto the fallback too', () => {
    const { src } = responsiveImg('/photos/team.jpg', '25vw', [640], LIGHTBOX_QUALITY);
    expect(new URL(src, 'https://x').searchParams.get('q')).toBe(String(LIGHTBOX_QUALITY));
  });
});

describe('off-site photos bypass the optimizer', () => {
  // The Lightbox is shared: the gallery hands it app paths, the community wall
  // hands it absolute Blob URLs. Wrapping a Blob URL in /_vercel/image is a 400
  // in production (no images.remotePatterns) and silently fine in dev, so this
  // is the only place the bug is catchable.
  const BLOB = 'https://abc123.public.blob.vercel-storage.com/slices/xyz.jpg';

  beforeEach(() => {
    globalThis.window = { location: { hostname: 'peterspizzeria.com' } };
  });
  afterEach(() => {
    delete globalThis.window;
  });

  it('serves a Blob URL untouched rather than routing it through /_vercel/image', () => {
    expect(photoSrc(BLOB, 1280, LIGHTBOX_QUALITY)).toBe(BLOB);
    expect(photoSrc(BLOB, 1280, LIGHTBOX_QUALITY)).not.toContain('/_vercel/image');
  });

  it('offers no srcset for an off-site image', () => {
    expect(photoSrcSet(BLOB, [960, 1280], LIGHTBOX_QUALITY)).toBeUndefined();
  });

  it('still optimizes app photo paths on the same code path', () => {
    // Guards against "fixing" the above by disabling the optimizer outright.
    expect(photoSrc('/photos/team.jpg', 1280)).toContain('/_vercel/image');
    expect(photoSrcSet('/photos/team.jpg', [960, 1280])).toContain('/_vercel/image');
  });

  it('carries the bypass through responsiveImg', () => {
    const { src, srcSet } = responsiveImg(BLOB, '88vw', [960, 1280]);
    expect(src).toBe(BLOB);
    expect(srcSet).toBeUndefined();
  });
});
