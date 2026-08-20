// Every photo in an <img> is served through Vercel's Image Optimization API
// (/_vercel/image), which resizes and re-encodes to AVIF/WebP per request and
// caches the result on the CDN. That replaced three hand-built, hand-committed
// JPEG tiers: sips can't write AVIF at all, and the tiers had to be regenerated
// and re-committed (~100 MB of git history) every time a quality knob moved.
//
// photos/large/ (2400px) is the single source the optimizer reads from. The
// untouched camera originals stay in photos/ as masters and are not deployed.

// Widths we're allowed to ask for. **These must all appear in vercel.json's
// images.sizes** — the API rejects any other `w` outright, so a width added here
// and not there is a broken image in production and nowhere else.
// photos.test.js asserts the two lists agree; don't edit one alone.
export const OPTIMIZER_WIDTHS = [320, 640, 960, 1280, 1600, 2048];

// Same deal for quality: it has to be listed in images.qualities.
export const DEFAULT_QUALITY = 75;
export const LIGHTBOX_QUALITY = 82;

// The tier the optimizer reads from.
export const SOURCE_TIER = 'large';

// Every subfolder of photos/ that holds derivatives rather than originals.
// scripts/gen-photo-dims.mjs imports this as its skip-list: without it the dims
// walker treats a tier folder as a folder of originals and fills PHOTO_RATIOS
// with one junk entry per derivative.
export const DERIVATIVE_TIERS = [SOURCE_TIER, 'static'];

// A few images deliberately skip the optimizer and are served as plain files
// from photos/static/: the three CSS hero backgrounds (a stylesheet can't take
// part in responsive selection, and a query-string URL in `background-image`
// would break on localhost where /_vercel/image doesn't exist) and the nav logo
// (well under the 10 KB where optimizing stops paying for itself).
export const staticSrc = (src) => src.replace('/photos/', '/photos/static/');

export const sourceSrc = (src) => src.replace('/photos/', `/photos/${SOURCE_TIER}/`);

// /_vercel/image exists only on Vercel. On localhost — `vite dev` and
// `vite preview` alike — fall back to the source file so the site still works
// with no network and no platform. Hostname rather than import.meta.env.PROD:
// a preview build served locally is PROD but still has no optimizer.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '']);
export const optimizerAvailable = () =>
  typeof window !== 'undefined' && !LOCAL_HOSTS.has(window.location.hostname);

// Pure URL builder, kept separate from the environment check so it can be
// tested without a DOM.
export function optimizedUrl(source, width, quality = DEFAULT_QUALITY) {
  return `/_vercel/image?url=${encodeURIComponent(source)}&w=${width}&q=${quality}`;
}

// One photo at one width. `src` is the plain '/photos/name.jpg' path used
// everywhere in the app — the tier is this module's business, not the caller's.
export function photoSrc(src, width, quality = DEFAULT_QUALITY) {
  const source = sourceSrc(src);
  return optimizerAvailable() ? optimizedUrl(source, width, quality) : source;
}

// A full srcset. Widths are filtered against OPTIMIZER_WIDTHS rather than
// trusted, so a typo degrades to a smaller candidate list instead of a 400.
export function buildSrcSet(src, widths, quality = DEFAULT_QUALITY) {
  const source = sourceSrc(src);
  return widths
    .filter((w) => OPTIMIZER_WIDTHS.includes(w))
    .map((w) => `${optimizedUrl(source, w, quality)} ${w}w`)
    .join(', ');
}

export function photoSrcSet(src, widths, quality = DEFAULT_QUALITY) {
  // With no optimizer every candidate is the same file under a different width
  // descriptor, and the browser believes the descriptors: it picks one, divides
  // the real width by the density it inferred, and reports (and lays out) the
  // image at a fraction of its size. Omit the attribute entirely and let `src`
  // stand on its own.
  return optimizerAvailable() ? buildSrcSet(src, widths, quality) : undefined;
}

// Fixed-width shorthands for the many places that just need one sensible size.
// Names kept from the old tier system so call sites didn't all have to change.
export const thumbSrc = (src) => photoSrc(src, 640);
export const webSrc   = (src) => photoSrc(src, 1600);
export const largeSrc = (src) => photoSrc(src, 2048);

// ── Upload downscaling ────────────────────────────────────────────────
// Customer uploads are re-encoded in the browser before they're sent. This
// keeps a 4 MB phone photo under the server's 1 MB cap, and the canvas
// round-trip drops EXIF, so the GPS coordinates baked into a phone photo never
// leave the device.

const UPLOAD_MAX_PX = 1600;
const UPLOAD_MAX_BYTES = 900_000; // under the server's 1 MB, with headroom

async function loadBitmap(file) {
  try {
    // 'from-image' applies the EXIF rotation; without it, portrait phone
    // photos land on the canvas sideways.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Older Safari doesn't accept the options bag — fall back to an <img>,
    // which browsers now orient from EXIF by default.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Could not read that image.'));
        img.src = url;
      });
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function downscaleImage(file) {
  const src = await loadBitmap(file);
  const sw = src.width;
  const sh = src.height;
  if (!sw || !sh) throw new Error('Could not read that image.');

  const scale = Math.min(1, UPLOAD_MAX_PX / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // A fresh canvas is transparent black, and the JPEG encode below has no
  // alpha channel to put it in — so a transparent PNG (a screenshot, a
  // sticker) would land on the wall with solid black where it should be
  // clear. Paint the backdrop white first.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  src.close?.();

  // Busy photos can still exceed the cap at the default quality; step down
  // rather than bounce the customer off a server-side size error.
  let quality = 0.82;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length * 0.75 > UPLOAD_MAX_BYTES && quality > 0.4) {
    quality -= 0.12;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  return { dataUrl, w, h };
}
