// Port of web components/gift/GiftLinkSlip.tsx + the parts of components/receipt/Slip.tsx it uses: a gift link that
// isn't ready to open yet (or is someone else's, or gone), printed on a slip out of a slot; status = a rubber stamp.
// Ready gifts get GiftReveal instead.
import { router } from "expo-router";
import { Gift } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, useColorScheme, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import type { Address } from "viem";
import { Kinko } from "@/components/Kinko";
import { dateLabel, Status, share, timeLeft, useNow } from "@/components/programs/kit";
import { Button, ErrorText, Footer, Screen, Text } from "@/components/ui";
import { isBound, type GiftLink } from "@/lib/giftLinks";
import { formatMoney } from "@/lib/money";
import { same } from "@/lib/programs";
import { useTheme } from "@/theme";
import { Grain, Label, MONO, P } from "./GiftNote";

const FEED_MS = 1250;
const home = (signedIn: boolean) => router.replace(signedIn ? "/tabs" : "/");

/** Metal printer slot with the dark mouth (simplified receipt Slot). */
function Slot() {
  const light = useColorScheme() === "light";
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ zIndex: 2, height: 30, borderRadius: 15, backgroundColor: light ? "#b9bbc1" : "#4b4d53", boxShadow: "0 8px 18px -6px rgba(0,0,0,0.55)" }}>
      <View style={{ position: "absolute", top: 11, left: 14, right: 14, bottom: 9, borderRadius: 5, backgroundColor: "#121110" }} />
    </View>
  );
}

/** A slip printing out of the slot (one smooth feed; the receipt's stepped feed lives in receipt/Ticket). */
function Slip({ label, children }: { label: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  const [h, setH] = useState(0);
  const f = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (h && !reduced) f.set(withDelay(120, withTiming(1, { duration: FEED_MS, easing: Easing.bezier(0.3, 0.7, 0.3, 1.02) })));
  }, [h, reduced, f]);
  const feed = useAnimatedStyle(() => ({ opacity: h || reduced ? 1 : 0, transform: [{ translateY: (f.get() - 1) * h }] }));
  return (
    <View>
      <Slot />
      <View style={{ marginTop: -10, paddingHorizontal: 14, overflow: "hidden", paddingBottom: 24 }}>
        <Animated.View style={feed} onLayout={(e) => setH(e.nativeEvent.layout.height)} accessibilityLabel={label}>
          <View style={{ alignItems: "center", gap: 16, paddingHorizontal: 20, paddingTop: 36, paddingBottom: 40, backgroundColor: P.paper, boxShadow: "0 10px 14px rgba(0,0,0,0.25)" }}>
            <Grain />
            {children}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const Dash = () => <Svg width="100%" height={2} style={{ opacity: 0.8 }}><Path d="M0 1 H2000" stroke={P.line} strokeWidth={2} strokeDasharray="6 4" /></Svg>;

/** Rubber stamp over the paper (status): lands with a thump after the print (web kd-stamp). */
export function Stamp({ children, tone = "ink", delay = 1450 }: { children: ReactNode; tone?: "ink" | "good" | "bad"; delay?: number }) {
  const reduced = useReducedMotion();
  const c = { ink: P.ink, good: P.good, bad: "#b3412e" }[tone];
  const v = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) v.set(withDelay(delay, withTiming(1, { duration: 360, easing: Easing.bezier(0.3, 0.7, 0.3, 1.1) })));
  }, [reduced, delay, v]);
  const s = useAnimatedStyle(() => {
    const p = v.get();
    return { opacity: p < 0.7 ? (p / 0.7) * 0.9 : 0.9 - ((p - 0.7) / 0.3) * 0.05, transform: [{ rotate: "-6deg" }, { scale: p < 0.7 ? 1.8 - (p / 0.7) * 0.86 : 0.94 + ((p - 0.7) / 0.3) * 0.06 }] };
  });
  return (
    <Animated.View style={[{ borderRadius: 8, borderWidth: 3, borderColor: c, paddingHorizontal: 12, paddingVertical: 4 }, s]}>
      <Text style={{ color: c, fontFamily: MONO, fontSize: 14, fontWeight: "700", letterSpacing: 2.8 }}>{children}</Text>
    </Animated.View>
  );
}

