import { useEffect } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";

// Confetti for big wins (web kinko/Celebrate): a one-shot burst from the middle, then a steady fall.
// Put it inside a flex:1 parent; it covers it and ignores touches.

const COLORS = ["#f2b830", "#ec5a7c", "#3b8cf0", "#6c4ee0", "#22b573"]; // web --fun-2..5, --fun-1
// Deterministic spread (no Math.random in render).
const FALL = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100, delay: ((i * 7) % 20) * 100, dur: 2600 + ((i * 13) % 10) * 170,
  rot: (i * 47) % 180, color: COLORS[i % COLORS.length], wide: i % 3 === 0,
}));
const BURST = Array.from({ length: 24 }, (_, i) => {
  const a = (i / 24) * 2 * Math.PI, d = 110 + ((i * 53) % 100);
  return { dx: Math.cos(a) * d, dy: Math.sin(a) * d - 50, rot: (i * 71) % 360, color: COLORS[i % COLORS.length], wide: i % 2 === 0 };
});

function Falling({ p, h }: { p: (typeof FALL)[number]; h: number }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.set(withDelay(p.delay, withRepeat(withTiming(1, { duration: p.dur, easing: Easing.linear }), -1)));
  }, [y, p]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -40 + y.get() * (h + 80) }, { rotate: `${p.rot + y.get() * 540}deg` }] }));
  return <Animated.View style={[{ position: "absolute", top: 0, left: `${p.left}%`, width: p.wide ? 8 : 6, height: p.wide ? 8 : 20, borderRadius: 4, backgroundColor: p.color }, style]} />;
}

function Burst({ p }: { p: (typeof BURST)[number] }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.set(withTiming(1, { duration: 1100, easing: Easing.bezier(0.15, 0.7, 0.3, 1) }));
  }, [v]);
  const style = useAnimatedStyle(() => ({
    opacity: v.get() < 0.8 ? 1 : (1 - v.get()) * 5,
    transform: [{ translateX: p.dx * v.get() }, { translateY: p.dy * v.get() }, { rotate: `${p.rot * v.get()}deg` }, { scale: 0.4 + 0.6 * v.get() }],
  }));
  return <Animated.View style={[{ position: "absolute", width: p.wide ? 10 : 7, height: p.wide ? 10 : 18, borderRadius: 5, backgroundColor: p.color }, style]} />;
}

export function Confetti() {
  const { height } = useWindowDimensions();
  if (useReducedMotion()) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {FALL.map((p, i) => <Falling key={i} p={p} h={height} />)}
      <View style={{ position: "absolute", left: "50%", top: "40%" }}>
        {BURST.map((p, i) => <Burst key={i} p={p} />)}
      </View>
    </View>
  );
}
