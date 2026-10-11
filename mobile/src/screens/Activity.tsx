import { ArrowDownLeft, Shapes } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useMode } from "@/lib/config";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Avatar, Chip, Serif, Text } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { cachedFeed, categoryOf, feedLabel, feedPayments, type Item } from "@/lib/activity";
import { openKin } from "@/lib/nav";
import { isActive } from "@/lib/live";
import { formatMoney } from "@/lib/money";
import { useTheme } from "@/theme";

// ponytail: no native receipt/spends/requests screens yet — open the web pages in the in-app browser.
const receipt = (i: Item) => openKin(`/details?tx=${i.hash}`);

type Filter = "all" | "out" | "in";
const FILTERS = [["all", "All"], ["out", "Sent"], ["in", "Received"]] as const;

// Same as web --fun-1..5 / funIndex.
const FUN = ["#22b573", "#f2b830", "#6c4ee0", "#ec5a7c", "#3b8cf0"];
const funBg = (name = "") => FUN[[...name].reduce((h, c) => h + c.charCodeAt(0), 0) % FUN.length];

/** Bright card for a recent payment. */
function Moment({ item }: { item: Item }) {
  const out = item.dir === "out";
  const Icon = out ? (categoryOf(item.hash)?.icon ?? Shapes) : ArrowDownLeft;
  return (
    <Pressable onPress={() => receipt(item)} accessibilityRole="button"
      style={({ pressed }) => ({ width: 144, height: 160, borderRadius: 28, padding: 16, justifyContent: "space-between", backgroundColor: funBg(item.who), transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <Icon color="#fff" size={28} />
      <View style={{ gap: 4 }}>
        <Serif size={24} color="#fff">{formatMoney(item.amount)}</Serif>
        <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600", lineHeight: 17 }} numberOfLines={2}>{out ? `paid to ${item.who}` : `from ${item.who}`}</Text>
        <Text style={{ color: "#fff", fontSize: 12, opacity: 0.8 }}>{item.when}</Text>
      </View>
    </Pressable>
  );
}

function Row({ item }: { item: Item }) {
  const t = useTheme();
  const inbound = item.dir === "in";
  const cat = inbound ? null : categoryOf(item.hash);
  return (
    <Pressable onPress={() => receipt(item)} accessibilityRole="button"
      style={({ pressed }) => ({ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: pressed ? t.surface2 : "transparent" })}>
      <Avatar name={item.who} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: t.ink, fontWeight: "600" }} numberOfLines={1}>{item.who}</Text>
        <Text style={{ color: t.muted, fontSize: 14 }} numberOfLines={1}>
          {inbound ? "Received" : "Sent"} · {item.when}{cat ? ` · ${cat.label}` : ""}
        </Text>
      </View>
      <Serif size={20} color={inbound ? t.good : t.ink}>{inbound ? "+" : "−"}{formatMoney(item.amount)}</Serif>
    </Pressable>
  );
}

// ponytail: rough bank-wire cost (3% + $5 per transfer) — an estimate, labelled as such in the UI.
const WIRE_FLAT = 5_000_000n; // $5 in base units
const wireSavings = (sent: bigint[]) => sent.reduce((a, v) => a + (v * 3n) / 100n + WIRE_FLAT, 0n);

// Names are looked up per payment: label the newest FIRST, then NEXT more, then NEXT per scroll (same as web).
const FIRST = 5;
const NEXT = 10;

function Skeleton() {
  const t = useTheme();
  const bar = (w: number, h: number, r: number) => <View style={{ width: w, height: h, borderRadius: r, backgroundColor: t.surface2 }} />;
  return (
    <View style={{ gap: 12 }} accessibilityLabel="Loading">
      <View style={{ paddingHorizontal: 20 }}>{bar(128, 28, 14)}</View>
      <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 20, overflow: "hidden" }}>
        {[0, 1, 2, 3].map((i) => <View key={i}>{bar(144, 160, 28)}</View>)}
      </View>
    </View>
  );
}

function SkeletonRows({ n }: { n: number }) {
  const t = useTheme();
  return (
    <View style={{ gap: 16, paddingHorizontal: 20, paddingVertical: 8 }}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.surface2 }} />
          <View style={{ width: 160, height: 16, borderRadius: 8, backgroundColor: t.surface2 }} />
        </View>
      ))}
    </View>
  );
}

