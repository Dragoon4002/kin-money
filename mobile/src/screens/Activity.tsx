import { ArrowDownLeft, Link, Shapes } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { useMode } from "@/lib/config";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Avatar, Band, Chip, ErrorText, IconTile, Row as ListRow, Serif, Text } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { ago, cachedFeed, categoryOf, feedLabel, feedPayments, type Item } from "@/lib/activity";
import { forgetLink, myLinkIds, readLink, refundLink } from "@/lib/claimLink";
import { humanError } from "@/lib/errors";
import type { Address } from "viem";
import { openKin } from "@/lib/nav";
import { isActive } from "@/lib/live";
import { formatMoney } from "@/lib/money";
import { usePrivate } from "@/lib/privacy";
import { useNavPad } from "@/components/NavBar";
import { Grain, Label, MONO, P } from "@/components/gift/GiftNote";
import { useTheme } from "@/theme";

type Pending = { id: bigint; amount: bigint; expired: boolean; when: string };

async function pendingLinks(me: Address): Promise<Pending[]> {
  const out: Pending[] = [];
  for (const id of myLinkIds(me)) {
    const l = await readLink(id);
    const ms = l.expiresAt * 1000;
    const expired = Date.now() >= ms;
    if (l.settled) forgetLink(me, id);
    // ponytail: lib ago() is past-only; future = whole days left.
    else out.push({ id, amount: l.amount, expired, when: expired ? ago(ms) : `in ${Math.max(1, Math.ceil((ms - Date.now()) / 86_400_000))} d` });
  }
  return out;
}

const receipt = (i: Item) => openKin(`/details?tx=${i.hash}`);

type Filter = "all" | "out" | "in";
const FILTERS = [["all", "All"], ["out", "Sent"], ["in", "Received"]] as const;

// Same as web --fun-1..5 / funIndex.
const FUN = ["#22b573", "#f2b830", "#6c4ee0", "#ec5a7c", "#3b8cf0"];
const funBg = (name = "") => FUN[[...name].reduce((h, c) => h + c.charCodeAt(0), 0) % FUN.length];

