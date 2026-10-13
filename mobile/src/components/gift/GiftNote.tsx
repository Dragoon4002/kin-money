// Port of web components/gift/GiftNote.tsx + the kd-gift fold in globals.css: the paper note (three 110 px rows that
// fold), the box parts and the confetti. Shared by GiftWrap (send) and GiftReveal (arrival).
// Fold: each outer row is one view turning on rotateX with perspective; its face swaps to the back at 90°.
import { Gift } from "lucide-react-native";
import { useEffect, type ReactNode } from "react";
import { Image, Platform, View, type TextStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue } from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { Text, TextInput } from "@/components/ui";
import { currencySymbol, formatMoney, fromLocal } from "@/lib/money";
import { fonts } from "@/theme";

export type GiftMode = "name" | "link";
/** What's on the note. amount = local-currency text as typed ("40", "12.5"); to = Kin name without "@" ("" = you). */
export type GiftDraft = { mode: GiftMode; to: string; amount: string; msg: string; from: string };
export const MAX_MSG = 120;

/** Paper stays off-white in both themes (web --kt-*). */
export const P = { paper: "#f5f0e6", back: "#ebe5da", ink: "#24201b", muted: "#756c61", good: "#1f9d6b", line: "#b9ae9f", pill: "rgba(36,32,27,0.07)", ribbon: "#f6d36b" };
export const MONO = Platform.select({ ios: "Menlo", default: "monospace" });
const NOISE = require("../../../assets/images/paper-noise.png");
export const Grain = () => <Image source={NOISE} resizeMode="repeat" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />;

export const ROW = 110;
export const NOTE_W = 280;
const FOLD = Easing.bezier(0.45, 0, 0.35, 1);

// Message shrinks as it grows so 120 chars still fit its 110 px row: 20 → 14 px.
const msgSize = (n: number) => Math.max(14, Math.min(20, 22 - n * 0.07));
/** Amount text → what the folded note shows. */
export const noteMoney = (amount: string) => formatMoney(Number(amount) > 0 ? fromLocal(amount) : 0n);

/** web color-mix(in srgb): `a` with `p` of it, rest `b`. */
export function mix(a: string, b: string, p: number) {
  const c = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(c(a, i) * p + c(b, i) * (1 - p)).toString(16).padStart(2, "0")).join("")}`;
}

export const Label = ({ children, style }: { children: ReactNode; style?: TextStyle }) => (
  <Text style={[{ fontFamily: MONO, fontSize: 11, fontWeight: "700", letterSpacing: 2, color: P.muted }, style]}>{children}</Text>
);

type Edit = { set?: (p: Partial<GiftDraft>) => void; onTo?: (focus: boolean) => void };
const bare: TextStyle = { padding: 0, margin: 0, textAlign: "center", color: P.ink, borderWidth: 0 };

/** Each panel shows one row, so only that row (`live`) gets the real inputs; the other copies are clipped and static. */
function NoteFace({ d, set, live, units, onTo }: { d: GiftDraft; live: number; units?: bigint } & Edit) {
  const edit = (row: number) => !!set && live === row;
  const big: TextStyle = { color: P.ink, fontSize: 48, fontWeight: "700", fontVariant: ["tabular-nums"], lineHeight: 56 };
  return (
    <View style={{ height: ROW * 3 }}>
      <View style={{ height: ROW, alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 24 }}>
        <View style={{ width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: P.pill }}><Gift color={P.ink} size={18} /></View>
        <Label>A GIFT FOR</Label>
        {d.mode === "link" ? <Text style={{ color: P.ink, fontSize: 20, fontWeight: "700" }}>Whoever accepts it</Text>
          : edit(0) ? (
            <TextInput accessibilityLabel="Who is it for?" placeholder="@name" placeholderTextColor={P.muted} autoComplete="off" autoCapitalize="none" autoCorrect={false}
              value={d.to ? `@${d.to}` : ""} onChangeText={(v) => set!({ to: v.replace(/[^a-z0-9_]/gi, "").toLowerCase() })}
              onFocus={() => onTo?.(true)} onBlur={() => onTo?.(false)} style={[bare, { width: "100%", fontSize: 20, fontWeight: "700", height: 26 }]} />
          ) : <Text numberOfLines={1} style={{ color: P.ink, fontSize: 20, fontWeight: "700" }}>{d.to ? `@${d.to}` : "You"}</Text>}
      </View>
      <View style={{ height: ROW, alignItems: "center", justifyContent: "center" }}>
        {edit(1) ? (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={[big, { color: P.muted }]}>{currencySymbol()}</Text>
            {/* Hidden copy sizes the field to what's typed (web field-sizing: content). */}
            <View style={{ minWidth: 28, maxWidth: 192 }}>
              <Text style={[big, { opacity: 0 }]} numberOfLines={1}>{d.amount || "0"}</Text>
              <TextInput accessibilityLabel="Amount" keyboardType="decimal-pad" placeholder="0" placeholderTextColor={P.muted} value={d.amount}
                onChangeText={(v) => set!({ amount: v.replace(/[^\d.]/g, "") })} style={[bare, big, { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, textAlign: "left" }]} />
            </View>
          </View>
        ) : <Text numberOfLines={1} adjustsFontSizeToFit style={big}>{units !== undefined ? formatMoney(units) : noteMoney(d.amount)}</Text>}
      </View>
      <View style={{ height: ROW, alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 24 }}>
        {edit(2) ? (
          <TextInput accessibilityLabel="Message (optional)" maxLength={MAX_MSG} multiline placeholder="Add a message" placeholderTextColor={P.muted}
            value={d.msg} onChangeText={(v) => set!({ msg: v.replace(/\n/g, " ") })} submitBehavior="blurAndSubmit" returnKeyType="done"
            style={[bare, { width: "100%", maxHeight: 76, fontFamily: fonts.serif, fontSize: msgSize(d.msg.length), lineHeight: msgSize(d.msg.length) * 1.3 }]} />
        ) : !!d.msg && (
          <Text numberOfLines={4} style={{ color: P.ink, textAlign: "center", fontFamily: fonts.serif, fontSize: msgSize(d.msg.length), lineHeight: msgSize(d.msg.length) * 1.3 }}>“{d.msg}”</Text>
        )}
        {!!d.from && <Text style={{ fontFamily: MONO, fontSize: 12, color: P.muted }}>from @{d.from}</Text>}
      </View>
    </View>
  );
}

/** Dark edge where the row bends (web .kd-shade), fades in with the fold. */
function Shade({ up, f }: { up: boolean; f: SharedValue<number> }) {
  const s = useAnimatedStyle(() => ({ opacity: f.get() }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, s]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={`shade${+up}`} x1="0" y1={up ? "1" : "0"} x2="0" y2={up ? "0" : "1"}>
            <Stop offset={0} stopColor="#000" stopOpacity={0.28} /><Stop offset={0.7} stopColor="#000" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#shade${+up})`} />
      </Svg>
    </Animated.View>
  );
}

