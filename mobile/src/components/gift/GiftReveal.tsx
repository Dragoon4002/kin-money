// Port of web components/gift/GiftReveal.tsx (kd-open in globals.css). Arrival of a gift that's ready: the box drops
// in → tap it → it pops (lid, flaps, confetti) and the money moves (`onOpen`: accept + open, behind the animation) →
// the folded note rises and unfolds → once it's in their balance, drag the note away in any direction to leave.
// No account: the tap only reveals; the button makes one ("Create free account to accept the gift").
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation, Easing, FadeIn, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue, type WithTimingConfig,
} from "react-native-reanimated";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { Button, ErrorText, Screen, Text } from "@/components/ui";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { play } from "@/lib/sound";
import { useTheme } from "@/theme";
import { BITS, Bow, BoxFront, boxColors, Note, Ribbon } from "./GiftNote";
import { Stamp } from "./GiftLinkSlip";

type RevealStep = "drop" | "wait" | "burst" | "unfold" | "card";
type Money = "idle" | "working" | "done" | "error";
/** ms in each step before the next; "wait" holds until the gift is tapped. */
const STEP_MS = { drop: 760, burst: 1150, unfold: 820 } as const;
const NEXT = { drop: "wait", burst: "unfold", unfold: "card" } as const;
const AWAY = 110; // px of drag that sends the note off
const B = Easing.bezier;
type Ease = NonNullable<WithTimingConfig["easing"]>;
const DROP_IN = B(0.5, 0, 0.9, 0.4), DROP_OUT = B(0.2, 0.7, 0.4, 1), EASE = B(0.25, 0.1, 0.25, 1);

type Props = {
  amount: bigint; sender: string; msg: string;
  /** Signed in: tapping the box runs onOpen. No account: tapping only reveals, the button calls onSignup. */
  signedIn: boolean;
  onOpen: (say: (text: string) => void) => Promise<void>;
  onSignup?: () => void;
  onLeave: () => void;
  /** Run onOpen now (back from sign-up). */
  resume?: boolean;
};

/** Keyframes as [value, ms, easing] steps from the current value (web @keyframes). */
const keys = (steps: [number, number, Ease][]) => withSequence(...steps.map(([v, duration, easing]) => withTiming(v, { duration, easing })));

function Bit({ b, burst, reduced }: { b: (typeof BITS)[number]; burst: number; reduced: boolean }) {
  const v = useSharedValue(0);
  useEffect(() => {
    if (!burst || reduced) return;
    v.set(0);
    v.set(withDelay(10, withTiming(1, { duration: 1100, easing: B(0.15, 0.7, 0.3, 1) })));
  }, [burst, reduced, v]);
  const style = useAnimatedStyle(() => {
    const p = v.get(), out = Math.min(1, p / 0.7), fall = Math.max(0, (p - 0.7) / 0.3);
    return {
      opacity: p === 0 || p === 1 ? 0 : p < 0.08 ? p / 0.08 : p <= 0.65 ? 1 : 1 - (p - 0.65) / 0.35,
      transform: [{ translateX: b.dx * out }, { translateY: b.dy * out + 70 * fall }, { rotate: `${b.r * out + 200 * fall}deg` }, { scale: 0.3 + 0.7 * out }],
    };
  });
  return <Animated.View style={[{ position: "absolute", left: -3, top: 0, width: b.w, height: b.h, borderRadius: b.radius, backgroundColor: b.color }, style]} />;
}

