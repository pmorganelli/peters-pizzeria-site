// Derivative paths generated from the originals in photos/ (see repo docs):
//   photos/thumbs/  — max 640px, for grids and cards
//   photos/web/     — max 1600px, for article bodies and the lightbox
const derive = (src, folder) => src.replace('/photos/', `/photos/${folder}/`);

export const thumbSrc = (src) => derive(src, 'thumbs');
export const webSrc   = (src) => derive(src, 'web');

// Both of the above only rewrite paths containing '/photos/'. Uploaded wall
// photos live on Blob storage and have no such segment, so calling them on an
// upload URL silently returns the original — don't.

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
