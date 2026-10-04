import { router } from "expo-router";
import { ChevronLeft, Delete, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput as RNTextInput, View, type StyleProp, type TextInputProps, type TextProps, type TextStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { Kinko } from "@/components/Kinko";
import { useAvatarLook } from "@/lib/names";
import { fonts, useTheme } from "@/theme";

/** Plus Jakarta Sans at the style's fontWeight, unless a fontFamily is set (e.g. Serif). */
function sans(style: StyleProp<TextStyle>): StyleProp<TextStyle> {
  const s = StyleSheet.flatten(style) ?? {};
  if (s.fontFamily) return style;
  const w = s.fontWeight === "bold" ? "700" : String(s.fontWeight ?? "400");
  return [style, { fontFamily: fonts.sans[w] ?? fonts.sans["400"], fontWeight: "normal" }];
}

/** Use these instead of react-native's Text/TextInput so UI text gets the brand font. */
export const Text = (p: TextProps) => <RNText {...p} style={sans(p.style)} />;
export const TextInput = (p: TextInputProps) => <RNTextInput {...p} style={sans(p.style)} />;

/** Full-screen page: safe area, optional back + title header. `tab`: a tab page (the tabs shell owns the safe area). */
export function Screen({ title, back, scroll, tab, children }: { title?: string; back?: boolean; scroll?: boolean; tab?: boolean; children: ReactNode }) {
  const t = useTheme();
  const Wrap = tab ? View : SafeAreaView;
  const body = { flexGrow: 1, gap: 16, paddingHorizontal: 20, paddingBottom: 20 } as const;
  return (
    <Wrap style={{ flex: 1, backgroundColor: t.bg }}>
      {(title || back) && (
        <View style={{ height: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 8, gap: 4 }}>
          {back && (
            <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/tabs"))} accessibilityLabel="Back" hitSlop={8}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <ChevronLeft color={t.ink} size={26} />
            </Pressable>
          )}
          <Text style={{ color: t.ink, fontSize: 18, fontWeight: "700", paddingLeft: back ? 0 : 12 }}>{title}</Text>
        </View>
      )}
      {scroll ? (
        <ScrollView contentContainerStyle={body} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      ) : (
        <View style={[body, { flex: 1 }]}>{children}</View>
      )}
    </Wrap>
  );
}

type Variant = "primary" | "soft" | "ghost";

export function Button({ title, onPress, variant = "primary", disabled, busy }: { title: string; onPress?: () => void; variant?: Variant; disabled?: boolean; busy?: boolean }) {
  const t = useTheme();
  const bg = { primary: t.brand, soft: t.surface, ghost: "transparent" }[variant];
  const fg = variant === "primary" ? t.brandInk : variant === "soft" ? t.ink : t.muted;
  return (
    <Pressable onPress={onPress} disabled={disabled || busy} accessibilityRole="button" accessibilityState={{ disabled: !!(disabled || busy), busy }}
      style={({ pressed }) => ({
        height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8,
        backgroundColor: bg, borderWidth: variant === "soft" ? 1 : 0, borderColor: t.line,
        opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.98 : 1 }],
      })}>
      {busy && <ActivityIndicator color={fg} />}
      <Text style={{ color: fg, fontSize: 16, fontWeight: "700" }}>{title}</Text>
    </Pressable>
  );
}

export function ErrorText({ children }: { children?: string }) {
  const t = useTheme();
  if (!children) return null;
  return (
    <Text accessibilityRole="alert" style={{ color: t.bad, backgroundColor: t.surface2, borderRadius: 16, padding: 12, fontSize: 14 }}>{children}</Text>
  );
}

/** Round icon button with a neutral tile; `badge` > 0 shows an unread count. */
export function IconButton({ icon: Icon, label, onPress, badge = 0 }: { icon: LucideIcon; label: string; onPress: () => void; badge?: number }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityLabel={badge > 0 ? `${label}, ${badge} new` : label} accessibilityRole="button"
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: t.surface2, borderWidth: 1, borderColor: t.line, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      <Icon color={t.ink} size={22} />
      {badge > 0 && (
        <View style={{ position: "absolute", top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", backgroundColor: t.brand, borderWidth: 2, borderColor: t.bg }}>
          <Text style={{ color: t.brandInk, fontSize: 11, fontWeight: "700" }}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Person's Kinko: published look, else the stable per-name default (same as web). */
export function Avatar({ name, size = 44 }: { name?: string; size?: number }) {
  const t = useTheme();
  const h = name?.replace(/^@/, "") ?? "";
  const look = useAvatarLook(h);
  return (
    <View accessibilityLabel={h ? `@${h}` : undefined}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.line, overflow: "hidden" }}>
      <Kinko look={look} size={size} avatar />
    </View>
  );
}

/** Rounded square icon tile (web IconTile). */
export function IconTile({ icon: Icon, size = 48, brand }: { icon: LucideIcon; size?: number; brand?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: brand ? t.brandSoft : t.surface2 }}>
      <Icon color={brand ? t.brand : t.ink} size={Math.round(size * 0.46)} />
    </View>
  );
}

/** Small pill label (web Chip). */
export function Chip({ children, good, tone = good ? "good" : undefined }: { children: ReactNode; good?: boolean; tone?: "good" | "brand" | "warn" | "bad" }) {
  const t = useTheme();
  const fg = tone ? t[tone] : t.muted;
  return (
    <View style={{ alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: tone ? `${fg}26` : t.surface2 }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: "600" }}>{children}</Text>
    </View>
  );
}

