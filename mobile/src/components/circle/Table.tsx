import { Check } from "lucide-react-native";
import { View } from "react-native";
import type { Address } from "viem";
import { Kinko, type Mood } from "@/components/Kinko";
import { useName, Who } from "@/components/programs/kit";
import { Serif, Text } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { useAvatarLook } from "@/lib/names";
import { same, type Circle, type CirclePhase } from "@/lib/programs";
import { useTheme } from "@/theme";

// Port of the Table in app/src/app/circle/[id]/page.tsx + ui Countdown.

/** A member's own Kinko from their account (web AddressKinko). */
function SeatKinko({ a, size, mood }: { a: Address; size: number; mood: Mood }) {
  return <Kinko look={useAvatarLook(useName(a) || "")} size={size} mood={mood} />;
}

const at = (i: number, n: number) => {
  const a = (i / n) * 2 * Math.PI - Math.PI / 2;
  return { left: `${50 + 41 * Math.cos(a)}%`, top: `${50 + 41 * Math.sin(a)}%` } as const;
};

/** The circle table: everyone's Kinko seated around the pot, spotlight on whose turn it is. */
export function Table({ c, phase, me }: { c: Circle; phase: CirclePhase; me?: Address }) {
  const t = useTheme();
  const n = c.seats;
  const size = n <= 6 ? 60 : n <= 10 ? 46 : 34;
  const turn = c.members[c.round];
  const pot = c.contribution * BigInt(n);
  const seat = { position: "absolute", width: 80, marginLeft: -40, marginTop: -size / 2, alignItems: "center" } as const;
  return (
    <View style={{ alignSelf: "center", width: "100%", maxWidth: 340, aspectRatio: 1 }}>
      <View style={{ position: "absolute", top: "18%", left: "18%", right: "18%", bottom: "18%", borderRadius: 999, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 16 }}>
        <Text style={{ color: t.muted, fontSize: 10, fontWeight: "600", letterSpacing: 1.5, textTransform: "uppercase", textAlign: "center" }}>
          {phase === "running" ? `Turn ${c.round + 1} of ${n}` : phase === "gathering" ? `${c.joined} of ${n} joined` : phase === "done" ? "Complete" : "Didn't start"}
        </Text>
        <Serif size={32}>{formatMoney(pot)}</Serif>
        {phase === "running" && !!turn && (
          <Text numberOfLines={1} style={{ maxWidth: 144, color: t.brand, fontSize: 14, fontWeight: "600" }}>
            <Who a={turn.address} me={me} you="Your" />{same(turn.address, me) ? "" : "'s"} turn
          </Text>
        )}
        {phase === "running" && <Text style={{ color: t.muted, fontSize: 12 }}>{c.paidCount} of {n} put in</Text>}
      </View>
      {c.members.map((m, i) => {
        const isTurn = phase === "running" && i === c.round;
        const paid = phase === "running" && m.paidRound === c.round + 1;
        const ok = phase === "gathering" || phase === "stalled" ? m.joined : paid;
        const mood: Mood = m.defaulted ? "sad" : isTurn ? "celebrate" : ok ? "happy" : "calm";
        const dim = (phase === "gathering" && !m.joined) || m.defaulted;
        return (
          <View key={m.address} style={[seat, at(i, n), { zIndex: isTurn ? 10 : 0, opacity: dim ? 0.5 : 1, transform: [{ scale: isTurn ? 1.25 : 1 }] }]}>
            <View style={{ borderRadius: 999, borderWidth: 2, borderColor: isTurn ? t.brand : "transparent", backgroundColor: isTurn ? t.brandSoft : "transparent" }}>
              <SeatKinko a={m.address} size={size} mood={mood} />
              {(ok || m.defaulted) && (
                <View style={{ position: "absolute", bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: t.bg, alignItems: "center", justifyContent: "center", backgroundColor: m.defaulted ? t.bad : t.good }}>
                  {m.defaulted ? <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>!</Text> : <Check color="#fff" size={12} />}
                </View>
              )}
            </View>
            {n <= 8 && <Text numberOfLines={1} style={{ marginTop: 4, color: t.ink, fontSize: 11, fontWeight: "600" }}><Who a={m.address} me={me} /></Text>}
          </View>
        );
      })}
      {phase === "gathering" && Array.from({ length: n - c.members.length }, (_, k) => c.members.length + k).map((i) => (
        <View key={`open${i}`} accessibilityLabel="Open spot" style={[seat, at(i, n)]}>
          <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderStyle: "dashed", borderColor: t.line, opacity: 0.6, alignItems: "center", justifyContent: "center" }}>
            <View style={{ opacity: 0.4 }}><Kinko size={size - 8} mood="calm" /></View>
          </View>
          {n <= 8 && <Text style={{ marginTop: 4, color: t.muted, fontSize: 11, fontWeight: "600" }}>Open</Text>}
        </View>
      ))}
    </View>
  );
}

/** Big countdown "01 : 21 : 19 : 01". Caller re-renders each second. */
export function Countdown({ seconds }: { seconds: number }) {
  const t = useTheme();
  const s = Math.max(0, Math.floor(seconds));
  const parts = [[Math.floor(s / 86400), "Days"], [Math.floor((s % 86400) / 3600), "Hours"], [Math.floor((s % 3600) / 60), "Minutes"], [s % 60, "Seconds"]] as const;
  return (
    <View accessibilityLabel={`${parts.map(([v, l]) => `${v} ${l}`).join(", ")}`} style={{ flexDirection: "row", alignItems: "flex-start", gap: 4 }}>
      {parts.map(([v, label], i) => (
        <View key={label} style={{ flexDirection: "row", alignItems: "flex-start", gap: 4 }}>
          {i > 0 && <Serif size={36} color={t.muted}>:</Serif>}
          <View style={{ alignItems: "center" }}>
            <Serif size={44}>{String(v).padStart(2, "0")}</Serif>
            <Text style={{ marginTop: 4, color: t.muted, fontSize: 10 }}>{label}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
