import type { ReactNode } from "react";
import Svg, { Circle, Ellipse, G, Path, Rect, Text } from "react-native-svg";

// Kinko — native port of app/src/components/kinko/Kinko.tsx (same paths/skins/faces/accessories, no animation).
// Web colors are CSS vars + color-mix(in oklab); resolved here to hex from app/src/app/globals.css.

export type Mood = "happy" | "calm" | "sad" | "celebrate";
export type Look = { skin: string; expression: string; accessories: string[] };
export const DEFAULT_LOOK: Look = { skin: "classic", expression: "smile", accessories: [] };

const INK = "#1b1530"; // --kinko-ink
const CHEEK = "#ff9bb3";
const F1 = "#22b573", F2 = "#f2b830", F3 = "#6c4ee0", F4 = "#ec5a7c", F5 = "#3b8cf0", FINK = "#ffffff";

// kb = body, ks = shade, belly = color-mix(kb 50%, fun-ink) — precomputed in oklab.
const SKINS: Record<string, { kb: string; ks: string; belly: string }> = {
  classic: { kb: "#9d8cf6", ks: "#7e6be6", belly: "#ccc6fd" },
  mint: { kb: "#79cc9c", ks: "#2b8f66", belly: "#bee6cd" },
  sunset: { kb: "#ef7571", ks: "#b94c6b", belly: "#fcbcb7" },
  night: { kb: "#5972e9", ks: "#5941b6", belly: "#a7baf8" },
  gold: { kb: "#f2b830", ks: "#bd9141", belly: "#f9dda6" },
};