const FACE = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" } as const;

/** Row k. Rows 0 and 2 turn (0: down over the middle about its bottom edge, 2: up about its top edge). */
function Panel({ k, d, set, onTo, units, f }: { k: 0 | 1 | 2; d: GiftDraft; units?: bigint; f: SharedValue<number> } & Edit) {
  const sign = k === 0 ? -1 : 1;
  const r = k === 0 ? { borderTopLeftRadius: 6, borderTopRightRadius: 6 } : k === 2 ? { borderBottomLeftRadius: 6, borderBottomRightRadius: 6 } : {};
  const rb = k === 0 ? { borderBottomLeftRadius: 6, borderBottomRightRadius: 6 } : { borderTopLeftRadius: 6, borderTopRightRadius: 6 };
  const turn = useAnimatedStyle(() => (k === 1 ? {} : { transform: [{ perspective: 1100 }, { rotateX: `${sign * 180 * f.get()}deg` }] }));
  const front = useAnimatedStyle(() => ({ opacity: f.get() < 0.5 ? 1 : 0 }));
  const back = useAnimatedStyle(() => ({ opacity: f.get() < 0.5 ? 0 : 1 }));
  return (
    <Animated.View pointerEvents="box-none" style={[{ position: "absolute", left: 0, right: 0, top: ROW * k, height: ROW, zIndex: [3, 1, 2][k], transformOrigin: k === 0 ? "50% 100%" : "50% 0%" }, turn]}>
      <Animated.View pointerEvents="box-none" style={[FACE, r, { backgroundColor: P.paper }, front]}>
        <Grain />
        <View style={{ marginTop: -ROW * k }}><NoteFace d={d} set={set} live={k} units={units} onTo={onTo} /></View>
        {k !== 1 && <Shade up={k === 0} f={f} />}
      </Animated.View>
      {k !== 1 && (
        // Back of the paper: drawn upside down so it reads right once turned over.
        <Animated.View pointerEvents="none" style={[FACE, rb, { backgroundColor: P.back, alignItems: "center", justifyContent: "center", transform: [{ scaleY: -1 }] }, back]}>
          <Grain />
          <Svg width="100%" height="100%" style={{ position: "absolute" }}>
            <Defs>
              <LinearGradient id={`back${k}`} x1="0" y1={k === 0 ? "1" : "0"} x2="0" y2={k === 0 ? "0" : "1"}>
                <Stop offset={0} stopColor="#000" stopOpacity={0.1} /><Stop offset={0.3} stopColor="#000" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#back${k})`} />
          </Svg>
          {k === 0 && <Text style={{ color: P.ink, fontFamily: fonts.serif, fontSize: 24 }}>For {d.mode === "link" || !d.to ? "you" : `@${d.to}`}</Text>}
        </Animated.View>
      )}
    </Animated.View>
  );
}