export default function Activity() {
  const mode = useMode();
  const t = useTheme();
  const me = useAccount().profile?.address;
  const [raw, setRaw] = useState<{ mode: string; list: Awaited<ReturnType<typeof feedPayments>> } | null>(null);
  const all = raw?.mode === mode ? raw.list : me ? cachedFeed(me) : null; // this session's last list right away
  const [n, setN] = useState(FIRST);
  const [labelled, setItems] = useState<Item[] | null>(null);
  const items = all && labelled;
  const saved = all ? wireSavings(all.filter((i) => i.dir === "out").map((i) => i.amount)) : 0n;
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    if (!me) return Promise.resolve();
    return feedPayments(me).then((list) => setRaw({ mode, list }), () => {});
  }, [me, mode]);

  // Label the newest n payments; once the first FIRST show, queue NEXT more.
  useEffect(() => {
    if (!me || !all) return;
    let live = true;
    feedLabel(all.slice(0, n), me)
      .then((it) => {
        if (!live) return;
        setItems(it);
        if (n === FIRST) setN(FIRST + NEXT);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [all, n, me]);

  // Near the bottom: NEXT more (one step per finished page).
  const hasMore = !!all && !!items && n > FIRST && items.length === n && n < all.length;

  useEffect(() => {
    void refresh();
    // ponytail: 10s poll while foregrounded (web polls 4s); push a refresh from live events if it feels slow.
    const id = setInterval(() => isActive() && void refresh(), 10_000);
    return () => clearInterval(id);
  }, [refresh, mode]); // mode: practice ↔ real money switches the list

  const shown = items?.filter((i) => filter === "all" || i.dir === filter) ?? [];
  const moments = items?.slice(0, 8) ?? [];
  const chip = (on: boolean) => ({ height: 40, borderRadius: 20, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", backgroundColor: on ? t.ink : t.surface2 }) as const;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingTop: 16, paddingBottom: 120, gap: 16 }}
      scrollEventThrottle={200}
      onScroll={({ nativeEvent: e }) => hasMore && e.layoutMeasurement.height + e.contentOffset.y > e.contentSize.height - 300 && setN(items!.length + NEXT)}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={() => (setBusy(true), void refresh().finally(() => setBusy(false)))} tintColor={t.muted} colors={[t.brand]} />}>
      <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20 }}>
        <Text style={{ flex: 1, color: t.ink, fontSize: 20, fontWeight: "700" }}>Activity</Text>
        {([["/requests", "Requests"], ["/spends", "Spends"]] as const).map(([path, label]) => (
          <Pressable key={path} onPress={() => openKin(path)} accessibilityRole="button" style={({ pressed }) => [chip(false), { height: 44, borderRadius: 22, transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
            <Text style={{ color: t.ink, fontSize: 14, fontWeight: "600" }}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {saved > 0n && (
        <View style={{ gap: 4, paddingHorizontal: 20, alignItems: "flex-start" }}>
          <Chip good>You saved about {formatMoney(saved)} vs a bank wire</Chip>
          <Text style={{ color: t.muted, fontSize: 12, paddingHorizontal: 4 }}>Estimate: banks often charge 3% + $5 per transfer.</Text>
        </View>
      )}
      {items === null && <Skeleton />}
      {moments.length > 0 && (
        <View style={{ gap: 12 }}>
          <View style={{ paddingHorizontal: 20 }}><Serif size={26}>Moments</Serif></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={156} decelerationRate="fast" contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}>
            {moments.map((i) => <Moment key={`${i.hash}:${i.logIndex}`} item={i} />)}
          </ScrollView>
        </View>
      )}

      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 20 }} accessibilityRole="tablist">
        {FILTERS.map(([v, label]) => (
          <Pressable key={v} onPress={() => setFilter(v)} accessibilityRole="tab" accessibilityState={{ selected: v === filter }} style={chip(v === filter)}>
            <Text style={{ color: v === filter ? t.bg : t.muted, fontSize: 14, fontWeight: "600" }}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <View>
        {items === null ? (
          <SkeletonRows n={5} />
        ) : shown.length === 0 ? (
          <Text style={{ color: t.muted, fontSize: 14, textAlign: "center", paddingVertical: 24, paddingHorizontal: 20 }}>
            {items.length === 0 ? "No payments yet. Money you send or get shows up here." : "Nothing here yet."}
          </Text>
        ) : (
          shown.map((i) => <Row key={`${i.hash}:${i.logIndex}`} item={i} />)
        )}
        {hasMore && <SkeletonRows n={2} />}
      </View>
    </ScrollView>
  );
}