/** Mono countdown in four boxes (DAYS : HRS : MIN : SEC). */
function TicketCountdown({ seconds }: { seconds: number }) {
  const s = Math.max(0, Math.floor(seconds));
  const parts = [[Math.floor(s / 86400), "DAYS"], [Math.floor((s % 86400) / 3600), "HRS"], [Math.floor((s % 3600) / 60), "MIN"], [s % 60, "SEC"]] as const;
  return (
    <View accessible accessibilityRole="timer" accessibilityLabel={`${parts.map(([n, l]) => `${n} ${l.toLowerCase()}`).join(" ")} left`} style={{ flexDirection: "row", alignItems: "flex-start", gap: 4 }}>
      {parts.map(([n, l], i) => (
        <View key={l} style={{ flexDirection: "row", alignItems: "flex-start", gap: 4 }}>
          {i > 0 && <Text style={{ paddingTop: 6, fontFamily: MONO, fontSize: 20, color: P.muted }}>:</Text>}
          <View style={{ alignItems: "center" }}>
            <Text style={{ minWidth: 44, textAlign: "center", borderRadius: 8, overflow: "hidden", paddingHorizontal: 6, paddingVertical: 4, backgroundColor: P.pill, color: P.ink, fontFamily: MONO, fontSize: 24, fontWeight: "700" }}>{String(n).padStart(2, "0")}</Text>
            <Label style={{ marginTop: 4, fontSize: 9 }}>{l}</Label>
          </View>
        </View>
      ))}
    </View>
  );
}

function Field({ k, v, first }: { k: string; v: string; first?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: "center", gap: 4, paddingHorizontal: 8 }}>
      <Label>{k}</Label>
      <Text numberOfLines={1} style={{ color: P.ink, fontFamily: MONO, fontSize: 14, fontWeight: "700" }}>{v}</Text>
      {first && <Svg width={2} height="100%" style={{ position: "absolute", right: -1, top: 0 }}><Path d="M1 0 V400" stroke={P.line} strokeWidth={2} strokeDasharray="6 4" /></Svg>}
    </View>
  );
}

/** Empty slot with a message (link incomplete, couldn't open) or a spinner (loading). */
function SlotNote({ title, children, busy }: { title?: string; children: ReactNode; busy?: boolean }) {
  const t = useTheme();
  return (
    <View accessibilityState={{ busy }}>
      <Slot />
      <View style={{ alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 40 }}>
        {busy && <ActivityIndicator size="large" color={t.muted} />}
        {!!title && <Text style={{ color: t.ink, fontFamily: MONO, fontSize: 14, fontWeight: "700", letterSpacing: 2.8 }}>{title}</Text>}
        <Text accessibilityLiveRegion="polite" style={{ color: t.muted, fontSize: 14, textAlign: "center", fontFamily: busy ? MONO : undefined }}>{children}</Text>
      </View>
    </View>
  );
}

type Props = {
  link: { message: string } | null; info: (GiftLink & { sender: string }) | null; err: string;
  phase: "view" | "binding" | "opening"; justBound: boolean; me?: Address; profile?: { name?: string } | null; url: string;
  onAccept: () => void; onSignup: () => void; onOpen: () => void;
};

