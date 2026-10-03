import { ChevronRight, House, ListChecks, type LucideIcon, PiggyBank, RefreshCcw, Sprout } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import type { Address } from "viem";
import { Button, Chip, ErrorText, IconTile, MeButton, Screen, Serif, TabHeader, Text } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { getBalance, loadActivity } from "@/lib/activity";
import { API_BASE, publicClient } from "@/lib/config";
import { humanError } from "@/lib/errors";
import { formatMoney, getCurrency } from "@/lib/money";
import { openKin } from "@/lib/nav";
import { useTheme } from "@/theme";

// Native port of app/src/app/(tabs)/money/page.tsx. Pockets open their web page (no native screens yet).
// ponytail: idle line only; web's live per-pocket summaries need the programs lib ported.
const POCKETS: [string, string, string, LucideIcon][] = [
  ["Live allowance", "/allowance", "Grows every second", Sprout],
  ["Savings jars", "/jars", "Save toward something big", PiggyBank],
  ["Family pots", "/pot", "Chip in together", House],
  ["Circles", "/circle", "Save as a group, take turns", RefreshCcw],
  ["Chores", "/chores", "Earn for helping out", ListChecks],
];

// ponytail: rough bank-wire cost (3% + $5 per transfer) — an estimate, labelled as such in the UI.
const WIRE_FLAT = 5_000_000n;
const wireSavings = (sent: bigint[]) => sent.reduce((a, v) => a + (v * 3n) / 100n + WIRE_FLAT, 0n);

function Row({ title, sub, onPress, icon }: { title: string; sub: string; onPress: () => void; icon?: LucideIcon }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => ({ minHeight: icon ? 80 : 64, flexDirection: "row", alignItems: "center", gap: 16, borderRadius: 24, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 16, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      {icon && <IconTile icon={icon} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: t.ink, fontSize: 16, fontWeight: "600" }}>{title}</Text>
        <Text numberOfLines={1} style={{ color: t.muted, fontSize: 14 }}>{sub}</Text>
      </View>
      <ChevronRight color={t.muted} size={20} />
    </Pressable>
  );
}

export default function Money() {
  const t = useTheme();
  const { profile } = useAccount();
  const me = profile?.address;
  const [balance, setBalance] = useState<bigint | null>(null);
  const [adding, setAdding] = useState<"idle" | "busy" | "done" | "had">("idle");
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(0n);

  useEffect(() => {
    if (!me) return;
    let on = true;
    const tick = () => getBalance(me).then((b) => on && setBalance(b)).catch(() => {});
    tick();
    loadActivity(me).then((items) => on && setSaved(wireSavings(items.filter((i) => i.dir === "out").map((i) => i.amount)))).catch(() => {});
    const iv = setInterval(tick, 6000);
    return () => {
      on = false;
      clearInterval(iv);
    };
  }, [me]);

  async function addMoney(me: Address) {
    setAdding("busy");
    setErr("");
    try {
      const res = await fetch(`${API_BASE}/api/faucet`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: me }) });
      if (res.status === 429) throw new Error("network: slow down");
      const body = (await res.json()) as { hash?: `0x${string}`; skipped?: boolean };
      if (!res.ok) throw new Error("network: faucet");
      if (body.skipped) return setAdding("had");
      if (body.hash) await publicClient.waitForTransactionReceipt({ hash: body.hash });
      setBalance(await getBalance(me));
      setAdding("done");
    } catch (e) {
      setErr(humanError(e));
      setAdding("idle");
    }
  }

  return (
    <Screen tab scroll>
      <TabHeader title="Money">
        <MeButton name={profile?.name} />
      </TabHeader>

      <View style={{ overflow: "hidden", borderRadius: 32, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 24 }}>
        <View pointerEvents="none" style={{ position: "absolute", right: -64, top: -64, width: 192, height: 192, borderRadius: 96, backgroundColor: t.brandSoft }} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: t.muted, fontSize: 14 }}>Total balance</Text>
          <Chip>Practice money</Chip>
        </View>
        <View style={{ marginTop: 12, minHeight: 64, justifyContent: "center" }}>
          {balance === null ? (
            <View style={{ width: 208, height: 56, borderRadius: 16, backgroundColor: t.surface2 }} />
          ) : (
            <Serif size={60}>{formatMoney(balance)}</Serif>
          )}
        </View>
        {balance !== null && getCurrency() !== "USD" && <Text style={{ color: t.muted, fontSize: 14, marginTop: 4, fontVariant: ["tabular-nums"] }}>{formatMoney(balance, "USD")}</Text>}
        <View style={{ marginTop: 24 }}>
          <Button
            title={adding === "done" ? "Added ✓" : adding === "had" ? "You already have practice money" : "Add practice money"}
            onPress={() => me && void addMoney(me)} busy={adding === "busy"} disabled={adding === "done" || adding === "had"} />
          {adding === "busy" && <Text style={{ color: t.muted, fontSize: 14, textAlign: "center", marginTop: 12 }}>Adding practice money — a few seconds…</Text>}
        </View>
      </View>
      <ErrorText>{err}</ErrorText>

      <Row title="Cash out to bank" sub="Arrives in 1–2 days · no fee" onPress={() => openKin("/cashout")} />
      {saved > 0n && (
        <View style={{ gap: 4 }}>
          <Chip good>You saved about {formatMoney(saved)} vs a bank wire</Chip>
          <Text style={{ color: t.muted, fontSize: 12, paddingHorizontal: 4 }}>Estimate: banks often charge 3% + $5 per transfer.</Text>
        </View>
      )}

      <Text style={{ marginTop: 8, color: t.muted, fontSize: 12, fontWeight: "600", letterSpacing: 1.5, textTransform: "uppercase" }}>Pockets</Text>
      <View style={{ gap: 12 }}>
        {POCKETS.map(([title, href, idle, icon]) => (
          <Row key={href} title={title} sub={idle} icon={icon} onPress={() => openKin(href)} />
        ))}
      </View>
    </Screen>
  );
}
