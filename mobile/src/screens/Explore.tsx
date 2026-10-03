import { ArrowDownLeft, Briefcase, CalendarClock, ChartPie, Gift, House, ListChecks, Luggage, type LucideIcon, PiggyBank, Receipt, RefreshCcw, Split, Sprout, UserPlus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { Kinko } from "@/components/Kinko";
import { IconTile, MeButton, Screen, Serif, TabHeader, Text } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { listRequests } from "@/lib/contacts";
import { useAvatarLook } from "@/lib/names";
import { openKin } from "@/lib/nav";
import { useTheme } from "@/theme";

type Tile = { title: string; sub: string; icon: LucideIcon | null }; // icon null = my Kinko
// Native port of app/src/app/(tabs)/explore/page.tsx — keep the tiles and blocks in sync.
const TILES: Record<string, Tile> = {
  "/requests": { title: "Requests", sub: "See what's waiting", icon: ArrowDownLeft },
  "/earmark": { title: "Pay a bill", sub: "Money only for school, rent, doctor", icon: Receipt },
  "/split": { title: "Split a bill", sub: "Share the cost", icon: Split },
  "/invoice": { title: "Invoices", sub: "Get paid for work", icon: Briefcase },
  "/chores": { title: "Chores", sub: "Earn for helping", icon: ListChecks },
  "/jars": { title: "Savings jars", sub: "Save for a goal", icon: PiggyBank },
  "/spends": { title: "Monthly spends", sub: "Where your money went", icon: ChartPie },
  "/allowance": { title: "Live allowance", sub: "Grows every second", icon: Sprout },
  "/trips": { title: "Trips", sub: "Who paid what", icon: Luggage },
  "/circle": { title: "Circles", sub: "Save together, take turns", icon: RefreshCcw },
  "/pot": { title: "Family pot", sub: "Chip in for home", icon: House },
  "/gift": { title: "Gifts", sub: "Opens on the day", icon: Gift },
  "/autopay": { title: "AutoPay", sub: "Paid every month", icon: CalendarClock },
  "/kinko": { title: "Kinko & Kin Score", sub: "Dress up your buddy", icon: null },
  "/invite": { title: "Invite & earn", sub: "You both get a Kinko treat", icon: UserPlus },
};

// Bento blocks: a wide card, then two small cards stacked beside one tall card (`flip` swaps the sides).
const BLOCKS: { wide: string; small: [string, string]; tall: string; flip?: boolean }[] = [
  { wide: "/requests", small: ["/earmark", "/split"], tall: "/invoice" },
  { wide: "/chores", small: ["/spends", "/allowance"], tall: "/jars", flip: true },
  { wide: "/trips", small: ["/circle", "/pot"], tall: "/gift" },
];
const TAIL = ["/autopay", "/kinko", "/invite"]; // wide cards
const SMALL = 120, GAP = 12;

export default function Explore() {
  const t = useTheme();
  const { profile, canRead } = useAccount();
  const [waiting, setWaiting] = useState(0);
  // Only with a read session: the count must never trigger Face ID on its own.
  useEffect(() => {
    if (canRead) listRequests().then((r) => setWaiting(r.incoming.filter((q) => q.status === "open").length), () => {});
  }, [canRead]);
  const look = useAvatarLook(profile?.name);

  function card(href: string, shape: "wide" | "small" | "tall") {
    const tile = TILES[href];
    const sub = href === "/requests" && waiting ? `${waiting} waiting for you` : tile.sub;
    const size: ViewStyle =
      shape === "wide" ? { minHeight: 96, flexDirection: "row", alignItems: "center" }
      : shape === "small" ? { height: SMALL, justifyContent: "space-between" }
      : { height: SMALL * 2 + GAP, justifyContent: "space-between" };
    return (
      <Pressable key={href} onPress={() => openKin(href)} accessibilityRole="button" accessibilityLabel={tile.title}
        style={({ pressed }) => ({
          gap: 12, borderRadius: 24, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 16,
          ...size, ...(shape === "wide" ? {} : { flex: 1 }), transform: [{ scale: pressed ? 0.97 : 1 }],
        })}>
        {tile.icon ? <IconTile icon={tile.icon} brand={href === "/earmark"} /> : <Kinko look={look} size={shape === "tall" ? 64 : 48} />}
        <View style={{ flex: shape === "wide" ? 1 : undefined, minWidth: 0 }}>
          <Text style={{ color: t.ink, fontSize: shape === "tall" ? 18 : 16, fontWeight: "600" }}>{tile.title}</Text>
          <Text style={{ color: t.muted, fontSize: 12 }}>{sub}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Screen tab scroll>
      <TabHeader title="Explore">
        <MeButton name={profile?.name} />
      </TabHeader>
      <Serif size={36}>Money that behaves.</Serif>
      <View style={{ gap: GAP }}>
        {BLOCKS.map(({ wide, small, tall, flip }) => (
          <View key={wide} style={{ gap: GAP }}>
            {card(wide, "wide")}
            <View style={{ flexDirection: flip ? "row-reverse" : "row", gap: GAP }}>
              <View style={{ flex: 1, gap: GAP }}>{small.map((h) => card(h, "small"))}</View>
              {card(tall, "tall")}
            </View>
          </View>
        ))}
        {TAIL.map((href) => card(href, "wide"))}
      </View>
    </Screen>
  );
}
