import { useLocalSearchParams } from "expo-router";
import { ShieldCheck } from "lucide-react-native";
import { View } from "react-native";
import type { Address } from "viem";
import type { Invoice as Meta } from "@/components/invoice/meta";
import { MarkDone, PartChip } from "@/components/invoice/parts";
import { Loading, Status, Who, WhoAvatar, dateLabel, timeLeft, useAction, useLoad, useMe, useNow } from "@/components/programs/kit";
import { Amount, Card } from "@/components/trips/bits";
import { Button, Chip, ErrorText, Screen, Serif, Text } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { addr } from "@/lib/config";
import { api, recordPayment } from "@/lib/contacts";
import { formatMoney } from "@/lib/money";
import { canRelease, getEscrow, same, type Escrow } from "@/lib/programs";
import { call } from "@/lib/tx";
import { useTheme } from "@/theme";

// Port of app/src/app/invoice/[id]/page.tsx. /invoice/12-13-14 — one held payment per part. Names/dues/"done" from /api/invoices (older links: ?t=Logo).

export default function Invoice() {
  const t = useTheme();
  const { id = "", t: rawTitle } = useLocalSearchParams<{ id: string; t?: string }>();
  const title = rawTitle?.slice(0, 60);
  const me = useMe();
  const ids = id.split("-").filter((x) => /^\d+$/.test(x)).slice(0, 3).map(BigInt);
  const { data, error, reload } = useLoad(() => Promise.all(ids.map(getEscrow)), me && id); // wait for me: only the two sides see it
  const { data: inv, reload: reloadInv } = useLoad(() => api<Meta | null>(`/api/invoices?e=${ids[0]}`).catch(() => null), me && ids.length ? `${id}-${me}` : undefined);

  if (!data) return <Screen title="Invoice" back>{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  const first = data[0];
  if (!first || data.some((e) => e.kind !== "invoice" || ![e.from, e.to, e.approver].some((a) => same(a, me)))) {
    return <Screen title="Invoice" back><ErrorText>We couldn&apos;t find this invoice.</ErrorText></Screen>;
  }
  const paid = data.filter((e) => e.settled).reduce((a, e) => a + e.amount, 0n);
  const total = data.reduce((a, e) => a + e.amount, 0n);
  const iWork = same(first.to, me);

  return (
    <Screen title={inv?.title || title || "Invoice"} back scroll>
      <Card style={{ alignItems: "center", gap: 8, paddingVertical: 24 }}>
        <View style={{ flexDirection: "row" }}>
          <WhoAvatar a={first.from} size={48} />
          <View style={{ marginLeft: -12 }}><WhoAvatar a={first.to} size={48} /></View>
        </View>
        <Text style={{ color: t.muted, fontSize: 14 }}>
          <Who a={first.from} me={me} /> → <Who a={first.to} me={me} you="you" />
        </Text>
        <Amount value={formatMoney(total)} size={64} />
        <View style={{ alignItems: "center" }}>{paid === total ? <Chip good>All paid ✓✓</Chip> : <Chip>{formatMoney(paid)} paid so far</Chip>}</View>
      </Card>
      {data.map((e, i) => {
        const n = inv?.escrows.indexOf(String(e.id)) ?? -1;
        const meta = n >= 0 ? { inv: inv!, n } : undefined;
        return <Part key={String(e.id)} e={e} n={i + 1} many={data.length > 1} me={me} iWork={iWork} meta={meta} onDone={() => (reload(), reloadInv())} />;
      })}
    </Screen>
  );
}

function Part({ e, n, many, me, iWork, meta, onDone }: { e: Escrow; n: number; many: boolean; me?: Address; iWork: boolean; meta?: { inv: Meta; n: number }; onDone: () => void }) {
  const p = meta?.inv.parts[meta.n];
  const t = useTheme();
  const now = useNow();
  const { busy, status, error, run } = useAction();
  const iPay = same(e.approver, me) && !e.settled;
  const due = canRelease(e, now);

  async function act(fn: "approve" | "release") {
    const ok = await run(async (say) => {
      await call(addr.escrow, KinEscrowAbi, fn, [e.id]);
      say("Paying…");
      return true;
    });
    if (ok) {
      if (fn === "approve") void recordPayment(e.to, e.amount);
      onDone();
    }
  }

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontWeight: "600" }}>{p?.name ?? (many ? `Part ${n}` : "Payment")}</Text>
        <Serif size={30}>{formatMoney(e.amount)}</Serif>
      </View>
      {p && <PartChip p={p} settled={e.settled} iWork={iWork} />}
      {e.settled ? (
        !p && <Chip good>Paid ✓✓</Chip>
      ) : due ? (
        <Text style={{ color: t.muted, fontSize: 14 }}>No reply in time — ready to pay out.</Text>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <ShieldCheck color={t.muted} size={16} />
            <Text style={{ color: t.muted, fontSize: 14 }}>Held safely</Text>
          </View>
          <Text style={{ color: t.ink, fontSize: 14, fontWeight: "500", fontVariant: ["tabular-nums"] }}>Pays itself in {timeLeft(e.autoApproveAt - now)}</Text>
        </View>
      )}
      {!e.settled && !due && <Text style={{ color: t.muted, fontSize: 12 }}>On {dateLabel(e.autoApproveAt)}, unless it&apos;s OK&apos;d sooner.</Text>}
      <ErrorText>{error}</ErrorText>
      <Status>{busy && status}</Status>
      {meta && p && iWork && !p.done && !e.settled && <MarkDone id={meta.inv.id} n={meta.n} onDone={onDone} />}
      {iPay && !due && <Button title="Work looks good — pay" onPress={() => act("approve")} busy={busy} />}
      {due && !e.settled && <Button title={iWork ? `Collect ${formatMoney(e.amount)}` : "Pay out now"} variant={iWork ? "primary" : "soft"} onPress={() => act("release")} busy={busy} />}
    </Card>
  );
}
