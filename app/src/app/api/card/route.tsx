import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { KinMark } from "@/components/KinMark";
import { FX, formatMoney } from "@/lib/money";
import { allow, clientIp } from "@/lib/server/relayer";
import { CATS, parseCard, type Card } from "./params";

// Share card: 1080×1350 PNG. Public, no account data — only the amount/@names/title the user chose to share.
// next/og can't read CSS vars or color-mix, so the dark palette + Kinko skins are hardcoded hex
// (mirrors globals.css dark values and components/kinko/Kinko.tsx; keep in sync by eye).

const C = { bg: "#0d0c0b", surface: "#171513", line: "#2b2723", ink: "#f6f1ea", muted: "#9a9088", brand: "#ec6a4f", good: "#3cc28a" };
const K = { ink: "#1b1530", cheek: "#ff9bb3", leaf: "#22b573", yellow: "#f2b830", purple: "#6c4ee0", pink: "#ec5a7c", blue: "#3b8cf0" };
const SKIN: Record<string, { kb: string; ks: string }> = {
  classic: { kb: "#9d8cf6", ks: "#7e6be6" },
  mint: { kb: "#6fd0a2", ks: "#209264" },
  sunset: { kb: "#ee7269", ks: "#be4b6b" },
  night: { kb: "#5170e9", ks: "#5a41b9" },
  gold: { kb: "#f2b830", ks: "#c39430" },
};
const HEAD_TOP = ["cap", "crown", "party", "headphones"];
const line = { stroke: K.ink, strokeWidth: 5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const ACC: Record<string, ReactNode> = {
  scarf: <g><path d="M40 110 Q100 128 160 110 L160 124 Q100 142 40 124 Z" fill={K.pink} {...line} strokeWidth={4} /><path d="M120 128 L126 160 L140 157 L136 124 Z" fill={K.pink} {...line} strokeWidth={4} /></g>,
  chain: <g><path d="M62 114 Q100 138 138 114" fill="none" stroke={K.yellow} strokeWidth={7} strokeDasharray="0.1 9" strokeLinecap="round" /><circle cx={100} cy={127} r={10} fill={K.yellow} {...line} strokeWidth={3.5} /></g>,
  shades: <g><rect x={60} y={72} width={36} height={24} rx={10} fill={K.ink} /><rect x={104} y={72} width={36} height={24} rx={10} fill={K.ink} /><path d="M94 80 Q100 76 106 80 M60 80 L42 74 M140 80 L158 74" fill="none" stroke={K.ink} strokeWidth={4} strokeLinecap="round" /></g>,
  headphones: <g><path d="M36 92 C34 14 166 14 164 92" fill="none" stroke={K.ink} strokeWidth={12} strokeLinecap="round" /><path d="M36 92 C34 14 166 14 164 92" fill="none" stroke={K.purple} strokeWidth={5} strokeLinecap="round" /><rect x={20} y={74} width={22} height={36} rx={10} fill={K.purple} {...line} strokeWidth={4} /><rect x={158} y={74} width={22} height={36} rx={10} fill={K.purple} {...line} strokeWidth={4} /></g>,
  cap: <g><path d="M50 58 C50 12 150 12 150 58 Z" fill={K.blue} {...line} strokeWidth={4} /><path d="M140 56 Q176 54 186 66 Q156 72 118 60 Z" fill={K.blue} {...line} strokeWidth={4} /><circle cx={100} cy={20} r={5} fill={K.yellow} {...line} strokeWidth={3} /></g>,
  crown: <g><path d="M66 50 L64 16 L84 32 L100 8 L116 32 L136 16 L134 50 Z" fill={K.yellow} {...line} strokeWidth={4} /><circle cx={100} cy={38} r={5} fill={K.pink} /><circle cx={80} cy={42} r={3.5} fill={K.blue} /><circle cx={120} cy={42} r={3.5} fill={K.leaf} /></g>,
  party: <g><path d="M74 44 L108 -2 L126 40 Z" fill={K.blue} {...line} strokeWidth={4} /><path d="M86 28 L114 22 M80 38 L120 30" stroke={K.yellow} strokeWidth={4} strokeLinecap="round" /><circle cx={108} cy={-4} r={7} fill={K.pink} {...line} strokeWidth={3} /></g>,
  bow: <g><path d="M140 40 L118 26 Q112 44 128 50 Z M140 40 L162 30 Q166 50 150 52 Z" fill={K.pink} {...line} strokeWidth={4} /><circle cx={140} cy={42} r={6} fill={K.pink} {...line} strokeWidth={3.5} /></g>,
};
const star = "M0 -12 Q2 -2 12 0 Q2 2 0 12 Q-2 2 -12 0 Q-2 -2 0 -12 Z";

/** Celebrating Kinko (arms up, sparkles) — static port of components/kinko/Kinko.tsx. */
function Kinko({ skin, accessories, size }: { skin: string; accessories: string[]; size: number }) {
  const { kb, ks } = SKIN[skin] ?? SKIN.classic;
  const arm = (x: number, f: 1 | -1) => <ellipse cx={x - f * 4} cy={84} rx={11} ry={20} transform={`rotate(${f * -32} ${x} 84)`} fill={ks} {...line} strokeWidth={4.5} />;
  const eye = (x: number) => <path d={`M${x - 9} 87 Q${x} 76 ${x + 9} 87`} fill="none" {...line} />;
  return (
    <svg viewBox="-12 -16 224 222" width={size} height={size}>
      <ellipse cx={100} cy={196} rx={50} ry={7} fill="#000" opacity={0.3} />
      {arm(26, 1)}
      {arm(174, -1)}
      <ellipse cx={76} cy={178} rx={17} ry={11} fill={ks} {...line} strokeWidth={4.5} />
      <ellipse cx={124} cy={178} rx={17} ry={11} fill={ks} {...line} strokeWidth={4.5} />
      {!accessories.some((a) => HEAD_TOP.includes(a)) && (
        <g>
          <path d="M100 34 Q98 20 106 10" fill="none" {...line} strokeWidth={4} />
          <path d="M106 12 Q118 -2 132 6 Q122 22 106 12 Z" fill={K.leaf} {...line} strokeWidth={4} />
          <path d="M102 18 Q88 6 78 14 Q88 26 102 18 Z" fill={K.leaf} {...line} strokeWidth={4} />
        </g>
      )}
      <path d="M100 32 C152 32 172 78 172 122 C172 164 140 184 100 184 C60 184 28 164 28 122 C28 78 48 32 100 32 Z" fill={kb} {...line} />
      <ellipse cx={100} cy={152} rx={34} ry={22} fill="#fff" opacity={0.45} />
      <path d="M100 166 C86 156 82 150 82 144 C82 138 87 134 92 134 C96 134 99 137 100 140 C101 137 104 134 108 134 C113 134 118 138 118 144 C118 150 114 156 100 166 Z" fill={K.pink} {...line} strokeWidth={3.5} />
      <ellipse cx={60} cy={100} rx={11} ry={7} fill={K.cheek} opacity={0.85} />
      <ellipse cx={140} cy={100} rx={11} ry={7} fill={K.cheek} opacity={0.85} />
      {eye(78)}
      {eye(122)}
      <path d="M84 102 Q100 128 116 102 Z" fill={K.ink} {...line} strokeWidth={4} />
      <ellipse cx={100} cy={115} rx={7} ry={4.5} fill={K.cheek} />
      {accessories.map((a) => <g key={a}>{ACC[a]}</g>)}
      {[[8, 40, 1], [180, 30, 0.8], [192, 120, 0.6], [2, 130, 0.7]].map(([x, y, s]) => (
        <path key={x} d={star} transform={`translate(${x} ${y}) scale(${s})`} fill={K.yellow} stroke={K.ink} strokeWidth={2} />
      ))}
    </svg>
  );
}

function words(c: Card): { head: string; sub?: string; check?: boolean } {
  switch (c.kind) {
    case "sent": return { head: c.secs ? `Sent home in ${c.secs}s` : "Sent with Kin", sub: c.to && `to @${c.to}` };
    case "received": return { head: c.from ? `Money from @${c.from}` : "Money for you" };
    case "goal": return { head: "Goal reached 🎉", sub: c.title };
    case "gift": return { head: c.from ? `A gift from @${c.from}` : "A gift for you" };
    case "settled": return { head: "Trip settled", sub: c.title, check: true }; // ✓ drawn: no font has the glyph
    case "receipt": return { head: "" }; // drawn by Receipt below
  }
}

// ponytail: fonts fetched from Google once per server instance; falls back to the built-in font if offline.
async function gfont(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}
let fonts: Promise<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[]> | undefined;
const loadFonts = () =>
  (fonts ??= Promise.all([gfont("Instrument+Serif", 400), gfont("Plus+Jakarta+Sans", 700), gfont("JetBrains+Mono", 400), gfont("JetBrains+Mono", 700)]).then(([serif, sans, mono, monoB]) => {
    if (!serif || !sans || !mono || !monoB) fonts = undefined; // retry next request
    return [
      ...(sans ? [{ name: "Jakarta", data: sans, weight: 700 as const, style: "normal" as const }] : []),
      ...(serif ? [{ name: "Serif", data: serif, weight: 400 as const, style: "normal" as const }] : []),
      ...(mono ? [{ name: "Mono", data: mono, weight: 400 as const, style: "normal" as const }] : []),
      ...(monoB ? [{ name: "Mono", data: monoB, weight: 700 as const, style: "normal" as const }] : []),
    ];
  }));


// Receipt card: the whole printed ticket, paper only (transparent around the torn top and scalloped bottom).
// Mirrors components/receipt/ReceiptTicket.tsx at 3× (keep in sync by eye).
const P = { paper: "#f5f0e6", ink: "#24201b", muted: "#756c61", good: "#1f9d6b", line: "#b9ae9f", pill: "#e6e0d5", okBg: "#d9e8dc" };
const RW = 1080; // image width
const PAD = 84;
const NOTE_CHARS = 38; // mono 34px across the inner width: rough chars per line for the height estimate

/** Same bars as the ticket's Barcode: same payment, same barcode. */
function bars(id: string) {
  let x = 0;
  const out = [...id.slice(2)].map((ch, i) => {
    const c = parseInt(ch, 16);
    const w = 1 + ((c + i * 7) % 3);
    const b = { x, w };
    x += w + 1 + ((c * 3 + i) % 2);
    return b;
  });
  return { out, total: x };
}

const label = { fontFamily: "Mono", fontWeight: 700, fontSize: 30, letterSpacing: 6, color: P.muted } as const;
const value = { fontFamily: "Mono", fontWeight: 700, fontSize: 40, color: P.ink } as const;
const Dash = () => (
  <svg width={RW - PAD * 2} height={4} style={{ margin: "36px 0" }}>
    <line x1={0} y1={2} x2={RW - PAD * 2} y2={2} stroke={P.line} strokeWidth={4} strokeDasharray="18 12" />
  </svg>
);
const who = (s?: string) => (!s ? "—" : s.startsWith("0x") ? s : `@${s}`);
const Check = ({ size, bg, fg }: { size: number; bg: string; fg: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size}>
    <circle cx={12} cy={12} r={12} fill={bg} />
    <path d="M7 12.5 L10.5 16 L17 8.5" fill="none" stroke={fg} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Height for the content (the image can't grow to fit): fixed blocks + the note's wrapped lines. */
function receiptHeight(c: Card) {
  const noteLines = c.note ? Math.min(6, Math.ceil(c.note.length / NOTE_CHARS)) : 0;
  const forBlock = c.cat || c.note ? 76 + 36 + (c.cat && c.out ? 92 : 0) + noteLines * 48 + (c.cat && c.out && c.note ? 20 : 0) : 0;
  return 1850 + forBlock;
}

function Receipt({ c, money, kinko }: { c: Card; money: string; kinko: ReactNode }) {
  const [, sym = "", num = ""] = money.match(/^(\D*)(.*)$/) ?? [];
  const h = receiptHeight(c);
  const { out: b, total } = bars(c.id ?? "0x" + "0".repeat(64));
  const short = c.id ? `${c.id.slice(2, 8)}…${c.id.slice(-4)}`.toUpperCase() : "";
  const bite = 54; // scallop width
  const n = Math.floor((RW - 14) / bite);
  const cols = (items: [string, string][]) => (
    <div style={{ display: "flex", width: "100%" }}>
      {items.map(([k, v]) => (
        <div key={k} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <span style={label}>{k}</span>
          <span style={value}>{v}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ width: RW, height: h, display: "flex", position: "relative" }}>
      {/* Paper: torn top (zigzag), scalloped bottom (bites), drawn as one SVG behind the content. */}
      <svg width={RW} height={h} style={{ position: "absolute", left: 0, top: 0 }}>
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ece5d8" />
            <stop offset="0.06" stopColor={P.paper} />
            <stop offset="0.9" stopColor={P.paper} />
            <stop offset="1" stopColor="#ece5d8" />
          </linearGradient>
        </defs>
        <path
          fill="url(#g)"
          d={[
            `M0 14`,
            ...Array.from({ length: 36 }, (_, i) => `L${((i + 0.5) * RW) / 36} ${i % 2 ? 14 : 0} L${((i + 1) * RW) / 36} 14`),
            `L${RW} ${h}`,
            // Bites: 40px half-circles cut up into the paper, 14px of paper between them, right → left.
            ...Array.from({ length: n }, (_, i) => {
              const x = RW - 7 - i * bite;
              return `L${x} ${h} A20 20 0 0 0 ${x - 40} ${h}`;
            }),
            `L0 ${h} Z`,
          ].join(" ")}
        />
      </svg>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", width: "100%", padding: `96px ${PAD}px 0`, color: P.ink, fontFamily: "Jakarta" }}>
        <div style={{ display: "flex", position: "relative" }}>
          {kinko}
          <div style={{ display: "flex", position: "absolute", right: -24, bottom: 0, borderRadius: 999, border: `8px solid ${P.paper}` }}>
            <Check size={84} bg={P.good} fg="#fff" />
          </div>
        </div>
        <span style={{ marginTop: 28, fontFamily: "Mono", fontWeight: 700, fontSize: 52, letterSpacing: 14 }}>{c.out ? "PAYMENT RECEIPT" : "MONEY RECEIVED"}</span>
        <Dash />
        <span style={label}>{c.out ? "AMOUNT PAID" : "AMOUNT RECEIVED"}</span>
        <div style={{ display: "flex", alignItems: "baseline", marginTop: 12 }}>
          <span style={{ fontSize: 150, letterSpacing: -4 }}>{sym}{num}</span>
          <span style={{ marginLeft: 14, fontFamily: "Mono", fontWeight: 700, fontSize: 40, color: P.muted }}>{c.cur}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, padding: "14px 32px", borderRadius: 999, background: P.okBg, color: P.good, fontSize: 40 }}>
          {c.secs ? `Delivered in ${c.secs}s` : "Delivered"}
          <Check size={40} bg={P.okBg} fg={P.good} />
        </div>
        {(c.cat || c.note) && <Dash />}
        {(c.cat || c.note) && <span style={label}>FOR</span>}
        {c.cat && c.out && (
          <div style={{ display: "flex", marginTop: 20, padding: "16px 40px", borderRadius: 999, background: P.pill, fontSize: 40 }}>{CATS[c.cat]}</div>
        )}
        {c.note && (
          <div style={{ display: "flex", marginTop: 20, maxWidth: RW - PAD * 2, fontFamily: "Mono", fontSize: 34, lineHeight: 1.4, color: P.muted, textAlign: "center", justifyContent: "center" }}>
            {`“${c.note}”`}
          </div>
        )}
        <Dash />
        <div style={{ display: "flex", width: "100%" }}>
          {[["TO", who(c.to)], ["FROM", who(c.from)]].map(([k, v], i) => (
            <div key={k} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, borderLeft: i ? `4px dashed ${P.line}` : "none" }}>
              <span style={label}>{k}</span>
              <span style={{ fontSize: 52 }}>{v}</span>
              {v.startsWith("0x") && <span style={{ fontFamily: "Mono", fontSize: 28, color: P.muted }}>Not on Kin</span>}
            </div>
          ))}
        </div>
        <Dash />
        {cols(c.secs ? [["SPEED", `${c.secs}s`], ["FEE", formatMoney(0n, c.cur in FX ? c.cur : "USD")]] : [["FEE", formatMoney(0n, c.cur in FX ? c.cur : "USD")]])}
        {c.when && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: 40 }}>
            <span style={label}>DATE & TIME</span>
            <span style={{ ...value, fontSize: 36 }}>{c.when}</span>
          </div>
        )}
        <Dash />
        <span style={label}>PAYMENT ID</span>
        <span style={{ ...value, marginTop: 12, letterSpacing: 4 }}>{short}</span>
        <svg viewBox={`0 0 ${total} 10`} preserveAspectRatio="none" width={RW - PAD * 2} height={150} style={{ marginTop: 20 }}>
          {b.map((x, i) => <rect key={i} x={x.x} width={x.w} height={10} fill={P.ink} />)}
        </svg>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 40, fontSize: 32, color: P.muted }}>
          <KinMark size={40} /> {c.out ? "Sent" : "Received"} with Kin · getkin.space
        </div>
      </div>
    </div>
  );
}

