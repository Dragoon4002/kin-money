import { router } from "expo-router";
import { ChevronLeft, Delete, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput as RNTextInput, View, type StyleProp, type TextInputProps, type TextProps, type TextStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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

/** Full-screen page: safe area, optional back + title header. */
export function Screen({ title, back, scroll, children }: { title?: string; back?: boolean; scroll?: boolean; children: ReactNode }) {
  const t = useTheme();
  const body = { flexGrow: 1, gap: 16, paddingHorizontal: 20, paddingBottom: 20 } as const;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      {(title || back) && (
        <View style={{ height: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 8, gap: 4 }}>
          {back && (
            <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))} accessibilityLabel="Back" hitSlop={8}
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
    </SafeAreaView>
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

/** Round icon button with a neutral tile. */
export function IconButton({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} accessibilityRole="button"
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: t.surface2, borderWidth: 1, borderColor: t.line, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      <Icon color={t.ink} size={22} />
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

/** Text input style using tokens. */
export function useInputStyle(): TextStyle {
  const t = useTheme();
  return { height: 56, borderRadius: 20, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, color: t.ink, paddingHorizontal: 16, fontSize: 17 };
}

export function Label({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.muted, fontSize: 14, fontWeight: "600" }}>{children}</Text>;
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
