"use client";
import type { Ref } from "react";
import { MyKinko } from "@/components/kinko/PersonKinko";
import { QR_BG, QR_INK, QUIET, qrArt } from "@/lib/qrArt";

/** Kin's one payment QR: round dots, rounded eyes, my Kinko in the middle. Always dark-on-light so every camera reads it. */
export function PayQr({ text, label, svgRef }: { text: string; label: string; svgRef?: Ref<SVGSVGElement> }) {
  const { size, dots, eyes, c, logo } = qrArt(text);
  const k = logo * 0.96;
  return (
    <svg ref={svgRef} viewBox={`${-QUIET} ${-QUIET} ${size + 2 * QUIET} ${size + 2 * QUIET}`} role="img" aria-label={label} className="block aspect-square w-full">
      <rect x={-QUIET} y={-QUIET} width={size + 2 * QUIET} height={size + 2 * QUIET} fill={QR_BG} />
      <path d={dots} fill={QR_INK} />
      {eyes.map(([x, y]) => (
        <g key={`${x}-${y}`} fill={QR_INK}>
          <rect x={x + 0.5} y={y + 0.5} width={6} height={6} rx={1.8} fill="none" stroke={QR_INK} strokeWidth={1} />
          <rect x={x + 2} y={y + 2} width={3} height={3} rx={1} />
        </g>
      ))}
      <circle cx={c} cy={c} r={logo / 2} fill={QR_BG} />
      <clipPath id="kin-qr-badge"><circle cx={c} cy={c} r={logo / 2} /></clipPath>
      <g clipPath="url(#kin-qr-badge)">
        <g transform={`translate(${c - k / 2} ${c - k / 2})`}>
          <MyKinko avatar viewBox="20 -16 160 160" size={k} />
        </g>
      </g>
    </svg>
  );
}

/** The rendered QR (incl. Kinko) as an image, with CSS colors inlined so it rasterizes outside the page. */
export function qrImage(svg: SVGSVGElement): Promise<HTMLImageElement> {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const src = svg.querySelectorAll("*"), dst = copy.querySelectorAll("*");
  src.forEach((el, i) => {
    const s = getComputedStyle(el);
    (dst[i] as SVGElement).setAttribute("fill", s.fill);
    (dst[i] as SVGElement).setAttribute("stroke", s.stroke);
  });
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", "720"); // Safari needs a size to rasterize
  copy.setAttribute("height", "720");
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
  return img.decode().then(() => img);
}
