import { useLocalSearchParams } from "expo-router";
import { Check } from "lucide-react-native";
import type { ReactNode } from "react";
import { View } from "react-native";
import { parseEventLogs } from "viem";
import { BILL_FOR, BillActions, BillState, loadBillFor } from "@/components/earmark/bill";
import { Loading, Who, WhoAvatar, dateLabel, useLoad, useMe } from "@/components/programs/kit";
import { Amount, Card } from "@/components/trips/bits";
import { Band, ErrorText, Footer, IconTile, Row, Screen, Text } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { addr } from "@/lib/config";
import { ICON } from "@/lib/icons";
import { formatMoney } from "@/lib/money";
import { getEscrow, history, same, ZERO } from "@/lib/programs";
import { useTheme } from "@/theme";

// Port of app/src/app/earmark/[id]/page.tsx. One bill: what it's for, who pays whom, where it's at, and my next step.

type Step = { text: ReactNode; at?: number; done: boolean };

/** Bill + its events from the shared escrow history. */
async function loadBill(id: bigint) {
  const [e, logs, what] = await Promise.all([
    getEscrow(id),
    history(addr.escrow).then((l) => parseEventLogs({ abi: KinEscrowAbi, logs: l })).catch(() => []),
    loadBillFor([id]),
  ]);
  const evs = logs.filter((l) => "id" in l.args && l.args.id === id);
  // Seconds; 0 = happened but time unknown (fresh logs may lack it), undefined = didn't happen (or history is down).
  const at = (name: string) => {
    const l = evs.find((x) => x.eventName === name);
    return l ? Number(l.blockTimestamp ?? 0) : undefined;
  };
  return { e, what: what[String(id)], created: at("Created"), approved: at("Approved"), released: at("Released"), refunded: at("Refunded") };
}

export default function BillPage() {
  const t = useTheme();
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const valid = /^\d{1,30}$/.test(id);
  const { data, error, reload } = useLoad(() => loadBill(BigInt(id)), valid && me ? id : undefined);

  if (!valid || (data && data.e.kind !== "bill")) return <Screen title="Bill" back><ErrorText>We couldn&apos;t find this bill.</ErrorText></Screen>;
  if (!data) return <Screen title="Bill" back>{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  const { e, what } = data;
  const f = what ? BILL_FOR[what] : null;
  const back = data.refunded !== undefined;

  const steps: Step[] = [
    { text: <><Who a={e.from} me={me} /> set {f ? "it" : "the money"} aside</>, at: data.created, done: true },
    ...(e.approver !== ZERO && !back
      ? [{ text: e.approved ? <><Who a={e.approver} me={me} /> OK&apos;d the bill</> : <>Waiting for <Who a={e.approver} me={me} you="your" />{same(e.approver, me) ? "" : "'s"} OK</>, at: data.approved, done: e.approved }]
      : []),
    back
      ? { text: <>Came back to <Who a={e.from} me={me} you="you" /></>, at: data.refunded, done: true }
      : { text: e.settled ? <>Paid to <Who a={e.to} me={me} you="you" /> ✓✓</> : <><Who a={e.to} me={me} /> collects it</>, at: data.released, done: e.settled },
  ];

  return (
    <Screen title={f?.label ?? "Bill"} back scroll>
      <Card style={{ alignItems: "center", gap: 8, paddingVertical: 28 }}>
        <IconTile icon={ICON[f?.icon ?? "bill"]} size={56} brand />
        <Text style={{ color: t.muted, fontSize: 14 }}>{f?.label ?? "Bill"} for <Who a={e.to} me={me} you="you" /></Text>
        <Amount value={formatMoney(e.amount)} size={64} />
        <BillState e={e} me={me} />
      </Card>
      <Band>Who</Band>
      <Row icon={<WhoAvatar a={e.from} size={40} />} title={<Who a={e.from} me={me} />} sub="Set the money aside" />
      <Row icon={<WhoAvatar a={e.to} size={40} />} title={<Who a={e.to} me={me} />} sub="Gets paid — school, landlord, hospital" />
      {e.approver !== ZERO && <Row icon={<WhoAvatar a={e.approver} size={40} />} title={<Who a={e.approver} me={me} />} sub="Checks the bill first" />}
      <Band>What happened</Band>
      {steps.map((s, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={{ marginTop: 2, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", ...(s.done ? { backgroundColor: t.good } : { borderWidth: 2, borderColor: t.line }) }}>
            {s.done && <Check color={t.bg} size={14} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: s.done ? t.ink : t.muted, fontSize: 16 }}>{s.text}</Text>
            {!!s.at && <Text style={{ color: t.muted, fontSize: 12 }}>{dateLabel(s.at)}</Text>}
          </View>
        </View>
      ))}
      {!e.settled && e.expiresAt > 0 && (
        <Text style={{ color: t.muted, fontSize: 12 }}>If it isn&apos;t paid by {dateLabel(e.expiresAt)}, it can go back to <Who a={e.from} me={me} you="you" />.</Text>
      )}
      <Footer>
        <BillActions e={e} me={me} onDone={reload} />
      </Footer>
    </Screen>
  );
}