/** The note: folded when `folded` (bottom row up, then top row down, 380 ms each). `set` = editable (the form).
 *  `units` = exact amount to print (arrival); else the typed local amount. */
export function Note({ d, set, onTo, label, folded, units }: { d: GiftDraft; label: string; folded: boolean; units?: bigint } & Edit) {
  const reduced = useReducedMotion();
  const f2 = useSharedValue(+folded), f0 = useSharedValue(+folded), sh = useSharedValue(+folded);
  useEffect(() => {
    const v = +folded;
    if (reduced) return void (f2.set(v), f0.set(v), sh.set(v));
    f2.set(withTiming(v, { duration: 380, easing: FOLD }));
    f0.set(withDelay(360, withTiming(v, { duration: 380, easing: FOLD })));
    sh.set(withDelay(200, withTiming(v, { duration: 380, easing: FOLD })));
  }, [folded, reduced, f0, f2, sh]);
  // Shadow shrinks to the middle row as the note folds (web .kd-note-shadow inset).
  const shadow = useAnimatedStyle(() => ({ top: ROW * sh.get(), bottom: ROW * sh.get() }));
  return (
    <View accessible={!set} accessibilityRole={set ? undefined : "image"} accessibilityLabel={label} pointerEvents="box-none" style={{ width: NOTE_W, height: ROW * 3 }}>
      <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 3, right: 3, borderRadius: 4, boxShadow: "0 8px 14px rgba(0,0,0,0.22), 0 1px 2px rgba(0,0,0,0.18)" }, shadow]} />
      <Panel k={1} d={d} set={set} onTo={onTo} units={units} f={f2} />
      <Panel k={2} d={d} set={set} onTo={onTo} units={units} f={f2} />
      <Panel k={0} d={d} set={set} onTo={onTo} units={units} f={f0} />
    </View>
  );
}

export const Ribbon = () => <View pointerEvents="none" style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 26, marginLeft: -13, backgroundColor: P.ribbon, boxShadow: "inset 3px 0 rgba(0,0,0,0.08)" }} />;
export const Bow = () => (
  <Svg viewBox="0 0 80 44" width={84} height={46} fill={P.ribbon} stroke={P.ribbon}>
    <Path d="M40 30 C26 4 4 6 8 24 C10 34 26 34 40 30 Z" />
    <Path d="M40 30 C54 4 76 6 72 24 C70 34 54 34 40 30 Z" />
    <Path d="M37 30 L28 44 M43 30 L52 44" strokeWidth={5} strokeLinecap="round" fill="none" />
    <Circle cx={40} cy={29} r={6} />
  </Svg>
);

/** Box colours from the brand (web color-mix). */
export const boxColors = (brand: string) => ({ front: brand, inside: mix(brand, "#000000", 0.62), flap: mix(brand, "#000000", 0.8), lid: mix(brand, "#ffffff", 0.88) });

/** Front of the box, filling its parent: brand, a darker band under the rim, the ribbon. */
export const BoxFront = ({ brand }: { brand: string }) => (
  <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: brand, boxShadow: "0 10px 18px rgba(0,0,0,0.22)" }}>
    <View style={{ position: "absolute", top: 8, left: 0, right: 0, height: 4, backgroundColor: "rgba(0,0,0,0.08)" }} />
    <Ribbon />
  </View>
);

// Burst from the box top (same spread as web BITS).
const CONFETTI = ["#f2b830", "#ec5a7c", "#3b8cf0", "#6c4ee0", "#22b573"]; // web --fun-2, 4, 5, 3, 1
export const BITS = Array.from({ length: 26 }, (_, i) => {
  const a = Math.PI + (i / 25) * Math.PI, d = 110 + ((i * 53) % 90); // upper half-circle
  return { dx: Math.round(Math.cos(a) * d), dy: Math.round(Math.sin(a) * d), r: (i * 71) % 360, color: CONFETTI[i % CONFETTI.length], w: i % 2 ? 7 : 6, h: i % 2 ? 7 : 14, radius: i % 2 ? 99 : 2 };
});
