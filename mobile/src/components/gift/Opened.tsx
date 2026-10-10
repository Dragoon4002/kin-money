import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming, ZoomIn } from "react-native-reanimated";
import Svg, { Path, Rect } from "react-native-svg";
import { Confetti } from "@/components/Confetti";
import { Kinko } from "@/components/Kinko";
import { Amount } from "@/components/trips/bits";
import { Button, Footer, Screen, Serif, Text } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { savedLook } from "@/lib/kinko";
import { shareCard } from "@/lib/shareCard";
import { play } from "@/lib/sound";
import { useTheme } from "@/theme";

// Native stand-in for web Celebrate on a just-opened gift: a wrapped box wiggles, the lid pops off
// (with the "gift" sound), then confetti, party Kinko, amount, share card.

const GIFT_MS = 1100; // wiggle time before the lid pops
const PINK = "#ec5a7c", YELLOW = "#f2b830"; // web --fun-4 / --fun-2

function GiftBox() {
  const rot = useSharedValue(0);
  const lid = useSharedValue(0);
  useEffect(() => {
    rot.set(withSequence(...[-6, 6, -9, 9, -12, 12, 0].map((d) => withTiming(d, { duration: GIFT_MS / 7 }))));
    lid.set(withDelay(GIFT_MS, withTiming(1, { duration: 350 })));
  }, [rot, lid]);
  const box = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.get()}deg` }, { scale: 1 + Math.abs(rot.get()) / 100 }] }));
  const top = useAnimatedStyle(() => ({ opacity: 1 - lid.get(), transform: [{ translateX: 40 * lid.get() }, { translateY: -160 * lid.get() }, { rotate: `${35 * lid.get()}deg` }] }));
  return (
    <Animated.View style={[{ width: 200, height: 200, transformOrigin: "50% 90%" }, box]}>
      <Svg viewBox="0 0 120 120" width={200} height={200} style={{ position: "absolute" }}>
        <Rect x="18" y="52" width="84" height="58" rx="8" fill={PINK} />
        <Rect x="53" y="52" width="14" height="58" fill={YELLOW} />
      </Svg>
      <Animated.View style={[{ position: "absolute", width: 200, height: 200 }, top]}>
        <Svg viewBox="0 0 120 120" width={200} height={200}>
          <Path d="M60 36C44 12 26 30 60 36ZM60 36C76 12 94 30 60 36Z" fill={YELLOW} />
          <Rect x="10" y="36" width="100" height="20" rx="6" fill={PINK} />
          <Rect x="53" y="36" width="14" height="20" fill={YELLOW} />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

export function Opened({ amount, money, subtitle, from, onClose }: { amount: bigint; money: string; subtitle: string; from?: string; onClose: () => void }) {
  const t = useTheme();
  const me = useAccount().profile?.address;
  const reduce = useReducedMotion();
  const [wrapped, setWrapped] = useState(!reduce);
  useEffect(() => {
    if (reduce) return play("gift");
    const pop = setTimeout(() => play("gift"), GIFT_MS);
    const show = setTimeout(() => setWrapped(false), GIFT_MS + 350);
    return () => (clearTimeout(pop), clearTimeout(show));
  }, [reduce]);

  if (wrapped) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 24 }}>
          <GiftBox />
          <Serif size={30}>Opening your gift…</Serif>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <Confetti />
        <Animated.View entering={ZoomIn.springify().damping(12)}><Kinko look={savedLook(me)} mood="celebrate" size={140} /></Animated.View>
        <Animated.View entering={FadeInDown.delay(150)}><Serif size={40}>Your gift is open!</Serif></Animated.View>
        <Animated.View entering={ZoomIn.delay(250).springify()}><Amount value={money} /></Animated.View>
        <Animated.View entering={FadeInDown.delay(350)}><Text style={{ color: t.muted, fontSize: 16, textAlign: "center" }}>{subtitle}</Text></Animated.View>
      </View>
      <Footer>
        <Button title="Share" variant="soft" onPress={() => void shareCard({ kind: "gift", amount, from }, "I just opened a gift on Kin 🎁")} />
        <Button title="Done" onPress={onClose} />
      </Footer>
    </Screen>
  );
}
