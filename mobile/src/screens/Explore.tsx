import { ArrowDownLeft, Briefcase, CalendarClock, ChartPie, Gift, House, ListChecks, Luggage, type LucideIcon, PiggyBank, Receipt, RefreshCcw, Split, Sprout, UserPlus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useMode } from "@/lib/config";
import { Pressable, View } from "react-native";
import { Kinko } from "@/components/Kinko";
import { IconTile, MeButton, Screen, Serif, TabHeader, Text } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { listRequests } from "@/lib/contacts";
import { useAvatarLook } from "@/lib/names";
import { openKin } from "@/lib/nav";
import { useTheme } from "@/theme";

type Tile = { title: string; sub: string; icon: LucideIcon | null }; // icon null = my Kinko
// Native port of app/src/app/(tabs)/explore/page.tsx — keep the tiles and layout in sync.
const TILES: Record<string, Tile> = {
  "/requests": { title: "Requests", sub: "See what's waiting", icon: ArrowDownLeft },
  "/earmark": { title: "Pay a bill", sub: "Money only for school, rent, doctor", icon: Receipt },
  "/split": { title: "Split a bill", sub: "Share the cost", icon: Split },
  "/invoice": { title: "Invoices", sub: "Get paid for work", icon: Briefcase },
  "/spends": { title: "Monthly spends", sub: "Where your money went", icon: ChartPie },
  "/jars": { title: "Savings jars", sub: "Save for a goal", icon: PiggyBank },
  "/allowance": { title: "Live allowance", sub: "Grows every second", icon: Sprout },
  "/autopay": { title: "AutoPay", sub: "Paid every month", icon: CalendarClock },
  "/circle": { title: "Circles", sub: "Save together, take turns", icon: RefreshCcw },
  "/pot": { title: "Family pot", sub: "Chip in for home", icon: House },
  "/trips": { title: "Trips", sub: "Who paid what", icon: Luggage },
  "/chores": { title: "Chores", sub: "Earn for helping", icon: ListChecks },
  "/gift": { title: "Gifts", sub: "Opens on the day", icon: Gift },
  "/kinko": { title: "KinScore", sub: "Dress up your buddy", icon: null },
  "/invite": { title: "Invite & earn", sub: "You both get a Kinko treat", icon: UserPlus },
};

// Each row: [href] wide card · [href, href] two half cards · { small, tall, flip } two small stacked beside one tall.
type Row = [string] | [string, string] | { small: [string, string]; tall: string; flip?: boolean };
const SECTIONS: { title?: string; rows: Row[] }[] = [
  { rows: [["/requests"]] },
  { title: "Pay & get paid", rows: [["/earmark", "/split"], ["/invoice"]] },
  { title: "Money", rows: [["/autopay"], ["/jars", "/allowance"], ["/spends"]] },
  { title: "Together", rows: [["/circle", "/pot"], ["/trips", "/chores"]] },
  { title: "More", rows: [["/gift", "/kinko"], ["/invite"]] },
];
const SMALL = 120, GAP = 12;

export default function Explore() {
  const t = useTheme();
  const mode = useMode();
  const { profile, canRead } = useAccount();
  const [waiting, setWaiting] = useState(0);
  // Only with a read session: the count must never trigger Face ID on its own.
  useEffect(() => {
    if (canRead) listRequests().then((r) => setWaiting(r.incoming.filter((q) => q.status === "open").length), () => {});
  }, [canRead]);
  const look = useAvatarLook(profile?.name);

  function card(href: string, shape: "wide" | "half" | "tall") {
    const tile = TILES[href];
    return (
      <Pressable key={href} onPress={() => openKin(href)} accessibilityRole="button" accessibilityLabel={tile.title}
        style={({ pressed }) => ({
          gap: 12, borderRadius: 24, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 16,
          ...(shape === "wide" ? { minHeight: 96, flexDirection: "row", alignItems: "center" } : { flex: 1, justifyContent: "space-between", minHeight: shape === "tall" ? SMALL * 2 + GAP : SMALL }),
          transform: [{ scale: pressed ? 0.97 : 1 }],
        })}>
        {tile.icon ? <IconTile icon={tile.icon} /> : <Kinko look={look} size={shape === "tall" ? 64 : 48} />}
        <View style={{ flex: shape === "wide" ? 1 : undefined, minWidth: 0 }}>
          <Text style={{ color: t.ink, fontSize: shape === "tall" ? 18 : 16, fontWeight: "600" }}>{tile.title}</Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>{tile.sub}</Text>
        </View>
        {href === "/requests" && waiting > 0 && (
          <View accessibilityLabel={`${waiting} waiting for you`} style={{ minWidth: 32, height: 32, paddingHorizontal: 8, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: t.brand }}>
            <Text style={{ color: t.brandInk, fontWeight: "700" }}>{waiting}</Text>
          </View>
        )}
      </Pressable>
    );
  }

  function row(r: Row) {
    if (!Array.isArray(r)) {
      return (
        <View key={r.tall} style={{ flexDirection: r.flip ? "row-reverse" : "row", gap: GAP }}>
          <View style={{ flex: 1, gap: GAP }}>{r.small.map((h) => card(h, "half"))}</View>
          {card(r.tall, "tall")}
        </View>
      );
    }
    if (r.length === 1) return card(r[0], "wide");
    return <View key={r[0]} style={{ flexDirection: "row", gap: GAP }}>{r.map((h) => card(h, "half"))}</View>;
  }

  return (
    <Screen tab scroll>
      <TabHeader title="Explore">
        <MeButton name={profile?.name} />
      </TabHeader>
      {mode === "main" && (
        <Text style={{ borderRadius: 20, backgroundColor: t.surface2, paddingHorizontal: 16, paddingVertical: 12, color: t.muted, fontSize: 14 }}>
          These use practice money for now. Turn off Real money in Me to try them.
        </Text>
      )}
      <Serif size={36}>Money that behaves.</Serif>
      <View style={{ gap: 24 }}>
        {SECTIONS.map(({ title, rows }) => (
          <View key={title ?? "top"} style={{ gap: GAP }}>
            {rows.map(row)}
          </View>
        ))}
      </View>
    </Screen>
  );
}
