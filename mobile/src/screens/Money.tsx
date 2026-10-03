import { ChevronRight, type LucideIcon, PiggyBank } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import type { Address } from "viem";
import { Button, Chip, ErrorText, IconTile, MeButton, Screen, Serif, TabHeader, Text } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { getBalance } from "@/lib/activity";
import { API_BASE, publicClient } from "@/lib/config";
import { humanError } from "@/lib/errors";
import { formatMoney, getCurrency } from "@/lib/money";
import { openKin } from "@/lib/nav";
import { isJar, listPots } from "@/lib/programs";
import { useTheme } from "@/theme";

// Native port of app/src/app/(tabs)/money/page.tsx.

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
  const [jars, setJars] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    let on = true;
    const tick = () => getBalance(me).then((b) => on && setBalance(b)).catch(() => {});
    tick();
    listPots(me).then((ps) => {
      const js = ps.filter((p) => !p.closed && isJar(p));
      if (on && js.length) setJars(`${formatMoney(js.reduce((a, p) => a + p.balance, 0n))} saved · ${js.length} ${js.length === 1 ? "jar" : "jars"}`);
    }, () => {});
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

      <Row title="Savings jars" sub={jars ?? "Save toward something big"} icon={PiggyBank} onPress={() => openKin("/jars")} />
    </Screen>
  );
}
