import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import { Band, IconTile, Screen, Serif, Text } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { categoryOf, loadFeed, type Item } from "@/lib/activity";
import { CATEGORIES } from "@/lib/categories";
import { formatMoney } from "@/lib/money";
import { useTheme } from "@/theme";

// Port of app/src/app/(tabs)/spends/page.tsx. Uses the full feed (server history), not just recent blocks.

type Category = (typeof CATEGORIES)[number];
const OTHER = CATEGORIES[CATEGORIES.length - 1];
const W = 320;
const H = 120;

/** Running total of spend across the month's days. */
function Chart({ daily, upTo }: { daily: bigint[]; upTo: number }) {
  const t = useTheme();
  const pts: number[] = [];
  for (const v of daily.slice(0, upTo)) pts.push((pts.at(-1) ?? 0) + Number(v));
  const max = Math.max(pts.at(-1) ?? 0, 1);
  const x = (i: number) => (daily.length > 1 ? (i / (daily.length - 1)) * W : 0);
  const y = (v: number) => H - 8 - (v / max) * (H - 16);
  const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = pts.length - 1;
  return (
    <View accessibilityLabel="Spending through the month" style={{ gap: 8 }}>
      <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={128} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((f) => (
          <Line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke={t.line} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        ))}
        {last >= 0 && (
          <>
            <Path d={`${line} L${x(last)},${H} L0,${H} Z`} fill={t.brandSoft} />
            <Path d={line} fill="none" stroke={t.brand} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {[1, Math.ceil(daily.length / 2), daily.length].map((d) => <Text key={d} style={{ color: t.muted, fontSize: 12 }}>{d}</Text>)}
      </View>
    </View>
  );
}

const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth();

export default function Spends() {
  const t = useTheme();
  const me = useAccount().profile?.address;
  const [items, setItems] = useState<Item[] | null>(null);
  const [month, setMonth] = useState(() => monthKey(new Date()));

  useEffect(() => {
    if (me) loadFeed(me).then(setItems).catch(() => setItems([]));
  }, [me]);

  const year = Math.floor(month / 12);
  const m = month % 12;
  const days = new Date(year, m + 1, 0).getDate();
  const now = new Date();
  const upTo = month === monthKey(now) ? now.getDate() : month > monthKey(now) ? 0 : days;
  const sent = (items ?? []).filter((i) => i.dir === "out" && monthKey(new Date(i.time)) === month);

  const daily = Array.from({ length: days }, () => 0n);
  const byCat = new Map<string, { cat: Category; total: bigint }>();
  let total = 0n;
  for (const i of sent) {
    daily[new Date(i.time).getDate() - 1] += i.amount;
    total += i.amount;
    const cat = categoryOf(i.hash) ?? OTHER;
    const e = byCat.get(cat.id) ?? { cat, total: 0n };
    e.total += i.amount;
    byCat.set(cat.id, e);
  }
  const cats = [...byCat.values()].sort((a, b) => (b.total > a.total ? 1 : -1));
  const pct = (v: bigint) => (total ? Number((v * 1000n) / total) / 10 : 0);
  const name = new Date(year, m).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const arrow = (disabled?: boolean) => ({ pressed }: { pressed: boolean }) =>
    ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.3 : 1, backgroundColor: pressed ? t.surface2 : "transparent" }) as const;
  const atNow = month >= monthKey(now);

  return (
    <Screen title="Spends" back scroll>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: -8 }}>
        <Pressable accessibilityLabel="Previous month" accessibilityRole="button" onPress={() => setMonth(month - 1)} style={arrow()}>
          <ChevronLeft color={t.ink} size={24} />
        </Pressable>
        <Text style={{ color: t.ink, fontWeight: "600" }}>{name}</Text>
        <Pressable accessibilityLabel="Next month" accessibilityRole="button" disabled={atNow} onPress={() => setMonth(month + 1)} style={arrow(atNow)}>
          <ChevronRight color={t.ink} size={24} />
        </Pressable>
      </View>

      <View style={{ alignItems: "center", gap: 8 }}>
        <Text style={{ color: t.muted, fontSize: 14 }}>You sent</Text>
        {items === null ? <View style={{ width: 192, height: 56, borderRadius: 16, backgroundColor: t.surface2 }} /> : <Serif size={56}>{formatMoney(total)}</Serif>}
      </View>

      <Chart daily={daily} upTo={upTo} />

      <View>
        <Band>By category</Band>
        {items !== null && cats.length === 0 && (
          <Text style={{ paddingVertical: 24, color: t.muted, fontSize: 14, textAlign: "center" }}>No spending this month. Nice and calm.</Text>
        )}
        {cats.map(({ cat, total: v }) => (
          <View key={cat.id} style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 12 }}>
            <IconTile icon={cat.icon} size={44} />
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ color: t.ink, fontWeight: "600" }}>{cat.label}</Text>
                <Serif size={18}>{formatMoney(v)}</Serif>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ flex: 1, height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: t.surface2 }}>
                  <View style={{ width: `${pct(v)}%`, height: "100%", borderRadius: 4, backgroundColor: t.brand }} />
                </View>
                <Text style={{ width: 48, textAlign: "right", color: t.muted, fontSize: 12, fontVariant: ["tabular-nums"] }}>{pct(v)}%</Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}
