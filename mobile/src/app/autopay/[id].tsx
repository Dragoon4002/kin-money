import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { DoneNote } from "@/components/allowance/bits";
import { Loading, Sheet, Status, Who, WhoAvatar, dateLabel, timeLeft, useAction, useLoad, useMe, useNow } from "@/components/programs/kit";
import { Band, Button, Chip, ErrorText, Footer, Row, Screen, Serif, Text } from "@/components/ui";
import { KinMandateAbi } from "@/lib/abi";
import { addr } from "@/lib/config";
import { recordPayment } from "@/lib/contacts";
import { dueCount, getMandate, isDone, nextDue, unitOf, type Mandate } from "@/lib/mandates";
import { formatMoney } from "@/lib/money";
import { same, ZERO } from "@/lib/programs";
import { call } from "@/lib/tx";
import { useTheme } from "@/theme";

// Port of app/src/app/autopay/[id]/page.tsx.

export default function AutoPayDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const valid = /^\d+$/.test(id ?? "");
  const { data: m, error, reload } = useLoad(() => getMandate(BigInt(id)), me && valid ? id : undefined);
  const now = useNow(1000);

  const missing = <Screen title="AutoPay" back><ErrorText>We couldn&apos;t find this AutoPay.</ErrorText></Screen>;
  if (!valid) return missing;
  if (!m) return <Screen title="AutoPay" back>{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  if (m.payer === ZERO || !(same(m.payer, me) || same(m.payee, me))) return missing;
  const isPayer = same(m.payer, me);
  const other = isPayer ? m.payee : m.payer;
  const ready = dueCount(m, now);
  const done = isDone(m);
  const muted = (s: string) => <Text style={{ color: t.muted }}>{s}</Text>;

  return (
    <Screen title="AutoPay" back scroll>
      <View style={{ alignItems: "center", gap: 12, paddingTop: 8, paddingBottom: 16 }}>
        <Chip good={!done && ready > 0}>{done ? "Finished" : ready ? "Ready to collect" : "On schedule"}</Chip>
        <Serif size={56}>{formatMoney(m.amount)}</Serif>
        <Text style={{ color: t.muted, fontSize: 14 }}>every {unitOf(m.period)} · {m.paid} of {m.periods} paid</Text>
        {!done && !ready && <Text style={{ color: t.muted, fontSize: 14 }}>Next one in {timeLeft(nextDue(m) - now)}</Text>}
      </View>
      <Band>Details</Band>
      <Row icon={<WhoAvatar a={other} size={40} />} title={<Who a={other} me={me} />} sub={isPayer ? "Gets paid by you" : "Pays you automatically"} />
      {!done && <Row title="Next payment" trail={muted(dateLabel(nextDue(m)))} />}
      {!done && <Row title="Last payment" trail={muted(dateLabel(m.start + m.periods * m.period))} />}
      <Row title="Still held for this" trail={<Serif size={24}>{formatMoney(m.amount * BigInt(m.periods - m.paid))}</Serif>} />
      <Actions m={m} ready={ready} isPayer={isPayer} onDone={reload} />
    </Screen>
  );
}

function Actions({ m, ready, isPayer, onDone }: { m: Mandate; ready: number; isPayer: boolean; onDone: () => void }) {
  const t = useTheme();
  const { busy, status, error, run } = useAction();
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState("");
  const [split, setSplit] = useState({ keep: 0n, back: 0n });

  async function collect() {
    const amt = m.amount * BigInt(ready);
    const ok = await run(async (say) => {
      await call(addr.mandate, KinMandateAbi, "collect", [m.id]);
      say("Moving it to your balance…");
      return true;
    });
    if (ok) {
      setDone(`${formatMoney(amt)} added to your balance ✓`);
      onDone();
    }
  }

  function askStop() {
    const keep = m.amount * BigInt(dueCount(m));
    setSplit({ keep, back: m.amount * BigInt(m.periods - m.paid) - keep });
    setConfirm(true);
  }

  async function stop() {
    const ok = await run(async () => {
      await call(addr.mandate, KinMandateAbi, "cancel", [m.id]);
      return true;
    });
    setConfirm(false);
    if (ok) {
      if (split.keep) void recordPayment(m.payee, split.keep);
      setDone(`Stopped. ${formatMoney(split.back)} is back in your balance ✓`);
      onDone();
    }
  }

  return (
    <Footer>
      <DoneNote>{done}</DoneNote>
      <ErrorText>{error}</ErrorText>
      <Status>{busy && !confirm && status}</Status>
      {!isPayer && ready > 0 && <Button title={`Collect ${formatMoney(m.amount * BigInt(ready))}`} onPress={collect} busy={busy} />}
      {isPayer && !isDone(m) && <Button title="Stop AutoPay" variant="ghost" onPress={askStop} disabled={busy} />}
      <Sheet open={confirm} onClose={() => !busy && setConfirm(false)}>
        <Text style={{ color: t.ink, fontSize: 20, fontWeight: "700" }}>Stop this AutoPay?</Text>
        <Text style={{ color: t.muted }}>
          {split.keep ? `They still get ${formatMoney(split.keep)} already due. ` : ""}You get {formatMoney(split.back)} back, right away.
        </Text>
        <Status>{busy && status}</Status>
        <Button title={`Stop and get ${formatMoney(split.back)} back`} onPress={stop} busy={busy} />
        <Button title="Keep it going" variant="ghost" onPress={() => setConfirm(false)} disabled={busy} />
      </Sheet>
    </Footer>
  );
}
