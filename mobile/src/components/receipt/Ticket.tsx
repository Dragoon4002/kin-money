// Port of web components/receipt/ReceiptTicket.tsx + useTearOff.ts (kt-* in globals.css): the receipt as a paper ticket
// feeding out of a printer slot. Paper stays off-white in both themes; the slot metal follows the theme.
// Pull the paper down to tear it off (react-native-gesture-handler Pan, runs on the UI thread with reanimated).
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ArrowUpRight, Check, ChevronsDown, Copy, Image as ImageIcon, MessageCircle, Share2 } from "lucide-react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, Modal, Platform, Pressable, ScrollView, useColorScheme, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation, Easing, FadeIn, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming, ZoomIn, ZoomOut,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import type { Address } from "viem";
import { share } from "@/components/programs/kit";
import { Kinko, type Look } from "@/components/Kinko";
import { Button, Screen, Text, TextInput } from "@/components/ui";
import { CATEGORIES } from "@/lib/categories";
import { API_BASE } from "@/lib/config";
import { formatMoney, getCurrency } from "@/lib/money";
import { shareCard, type CardParams } from "@/lib/shareCard";
import { useTheme } from "@/theme";

type Category = (typeof CATEGORIES)[number];
export type Paid = { amount: bigint; from: string; to: string; fromA?: Address; toA?: Address; out: boolean; at: Date; block: bigint };

const P = { paper: "#f5f0e6", ink: "#24201b", muted: "#756c61", good: "#1f9d6b", line: "#b9ae9f", pill: "rgba(36,32,27,0.07)" };
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });
const READY_MS = 1370; // feed lands (120 ms delay + 1250 ms); pulls start after this
const FEED_MS = 1250;

/** Friendly short receipt number: "A1B2C3…9F0E". */
export const paymentId = (h: string) => `${h.slice(2, 8)}…${h.slice(-4)}`.toUpperCase();

const clamp = (v: number, lo: number, hi: number) => {
  "worklet";
  return Math.min(hi, Math.max(lo, v));
};

