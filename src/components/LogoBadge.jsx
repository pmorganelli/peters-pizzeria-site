import { thumbSrc } from '../utils/photos';

// The real pizzeria logo, cropped to a circular badge. The thumb derivative
// (640px) is plenty for every size this renders at, and one file serves the
// nav, footer, and hero so the browser caches it once.
export function LogoBadge({ size = 52 }) {
  return (
    <img
      src={thumbSrc('/photos/peterspizzerialogo.jpg')}
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: '50%', display: 'block' }}
    />
  );
}