export async function GET(req: Request) {
  if (!allow(`card:${clientIp(req)}`, 30)) return new Response("Slow down", { status: 429 }); // image render is CPU-heavy
  const c = parseCard(new URL(req.url).searchParams);
  if (!c) return new Response("Bad card", { status: 400 });
  const { head, sub, check } = words(c);
  const money = c.amount === undefined ? "" : formatMoney(c.amount, c.cur in FX ? c.cur : "USD");
  // Symbol apart from digits: the serif lacks ₹/₦/₱, and a dimmed symbol matches <Amount>.
  const [, sym = "", num = ""] = money.match(/^(\D*)(.*)$/) ?? [];
  const big = Math.min(180, Math.floor(1700 / Math.max(num.length, 1)));
  const f = await loadFonts();
  const serif = f.some((x) => x.name === "Serif") ? "Serif" : undefined;

  if (c.kind === "receipt")
    return new ImageResponse(<Receipt c={c} money={money} kinko={<Kinko skin={c.skin} accessories={c.accessories} size={220} />} />, {
      width: RW, height: receiptHeight(c), fonts: f.length ? f : undefined, headers: { "cache-control": "public, max-age=86400, immutable" },
    });

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 64, background: C.bg, color: C.ink, fontFamily: "Jakarta" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: 72, border: `2px solid ${C.line}`, backgroundColor: C.surface, backgroundImage: `radial-gradient(circle at 50% 30%, ${C.brand}33, transparent 60%)`, padding: 56 }}>
          <Kinko skin={c.skin} accessories={c.accessories} size={460} />
          <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 20, fontFamily: serif, fontSize: 84, lineHeight: 1.05, textAlign: "center" }}>
            {head}
            {check && (
              <svg viewBox="0 0 24 24" width={64} height={64}>
                <circle cx={12} cy={12} r={12} fill={C.good} />
                <path d="M7 12.5 L10.5 16 L17 8.5" fill="none" stroke={C.bg} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          {money && (
            <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", lineHeight: 1 }}>
              <span style={{ fontSize: big * 0.55, color: C.muted, marginRight: 8 }}>{sym}</span>
              <span style={{ fontFamily: serif, fontSize: big, letterSpacing: -2 }}>{num}</span>
            </div>
          )}
          {sub && <div style={{ marginTop: 20, fontSize: 40, color: C.muted, textAlign: "center" }}>{sub}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 40, fontSize: 34 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 14, color: C.brand, fontFamily: serif, fontSize: 64 }}><KinMark size={48} />Kin</span>
          <span style={{ color: C.muted }}>getkin.space</span>
        </div>
      </div>
    ),
    { width: 1080, height: 1350, fonts: f.length ? f : undefined, headers: { "cache-control": "public, max-age=86400, immutable" } },
  );
}
