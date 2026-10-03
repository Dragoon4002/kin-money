import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { Serif, Text } from "@/components/ui";
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

/** Big centered success state. Put buttons in a <Footer> after it. */
export function Delivered({ title, subtitle }: { title: string; subtitle?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
      <View style={{ width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", backgroundColor: t.good }}>
        <Text style={{ color: "#fff", fontSize: 30, fontWeight: "700" }}>✓</Text>
      </View>
      <Serif size={36}>{title}</Serif>
      {!!subtitle && <Text style={{ color: t.muted, textAlign: "center" }}>{subtitle}</Text>}
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