export function GiftLinkSlip({ link, info, err, phase, justBound, me, profile, url, onAccept, onSignup, onOpen }: Props) {
  const t = useTheme();
  const now = useNow();
  if (!link)
    return (
      <Screen title="Kin" back>
        <SlotNote title="LINK INCOMPLETE">This gift link looks incomplete. Ask the sender to share it again.</SlotNote>
        <Footer><Button title="Open Kin" variant="soft" onPress={() => home(!!profile)} /></Footer>
      </Screen>
    );
  if (!info)
    return (
      <Screen title="Kin" back>
        {err ? <SlotNote title="COULDN'T OPEN THE GIFT">{err}</SlotNote> : <SlotNote busy>Unwrapping your gift…</SlotNote>}
      </Screen>
    );

  const from = info.sender ? `@${info.sender}` : "Someone";
  const mine = isBound(info) && same(info.recipient, me);
  const locked = now < info.unlockAt;
  const fromMe = same(info.from, me);
  const canAccept = !info.settled && !isBound(info) && !!me && !fromMe;

  // What the slip says, and the stamp on it.
  let title: string, note: string, stamp: ReactNode = null;
  if (mine) {
    title = info.settled ? "OPENED" : justBound ? `NOW YOURS${profile?.name ? `, @${profile.name.toUpperCase()}` : ""}` : `YOUR GIFT FROM ${from.toUpperCase()}`;
    note = info.settled ? "It's in your balance." : locked ? `Held safely until ${dateLabel(info.unlockAt)}. It opens by itself that day.` : "It's ready to open!";
    stamp = info.settled ? <Stamp tone="good">OPENED ✓</Stamp> : locked ? (justBound ? <Stamp tone="good">YOURS</Stamp> : null) : <Stamp tone="good">READY</Stamp>;
  } else {
    title = fromMe ? "YOUR GIFT LINK" : `A GIFT FROM ${from.toUpperCase()}`;
    note = info.settled ? "This gift is no longer available." : isBound(info) ? "This gift was already accepted." : fromMe ? "Share this link with the person it's for." : `Opens on ${dateLabel(info.unlockAt)}. Accept it now so it's yours.`;
    stamp = info.settled ? <Stamp tone="bad">NO LONGER AVAILABLE</Stamp> : isBound(info) ? <Stamp>ALREADY ACCEPTED</Stamp> : null;
  }

  return (
    <Screen title="Kin" back scroll>
      <Slip label="Gift">
        {mine ? <Kinko size={72} mood="celebrate" /> : (
          <View style={{ width: 64, height: 64, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: P.pill }}><Gift color={P.ink} size={32} /></View>
        )}
        <Text accessibilityRole="header" style={{ color: P.ink, fontFamily: MONO, fontSize: 14, fontWeight: "700", letterSpacing: 2.8, textAlign: "center" }}>{title}</Text>
        {!!link.message && <Text style={{ maxWidth: 288, color: P.ink, fontSize: 18, lineHeight: 24, textAlign: "center" }}>“{link.message}”</Text>}
        <Dash />
        <View style={{ alignItems: "center", gap: 8 }}>
          <Label>GIFT</Label>
          <Text style={{ color: P.ink, fontSize: 48, fontWeight: "700", letterSpacing: -1, fontVariant: ["tabular-nums"] }}>{formatMoney(info.amount)}</Text>
        </View>
        {stamp}
        {!info.settled && locked && (mine || canAccept || fromMe) && (
          <>
            <Dash />
            <Label>OPENS IN {timeLeft(info.unlockAt - now).toUpperCase()}</Label>
            <TicketCountdown seconds={info.unlockAt - now} />
          </>
        )}
        <Dash />
        <View style={{ width: "100%", flexDirection: "row" }}><Field k="FROM" v={from} first /><Field k="OPENS" v={dateLabel(info.unlockAt)} /></View>
        <Text style={{ color: P.muted, fontFamily: MONO, fontSize: 12, lineHeight: 17, textAlign: "center" }}>{note}</Text>
      </Slip>
      <Footer>
        <ErrorText>{err}</ErrorText>
        {phase === "binding" && <Status>Accepting your gift…</Status>}
        {phase === "opening" && <Status>Opening your gift…</Status>}
        {canAccept && <Button title="Accept gift" busy={phase === "binding"} onPress={onAccept} />}
        {!info.settled && !isBound(info) && !profile && (
          <>
            <Button title="Create free account to accept" onPress={onSignup} />
            <Text style={{ textAlign: "center", color: t.muted, fontSize: 12 }}>Takes 20 seconds. Just your name and an Identity check.</Text>
          </>
        )}
        {mine && !info.settled && !locked && <Button title="Open gift" busy={phase === "opening"} onPress={onOpen} />}
        {fromMe && !info.settled && !isBound(info) && <Button title="Share gift link" variant="soft" onPress={() => void share("A gift for you on Kin 🎁", url)} />}
        {(info.settled || isBound(info) || fromMe) && <Button title="Open Kin" variant="soft" onPress={() => home(!!profile)} />}
      </Footer>
    </Screen>
  );
}