export function GiftReveal({ amount, sender, msg, signedIn, onOpen, onSignup, onLeave, resume }: Props) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const [step, setStep] = useState<RevealStep>(resume ? "card" : "drop");
  const [money, setMoney] = useState<Money>("idle");
  const [say, setSay] = useState("");
  const [err, setErr] = useState("");
  const [burst, setBurst] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (!(step in STEP_MS)) return;
    const id = setTimeout(() => setStep(NEXT[step as keyof typeof NEXT]), STEP_MS[step as keyof typeof STEP_MS]);
    return () => clearTimeout(id);
  }, [step]);

  async function run() {
    setErr("");
    setMoney("working");
    try {
      await onOpen(setSay);
      setMoney("done");
    } catch (e) {
      setErr(humanError(e));
      setMoney("error");
    }
  }
  useEffect(() => {
    if (resume && !started.current) {
      started.current = true;
      void Promise.resolve().then(run);
    }
  });

  function tap() {
    if (step !== "wait") return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    play("gift");
    setStep(reduced ? "card" : "burst");
    setBurst((n) => n + 1);
    if (signedIn) void run();
  }

  // Box motion: one transform (drop, idle wiggle, pop all move .kd-open-drop), plus floor, lid, flaps, card.
  const ty = useSharedValue(0), rot = useSharedValue(0), sx = useSharedValue(1), sy = useSharedValue(1);
  const floor = useSharedValue(1), floorO = useSharedValue(1), lid = useSharedValue(0), flap = useSharedValue(0), card = useSharedValue(resume ? 1 : 0);
  useEffect(() => {
    const all: SharedValue<number>[] = [ty, rot, sx, sy, floor, floorO];
    all.forEach(cancelAnimation);
    const open = step !== "drop" && step !== "wait";
    if (reduced) {
      [ty, rot].forEach((v) => v.set(0));
      [sx, sy, floor, floorO].forEach((v) => v.set(1));
      lid.set(+open);
      flap.set(+open);
      card.set(+open);
      return;
    }
    if (step === "drop") {
      // kd-ob-drop 720 ms: fall, squash, bounce, settle (0 / 55 / 71 / 85 / 93 / 100 %).
      ty.set(-600); rot.set(-14);
      ty.set(keys([[0, 396, DROP_IN], [-36, 115, DROP_OUT], [0, 101, DROP_IN], [-6, 58, Easing.out(Easing.ease)], [0, 50, EASE]]));
      rot.set(keys([[2, 396, DROP_IN], [-1.5, 115, DROP_OUT], [0, 101, DROP_IN]]));
      sx.set(keys([[1.07, 396, DROP_IN], [0.98, 115, DROP_OUT], [1.03, 101, DROP_IN], [1, 108, EASE]]));
      sy.set(keys([[0.9, 396, DROP_IN], [1.03, 115, DROP_OUT], [0.96, 101, DROP_IN], [1, 108, EASE]]));
      floor.set(0.25); floorO.set(0);
      floor.set(keys([[1.06, 396, Easing.linear], [0.85, 115, Easing.linear], [1, 101, Easing.linear]]));
      floorO.set(withTiming(1, { duration: 396, easing: Easing.linear }));
    } else if (step === "wait") {
      // kd-ob-idle 1.8 s, 200 ms in, forever: still for 55 %, then a little shake.
      const io = Easing.inOut(Easing.ease);
      rot.set(withDelay(200, withRepeat(keys([[0, 990, io], [-4, 162, io], [4, 162, io], [-2, 162, io], [0, 324, io]]), -1)));
      const s = withDelay(200, withRepeat(keys([[1, 1152, io], [1.03, 162, io], [1, 486, io]]), -1));
      sx.set(s);
      sy.set(withDelay(200, withRepeat(keys([[1, 1152, io], [1.03, 162, io], [1, 486, io]]), -1)));
    } else if (step === "burst") {
      // kd-ob-pop 320 ms; lid flies off, flaps open, the note rises out.
      rot.set(withTiming(0, { duration: 120 }));
      const o = Easing.out(Easing.ease);
      sx.set(keys([[1.12, 112, o], [0.97, 112, o], [1, 96, o]]));
      sy.set(keys([[0.88, 112, o], [1.04, 112, o], [1, 96, o]]));
      lid.set(withTiming(1, { duration: 620, easing: B(0.2, 0.7, 0.4, 1) }));
      flap.set(withDelay(30, withTiming(1, { duration: 420, easing: B(0.3, 1.5, 0.5, 1) })));
      card.set(withDelay(180, withTiming(1, { duration: 620, easing: B(0.2, 0.9, 0.3, 1.15) })));
    } else {
      [lid, flap, card].forEach((v) => v.set(1));
    }
  }, [step, reduced, ty, rot, sx, sy, floor, floorO, lid, flap, card]);

  const dropStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.get() }, { rotate: `${rot.get()}deg` }, { scaleX: sx.get() }, { scaleY: sy.get() }] }));
  const floorStyle = useAnimatedStyle(() => ({ opacity: floorO.get(), transform: [{ scale: floor.get() }] }));
  // Lid: on → (45 %) up and right → gone (kd-ob-lid).
  const lidStyle = useAnimatedStyle(() => {
    const p = lid.get(), a = Math.min(1, p / 0.45), b = Math.max(0, (p - 0.45) / 0.55);
    return { opacity: p < 0.45 ? 1 : 1 - b, transform: [{ translateX: 34 * a + 36 * b }, { translateY: -150 * a - 60 * b }, { rotate: `${18 * a + 10 * b}deg` }] };
  });
  const flapL = useAnimatedStyle(() => ({ transform: [{ rotate: `${-118 * flap.get()}deg` }] }));
  const flapR = useAnimatedStyle(() => ({ transform: [{ rotate: `${118 * flap.get()}deg` }] }));
  // kd-ob-rise: from translateY(200) scale(.5), fully visible by 25 %.
  const cardStyle = useAnimatedStyle(() => {
    const p = card.get();
    return { opacity: Math.min(1, p / 0.25), transform: [{ translateY: 200 * (1 - p) }, { scale: 0.5 + 0.5 * p }] };
  });

  // Drag the note away once the money is in (Pan, any direction).
  const done = money === "done";
  const dx = useSharedValue(0), dy = useSharedValue(0);
  const settle = { duration: 280, easing: B(0.3, 0.7, 0.3, 1) };
  const pan = Gesture.Pan()
    .enabled(done)
    .onUpdate((e) => {
      dx.set(e.translationX);
      dy.set(e.translationY);
    })
    .onEnd((e) => {
      if (Math.hypot(e.translationX, e.translationY) < AWAY) {
        dx.set(withTiming(0, settle));
        dy.set(withTiming(0, settle));
        return;
      }
      if (reduced) return void scheduleOnRN(onLeave);
      dx.set(withTiming(e.translationX * 6, settle));
      dy.set(withTiming(e.translationY * 6, settle, (fin) => void (fin && scheduleOnRN(onLeave))));
    });
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dx.get() }, { translateY: dy.get() }, { rotate: `${dx.get() / 25}deg` }] }));

  const c = boxColors(t.brand);
  const unfolded = step === "unfold" || step === "card";
  const abs = { position: "absolute" } as const;
  return (
    <Screen title="Kin">
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Pressable onPress={tap} disabled={step !== "wait"} accessibilityRole={step === "wait" ? "button" : undefined} accessibilityLabel={step === "wait" ? "Open the gift" : undefined}
            style={{ width: 300, height: 430 }}>
            <Animated.View style={[{ ...abs, top: 0, left: 0, right: 0, bottom: 0, transformOrigin: "50% 100%" }, dropStyle]}>
              <View style={{ ...abs, zIndex: 1, top: 278, left: 45, width: 210, height: 30, borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: c.inside }} />
              <Animated.View style={[{ ...abs, zIndex: 1, top: 292, left: 45, width: 100, height: 16, borderRadius: 3, backgroundColor: c.flap, transformOrigin: "0% 50%" }, flapL]} />
              <Animated.View style={[{ ...abs, zIndex: 1, top: 292, left: 155, width: 100, height: 16, borderRadius: 3, backgroundColor: c.flap, transformOrigin: "100% 50%" }, flapR]} />
              <Animated.View style={[{ ...abs, zIndex: 2, left: 10, width: 280, bottom: 140, transformOrigin: "50% 100%" }, cardStyle]}>
                <GestureDetector gesture={pan}>
                  <Animated.View style={dragStyle} accessibilityHint={done ? "Drag the note away to leave" : undefined}>
                    {/* Same note as the send, folded until "unfold". */}
                    <Note d={{ mode: "name", to: "", amount: "", msg, from: sender }} units={amount} folded={!unfolded}
                      label={`A gift from ${sender ? `@${sender}` : "someone"}: ${formatMoney(amount)}.${msg ? ` ${msg}` : ""}`} />
                    {done && <View pointerEvents="none" style={{ ...abs, left: 0, right: 0, top: 236, alignItems: "center" }}><Stamp tone="good" delay={0}>IN YOUR BALANCE</Stamp></View>}
                  </Animated.View>
                </GestureDetector>
              </Animated.View>
              <View style={{ ...abs, zIndex: 3, top: 300, left: 45, width: 210, height: 130 }}><BoxFront brand={c.front} /></View>
              <Animated.View style={[{ ...abs, zIndex: 5, top: 286, left: 34, width: 232, height: 44, borderRadius: 8, backgroundColor: c.lid, boxShadow: "0 3px 0 rgba(0,0,0,0.12)" }, lidStyle]}>
                <View style={{ ...abs, top: 0, bottom: 0, left: 0, right: 0, borderRadius: 8, overflow: "hidden" }}><Ribbon /></View>
                <View style={{ ...abs, left: 74, bottom: 36 }}><Bow /></View>
              </Animated.View>
              <View pointerEvents="none" style={{ ...abs, zIndex: 4, left: 150, top: 300 }}>
                {BITS.map((b, i) => <Bit key={i} b={b} burst={burst} reduced={reduced} />)}
              </View>
            </Animated.View>
            <Animated.View pointerEvents="none" style={[{ ...abs, bottom: -8, left: 35, width: 230, height: 16 }, floorStyle]}>
              <Svg width={230} height={16}>
                <Defs>
                  <RadialGradient id="floor" cx="50%" cy="50%" rx="50%" ry="50%">
                    <Stop offset={0} stopColor="#000" stopOpacity={0.22} /><Stop offset={1} stopColor="#000" stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Ellipse cx={115} cy={8} rx={115} ry={8} fill="url(#floor)" />
              </Svg>
            </Animated.View>
          </Pressable>
        </View>
        <View style={{ minHeight: 88, justifyContent: "flex-end", gap: 12, paddingTop: 8 }}>
          {step === "wait" ? (
            <Animated.View entering={FadeIn.duration(400)}><Text style={{ textAlign: "center", color: t.muted, fontWeight: "600", fontSize: 16 }}>Tap the gift to open it</Text></Animated.View>
          ) : step !== "card" ? null : (
            <Animated.View entering={FadeInDown.duration(320).withInitialValues({ transform: [{ translateY: 6 }] })} style={{ gap: 12 }}>
              {money === "working" && <Text accessibilityLiveRegion="polite" style={{ textAlign: "center", color: t.muted, fontSize: 14 }}>{say || "Opening your gift…"}</Text>}
              {money === "error" && (
                <>
                  <ErrorText>{err}</ErrorText>
                  <Button title="Try again" onPress={run} />
                </>
              )}
              {done ? (
                <>
                  <Text accessibilityLiveRegion="polite" style={{ textAlign: "center", color: t.muted, fontSize: 16 }}>It&apos;s in your balance. Swipe the note away when you&apos;re done.</Text>
                  <Button title="See my balance" onPress={onLeave} />
                </>
              ) : !signedIn ? (
                <>
                  <Button title="Create free account to accept the gift" onPress={onSignup} />
                  <Text style={{ textAlign: "center", color: t.muted, fontSize: 12 }}>Takes 20 seconds. Just your name and an Identity check.</Text>
                </>
              ) : null}
            </Animated.View>
          )}
        </View>
      </GestureHandlerRootView>
    </Screen>
  );
}
