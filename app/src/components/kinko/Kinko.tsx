"use client";
import type { CSSProperties, ReactNode } from "react";

// Kinko — Kin's mascot: a round gumdrop buddy with a leaf sprout and a heart belly.
// Pure layered SVG. Colors only via CSS vars (globals.css tokens). Exports/props are a stable contract.

export type Mood = "happy" | "calm" | "sad" | "celebrate";
export type Look = { skin: string; expression: string; accessories: string[] };
export const DEFAULT_LOOK: Look = { skin: "classic", expression: "smile", accessories: [] };

const INK = "var(--kinko-ink)";
const shade = (c: string) => `color-mix(in oklab, ${c} 78%, var(--kinko-ink))`;

const SKINS: Record<string, { kb: string; ks: string }> = {
  classic: { kb: "var(--kinko-body)", ks: "var(--kinko-shade)" },
  mint: { kb: "color-mix(in oklab, var(--fun-1) 70%, var(--fun-ink))", ks: shade("var(--fun-1)") },
  sunset: { kb: "color-mix(in oklab, var(--fun-4) 75%, var(--fun-2))", ks: shade("var(--fun-4)") },
  night: { kb: "color-mix(in oklab, var(--fun-5) 55%, var(--fun-3))", ks: shade("var(--fun-3)") },
  gold: { kb: "var(--fun-2)", ks: shade("var(--fun-2)") },
};

const HEAD_TOP = ["cap", "crown", "party", "headphones"];

const CSS = `
@keyframes kinko-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes kinko-hop{0%,100%{transform:translateY(0)}40%{transform:translateY(-14px)}}
@keyframes kinko-twinkle{0%,100%{opacity:.35;transform:scale(.6)}50%{opacity:1;transform:scale(1)}}
.kinko-bob{animation:kinko-bob 3.2s ease-in-out infinite}
.kinko-hop{animation:kinko-hop .9s ease-in-out infinite}
.kinko-twinkle{transform-box:fill-box;transform-origin:center;animation:kinko-twinkle 1.4s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.kinko-bob,.kinko-hop,.kinko-twinkle{animation:none}}
`;