/** Header avatar → Me (settings), like web MeButton. */
export function MeButton({ name }: { name?: string }) {
  return (
    <Pressable onPress={() => router.push("/more")} accessibilityLabel="Me and settings" accessibilityRole="button" hitSlop={4}
      style={({ pressed }) => ({ width: 44, height: 44, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      <Avatar name={name} size={40} />
    </Pressable>
  );
}

/** Tab page header: big bold title + optional right side (web `header h-12`). */
export function TabHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ height: 48, marginTop: 16, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <View style={{ flex: 1 }}>{typeof title === "string" ? <Text numberOfLines={1} style={{ color: t.ink, fontSize: 20, fontWeight: "700" }}>{title}</Text> : title}</View>
      {children}
    </View>
  );
}

/** Section label strip, full-bleed inside <Screen> (web Band). */
export function Band({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginHorizontal: -20, paddingHorizontal: 20, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: t.surface2 }}>
      <Text style={{ color: t.muted, fontSize: 12, fontWeight: "600", letterSpacing: 1.5, textTransform: "uppercase" }}>{children}</Text>
      {action}
    </View>
  );
}

/** List row, full-bleed inside <Screen> (web Row): icon, title/sub, trailing. Pressable when `onPress`. */
export function Row({ icon, title, sub, trail, onPress }: { icon?: ReactNode; title: ReactNode; sub?: ReactNode; trail?: ReactNode; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => ({ marginHorizontal: -20, paddingHorizontal: 20, paddingVertical: 12, minHeight: 64, flexDirection: "row", alignItems: "center", gap: 16, backgroundColor: pressed ? t.surface2 : "transparent" })}>
      {icon}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: t.ink, fontSize: 16, fontWeight: "600" }}>{title}</Text>
        {!!sub && <Text numberOfLines={1} style={{ color: t.muted, fontSize: 14 }}>{sub}</Text>}
      </View>
      {trail}
    </Pressable>
  );
}

/** Labelled form field (web Field). */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      {children}
      {!!hint && <Text style={{ color: t.muted, fontSize: 12 }}>{hint}</Text>}
    </View>
  );
}

/** Primary action(s) pinned to the bottom of <Screen> (safe area comes from Screen). Last child of Screen. */
export function Footer({ children }: { children: ReactNode }) {
  return <View style={{ marginTop: "auto", paddingTop: 8, gap: 12 }}>{children}</View>;
}

/** Text input style using tokens. */
export function useInputStyle(): TextStyle {
  const t = useTheme();
  return { height: 56, borderRadius: 20, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, color: t.ink, paddingHorizontal: 16, fontSize: 17 };
}

export function Label({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.muted, fontSize: 14, fontWeight: "600" }}>{children}</Text>;
}

/** Kin logo mark (brand/kin-mark-*.svg). */
export function KinMark({ size = 28, color }: { size?: number; color: string }) {
  return (
    <Svg viewBox="0 0 480 480" width={size} height={size} fill={color}>
      <Circle cx="115" cy="115" r="115" />
      <Rect x="0" y="251" width="229" height="229" rx="10" />
      <Path d="M251 10Q251 0 261 0H469Q479 0 479 10A228 228 0 0 1 261 228Q251 228 251 218Z" />
      <Path d="M251 262Q251 252 261 252A228 228 0 0 1 479 470Q479 480 469 480H261Q251 480 251 470Z" />
    </Svg>
  );
}

export function Serif({ children, size = 40, color }: { children: ReactNode; size?: number; color?: string }) {
  const t = useTheme();
  return <Text style={{ fontFamily: fonts.serif, fontSize: size, lineHeight: size * 1.1, color: color ?? t.ink, fontVariant: ["tabular-nums"] }}>{children}</Text>;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"] as const;

/** Next amount string after a key press: ≤2 decimals, ≤9 whole digits, no leading zeros. */
export function press(v: string, k: string): string {
  if (k === "⌫") return v.slice(0, -1);
  if (k === ".") return v.includes(".") ? v : (v || "0") + ".";
  const [whole, frac] = v.split(".");
  if (frac !== undefined) return frac.length >= 2 ? v : v + k;
  if (whole === "0") return k;
  return whole.length >= 9 ? v : v + k;
}

/** 3×4 number pad for amount entry. */
export function Keypad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {KEYS.map((k) => (
        <Pressable key={k} onPress={() => onChange(press(value, k))} accessibilityLabel={k === "⌫" ? "Delete" : k === "." ? "Decimal point" : k}
          style={({ pressed }) => ({ width: "33.333%", height: 64, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? t.surface2 : "transparent" })}>
          {k === "⌫" ? <Delete color={t.ink} size={26} /> : <Text style={{ color: t.ink, fontSize: 26, fontWeight: "600" }}>{k}</Text>}
        </Pressable>
      ))}
    </View>
  );
}
