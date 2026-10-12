import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { X } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import type { Address } from "viem";
import type { Person } from "@/components/PersonPicker";
import { dateLabel } from "@/components/programs/kit";
import { Avatar, Field, Serif, Text, useInputStyle } from "@/components/ui";
import { play, type Sound } from "@/lib/sound";
import { useTheme } from "@/theme";

// Port of app/src/components/trips/bits.tsx + small web ui bits (Card, Delivered, date input) shared by
// trips, split, gift, invoice and claim screens.

/** Overlapping Kinko faces, "+3" after `max`. */
export function Avatars({ people, size = 28, max = 5 }: { people: Person[]; size?: number; max?: number }) {
  const t = useTheme();
  return (
    <View accessibilityLabel={`${people.length} people`} style={{ flexDirection: "row", alignItems: "center" }}>
      {people.slice(0, max).map((p, i) => (
        <View key={p.address} style={{ marginLeft: i ? -8 : 0, borderRadius: size, borderWidth: 2, borderColor: t.bg }}>
          <Avatar name={p.name} size={size} />
        </View>
      ))}
      {people.length > max && <Text style={{ marginLeft: 6, color: t.muted, fontSize: 12, fontWeight: "600" }}>+{people.length - max}</Text>}
    </View>
  );
}

/** Member pills; `on` = selected. 44px targets. */
export function MemberChips({ members, me, on, onTap, label }: { members: Person[]; me?: Address; on: (a: Address) => boolean; onTap: (a: Address) => void; label: string }) {
  const t = useTheme();
  return (
    <View accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {members.map((m) => {
        const sel = on(m.address);
        return (
          <Pressable key={m.address} onPress={() => onTap(m.address)} accessibilityRole="button" accessibilityState={{ selected: sel }}
            style={({ pressed }) => ({ height: 44, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 22, paddingLeft: 6, paddingRight: 14, backgroundColor: sel ? t.ink : t.surface2, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
            <Avatar name={m.name} size={32} />
            <Text style={{ color: sel ? t.bg : t.muted, fontSize: 14, fontWeight: "500" }}>{m.address === me ? "You" : `@${m.name}`}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Picked people as removable brand pills. */
export function PeopleChips({ people, onRemove, label }: { people: Person[]; onRemove: (p: Person) => void; label: string }) {
  const t = useTheme();
  if (!people.length) return null;
  return (
    <View accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {people.map((p) => (
        <Pressable key={p.address} onPress={() => onRemove(p)} accessibilityRole="button" accessibilityLabel={`Remove @${p.name}`}
          style={({ pressed }) => ({ height: 44, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 22, paddingLeft: 6, paddingRight: 12, backgroundColor: t.brandSoft, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
          <Avatar name={p.name} size={32} />
          <Text style={{ color: t.brand, fontSize: 14, fontWeight: "500" }}>@{p.name}</Text>
          <X color={t.brand} size={16} />
        </Pressable>
      ))}
    </View>
  );
}

/** Rounded surface (web Card). */
export function Card({ children, style, brand }: { children: ReactNode; style?: ViewStyle; brand?: boolean }) {
  const t = useTheme();
  return (
    <View style={[{ gap: 12, padding: 20, borderRadius: 28, borderWidth: 1, borderColor: brand ? t.brand : t.line, backgroundColor: brand ? t.brandSoft : t.surface }, style]}>
      {children}
    </View>
  );
}

/** Small pill action inside a Row (Pay / Remind / Move). 44px target. */
export function Pill({ title, onPress, soft, disabled }: { title: string; onPress: () => void; soft?: boolean; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", borderRadius: 22, paddingHorizontal: 20, backgroundColor: soft ? t.brandSoft : t.brand, opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      <Text style={{ color: soft ? t.brand : t.brandInk, fontSize: 14, fontWeight: "600" }}>{title}</Text>
    </Pressable>
  );
}

/** Success body (web Delivered): big check line, title, subtitle; actions go in the Screen's <Footer>. `sound` = which moment (lib/sound.ts). */
export function Delivered({ title, subtitle, sound = "success" }: { title: string; subtitle?: string; sound?: Sound }) {
  const t = useTheme();
  useEffect(() => play(sound), [sound]);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
      <Animated.View entering={ZoomIn.springify().damping(12)}><Text style={{ color: t.good, fontSize: 20, fontWeight: "700" }}>✓</Text></Animated.View>
      <Animated.View entering={FadeInDown.delay(120)}><Serif size={44}>{title}</Serif></Animated.View>
      {!!subtitle && <Animated.View entering={FadeInDown.delay(200)}><Text style={{ color: t.muted, fontSize: 16, textAlign: "center" }}>{subtitle}</Text></Animated.View>}
    </View>
  );
}

/** Big centered money amount (web Amount). */
export const Amount = ({ value, size = 56 }: { value: string; size?: number }) => <Serif size={size}>{value}</Serif>;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Date field (web <input type="date">): value/min are "YYYY-MM-DD"; tap opens the system calendar. */
export function DateField({ label, value, min, onChange }: { label: string; value: string; min: string; onChange: (v: string) => void }) {
  const t = useTheme();
  const input = useInputStyle();
  const [open, setOpen] = useState(false);
  return (
    <Field label={label}>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label} style={[input, { justifyContent: "center" }]}>
        <Text style={{ color: value ? t.ink : t.muted, fontSize: 17 }}>{value ? dateLabel(new Date(`${value}T12:00`).getTime() / 1000) : "Pick a date"}</Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={new Date(value || min)}
          minimumDate={new Date(min)}
          accentColor={t.brand}
          onValueChange={(_, d) => (setOpen(false), onChange(iso(d)))}
          onDismiss={() => setOpen(false)}
        />
      )}
    </Field>
  );
}