const line = { stroke: INK, strokeWidth: 5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Eyes({ kind }: { kind: string }) {
  const open = (x: number) => (
    <g key={x}>
      <ellipse cx={x} cy={84} rx={9} ry={12} fill={INK} />
      <circle cx={x + 3} cy={79} r={3.5} fill="var(--fun-ink)" />
    </g>
  );
  const closed = (x: number, up: boolean) => <path key={x} d={up ? `M${x - 9} 87 Q${x} 76 ${x + 9} 87` : `M${x - 9} 82 Q${x} 91 ${x + 9} 82`} fill="none" {...line} />;
  switch (kind) {
    case "wink": return <>{closed(78, true)}{open(122)}</>;
    case "sleepy":
    case "celebrate": return <>{closed(78, kind === "celebrate")}{closed(122, kind === "celebrate")}</>;
    case "cool":
      return (
        <>
          {open(78)}
          {open(122)}
          <path d="M66 78 H90 M110 78 H134" {...line} />
        </>
      );
    case "sad":
      return (
        <>
          {open(78)}
          {open(122)}
          <path d="M66 68 L88 63 M112 63 L134 68" {...line} strokeWidth={4} />
        </>
      );
    default: return <>{open(78)}{open(122)}</>;
  }
}

function Mouth({ kind }: { kind: string }) {
  switch (kind) {
    case "grin":
    case "celebrate":
      return (
        <g>
          <path d="M84 102 Q100 128 116 102 Z" fill={INK} {...line} strokeWidth={4} />
          <ellipse cx={100} cy={115} rx={7} ry={4.5} fill="var(--kinko-cheek)" />
        </g>
      );
    case "cool": return <path d="M88 108 Q102 114 114 102" fill="none" {...line} />;
    case "sleepy":
      return (
        <g>
          <ellipse cx={100} cy={108} rx={5} ry={6} fill={INK} />
          <text x={146} y={52} fontSize={20} fontWeight={800} fill={INK} className="kinko-twinkle">z</text>
          <text x={160} y={34} fontSize={14} fontWeight={800} fill={INK} className="kinko-twinkle" style={{ animationDelay: ".5s" }}>z</text>
        </g>
      );
    case "sad": return <path d="M88 112 Q100 102 112 112" fill="none" {...line} />;
    default: return <path d="M88 103 Q100 116 112 103" fill="none" {...line} />;
  }
}

const ACCESSORIES: Record<string, ReactNode> = {
  scarf: (
    <g>
      <path d="M40 110 Q100 128 160 110 L160 124 Q100 142 40 124 Z" fill="var(--fun-4)" {...line} strokeWidth={4} />
      <path d="M120 128 L126 160 L140 157 L136 124 Z" fill="var(--fun-4)" {...line} strokeWidth={4} />
      <path d="M60 120 L64 127 M84 125 L87 133 M110 126 L112 134" stroke="var(--fun-ink)" strokeWidth={3} strokeLinecap="round" opacity={0.7} />
    </g>
  ),
  chain: (
    <g>
      <path d="M62 114 Q100 138 138 114" fill="none" stroke="var(--fun-2)" strokeWidth={7} strokeDasharray="0.1 9" strokeLinecap="round" />
      <circle cx={100} cy={127} r={10} fill="var(--fun-2)" {...line} strokeWidth={3.5} />
      <text x={100} y={131.5} textAnchor="middle" fontSize={13} fontWeight={800} fill={INK}>K</text>
    </g>
  ),
  shades: (
    <g>
      <rect x={60} y={72} width={36} height={24} rx={10} fill={INK} />
      <rect x={104} y={72} width={36} height={24} rx={10} fill={INK} />
      <path d="M94 80 Q100 76 106 80 M60 80 L42 74 M140 80 L158 74" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <path d="M68 78 L76 78 M112 78 L120 78" stroke="var(--fun-ink)" strokeWidth={3} strokeLinecap="round" opacity={0.6} />
    </g>
  ),
  headphones: (
    <g>
      <path d="M36 92 C34 14 166 14 164 92" fill="none" stroke={INK} strokeWidth={12} strokeLinecap="round" />
      <path d="M36 92 C34 14 166 14 164 92" fill="none" stroke="var(--fun-3)" strokeWidth={5} strokeLinecap="round" />
      <rect x={20} y={74} width={22} height={36} rx={10} fill="var(--fun-3)" {...line} strokeWidth={4} />
      <rect x={158} y={74} width={22} height={36} rx={10} fill="var(--fun-3)" {...line} strokeWidth={4} />
    </g>
  ),
  cap: (
    <g>
      <path d="M50 58 C50 12 150 12 150 58 Z" fill="var(--fun-5)" {...line} strokeWidth={4} />
      <path d="M140 56 Q176 54 186 66 Q156 72 118 60 Z" fill="var(--fun-5)" {...line} strokeWidth={4} />
      <path d="M100 22 C92 34 92 48 96 58" fill="none" stroke={INK} strokeWidth={3} opacity={0.4} />
      <circle cx={100} cy={20} r={5} fill="var(--fun-2)" {...line} strokeWidth={3} />
    </g>
  ),
  crown: (
    <g>
      <path d="M66 50 L64 16 L84 32 L100 8 L116 32 L136 16 L134 50 Z" fill="var(--fun-2)" {...line} strokeWidth={4} />
      <circle cx={100} cy={38} r={5} fill="var(--fun-4)" />
      <circle cx={80} cy={42} r={3.5} fill="var(--fun-5)" />
      <circle cx={120} cy={42} r={3.5} fill="var(--fun-1)" />
    </g>
  ),
  party: (
    <g>
      <path d="M74 44 L108 -2 L126 40 Z" fill="var(--fun-5)" {...line} strokeWidth={4} />
      <path d="M86 28 L114 22 M80 38 L120 30" stroke="var(--fun-2)" strokeWidth={4} strokeLinecap="round" />
      <circle cx={108} cy={-4} r={7} fill="var(--fun-4)" {...line} strokeWidth={3} />
    </g>
  ),
  bow: (
    <g>
      <path d="M140 40 L118 26 Q112 44 128 50 Z M140 40 L162 30 Q166 50 150 52 Z" fill="var(--fun-4)" {...line} strokeWidth={4} />
      <circle cx={140} cy={42} r={6} fill="var(--fun-4)" {...line} strokeWidth={3.5} />
    </g>
  ),
};

const ORDER = ["scarf", "chain", "shades", "headphones", "cap", "crown", "party", "bow"];

const SPARKLES = [
  [8, 40, 1, 0],
  [180, 30, 0.8, 0.3],
  [192, 120, 0.6, 0.6],
  [2, 130, 0.7, 0.9],
] as const;
const star = "M0 -12 Q2 -2 12 0 Q2 2 0 12 Q-2 2 -12 0 Q-2 -2 0 -12 Z";

/** Kin's mascot. `mood` overrides the face (sad, celebrate = arms up + sparkles). */
export function Kinko({ look = DEFAULT_LOOK, mood = "happy", size = 120 }: { look?: Look; mood?: Mood; size?: number }) {
  const skin = SKINS[look.skin] ?? SKINS.classic;
  const party = mood === "celebrate";
  const face = mood === "sad" || party ? mood : look.expression;
  const worn = ORDER.filter((a) => look.accessories.includes(a));
  const sprout = !worn.some((a) => HEAD_TOP.includes(a));
  const style = { "--kb": skin.kb, "--ks": skin.ks } as CSSProperties;
  const arm = (x: number, flip: 1 | -1) =>
    party ? (
      <ellipse cx={x - flip * 4} cy={84} rx={11} ry={20} transform={`rotate(${flip * -32} ${x} 84)`} fill="var(--ks)" {...line} strokeWidth={4.5} />
    ) : (
      <ellipse cx={x} cy={130} rx={10} ry={17} transform={`rotate(${flip * 30} ${x} 130)`} fill="var(--ks)" {...line} strokeWidth={4.5} />
    );

  return (
    <svg viewBox="-12 -16 224 222" width={size} height={size} style={style} role="img" aria-label="Kinko" className="shrink-0 overflow-visible">
      <style href="kinko" precedence="default">{CSS}</style>
      <ellipse cx={100} cy={196} rx={50} ry={7} fill={INK} opacity={0.12} />
      <g className={party ? "kinko-hop" : "kinko-bob"}>
        {arm(26, 1)}
        {arm(174, -1)}
        <ellipse cx={76} cy={178} rx={17} ry={11} fill="var(--ks)" {...line} strokeWidth={4.5} />
        <ellipse cx={124} cy={178} rx={17} ry={11} fill="var(--ks)" {...line} strokeWidth={4.5} />
        {sprout && (
          <g>
            <path d="M100 34 Q98 20 106 10" fill="none" {...line} strokeWidth={4} />
            <path d="M106 12 Q118 -2 132 6 Q122 22 106 12 Z" fill="var(--fun-1)" {...line} strokeWidth={4} />
            <path d="M102 18 Q88 6 78 14 Q88 26 102 18 Z" fill="var(--fun-1)" {...line} strokeWidth={4} />
          </g>
        )}
        <path d="M100 32 C152 32 172 78 172 122 C172 164 140 184 100 184 C60 184 28 164 28 122 C28 78 48 32 100 32 Z" fill="var(--kb)" {...line} />
        <path d="M44 140 C52 166 80 176 100 176 C120 176 148 166 156 140 C146 160 124 168 100 168 C76 168 54 160 44 140 Z" fill="var(--ks)" opacity={0.5} />
        <ellipse cx={100} cy={152} rx={34} ry={22} fill="color-mix(in oklab, var(--kb) 50%, var(--fun-ink))" />
        <path d="M100 166 C86 156 82 150 82 144 C82 138 87 134 92 134 C96 134 99 137 100 140 C101 137 104 134 108 134 C113 134 118 138 118 144 C118 150 114 156 100 166 Z" fill="var(--fun-4)" {...line} strokeWidth={3.5} />
        <ellipse cx={60} cy={100} rx={11} ry={7} fill="var(--kinko-cheek)" opacity={0.85} />
        <ellipse cx={140} cy={100} rx={11} ry={7} fill="var(--kinko-cheek)" opacity={0.85} />
        <Eyes kind={face} />
        <Mouth kind={face} />
        {worn.map((a) => <g key={a}>{ACCESSORIES[a]}</g>)}
      </g>
      {party &&
        SPARKLES.map(([x, y, s, d]) => (
          <g key={x} transform={`translate(${x} ${y}) scale(${s})`}>
            <path d={star} className="kinko-twinkle" style={{ animationDelay: `${d}s` }} fill="var(--fun-2)" stroke={INK} strokeWidth={2} />
          </g>
        ))}
    </svg>
  );
}
