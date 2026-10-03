import QRCode from "qrcode";

// Styled QR geometry in module units (code spans 0..size). Mirror of app/src/lib/qrArt.ts — keep in sync.
// High error correction (H, 30%) so the cleared center (≈4% of the code) under the Kinko badge still reads.
export const QR_INK = "#1b1530"; // --kinko-ink on white: 17.6:1 contrast
export const QR_BG = "#ffffff";
export const QUIET = 4; // quiet zone, modules

export function qrArt(text: string) {
  const { size, data } = QRCode.create(text, { errorCorrectionLevel: "H" }).modules;
  const c = size / 2;
  const logo = size * 0.26; // badge diameter
  const eyes: [number, number][] = [[0, 0], [size - 7, 0], [0, size - 7]];
  const inEye = (x: number, y: number) => eyes.some(([ex, ey]) => x >= ex && x < ex + 7 && y >= ey && y < ey + 7);
  const r = 0.46;
  let dots = "";
  for (let i = 0; i < data.length; i++) {
    const x = i % size, y = Math.floor(i / size);
    if (!data[i] || inEye(x, y) || Math.hypot(x + 0.5 - c, y + 0.5 - c) < logo / 2 + 0.5) continue;
    dots += `M${x + 0.5 - r} ${y + 0.5}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  }
  return { size, dots, eyes, c, logo };
}
