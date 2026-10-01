"use client";
import QRCode from "qrcode";

/** QR as one SVG path; colors come from tokens (always dark-on-light so every camera reads it). */
export function PayQr({ text, label }: { text: string; label: string }) {
  const { size, data } = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
  let d = "";
  for (let i = 0; i < data.length; i++) if (data[i]) d += `M${i % size} ${Math.floor(i / size)}h1v1h-1z`;
  return (
    <svg viewBox={`-2 -2 ${size + 4} ${size + 4}`} role="img" aria-label={label} className="aspect-square w-full" shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={size + 4} height={size + 4} fill="var(--fun-ink)" />
      <path d={d} fill="var(--kinko-ink)" />
    </svg>
  );
}
