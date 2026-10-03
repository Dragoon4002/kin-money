import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import type { Address } from "viem";
import { Delivered } from "@/components/allowance/bits";
import { BILL_FOR, BillState, loadBillFor, saveBillFor, type BillFor } from "@/components/earmark/bill";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Choice, Empty, Loading, MoneyInput, Status, Who, WhoAvatar, useAction, useLoad, useMe, useBack } from "@/components/programs/kit";
import { Band, Button, ErrorText, Footer, Label, Row, Screen, Serif, Text } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { addr } from "@/lib/config";
import { recordPayment } from "@/lib/contacts";
import { formatMoney, fromLocal } from "@/lib/money";
import { createdId, expiryAfter, HOLD_DAYS, listEscrows, nowSec, same, ZERO, type Escrow } from "@/lib/programs";
import { call } from "@/lib/tx";
import { useTheme } from "@/theme";

// Port of app/src/app/earmark/page.tsx. Rows open /earmark/[id]. "Pay a bill": money that can only go to one payee
// (school, landlord, hospital), optionally held until a family member OKs it.

export default function EarmarkPage() {
  const t = useTheme();
  const me = useMe();
  const [creating, setCreating] = useState(false);
  const { data, error, reload } = useLoad(() => listEscrows(me!, "bill").then((r) => r.escrows), me);
  const ids = data?.map((e) => e.id).reverse() ?? [];
  const { data: what } = useLoad(() => loadBillFor(ids), ids.join(",") || undefined);
  // Back from a bill: it may have been paid.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reload is a fresh closure each render
  useFocusEffect(useCallback(() => reload(), []));

  if (creating) return <NewBill me={me} onClose={() => { setCreating(false); reload(); }} />;
  const open = data?.filter((e) => !e.settled) ?? [];
  const past = data?.filter((e) => e.settled) ?? [];

  return (
    <Screen title="Pay a bill" back scroll>
      <Text style={{ color: t.muted }}>Money that can only go to the school, landlord or hospital you choose.</Text>
      <ErrorText>{error}</ErrorText>
      {!data && !error && <Loading />}
      {data && !data.length && <Empty icon="bill" title="No bills yet" sub="Send money that can only pay the fees — and let family OK it first." />}
      {open.map((e) => <BillRow key={String(e.id)} e={e} me={me} what={what?.[String(e.id)]} />)}
      {past.length > 0 && <Band>Done</Band>}
      {past.map((e) => <BillRow key={String(e.id)} e={e} me={me} what={what?.[String(e.id)]} />)}
      <Footer>
        <Button title="Pay a bill" onPress={() => setCreating(true)} />
      </Footer>
    </Screen>
  );
}

function BillRow({ e, me, what }: { e: Escrow; me?: Address; what?: BillFor }) {
  return (
    <Row
      onPress={() => router.push({ pathname: "/earmark/[id]", params: { id: String(e.id) } })}
      icon={<WhoAvatar a={e.to} size={44} />}
      title={<>{what ? `${BILL_FOR[what].label} · ` : ""}{same(e.from, me) ? <>To <Who a={e.to} me={me} you="you" /></> : <>From <Who a={e.from} me={me} /></>}</>}
      sub={<BillState e={e} me={me} />}
      trail={<Serif size={24}>{formatMoney(e.amount)}</Serif>}
    />
  );
}

const FOR_OPTIONS = (Object.keys(BILL_FOR) as BillFor[]).map((k) => ({ value: k, label: BILL_FOR[k].short }));

function NewBill({ me, onClose }: { me?: Address; onClose: () => void }) {
  useBack(onClose);
  const t = useTheme();
  const [payee, setPayee] = useState<Person | null>(null);
  const [checker, setChecker] = useState<Person | null>(null);
  const [amount, setAmount] = useState("");
  const [what, setWhat] = useState<BillFor | "">("");
  const [done, setDone] = useState(false);
  const { busy, status, error, run } = useAction();
  const value = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const selfCheck = same(checker?.address, me);

  async function send() {
    if (!payee || !value || selfCheck) return;
    const ok = await run(async (say) => {
      const hash = await call(addr.escrow, KinEscrowAbi, "create", [payee.address, ZERO, checker?.address ?? ZERO, 0, expiryAfter(nowSec()), 0], { fund: value });
      say("Holding it safely…");
      if (what) void saveBillFor(await createdId(hash, KinEscrowAbi, "Created"), what);
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
      <View style={{ gap: 6 }}>
        <Label>What&apos;s it for?</Label>
        <Choice<BillFor | ""> options={FOR_OPTIONS} value={what} onChange={setWhat} />
      </View>
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
