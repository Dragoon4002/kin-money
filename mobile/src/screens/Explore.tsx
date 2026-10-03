import { Briefcase, CalendarClock, ChartPie, Gift, House, ListChecks, Luggage, type LucideIcon, PiggyBank, Receipt, RefreshCcw, Split, UserPlus, Users } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Kinko } from "@/components/Kinko";
import { IconTile, MeButton, Screen, Serif, TabHeader, Text } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { useAvatarLook } from "@/lib/names";
import { openKin } from "@/lib/nav";
import { useTheme } from "@/theme";

// Native port of app/src/app/(tabs)/explore/page.tsx. [title, sub, href, icon (null = my Kinko), wide].
const TILES: [string, string, string, LucideIcon | null, boolean][] = [
  ["Pay a bill", "Money only for school, rent, doctor", "/earmark", Receipt, true],
  ["AutoPay", "Paid automatically every month", "/autopay", CalendarClock, true],
  ["Chores", "Earn for helping", "/chores", ListChecks, false],
  ["Savings jars", "Save for a goal", "/jars", PiggyBank, false],
  ["Kinko & Kin Score", "Dress up your buddy", "/kinko", null, true],
  ["Gifts", "Opens on the day", "/gift", Gift, false],
  ["Invoice", "Get paid for work", "/invoice", Briefcase, false],
  ["Circles", "Save together, take turns", "/circle", RefreshCcw, false],
  ["Family pot", "Chip in for home", "/pot", House, false],
  ["This month's spends", "Where your money went", "/spends", ChartPie, true],
  ["Trips", "Who paid what, settled in one tap", "/trips", Luggage, true],
  ["Split a bill", "Share the cost", "/split", Split, false],
  ["People", "Your Kin contacts", "/contacts", Users, false],
  ["Invite & earn", "You both get a Kinko treat", "/invite", UserPlus, true],
];

export default function Explore() {
  const t = useTheme();
  const { profile } = useAccount();
  const look = useAvatarLook(profile?.name);
  return (
    <Screen tab scroll>
      <TabHeader title="Explore">
        <MeButton name={profile?.name} />
      </TabHeader>
      <Serif size={36}>Money that behaves.</Serif>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 }}>
        {TILES.map(([title, sub, href, icon, wide]) => (
          <Pressable key={href} onPress={() => openKin(href)} accessibilityRole="button" accessibilityLabel={title}
            style={({ pressed }) => ({
              width: wide ? "100%" : "48.2%", gap: 12, borderRadius: 24, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 16,
              ...(wide ? { minHeight: 96, flexDirection: "row", alignItems: "center" } : { minHeight: 128, justifyContent: "space-between" }),
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}>
            {icon ? <IconTile icon={icon} brand={href === "/earmark"} /> : <Kinko look={look} size={48} />}
            <View style={{ flex: wide ? 1 : undefined, minWidth: 0 }}>
              <Text style={{ color: t.ink, fontSize: 16, fontWeight: "600" }}>{title}</Text>
              <Text style={{ color: t.muted, fontSize: 12 }}>{sub}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