/** "GMT+5:30". Hermes has no `timeZoneName: "shortOffset"`, so built by hand. */
function gmt(d: Date) {
  const off = -d.getTimezoneOffset();
  if (!off) return "GMT";
  const a = Math.abs(off);
  return `GMT${off > 0 ? "+" : "-"}${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, "0")}` : ""}`;
}

const Label = ({ children }: { children: ReactNode }) => (
  <Text style={{ fontFamily: MONO, fontSize: 11, fontWeight: "700", letterSpacing: 2, color: P.muted }}>{children}</Text>
);
const Dash = () => (
  <Svg width="100%" height={2} style={{ opacity: 0.8 }}><Path d="M0 1 H2000" stroke={P.line} strokeWidth={2} strokeDasharray="6 4" /></Svg>
);

/** Bars from the receipt number: same receipt, same barcode (same algorithm as web). Decoration only. */
function Barcode({ hash }: { hash: string }) {
  let x = 0;
  const bars = [...hash.slice(2)].map((ch, i) => {
    const c = parseInt(ch, 16);
    const w = 1 + ((c + i * 7) % 3);
    const bar = { x, w };
    x += w + 1 + ((c * 3 + i) % 2);
    return bar;
  });
  return (
    <View style={{ width: "100%" }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height={48} viewBox={`0 0 ${x} 10`} preserveAspectRatio="none">
        {bars.map((b, i) => <Rect key={i} x={b.x} width={b.w} height={10} fill={P.ink} />)}
      </Svg>
    </View>
  );
}

/** Metal printer slot with the dark mouth the paper comes out of. */
function Slot() {
  const light = useColorScheme() === "light";
  const metal = light ? ["#f2f2f4", "#b9bbc1", "#9a9ca3", "#d6d7db"] : ["#8d9097", "#4b4d53", "#36383d", "#64676e"];
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ zIndex: 2, height: 30, borderRadius: 15, backgroundColor: metal[2], boxShadow: "0 8px 18px -6px rgba(0,0,0,0.55)" }}>
      <Svg width="100%" height={30} style={{ position: "absolute" }}>
        <Defs>
          <LinearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
            {metal.map((c, i) => <Stop key={i} offset={[0, 0.45, 0.55, 1][i]} stopColor={c} />)}
          </LinearGradient>
        </Defs>
        <Rect width="100%" height={30} rx={15} fill="url(#metal)" />
      </Svg>
      <View style={{ position: "absolute", top: 11, left: 14, right: 14, bottom: 9, borderRadius: 5, overflow: "hidden", boxShadow: "0 1px 0 rgba(255,255,255,0.25)" }}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="mouth" x1="0" y1="0" x2="0" y2="1">
              <Stop offset={0} stopColor="#000" /><Stop offset={0.7} stopColor="#1a1917" /><Stop offset={1} stopColor="#2b2925" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#mouth)" />
        </Svg>
      </View>
    </View>
  );
}

/** Scalloped tear at the bottom: 7 px bites every 18 px (web: mask on .kt-sheet). */
function Scallops({ w }: { w: number }) {
  const n = Math.ceil(w / 18);
  let d = `M0 0 H${w} V14`;
  for (let k = n - 1; k >= 0; k--) d += ` L${9 + 18 * k + 7} 14 A7 7 0 0 0 ${9 + 18 * k - 7} 14`;
  return <Svg width={w} height={14} style={{ marginTop: -1 }}><Path d={`${d} L0 14 Z`} fill="#ece5d8" /></Svg>;
}

/** Who this is: @name, or the short account for someone not on Kin. Tap to copy (@name / full account). */
function Who({ label, who, a, first }: { label: string; who: string; a?: Address; first?: boolean }) {
  const [done, setDone] = useState(false);
  const acct = who.startsWith("0x");
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: "center", gap: 4, paddingHorizontal: 8 }}>
      <Label>{label}</Label>
      <Pressable accessibilityRole="button" accessibilityLabel={acct ? "Copy account for someone not on Kin" : `Copy name ${who}`}
        onPress={() => void Clipboard.setStringAsync(acct ? (a ?? who) : who).then(() => (setDone(true), setTimeout(() => setDone(false), 1500)))}
        style={({ pressed }) => ({ minHeight: 44, maxWidth: "100%", alignItems: "center", justifyContent: "center", paddingHorizontal: 8, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
        <Text numberOfLines={1} style={{ color: P.ink, fontSize: 18, fontWeight: "700" }}>{who}</Text>
        <Text style={{ color: P.muted, fontFamily: MONO, fontSize: 11 }}>{done ? "Copied ✓" : acct ? "Not on Kin · tap to copy" : "Tap to copy"}</Text>
      </Pressable>
      {first && <Svg width={2} height="100%" style={{ position: "absolute", right: -1, top: 0, bottom: 0 }}><Path d="M1 0 V400" stroke={P.line} strokeWidth={2} strokeDasharray="6 4" /></Svg>}
    </View>
  );
}

function Pill({ label, a11y = label, icon, onPress, busy }: { label: string; a11y?: string; icon: ReactNode; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ busy }} onPress={onPress} disabled={busy}
      style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: P.pill, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      {busy ? <ActivityIndicator size="small" color={P.ink} /> : <Text style={{ color: P.ink, fontFamily: MONO, fontSize: 12 }}>{label}</Text>}
      {!busy && icon}
    </Pressable>
  );
}

/** 0 → 1 over `ms` after `delay`, ease-out cubic (web CountUp). */
function useProgress(on: boolean, delay: number, ms: number) {
  const [p, setP] = useState(on ? 0 : 1);
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const t0 = Date.now() + delay;
    const tick = () => {
      const x = Math.min(1, Math.max(0, (Date.now() - t0) / ms));
      setP(1 - (1 - x) ** 3);
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, delay, ms]);
  return p;
}

export type TicketProps = {
  hash: string;
  r: Paid;
  explorer: string;
  look: Look;
  ms?: number;
  note?: string;
  /** Called with the note when the screen is left (back, tear, app sent to background). */
  onNote: (note: string) => void;
  cat?: Category | null;
  onCategory?: (c: Category) => void;
  onTear: () => void;
};

export function ReceiptTicket({ hash, r, explorer, look, ms = 0, note = "", onNote, cat, onCategory, onTear }: TicketProps) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const { height: vh } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note);
  const [focus, setFocus] = useState(false);
  const [ready, setReady] = useState(reduced);
  const [pulled, setPulled] = useState(false); // hides the hint
  const [gone, setGone] = useState(false); // torn off: no more pulls
  const [atTop, setAtTop] = useState(true);
  const [w, setW] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [idCopied, setIdCopied] = useState(false);

  // Save on the way out: unmount covers back + tear, background covers leaving the app.
  const latest = useRef({ text, onNote });
  useEffect(() => {
    latest.current = { text, onNote };
  });
  useEffect(() => {
    const save = () => latest.current.onNote(latest.current.text.trim());
    const sub = AppState.addEventListener("change", (s) => s !== "active" && save());
    return () => (sub.remove(), save());
  }, []);

  // Print: stepped feed (push, hitch, push), small overshoot, then one sway. Same keyframes as web kt-feed / kt-sway.
  const h = useSharedValue(0);
  const f = useSharedValue(reduced ? 0 : -1); // feed position, in paper heights
  const tx = useSharedValue(0), ty = useSharedValue(0), rot = useSharedValue(0), sway = useSharedValue(0);
  const pivot = useSharedValue(1); // 1 = rotate about the slot mouth (top held), 0 = about the paper's middle (falling)
  const perf = useSharedValue(0), rest = useSharedValue(1), limit = useSharedValue(1), armed = useSharedValue(false);
  const started = useRef(false);

  const swayAgain = (delay: number) => {
    "worklet";
    const ease = Easing.bezier(0.42, 0, 0.58, 1);
    const steps: [number, number][] = [[0.9, 240], [-0.5, 240], [0.2, 176], [0, 144]];
    sway.set(withDelay(delay, withSequence(...steps.map(([v, d]) => withTiming(v, { duration: d, easing: ease })))));
  };

  function onPaper(height: number) {
    h.set(height);
    if (started.current || reduced) return;
    started.current = true;
    const ease = Easing.bezier(0.42, 0, 0.58, 1);
    const keys: [number, number][] = [[16, -0.8], [21, -0.79], [37, -0.57], [42, -0.56], [58, -0.33], [63, -0.32], [82, -0.04], [90, 0.015], [100, 0]];
    let at = 0;
    f.set(withDelay(120, withSequence(...keys.map(([pc, v]) => {
      const d = ((pc - at) / 100) * FEED_MS;
      at = pc;
      return withTiming(v, { duration: d, easing: ease });
    }))));
    swayAgain(READY_MS);
  }
  useEffect(() => {
    if (reduced) return;
    const id = setTimeout(() => setReady(true), READY_MS);
    return () => clearTimeout(id);
  }, [reduced]);

  const paperStyle = useAnimatedStyle(() => {
    const H = h.get();
    const p = pivot.get() * (-H / 2 - ty.get()); // pivot relative to the paper's middle
    return {
      opacity: H > 0 || reduced ? 1 : 0,
      transform: [{ translateX: tx.get() }, { translateY: f.get() * H + ty.get() + p }, { rotate: `${rot.get() + sway.get()}deg` }, { translateY: -p }],
    };
  });
  const perfStyle = useAnimatedStyle(() => ({ opacity: perf.get() }));
  const restStyle = useAnimatedStyle(() => ({ opacity: rest.get() }));
  const leadStyle = useAnimatedStyle(() => ({ opacity: pivot.get() })); // torn: the piece left in the printer stays there

  const back = () => {
    "worklet";
    perf.set(0);
    const y = ty.get(), r0 = rot.get();
    if (reduced) return void (tx.set(0), ty.set(0), rot.set(0));
    const o = Math.min(8, Math.round(y * 0.04)); // overshoot once, into the slot
    const d = 280 + Math.min(220, y * 0.5);
    const out = Easing.bezier(0.3, 0.8, 0.4, 1), io = Easing.bezier(0.42, 0, 0.58, 1);
    tx.set(withTiming(0, { duration: d * 0.6, easing: out }));
    ty.set(withSequence(withTiming(-o, { duration: d * 0.6, easing: out }), withTiming(0, { duration: d * 0.4, easing: io })));
    rot.set(withSequence(withTiming(-r0 * 0.3, { duration: d * 0.6, easing: out }), withTiming(0, { duration: d * 0.4, easing: io })));
    swayAgain(d); // the landing sway, once more
  };

  const tear = (vx: number, vy: number) => {
    "worklet";
    perf.set(0);
    scheduleOnRN(setGone, true);
    const done = () => {
      "worklet";
      scheduleOnRN(onTear);
    };
    if (reduced) return void rest.set(withTiming(0, { duration: 150 }, (ok) => ok && done()));
    // Pivot moves to the middle; translate absorbs the jump (web useTearOff).
    const x = tx.get(), y = ty.get(), r0 = rot.get(), rad = (r0 * Math.PI) / 180, d = -(y + h.get() / 2);
    pivot.set(0);
    tx.set(x + d * Math.sin(rad));
    ty.set(y + d * (1 - Math.cos(rad)));
    const T = clamp(600 - vy * 120, 380, 600);
    const s = clamp(clamp(vx, -1, 1) * 50 - r0 * 4, -40, 40);
    const spin = Math.sign(s || 1) * Math.max(10, Math.abs(s));
    tx.set(withTiming(tx.get() + clamp(vx, -1, 1) * 0.5 * T, { duration: T }));
    // Leave once the paper is gone (gravity: ease-in).
    ty.set(withTiming(ty.get() + vh + 80, { duration: T, easing: Easing.in(Easing.quad) }, (fin) => fin && done()));
    rot.set(withTiming(r0 + spin, { duration: T }));
    rest.set(withTiming(0, { duration: T * 0.9 }));
  };

  const native = Gesture.Native();
  const pan = Gesture.Pan()
    .enabled(ready && atTop && !gone)
    .activeOffsetY(6) // down first: up = scroll, sideways = nothing
    .failOffsetY(-6)
    .failOffsetX([-10, 10])
    .simultaneousWithExternalGesture(native)
    .onBegin((e) => {
      // Tear line: near the bottom of the screen (88%) or 45% of it pulled, whichever comes first; at least 12%.
      limit.set(clamp(0.88 * vh - e.absoluteY, 0.12 * vh, 0.45 * vh));
      armed.set(false);
    })
    .onStart(() => {
      cancelAnimation(tx); cancelAnimation(ty); cancelAnimation(rot); cancelAnimation(sway);
      sway.set(0);
      scheduleOnRN(setPulled, true);
    })
    .onUpdate((e) => {
      const dx = e.translationX, dy = e.translationY, p = Math.max(0, dy / limit.get());
      // Down: light give that grows toward the line. Up past rest: strong rubber band, 24 px at most.
      const y = dy >= 0 ? dy * (1 - 0.12 * Math.min(p, 1.5)) : -24 * (1 - 1 / (1 - dy / 60));
      const shake = p > 0.85 ? Math.round(Math.sin(dy * 1.7) * Math.min(1.5, (p - 0.85) * 10)) : 0; // jitter from the pull itself (render-pure)
      tx.set(shake);
      ty.set(Math.round(y));
      rot.set(clamp(-dx * 0.035, -4, 4) * clamp(y / 40, 0, 1));
      perf.set(clamp((p - 0.1) / 0.9, 0, 1));
      armed.set(p >= 1);
    })
    .onEnd((e, ok) => {
      const vy = e.velocityY / 1000; // px/ms, like web
      if (ok && (armed.get() || (vy > 1.1 && e.translationY > 60))) tear(e.velocityX / 1000, vy);
      else back();
    });

  const day = r.at.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const time = `${r.at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} (${gmt(r.at)})`;
  const money = formatMoney(r.amount);
  const other = r.out ? r.to : r.from;
  const secs = ms > 0 ? (ms / 1000).toFixed(1) : null;
  const count = useProgress(!reduced, 780, 420); // counts up as the amount comes out of the slot
  const shown = count >= 1 ? money : formatMoney(BigInt(Math.trunc(Number(r.amount) * count)));

  function shareParts() {
    // Invite = plain link carrying my @name as ref (web lib/kinko stores ?ref= on "/").
    const me = r.out ? r.from : r.to;
    const join = me.startsWith("@") ? `${API_BASE}/?ref=${encodeURIComponent(me.slice(1))}` : API_BASE;
    const msg = `${r.out ? `Paid ${money} to ${other}` : `Got ${money} from ${other}`} with Kin. Delivered ✓\nCheck it: ${explorer}/tx/${hash}\n${join}`;
    const name = (s: string) => (s.startsWith("@") ? s.slice(1) : s.toLowerCase());
    const card: CardParams = {
      kind: "receipt", dir: r.out ? "out" : "in", amount: r.amount, to: name(r.to), from: name(r.from), look,
      secs: ms > 0 && ms < 60_000 ? (ms / 1000).toFixed(1) : undefined, note: text.trim() || undefined,
      cat: r.out ? cat?.id : undefined, when: `${day} · ${time}`, id: hash,
    };
    return { msg, card };
  }
  async function shareAs(image: boolean) {
    const { msg, card } = shareParts();
    setSheet(false);
    if (!image) return void share(msg);
    setSharing(true); // the picture downloads first (can take a few seconds)
    await shareCard(card, msg);
    setSharing(false);
  }

  return (
    <Screen title="Receipt" back>
      <GestureHandlerRootView style={{ flex: 1, marginHorizontal: -20, marginBottom: -20 }}>
        <GestureDetector gesture={native}>
          <ScrollView bounces={false} overScrollMode="never" keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
            scrollEventThrottle={32} onScroll={(e) => setAtTop(e.nativeEvent.contentOffset.y <= 0)}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 + insets.bottom }}>
            {/* Above the mouth: page colour hides the paper still inside the printer (the scroll edge clips the rest). */}
            <Animated.View style={[{ zIndex: 2 }, restStyle]}>
              <View pointerEvents="none" style={{ position: "absolute", left: -20, right: -20, bottom: 15, height: 1500, backgroundColor: t.bg }} />
              <Slot />
            </Animated.View>
            <View pointerEvents="box-none" style={{ zIndex: 1, marginTop: -10, paddingHorizontal: 14 }}>
              <GestureDetector gesture={pan}>
                <Animated.View style={paperStyle} onLayout={(e) => onPaper(e.nativeEvent.layout.height)}
                  accessible={false} accessibilityHint="Pull the receipt down to tear it off and close it">
                  {/* Paper still inside the printer: comes out of the slot when pulled, so the top stays held. */}
                  <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, right: 0, bottom: "100%", marginBottom: -2, height: 1200, backgroundColor: P.paper }, leadStyle]} />
                  <View onLayout={(e) => setW(e.nativeEvent.layout.width)}
                    style={{ alignItems: "center", gap: 16, paddingHorizontal: 20, paddingTop: 36, paddingBottom: 26, backgroundColor: P.paper, boxShadow: "0 10px 14px rgba(0,0,0,0.35), 0 2px 2px rgba(0,0,0,0.2)" }}>
                    <Svg pointerEvents="none" width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
                      <Defs>
                        <LinearGradient id="down" x1="0" y1="0" x2="0" y2="1"><Stop offset={0.85} stopColor={P.paper} /><Stop offset={1} stopColor="#ece5d8" /></LinearGradient>
                        <LinearGradient id="edges" x1="0" y1="0" x2="1" y2="0">
                          <Stop offset={0} stopColor="#000" stopOpacity={0.06} /><Stop offset={0.07} stopColor="#000" stopOpacity={0} />
                          <Stop offset={0.93} stopColor="#000" stopOpacity={0} /><Stop offset={1} stopColor="#000" stopOpacity={0.06} />
                        </LinearGradient>
                      </Defs>
                      <Rect width="100%" height="100%" fill="url(#down)" />
                      <Rect width="100%" height="100%" fill="url(#edges)" />
                    </Svg>

                    <View>
                      <Kinko look={look} mood="celebrate" size={56} />
                      <View style={{ position: "absolute", bottom: -4, right: -12, width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: P.paper, alignItems: "center", justifyContent: "center", backgroundColor: P.good }}>
                        <Check color="#fff" size={16} strokeWidth={3} />
                      </View>
                    </View>
                    <Text accessibilityRole="header" style={{ color: P.ink, fontFamily: MONO, fontSize: 16, fontWeight: "700", letterSpacing: 4 }}>{r.out ? "PAYMENT RECEIPT" : "MONEY RECEIVED"}</Text>

                    <Dash />
                    <View style={{ alignItems: "center", gap: 8 }}>
                      <Label>{r.out ? "AMOUNT PAID" : "AMOUNT RECEIVED"}</Label>
                      <View accessible accessibilityLabel={`${money} ${getCurrency()}`} style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                        <View>
                          <Text style={{ opacity: 0, fontSize: 48, fontWeight: "700", letterSpacing: -1, fontVariant: ["tabular-nums"] }}>{money}</Text>
                          <Text style={{ position: "absolute", right: 0, color: P.ink, fontSize: 48, fontWeight: "700", letterSpacing: -1, fontVariant: ["tabular-nums"] }}>{shown}</Text>
                        </View>
                        <Text style={{ color: P.muted, fontFamily: MONO, fontSize: 14, fontWeight: "700" }}>{getCurrency()}</Text>
                      </View>
                      <View style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "rgba(31,157,107,0.14)" }}>
                        <Text style={{ color: P.good, fontSize: 14, fontWeight: "600" }}>{secs ? `Delivered in ${secs}s ✓` : "Delivered ✓"}</Text>
                      </View>
                    </View>

                    {/* What it was for: category (sent only, tap to change) + a note. Both live on this phone only. */}
                    <Dash />
                    <View style={{ width: "100%", alignItems: "center", gap: 8 }}>
                      <Label>FOR</Label>
                      {r.out && cat && (
                        <Pressable accessibilityRole="button" accessibilityState={{ expanded: editing }} accessibilityLabel={`Category ${cat.label}, change`}
                          onPress={() => setEditing((e) => !e)}
                          style={({ pressed }) => ({ height: 44, borderRadius: 22, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: P.pill, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                          <Animated.View key={cat.id} entering={reduced ? undefined : FadeInDown.duration(220)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <cat.icon color={P.ink} size={16} />
                            <Text style={{ color: P.ink, fontSize: 14, fontWeight: "600" }}>{cat.label}</Text>
                          </Animated.View>
                          <Text style={{ color: P.muted, fontSize: 12 }}>{editing ? "Done" : "Change"}</Text>
                        </Pressable>
                      )}
                      {r.out && cat && editing && (
                        <View accessibilityRole="radiogroup" accessibilityLabel="Category" style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 }}>
                          {CATEGORIES.map((c, i) => {
                            const on = cat.id === c.id;
                            return (
                              <Animated.View key={c.id} entering={reduced ? undefined : ZoomIn.delay(60 + i * 22).duration(200)} exiting={reduced ? undefined : ZoomOut.delay((9 - i) * 12).duration(160)}>
                                <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }}
                                  onPress={() => (onCategory?.(c), setTimeout(() => setEditing(false), 220))}
                                  style={({ pressed }) => ({ height: 44, borderRadius: 22, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: on ? P.ink : P.pill, transform: [{ scale: pressed ? 0.92 : on ? 1.06 : 1 }] })}>
                                  <c.icon color={on ? P.paper : P.ink} size={14} />
                                  <Text style={{ color: on ? P.paper : P.ink, fontSize: 12, fontWeight: "600" }}>{c.label}</Text>
                                </Pressable>
                              </Animated.View>
                            );
                          })}
                        </View>
                      )}
                      {/* Wraps and grows with the text. Return = done, no new lines. */}
                      <View style={{ width: "100%", maxWidth: 288 }}>
                        <TextInput value={text} onChangeText={(v) => setText(v.replace(/\n/g, " "))} maxLength={200} multiline submitBehavior="blurAndSubmit" returnKeyType="done"
                          accessibilityLabel="Note" placeholder="Add a note" placeholderTextColor={P.muted} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
                          style={{ minHeight: 44, paddingHorizontal: 8, paddingVertical: 10, textAlign: "center", fontFamily: MONO, fontSize: 14, color: P.ink }} />
                        <Svg width="100%" height={2}><Path d="M0 1 H600" stroke={focus ? P.ink : P.line} strokeWidth={1.5} strokeDasharray={focus ? undefined : "4 3"} /></Svg>
                      </View>
                      {text.length > 160 && <Text accessibilityLiveRegion="polite" style={{ color: P.muted, fontFamily: MONO, fontSize: 11 }}>{200 - text.length} left</Text>}
                    </View>

                    <Dash />
                    <View style={{ width: "100%", flexDirection: "row" }}>
                      <Who label="TO" who={r.to} a={r.toA} first />
                      <Who label="FROM" who={r.from} a={r.fromA} />
                    </View>

                    {/* Top row: speed + fee (fee alone when opened later). Bottom row: date & time, full width. */}
                    <Dash />
                    <View style={{ width: "100%", gap: 16 }}>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {secs && <Fact label="SPEED" value={`${secs}s`} />}
                        <Fact label="FEE" value={formatMoney(0n)} />
                      </View>
                      <Fact label="DATE & TIME" value={`${day} · ${time}`} />
                    </View>

                    <Dash />
                    <View style={{ width: "100%", alignItems: "center", gap: 4 }}>
                      <Label>PAYMENT ID</Label>
                      <Text style={{ color: P.ink, fontFamily: MONO, fontSize: 14, fontWeight: "700", letterSpacing: 1.5 }}>{paymentId(hash)}</Text>
                      <Barcode hash={hash} />
                      <View style={{ marginTop: 8, width: "100%", flexDirection: "row", gap: 6 }}>
                        <Pill label={idCopied ? "Copied" : "Copy ID"} a11y={idCopied ? "Copied" : "Copy full payment ID"} icon={idCopied ? <Check color={P.ink} size={14} /> : <Copy color={P.ink} size={14} />}
                          onPress={() => void Clipboard.setStringAsync(hash).then(() => (setIdCopied(true), setTimeout(() => setIdCopied(false), 1500)))} />
                        <Pill label="Verify" a11y="Verify this payment on the public explorer" icon={<ArrowUpRight color={P.ink} size={14} />} onPress={() => void WebBrowser.openBrowserAsync(`${explorer}/tx/${hash}`)} />
                        <Pill label="Share" a11y="Share receipt" busy={sharing} icon={<Share2 color={P.ink} size={14} />} onPress={() => setSheet(true)} />
                      </View>
                    </View>
                  </View>
                  {w > 0 && <Scallops w={w} />}
                </Animated.View>
              </GestureDetector>
              {/* Tension: perforation at the mouth darkens as you pull. Curl: the paper's top bends into the slot, in shade. */}
              <Animated.View pointerEvents="none" style={[{ position: "absolute", zIndex: 2, left: 18, right: 18, top: 12, height: 0, borderTopWidth: 2, borderStyle: "dotted", borderColor: P.ink }, perfStyle]} />
              <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 14, right: 14, top: 0, height: 34 }, restStyle]}>
                <Svg width="100%" height={34}>
                  <Defs>
                    <LinearGradient id="curl" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset={0} stopColor="#000" stopOpacity={0.42} /><Stop offset={0.4} stopColor="#000" stopOpacity={0.12} /><Stop offset={1} stopColor="#000" stopOpacity={0} />
                    </LinearGradient>
                  </Defs>
                  <Rect width="100%" height={34} fill="url(#curl)" />
                </Svg>
              </Animated.View>
              {ready && !pulled && (
                <Animated.View entering={reduced ? undefined : FadeIn.delay(250).duration(400)} pointerEvents="none"
                  style={{ position: "absolute", zIndex: 2, top: 13, left: 0, right: 0, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4, opacity: 0.85 }}>
                  <Text style={{ color: P.muted, fontFamily: MONO, fontSize: 10, fontWeight: "700", letterSpacing: 1.2 }}>PULL DOWN TO TEAR OFF</Text>
                  <ChevronsDown color={P.muted} size={12} strokeWidth={2.5} />
                </Animated.View>
              )}
            </View>

            {/* Proof: a quiet note, not a card. The explorer + full ID live on the ticket's Payment ID. */}
            <Animated.View style={restStyle}>
              <Animated.View entering={reduced ? undefined : FadeInDown.delay(1450).duration(360)}>
                <Text style={{ marginTop: 24, paddingHorizontal: 24, color: t.muted, fontSize: 12, lineHeight: 18 }}>
                  Every Kin payment is recorded on the Monad public blockchain, so anyone can check it happened. Settled in dollars (AUSD), no fees. Block {r.block.toString()}.
                </Text>
              </Animated.View>
            </Animated.View>
          </ScrollView>
        </GestureDetector>
      </GestureHandlerRootView>

      {/* Share: pick Image (the whole receipt as a picture, with the text) or Text (just the message + links). */}
      <Modal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)} statusBarTranslucent navigationBarTranslucent>
        <Pressable accessibilityLabel="Close" onPress={() => setSheet(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} />
        <View accessibilityViewIsModal style={{ gap: 8, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: t.surface, padding: 20, paddingBottom: Math.max(20, insets.bottom + 8) }}>
          <Text accessibilityRole="header" style={{ marginBottom: 4, textAlign: "center", color: t.ink, fontWeight: "600", fontSize: 16 }}>Share receipt</Text>
          <Option icon={<ImageIcon color={t.ink} size={22} />} title="Image" sub="A picture of the whole receipt" onPress={() => void shareAs(true)} />
          <Option icon={<MessageCircle color={t.ink} size={22} />} title="Text" sub="A short message with the links" onPress={() => void shareAs(false)} />
          <Pressable accessibilityRole="button" onPress={() => setSheet(false)}
            style={({ pressed }) => ({ marginTop: 4, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? t.surface2 : "transparent" })}>
            <Text style={{ color: t.muted, fontWeight: "600", fontSize: 16 }}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 4 }}>
      <Label>{label}</Label>
      <Text style={{ color: P.ink, fontFamily: MONO, fontSize: 14, fontWeight: "700", textAlign: "center" }}>{value}</Text>
    </View>
  );
}

function Option({ icon, title, sub, onPress }: { icon: ReactNode; title: string; sub: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}: ${sub}`} onPress={onPress}
      style={({ pressed }) => ({ height: 64, borderRadius: 16, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: t.surface2, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      {icon}
      <View>
        <Text style={{ color: t.ink, fontWeight: "600", fontSize: 16 }}>{title}</Text>
        <Text style={{ color: t.muted, fontSize: 14 }}>{sub}</Text>
      </View>
    </Pressable>
  );
}

/** The empty printer with a message under it: loading, not found, didn't go through. */
function EmptySlot({ busy, children }: { busy?: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <Screen title="Receipt" back>
      <View accessibilityState={{ busy }}>
        <Slot />
        <Animated.View entering={reduced ? undefined : FadeInDown.duration(360)} style={{ alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 40 }}>
          {children}
        </Animated.View>
      </View>
    </Screen>
  );
}

/** While the payment loads: the empty slot and "Printing receipt in a sec". */
export function TicketLoading() {
  const t = useTheme();
  return (
    <EmptySlot busy>
      <ActivityIndicator size="large" color={t.muted} />
      <Text accessibilityRole="text" accessibilityLiveRegion="polite" style={{ color: t.muted, fontFamily: MONO, fontSize: 14 }}>Printing receipt in a sec</Text>
    </EmptySlot>
  );
}

/** No payment with this ID: nothing to print. */
export function TicketMissing() {
  const t = useTheme();
  return (
    <EmptySlot>
      <Text style={{ color: t.ink, fontFamily: MONO, fontSize: 14, fontWeight: "700", letterSpacing: 3 }}>RECEIPT NOT FOUND</Text>
      <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>We couldn&apos;t find this receipt. Your money is safe.</Text>
    </EmptySlot>
  );
}

/** Didn't go through: money not moved; Try again opens Pay with the same person + amount + note. */
export function TicketFailed({ r, note = "" }: { r: Paid; note?: string }) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  useEffect(() => {
    if (!reduced) x.set(withSequence(...[-5, 5, -5, 5, 0].map((v) => withTiming(v, { duration: 60 }))));
  }, [reduced, x]);
  const shake = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const to = r.to.startsWith("@") ? r.to.slice(1) : r.toA;
  const again = () =>
    router.push({ pathname: "/send", params: { ...(to ? { to } : {}), ...(r.amount > 0n ? { amt: r.amount.toString() } : {}), ...(note ? { note } : {}) } });
  return (
    <EmptySlot>
      <Animated.View style={[{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: `${t.bad}26` }, shake]}>
        <Text style={{ color: t.bad, fontSize: 24, fontWeight: "700" }}>!</Text>
      </Animated.View>
      <Text style={{ color: t.ink, fontFamily: MONO, fontSize: 14, fontWeight: "700", letterSpacing: 3 }}>DIDN&apos;T GO THROUGH</Text>
      <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>Money not moved. Nothing left your balance.</Text>
      {r.amount > 0n && (
        <Text style={{ marginTop: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: t.surface2, color: t.ink, fontSize: 14, overflow: "hidden" }}>
          Sending <Text style={{ fontWeight: "700" }}>{formatMoney(r.amount)}</Text> to <Text style={{ fontWeight: "700" }}>{r.to}</Text>
        </Text>
      )}
      <View style={{ marginTop: 16, alignSelf: "stretch" }}>
        <Button title="Try again" onPress={again} />
      </View>
    </EmptySlot>
  );
}