/** Recent payment as a mini ticket stub: paper, colored band = the person (same paper as the receipt). */
function Moment({ item }: { item: Item }) {
  const out = item.dir === "out";
  const Icon = out ? (categoryOf(item.hash)?.icon ?? Shapes) : ArrowDownLeft;
  return (
    <Pressable onPress={() => receipt(item)} accessibilityRole="button"
      accessibilityLabel={`${out ? "Paid" : "Got"} ${formatMoney(item.amount)} ${out ? "to" : "from"} ${item.who}, ${item.when}. Open receipt`}
      style={({ pressed }) => ({ width: 144, height: 176, overflow: "hidden", borderRadius: 4, paddingHorizontal: 12, paddingBottom: 16, backgroundColor: P.paper,
        boxShadow: "0 6px 8px rgba(0,0,0,0.22), 0 1px 1px rgba(0,0,0,0.18)", transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <Grain />
      <View style={{ height: 8, marginHorizontal: -12, marginBottom: 12, backgroundColor: funBg(item.who) }} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Icon color={P.ink} size={22} />
        <Label>{out ? "PAID" : "GOT"}</Label>
      </View>
      <Text style={{ marginTop: "auto", color: P.ink, fontSize: 24, fontWeight: "700", letterSpacing: -0.5 }} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(item.amount)}</Text>
      <View style={{ marginVertical: 8, borderTopWidth: 2, borderStyle: "dashed", borderColor: P.line, opacity: 0.8 }} />
      <Text style={{ color: P.ink, fontFamily: MONO, fontSize: 12, fontWeight: "700" }} numberOfLines={1}>{out ? "TO" : "FROM"} {item.who}</Text>
      <Text style={{ color: P.muted, fontFamily: MONO, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" }} numberOfLines={1}>{item.when}</Text>
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
        {[0, 1, 2, 3].map((i) => <View key={i}>{bar(144, 176, 4)}</View>)}
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
  const navPad = useNavPad(); // content scrolls under the see-through nav
  const hide = usePrivate();
  const me = useAccount().profile?.address;
  const [raw, setRaw] = useState<{ mode: string; list: Awaited<ReturnType<typeof feedPayments>> } | null>(null);
  const all = raw?.mode === mode ? raw.list : me ? cachedFeed(me) : null; // this session's last list right away
  const [n, setN] = useState(FIRST);
  const [labelled, setItems] = useState<Item[] | null>(null);
  const items = all && labelled;
  const saved = all ? wireSavings(all.filter((i) => i.dir === "out").map((i) => i.amount)) : 0n;
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<Pending[]>([]);
  const [taking, setTaking] = useState<bigint | null>(null);
  const [linkErr, setLinkErr] = useState("");

  const refresh = useCallback(() => {
    if (!me) return Promise.resolve();
    pendingLinks(me).then(setLinks, () => {});
    return feedPayments(me).then((list) => setRaw({ mode, list }), () => {});
  }, [me, mode]);

  async function takeBack(id: bigint) {
    setTaking(id);
    setLinkErr("");
    try {
      await refundLink(id); // gasless forward request; resolves once it's in
      void refresh();
    } catch (e) {
      setLinkErr(humanError(e));
    } finally {
      setTaking(null);
    }
  }

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
    // ponytail: 10s poll while foregrounded (web polls 15s); push a refresh from live events if it feels slow.
    const id = setInterval(() => isActive() && void refresh(), 10_000);
    return () => clearInterval(id);
  }, [refresh, mode]); // mode: practice ↔ real money switches the list

  const shown = items?.filter((i) => filter === "all" || i.dir === filter) ?? [];
  const moments = items?.slice(0, 8) ?? [];
  const chip = (on: boolean) => ({ height: 40, borderRadius: 20, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", backgroundColor: on ? t.ink : t.surface2 }) as const;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingTop: 16, paddingBottom: navPad, gap: 16 }}
      scrollEventThrottle={200}
      onScroll={({ nativeEvent: e }) => hasMore && e.layoutMeasurement.height + e.contentOffset.y > e.contentSize.height - 300 && setN(items!.length + NEXT)}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={() => (setBusy(true), void refresh().finally(() => setBusy(false)))} tintColor={t.muted} colors={[t.brand]} />}>
      <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20 }}>
        <Text style={{ flex: 1, color: t.ink, fontSize: 20, fontWeight: "700" }}>Activity</Text>
        {([["/spends", "Spends"]] as const).map(([path, label]) => (
          <Pressable key={path} onPress={() => openKin(path)} accessibilityRole="button" style={({ pressed }) => [chip(false), { height: 44, borderRadius: 22, transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
            <Text style={{ color: t.ink, fontSize: 14, fontWeight: "600" }}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {saved > 0n && !hide && (
        <View style={{ gap: 4, paddingHorizontal: 20, alignItems: "flex-start" }}>
          <Chip good>You saved about {formatMoney(saved)} vs a bank wire</Chip>
          <Text style={{ color: t.muted, fontSize: 12, paddingHorizontal: 4 }}>Estimate: banks often charge 3% + $5 per transfer.</Text>
        </View>
      )}
      {items === null && <Skeleton />}
      {moments.length > 0 && (
        <View style={{ gap: 8 }}>
          <View style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 20 }}>
            <Text style={{ color: t.muted, fontFamily: MONO, fontSize: 12, fontWeight: "700", letterSpacing: 2.4 }}>MOMENTS</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={156} decelerationRate="fast" contentContainerStyle={{ gap: 12, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 }}>
            {moments.map((i) => <Moment key={`${i.hash}:${i.logIndex}`} item={i} />)}
          </ScrollView>
        </View>
      )}

      {links.length > 0 && (
        <View style={{ paddingHorizontal: 20 }}>
          <Band>Links waiting to be collected</Band>
          {links.map((l) => (
            <ListRow key={l.id.toString()} icon={<IconTile icon={Link} size={44} />} title={formatMoney(l.amount)}
              sub={l.expired ? `Not collected · expired ${l.when}` : `You can take it back ${l.when}`}
              trail={l.expired && (
                <Pressable onPress={() => takeBack(l.id)} disabled={taking !== null} accessibilityRole="button" accessibilityState={{ busy: taking === l.id }}
                  style={({ pressed }) => ({ height: 44, borderRadius: 22, paddingHorizontal: 16, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, opacity: taking !== null && taking !== l.id ? 0.45 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                  {taking === l.id && <ActivityIndicator color={t.ink} size="small" />}
                  <Text style={{ color: t.ink, fontSize: 14, fontWeight: "600" }}>Take it back</Text>
                </Pressable>
              )} />
          ))}
          {!!linkErr && <ErrorText>{linkErr}</ErrorText>}
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
