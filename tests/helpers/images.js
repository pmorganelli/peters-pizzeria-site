// Byte-exact minimal fixtures for the three formats api/slices.js's
// imageMeta()/jpegSize() recognize. These are built directly from that
// parser's own byte offsets (see api/slices.js) rather than sourced from
// real image files, so each field lines up with exactly what the parser
// reads and dimensions are asserted precisely — no external image tool
// (sips/cwebp/etc.) or binary fixture file required.

// Minimal SOF0 JPEG: SOI, then an SOF0 marker with a 1-component payload
// carrying height/width, padded to the 24-byte floor imageMeta() enforces
// before it even looks at the format. jpegSize() returns as soon as it finds
// the SOF marker, so nothing after it needs to be a valid bitstream.
export function makeJpeg(w = 100, h = 50) {
  const buf = Buffer.alloc(24);
  buf[0] = 0xff; buf[1] = 0xd8;             // SOI
  buf[2] = 0xff; buf[3] = 0xc0;             // SOF0 marker
  buf.writeUInt16BE(11, 4);                 // segment length (1-component SOF0)
  buf[6] = 8;                               // sample precision
  buf.writeUInt16BE(h, 7);
  buf.writeUInt16BE(w, 9);
  buf[11] = 1;                              // numComponents
  buf[12] = 1; buf[13] = 0x11; buf[14] = 0; // component spec (id, sampling, qtable)
  buf[22] = 0xff; buf[23] = 0xd9;           // EOI, just to pad to 24 bytes
  return buf;
}

// Minimal PNG: imageMeta() only checks the first 4 signature bytes (not the
// full 8-byte magic) and reads IHDR's width/height directly off fixed
// offsets, so this stops right after the height field — no real IHDR
// bitdepth/color-type bytes or CRC needed.
export function makePng(w = 100, h = 50) {
  const buf = Buffer.alloc(24);
  buf.writeUInt32BE(0x89504e47, 0);   // PNG signature (first 4 bytes)
  buf.writeUInt32BE(13, 8);           // IHDR chunk length
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(w, 16);
  buf.writeUInt32BE(h, 20);
  return buf;
}

// Minimal WebP (VP8X container). Layout: RIFF/size/WEBP/VP8X/chunklen, then
// a 10-byte VP8X payload (1 flags byte + 3 reserved + 3-byte width-1 LE +
// 3-byte height-1 LE) — exactly the 30 bytes imageMeta()'s VP8X branch
// requires.
export function makeWebpVp8x(w = 100, h = 50) {
  const buf = Buffer.alloc(30);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(22, 4);           // RIFF size (unchecked by imageMeta)
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8X', 12, 'ascii');
  buf.writeUInt32LE(10, 16);          // VP8X payload length
  buf[20] = 0;                        // flags
  buf.writeUIntLE(w - 1, 24, 3);
  buf.writeUIntLE(h - 1, 27, 3);
  return buf;
}

// VP8 (lossy) WebP. Layout: RIFF/size/WEBP/"VP8 "/chunklen (20 bytes), then
// a 3-byte frame tag + 3-byte sync code (neither read by imageMeta — real
// values aren't required), then width/height each packed as a 2-byte LE
// "14-bit size + 2-bit scale" field at fixed offsets 26 and 28. Needs
// buf.length > 30.
export function makeWebpVp8(w = 100, h = 50) {
  const buf = Buffer.alloc(32);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(24, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8 ', 12, 'ascii');
  buf.writeUInt32LE(12, 16);
  buf[20] = 0x10; buf[21] = 0x00; buf[22] = 0x00; // frame tag (unchecked)
  buf[23] = 0x9d; buf[24] = 0x01; buf[25] = 0x2a; // sync code (unchecked)
  buf.writeUInt16LE(w & 0x3fff, 26);
  buf.writeUInt16LE(h & 0x3fff, 28);
  return buf;
}

// VP8L (lossless) WebP. Layout: RIFF/size/WEBP/"VP8L"/chunklen (20 bytes),
// then a 1-byte signature (0x2f — unchecked by imageMeta) at offset 20, then
// a 4-byte LE field at offset 21 packing width-1 in bits [0,14) and
// height-1 in bits [14,28). Needs buf.length > 25.
export function makeWebpVp8L(w = 100, h = 50) {
  const buf = Buffer.alloc(28);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(16, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8L', 12, 'ascii');
  buf.writeUInt32LE(8, 16);
  buf[20] = 0x2f;
  const bits = (w - 1) | ((h - 1) << 14);
  buf.writeUInt32LE(bits >>> 0, 21);
  return buf;
}

export function dataUrl(buf, mime) {
  return `data:${mime};base64,${buf.toString('base64')}`;
}