const HEAD_TOP = ["cap", "crown", "party", "headphones"];
const line = { stroke: INK, strokeWidth: 5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Eyes({ kind }: { kind: string }) {
  const open = (x: number) => (
    <G key={x}>
      <Ellipse cx={x} cy={84} rx={9} ry={12} fill={INK} />
      <Circle cx={x + 3} cy={79} r={3.5} fill={FINK} />
    </G>
  );
  const closed = (x: number, up: boolean) => <Path key={x} d={up ? `M${x - 9} 87 Q${x} 76 ${x + 9} 87` : `M${x - 9} 82 Q${x} 91 ${x + 9} 82`} fill="none" {...line} />;
  switch (kind) {
    case "wink": return <>{closed(78, true)}{open(122)}</>;
    case "sleepy":
    case "celebrate": return <>{closed(78, kind === "celebrate")}{closed(122, kind === "celebrate")}</>;
    case "cool": return <>{open(78)}{open(122)}<Path d="M66 78 H90 M110 78 H134" {...line} /></>;
    case "sad": return <>{open(78)}{open(122)}<Path d="M66 68 L88 63 M112 63 L134 68" {...line} strokeWidth={4} /></>;
    default: return <>{open(78)}{open(122)}</>;
  }
}

function Mouth({ kind }: { kind: string }) {
  switch (kind) {
    case "grin":
    case "celebrate":
      return (
        <G>
          <Path d="M84 102 Q100 128 116 102 Z" fill={INK} {...line} strokeWidth={4} />
          <Ellipse cx={100} cy={115} rx={7} ry={4.5} fill={CHEEK} />
        </G>
      );
    case "cool": return <Path d="M88 108 Q102 114 114 102" fill="none" {...line} />;
    case "sleepy":
      return (
        <G>
          <Ellipse cx={100} cy={108} rx={5} ry={6} fill={INK} />
          <Text x={146} y={52} fontSize={20} fontWeight="800" fill={INK}>z</Text>
          <Text x={160} y={34} fontSize={14} fontWeight="800" fill={INK}>z</Text>
        </G>
      );
    case "sad": return <Path d="M88 112 Q100 102 112 112" fill="none" {...line} />;
    default: return <Path d="M88 103 Q100 116 112 103" fill="none" {...line} />;
  }
}

const ACCESSORIES: Record<string, ReactNode> = {
  scarf: (
    <G>
      <Path d="M40 110 Q100 128 160 110 L160 124 Q100 142 40 124 Z" fill={F4} {...line} strokeWidth={4} />
      <Path d="M120 128 L126 160 L140 157 L136 124 Z" fill={F4} {...line} strokeWidth={4} />
      <Path d="M60 120 L64 127 M84 125 L87 133 M110 126 L112 134" stroke={FINK} strokeWidth={3} strokeLinecap="round" opacity={0.7} />
    </G>
  ),
  chain: (
    <G>
      <Path d="M62 114 Q100 138 138 114" fill="none" stroke={F2} strokeWidth={7} strokeDasharray="0.1 9" strokeLinecap="round" />
      <Circle cx={100} cy={127} r={10} fill={F2} {...line} strokeWidth={3.5} />
      <Text x={100} y={131.5} textAnchor="middle" fontSize={13} fontWeight="800" fill={INK}>K</Text>
    </G>
  ),
  shades: (
    <G>
      <Rect x={60} y={72} width={36} height={24} rx={10} fill={INK} />
      <Rect x={104} y={72} width={36} height={24} rx={10} fill={INK} />
      <Path d="M94 80 Q100 76 106 80 M60 80 L42 74 M140 80 L158 74" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <Path d="M68 78 L76 78 M112 78 L120 78" stroke={FINK} strokeWidth={3} strokeLinecap="round" opacity={0.6} />
    </G>
  ),
  headphones: (
    <G>
      <Path d="M36 92 C34 14 166 14 164 92" fill="none" stroke={INK} strokeWidth={12} strokeLinecap="round" />
      <Path d="M36 92 C34 14 166 14 164 92" fill="none" stroke={F3} strokeWidth={5} strokeLinecap="round" />
      <Rect x={20} y={74} width={22} height={36} rx={10} fill={F3} {...line} strokeWidth={4} />
      <Rect x={158} y={74} width={22} height={36} rx={10} fill={F3} {...line} strokeWidth={4} />
    </G>
  ),
  cap: (
    <G>
      <Path d="M50 58 C50 12 150 12 150 58 Z" fill={F5} {...line} strokeWidth={4} />
      <Path d="M140 56 Q176 54 186 66 Q156 72 118 60 Z" fill={F5} {...line} strokeWidth={4} />
      <Path d="M100 22 C92 34 92 48 96 58" fill="none" stroke={INK} strokeWidth={3} opacity={0.4} />
      <Circle cx={100} cy={20} r={5} fill={F2} {...line} strokeWidth={3} />
    </G>
  ),
  crown: (
    <G>
      <Path d="M66 50 L64 16 L84 32 L100 8 L116 32 L136 16 L134 50 Z" fill={F2} {...line} strokeWidth={4} />
      <Circle cx={100} cy={38} r={5} fill={F4} />
      <Circle cx={80} cy={42} r={3.5} fill={F5} />
      <Circle cx={120} cy={42} r={3.5} fill={F1} />
    </G>
  ),
  party: (
    <G>
      <Path d="M74 44 L108 -2 L126 40 Z" fill={F5} {...line} strokeWidth={4} />
      <Path d="M86 28 L114 22 M80 38 L120 30" stroke={F2} strokeWidth={4} strokeLinecap="round" />
      <Circle cx={108} cy={-4} r={7} fill={F4} {...line} strokeWidth={3} />
    </G>
  ),
  bow: (
    <G>
      <Path d="M140 40 L118 26 Q112 44 128 50 Z M140 40 L162 30 Q166 50 150 52 Z" fill={F4} {...line} strokeWidth={4} />
      <Circle cx={140} cy={42} r={6} fill={F4} {...line} strokeWidth={3.5} />
    </G>
  ),
};

const ORDER = ["scarf", "chain", "shades", "headphones", "cap", "crown", "party", "bow"];
const SPARKLES = [[8, 40, 1], [180, 30, 0.8], [192, 120, 0.6], [2, 130, 0.7]] as const;
const star = "M0 -12 Q2 -2 12 0 Q2 2 0 12 Q-2 2 -12 0 Q-2 -2 0 -12 Z";

const AVATAR_SKINS = ["classic", "mint", "sunset", "night", "gold"];
const AVATAR_FACES = ["smile", "grin", "sleepy", "wink", "cool"];

/** Exact port of web lookForName: same name → same Kinko on web and phone. */
export function lookForName(name = ""): Look {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { skin: AVATAR_SKINS[h % AVATAR_SKINS.length], expression: AVATAR_FACES[(h >>> 3) % AVATAR_FACES.length], accessories: [] };
}

/** Kin's mascot. `avatar`: head-and-shoulders crop for small profile pictures. */
export function Kinko({ look = DEFAULT_LOOK, mood = "happy", size = 120, avatar = false }: { look?: Look; mood?: Mood; size?: number; avatar?: boolean }) {
  const skin = SKINS[look.skin] ?? SKINS.classic;
  const party = mood === "celebrate";
  const face = mood === "sad" || party ? mood : look.expression;
  const worn = ORDER.filter((a) => look.accessories.includes(a));
  const sprout = !worn.some((a) => HEAD_TOP.includes(a));
  const arm = (x: number, flip: 1 | -1) =>
    party ? (
      <Ellipse cx={x - flip * 4} cy={84} rx={11} ry={20} transform={`rotate(${flip * -32} ${x} 84)`} fill={skin.ks} {...line} strokeWidth={4.5} />
    ) : (
      <Ellipse cx={x} cy={130} rx={10} ry={17} transform={`rotate(${flip * 30} ${x} 130)`} fill={skin.ks} {...line} strokeWidth={4.5} />
    );

  return (
    <Svg viewBox={avatar ? "22 10 156 156" : "-12 -16 224 222"} width={size} height={size} accessibilityLabel="Kinko">
      <Ellipse cx={100} cy={196} rx={50} ry={7} fill={INK} opacity={0.12} />
      {arm(26, 1)}
      {arm(174, -1)}
      <Ellipse cx={76} cy={178} rx={17} ry={11} fill={skin.ks} {...line} strokeWidth={4.5} />
      <Ellipse cx={124} cy={178} rx={17} ry={11} fill={skin.ks} {...line} strokeWidth={4.5} />
      {sprout && (
        <G>
          <Path d="M100 34 Q98 20 106 10" fill="none" {...line} strokeWidth={4} />
          <Path d="M106 12 Q118 -2 132 6 Q122 22 106 12 Z" fill={F1} {...line} strokeWidth={4} />
          <Path d="M102 18 Q88 6 78 14 Q88 26 102 18 Z" fill={F1} {...line} strokeWidth={4} />
        </G>
      )}
      <Path d="M100 32 C152 32 172 78 172 122 C172 164 140 184 100 184 C60 184 28 164 28 122 C28 78 48 32 100 32 Z" fill={skin.kb} {...line} />
      <Path d="M44 140 C52 166 80 176 100 176 C120 176 148 166 156 140 C146 160 124 168 100 168 C76 168 54 160 44 140 Z" fill={skin.ks} opacity={0.5} />
      <Ellipse cx={100} cy={152} rx={34} ry={22} fill={skin.belly} />
      <Path d="M100 166 C86 156 82 150 82 144 C82 138 87 134 92 134 C96 134 99 137 100 140 C101 137 104 134 108 134 C113 134 118 138 118 144 C118 150 114 156 100 166 Z" fill={F4} {...line} strokeWidth={3.5} />
      <Ellipse cx={60} cy={100} rx={11} ry={7} fill={CHEEK} opacity={0.85} />
      <Ellipse cx={140} cy={100} rx={11} ry={7} fill={CHEEK} opacity={0.85} />
      <Eyes kind={face} />
      <Mouth kind={face} />
      {worn.map((a) => <G key={a}>{ACCESSORIES[a]}</G>)}
      {party &&
        SPARKLES.map(([x, y, s]) => (
          <G key={x} transform={`translate(${x} ${y}) scale(${s})`}>
            <Path d={star} fill={F2} stroke={INK} strokeWidth={2} />
          </G>
        ))}
    </Svg>
  );
}
