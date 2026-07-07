// Derivative paths generated from the originals in photos/ (see repo docs):
//   photos/thumbs/  — max 640px, for grids and cards
//   photos/web/     — max 1600px, for article bodies and the lightbox
const derive = (src, folder) => src.replace('/photos/', `/photos/${folder}/`);

export const thumbSrc = (src) => derive(src, 'thumbs');
export const webSrc   = (src) => derive(src, 'web');
