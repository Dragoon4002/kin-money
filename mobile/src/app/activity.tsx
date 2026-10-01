import { ArrowDownLeft, ArrowUpRight } from "lucide-react-native";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { FlatList, RefreshControl, View } from "react-native";
import { Screen, Serif, Text } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { getBalance, loadActivity, type Item } from "@/lib/activity";
import { formatMoney } from "@/lib/money";
import { useTheme } from "@/theme";

const fetchAll = (me: Address) => Promise.all([getBalance(me).catch(() => null), loadActivity(me)]);

export default function Activity() {
  const t = useTheme();
  const me = useAccount().profile?.address;
  const [balance, setBalance] = useState<bigint | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);

  function apply([b, list]: [bigint | null, Item[]]) {
    setBalance(b);
    setItems(list);
    setBusy(false);
  }

  useEffect(() => {
    if (!me) return;
    let live = true;
    fetchAll(me).then((r) => live && apply(r));
    return () => {
      live = false;
    };
  }, [me]);

  function refresh() {
    if (!me) return;
    setBusy(true);
    void fetchAll(me).then(apply);
  }

  return (
    <Screen title="Activity" back>
      <View style={{ alignItems: "center", gap: 4 }}>
        <Text style={{ color: t.muted }}>Balance</Text>
        <Serif size={52}>{balance === null ? "…" : formatMoney(balance)}</Serif>
      </View>
      <FlatList
        data={items ?? []}
        keyExtractor={(i) => `${i.hash}:${i.logIndex}`}
        refreshControl={<RefreshControl refreshing={busy} onRefresh={refresh} tintColor={t.muted} colors={[t.brand]} />}
        ListEmptyComponent={<Text style={{ color: t.muted, textAlign: "center", marginTop: 24 }}>{items ? "No payments in the last little while." : "Loading…"}</Text>}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: t.line }} />}
        renderItem={({ item }) => {
          const Icon = item.dir === "in" ? ArrowDownLeft : ArrowUpRight;
          return (
            <View style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.surface2, alignItems: "center", justifyContent: "center" }}>
                <Icon color={t.ink} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontWeight: "600" }} numberOfLines={1}>{item.who}</Text>
                <Text style={{ color: t.muted, fontSize: 13 }}>{item.when}</Text>
              </View>
              <Text style={{ color: item.dir === "in" ? t.good : t.ink, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                {item.dir === "in" ? "+" : "−"}{formatMoney(item.amount)}
              </Text>
            </View>
          );
        }}
      />
    </Screen>
  );
}
