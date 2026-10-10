import { useEffect, useState, type ReactNode } from "react";
import { Linking, View } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { Confetti } from "@/components/Confetti";
import { Kinko } from "@/components/Kinko";
import { Sheet, share, Status, useMe } from "@/components/programs/kit";
import { Button, ErrorText, Footer, Screen, Serif, Text } from "@/components/ui";
import { useKinko } from "@/lib/kinko";
import { play } from "@/lib/sound";
import { fonts, useTheme } from "@/theme";

// Shared by pot, jars and circle screens (web: ui Ring, kinko/Celebrate, the invite sheet).

/** Progress ring (web Ring). */
export function Ring({ value, size = 160, stroke = 14, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const t = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={t.surface2} strokeWidth={stroke} />
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={t.good} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - v)} />
      </Svg>
      {children}
    </View>
  );
}

/** Small list ring with "42%". */
export function PctRing({ value }: { value: number }) {
  const t = useTheme();
  return (
    <Ring value={value} size={44} stroke={5}>
      <Text style={{ color: t.ink, fontSize: 10, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{Math.floor(Math.max(0, value || 0) * 100)}%</Text>
    </Ring>
  );
}

/** Big centre ring: "42%" + label. */
export function BigRing({ value, label }: { value: number; label: string }) {
  const t = useTheme();
  return (
    <Ring value={value} size={220} stroke={16}>
      <Serif size={52}>{Math.floor(Math.max(0, value || 0) * 100)}%</Serif>
      <Text style={{ marginTop: 4, color: t.muted, fontSize: 10, fontWeight: "600", letterSpacing: 1.5, textTransform: "uppercase" }}>{label}</Text>
    </Ring>
  );
}

/** "$40.00 / $100.00" under a ring. */
export function OfGoal({ have, goal }: { have: string; goal: string }) {
  const t = useTheme();
  return (
    <Text style={{ fontFamily: fonts.serif, fontSize: 40, color: t.ink, fontVariant: ["tabular-nums"] }}>
      {have}
      <Text style={{ fontFamily: fonts.serif, fontSize: 24, color: t.muted }}> / {goal}</Text>
    </Text>
  );
}

/** Goal-reached moment (web Celebrate): confetti, cheering Kinko, the "celebrate" sound. */
export function Celebrate({ title, amount, subtitle, shareText, onClose }: { title: string; amount: string; subtitle: string; shareText: string; onClose: () => void }) {
  const t = useTheme();
  const { look } = useKinko(useMe());
  const center = { textAlign: "center", color: t.ink } as const;
  useEffect(() => play("celebrate"), []);
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <Confetti />
        <Animated.View entering={ZoomIn.springify().damping(12)}><Kinko look={look} mood="celebrate" size={200} /></Animated.View>
        <Animated.Text entering={FadeInDown.delay(150)} style={{ ...center, fontFamily: fonts.serif, fontSize: 36, lineHeight: 40 }}>{title}</Animated.Text>
        <Animated.Text entering={ZoomIn.delay(250).springify()} style={{ ...center, fontFamily: fonts.serif, fontSize: 56, lineHeight: 60, fontVariant: ["tabular-nums"] }}>{amount}</Animated.Text>
        <Animated.Text entering={FadeInDown.delay(350)} style={{ ...center, maxWidth: 288, fontSize: 16, fontWeight: "500", color: t.muted }}>{subtitle}</Animated.Text>
      </View>
      <Footer>
        <Button title="Share the good news" variant="soft" onPress={() => share(shareText)} />
        <Button title="Done" onPress={onClose} />
      </Footer>
    </Screen>
  );
}

/** Invite-link sheet for pots and circles: WhatsApp, other apps, turn the link off. */
export function InviteSheet({ open, onClose, title, sub, text, link, canOff, onOff, busy, status, error }: {
  open: boolean; onClose: () => void; title: string; sub: string; text: string; link: string;
  canOff: boolean; onOff: () => void; busy: boolean; status: string; error: string;
}) {
  const t = useTheme();
  const [noApp, setNoApp] = useState(false);
  return (
    <Sheet open={open} onClose={onClose}>
      <Serif size={30}>{title}</Serif>
      <Text style={{ color: t.muted, fontSize: 16 }}>{sub}</Text>
      <ErrorText>{error || (noApp ? "WhatsApp isn't on this phone. Share another way." : "")}</ErrorText>
      <Status>{busy ? status : ""}</Status>
      {!!link && (
        <>
          <Button title="Send on WhatsApp" onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`).catch(() => setNoApp(true))} />
          <Button title="Share another way" variant="soft" onPress={() => share(text, link)} />
        </>
      )}
      {canOff && <Button title="Turn off my link" variant="ghost" onPress={onOff} busy={busy} />}
    </Sheet>
  );
}
