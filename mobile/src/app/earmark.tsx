import { useState } from "react";
import { View } from "react-native";
import type { Address } from "viem";
import { Card, Delivered } from "@/components/allowance/bits";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Empty, Loading, MoneyInput, Status, Who, WhoAvatar, dateLabel, useAction, useLoad, useMe, useNow, useBack } from "@/components/programs/kit";
import { Band, Button, ErrorText, Footer, Screen, Serif, Text } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { addr } from "@/lib/config";
import { recordPayment } from "@/lib/contacts";
import { formatMoney, fromLocal } from "@/lib/money";
import { canRelease, expiryAfter, HOLD_DAYS, listEscrows, nowSec, same, ZERO, type Escrow } from "@/lib/programs";
import { call } from "@/lib/tx";
import { useTheme } from "@/theme";

// Port of app/src/app/earmark/page.tsx. "Pay a bill": money that can only go to one payee
// (school, landlord, hospital), optionally held until a family member OKs it.

export default function EarmarkPage() {
  const t = useTheme();
  const me = useMe();
  const [creating, setCreating] = useState(false);
  const { data, error, reload } = useLoad(() => listEscrows(me!, "bill").then((r) => r.escrows), me);

  if (creating) return <NewBill me={me} onClose={() => { setCreating(false); reload(); }} />;
  const open = data?.filter((e) => !e.settled) ?? [];
  const past = data?.filter((e) => e.settled) ?? [];

  return (
    <Screen title="Pay a bill" back scroll>
      <Text style={{ color: t.muted }}>Money that can only go to the school, landlord or hospital you choose.</Text>
      <ErrorText>{error}</ErrorText>
      {!data && !error && <Loading />}
      {data && !data.length && <Empty icon="bill" title="No bills yet" sub="Send money that can only pay the fees — and let family OK it first." />}
      {open.map((e) => <Bill key={String(e.id)} e={e} me={me} onDone={reload} />)}
      {past.length > 0 && <Band>Done</Band>}
      {past.map((e) => <Bill key={String(e.id)} e={e} me={me} onDone={reload} />)}
      <Footer>
        <Button title="Pay a bill" onPress={() => setCreating(true)} />
      </Footer>
    </Screen>
  );
}

function Bill({ e, me, onDone }: { e: Escrow; me?: Address; onDone: () => void }) {
  const t = useTheme();
  const now = useNow(30_000);
  const { busy, status, error, run } = useAction();
  const iApprove = same(e.approver, me) && !e.approved;
  const iCollect = same(e.to, me) && canRelease(e, now);
  const iRefund = same(e.from, me) && !e.settled && !!e.expiresAt && now >= e.expiresAt;

  async function act(fn: "approve" | "release" | "refund") {
    const ok = await run(async () => (await call(addr.escrow, KinEscrowAbi, fn, [e.id]), true));
    if (ok) {
      if (fn === "approve") void recordPayment(e.to, e.amount);
      onDone();
    }
  }

  const state = e.settled
    ? <Text style={{ color: t.good }}>Paid ✓✓</Text>
    : e.approver === ZERO || e.approved
      ? <Text style={{ color: t.brand }}>Ready for <Who a={e.to} me={me} you="you" /> to collect</Text>
      : <Text style={{ color: t.warn }}>Waiting for <Who a={e.approver} me={me} you="your" />{same(e.approver, me) ? "" : "'s"} OK</Text>;

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <WhoAvatar a={e.to} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: t.ink, fontWeight: "600" }}>To <Who a={e.to} me={me} you="you" /></Text>
          <Text numberOfLines={1} style={{ marginTop: 4, fontSize: 13, fontWeight: "600" }}>{state}</Text>
        </View>
        <Serif size={24}>{formatMoney(e.amount)}</Serif>
      </View>
      {!e.settled && same(e.from, me) && !iRefund && e.expiresAt > 0 && (
        <Text style={{ color: t.muted, fontSize: 12 }}>If it isn&apos;t paid by {dateLabel(e.expiresAt)}, it comes back to you.</Text>
      )}
      <ErrorText>{error}</ErrorText>
      <Status>{busy && status}</Status>
      {iApprove && <Button title="Bill looks right — pay it" onPress={() => act("approve")} busy={busy} />}
      {!iApprove && iCollect && <Button title={`Collect ${formatMoney(e.amount)}`} onPress={() => act("release")} busy={busy} />}
      {iRefund && <Button title="Take it back" variant="soft" onPress={() => act("refund")} busy={busy} />}
    </Card>
  );
}

function NewBill({ me, onClose }: { me?: Address; onClose: () => void }) {
  useBack(onClose);
  const t = useTheme();
  const [payee, setPayee] = useState<Person | null>(null);
  const [checker, setChecker] = useState<Person | null>(null);
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState(false);
  const { busy, status, error, run } = useAction();
  const value = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const selfCheck = same(checker?.address, me);

  async function send() {
    if (!payee || !value || selfCheck) return;
    const ok = await run(async (say) => {
      await call(addr.escrow, KinEscrowAbi, "create", [payee.address, ZERO, checker?.address ?? ZERO, 0, expiryAfter(nowSec()), 0], { fund: value });
      say("Holding it safely…");
      return true;
    });
    if (ok) {
      void recordPayment(payee.address, value);
      setDone(true);
    }
  }

  if (done) {
    return (
      <Screen>
        <Delivered
          title={`${formatMoney(value)} set aside`}
          subtitle={checker ? `Held safely until @${checker.name} OKs the bill. Then @${payee!.name} gets paid.` : `Only @${payee!.name} can collect it.`}
        />
        <Footer>
          <Button title="Done" onPress={onClose} />
        </Footer>
      </Screen>
    );
  }

  return (
    <Screen title="Pay a bill" scroll>
      <PersonPicker label="Who gets paid? School, landlord, hospital…" onPick={setPayee} />
      <MoneyInput label="Amount" value={amount} onChange={setAmount} />
      <PersonPicker label="Who checks the bill first? (optional)" onPick={setChecker} />
      <Text style={{ marginTop: -8, color: t.muted, fontSize: 12 }}>
        {selfCheck
          ? "Pick someone else — or leave it empty."
          : checker
            ? `Money stays held until @${checker.name} OKs it. If it isn't paid in ${HOLD_DAYS} days, it comes back to you.`
            : "Leave empty and they can collect it straight away."}
      </Text>
      <ErrorText>{error}</ErrorText>
      <Footer>
        <Status>{busy && status}</Status>
        <Button title={value ? `Send ${formatMoney(value)}` : "Send"} onPress={send} busy={busy} disabled={!payee || !value || selfCheck} />
        <Button title="Cancel" variant="ghost" onPress={onClose} disabled={busy} />
      </Footer>
    </Screen>
  );
}
