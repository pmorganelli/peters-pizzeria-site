import { staticSrc } from '../utils/photos';

// The real pizzeria logo, cropped to a circular badge. The 256px static
// derivative covers every size this renders at (128px at most, so 2x), and one
// file serves the nav, footer, and hero so the browser caches it once.
// Regenerate it with scripts/gen-photo-derivatives.sh when the logo changes —
// copying the master into photos/static/ ships the full-size file on every page.
export function LogoBadge({ size = 52 }) {
  return (
    <img
      src={staticSrc('/photos/peterspizzerialogo.jpg')}
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: '50%', display: 'block' }}
    />
  );
}
