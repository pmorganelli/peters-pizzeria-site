export function LogoBadge({ size = 52 }) {
  const sliceAngles = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
    const a = (i * 45 - 90) * (Math.PI / 180);
    return { x: 60 + 27 * Math.cos(a), y: 60 + 27 * Math.sin(a) };
  });

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="60" r="58" fill="#1a1208" stroke="#c8933a" strokeWidth="2.5" />
      <circle cx="60" cy="60" r="51" fill="none" stroke="#c8933a" strokeWidth="0.8" strokeDasharray="2 2" />
      <circle cx="60" cy="60" r="44" fill="#e03616" />
      <circle cx="60" cy="60" r="34" fill="#d4a04a" stroke="#b07830" strokeWidth="1.5" />
      <circle cx="60" cy="60" r="27" fill="#e03616" />
      <circle cx="60" cy="60" r="23" fill="#f0c060" />
      {sliceAngles.map(({ x, y }, i) => (
        <line key={i} x1="60" y1="60" x2={x} y2={y} stroke="#d4a04a" strokeWidth="0.8" />
      ))}
      {[[50, 50], [68, 52], [57, 66], [70, 68], [46, 63]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="2.5" fill="#2c6e49" />
      ))}
      {[[54, 56], [66, 60], [60, 72]].map(([cx, cy], i) => (
        <ellipse key={i} cx={cx} cy={cy} rx="3" ry="2" fill="white" opacity="0.9" />
      ))}
      <path d="M54 24 Q52 20 54 17 Q56 14 54 11" stroke="#c8933a" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M60 23 Q58 19 60 16 Q62 13 60 10" stroke="#c8933a" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M66 24 Q64 20 66 17 Q68 14 66 11" stroke="#c8933a" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <defs>
        <path id="topArc" d="M 18,60 A 42,42 0 0,1 102,60" />
        <path id="botArc" d="M 20,68 A 42,42 0 0,0 100,68" />
      </defs>
      <text fill="#fef5ef" fontSize="8.5" fontFamily="'EB Garamond', serif" fontWeight="700" letterSpacing="2">
        <textPath href="#topArc" startOffset="8%">PETER&apos;S PIZZERIA</textPath>
      </text>
      <text fill="#c8933a" fontSize="7" fontFamily="'EB Garamond', serif" fontStyle="italic" letterSpacing="1.5">
        <textPath href="#botArc" startOffset="12%">Homemade Goodness</textPath>
      </text>
    </svg>
  );
}
