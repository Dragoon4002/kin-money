// Kin logo mark (brand/kin-mark-*.svg). No "use client" so next/og can render it too. Colour = currentColor.
export function KinMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 480 480" width={size} height={size} fill="currentColor" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="115" cy="115" r="115" />
      <rect x="0" y="251" width="229" height="229" rx="10" />
      <path d="M251 10Q251 0 261 0H469Q479 0 479 10A228 228 0 0 1 261 228Q251 228 251 218Z" />
      <path d="M251 262Q251 252 261 252A228 228 0 0 1 479 470Q479 480 469 480H261Q251 480 251 470Z" />
    </svg>
  );
}
