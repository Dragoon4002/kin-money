import { useEffect, type ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { Serif, Text } from "@/components/ui";
import { play, type Sound } from "@/lib/sound";
import { useTheme } from "@/theme";

// Small pieces shared by the allowance, chores, AutoPay and bill screens (web Card / Delivered / done note).

/** Rounded surface box (web Card). `hot` = brand-tinted, for "needs you now". */
export function Card({ children, hot, style }: { children: ReactNode; hot?: boolean; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View style={[{ gap: 12, padding: 16, borderRadius: 24, borderWidth: 1, borderColor: hot ? t.brand : t.line, backgroundColor: hot ? t.brandSoft : t.surface }, style]}>
      {children}
    </View>
  );
}

/** Big centered success state. Put buttons in a <Footer> after it. `sound` = which moment (lib/sound.ts). */
export function Delivered({ title, subtitle, sound = "success" }: { title: string; subtitle?: string; sound?: Sound }) {
  const t = useTheme();
  useEffect(() => play(sound), [sound]);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
      <Animated.View entering={ZoomIn.springify().damping(12)} style={{ width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", backgroundColor: t.good }}>
        <Text style={{ color: "#fff", fontSize: 30, fontWeight: "700" }}>✓</Text>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(120)}><Serif size={36}>{title}</Serif></Animated.View>
      {!!subtitle && <Animated.View entering={FadeInDown.delay(200)}><Text style={{ color: t.muted, textAlign: "center" }}>{subtitle}</Text></Animated.View>}
    </View>
  );
}

/** Green "it worked" line. */
export function DoneNote({ children }: { children?: ReactNode }) {
  const t = useTheme();
  if (!children) return null;
  return (
    <Text accessibilityLiveRegion="polite" style={{ borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, textAlign: "center", fontSize: 14, fontWeight: "600", color: t.good, backgroundColor: `${t.good}1a` }}>
      {children}
    </Text>
  );
}

/** Small uppercase caption (web "text-xs uppercase tracking-widest"). */
export function Caption({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.muted, fontSize: 12, fontWeight: "600", letterSpacing: 1.5, textTransform: "uppercase" }}>{children}</Text>;
}
