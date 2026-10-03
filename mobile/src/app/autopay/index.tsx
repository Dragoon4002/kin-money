import { router, type Href } from "expo-router";
import { Fragment, useState } from "react";
import { View } from "react-native";
import { Caption, Card } from "@/components/allowance/bits";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Choice, Empty, Loading, MoneyInput, Status, Who, WhoAvatar, dateLabel, useAction, useLoad, useMe, useBack } from "@/components/programs/kit";
import { Band, Button, ErrorText, Field, Footer, Label, Row, Screen, Serif, Text, TextInput, useInputStyle } from "@/components/ui";
import { KinMandateAbi } from "@/lib/abi";
import { addr } from "@/lib/config";
import { recordPayment } from "@/lib/contacts";
import { DAY, EVERY, dueCount, isDone, listMandates, nextDue, unitOf } from "@/lib/mandates";
import { formatMoney, fromLocal } from "@/lib/money";
import { createdId, same } from "@/lib/programs";
import { call } from "@/lib/tx";
import { useTheme } from "@/theme";

// Port of app/src/app/autopay/page.tsx.

const MAX_TIMES = 120;

export default function AutoPayPage() {
  const t = useTheme();
  const me = useMe();
  const [creating, setCreating] = useState(false);
  const { data, error } = useLoad(() => listMandates(me!), me);

  if (creating) return <NewAutoPay onCancel={() => setCreating(false)} />;
  const paying = data?.filter((m) => same(m.payer, me)) ?? [];
  const getting = data?.filter((m) => same(m.payee, me)) ?? [];

  return (
    <Screen title="AutoPay" back scroll>
      <Text style={{ color: t.muted }}>Paid automatically every month. Set it once, stop any time.</Text>
      <ErrorText>{error}</ErrorText>
      {!data && !error && <Loading />}
      {data && !data.length && <Empty icon="schedule" title="No AutoPay yet" sub="Rent, school fees, help for home. Set it once and forget it." />}
      {([["You pay", paying], ["You get", getting]] as const).map(([label, list]) =>
        list.length > 0 && (
          <Fragment key={label}>
            <Band>{label}</Band>
            {list.map((m) => {
              const other = same(m.payer, me) ? m.payee : m.payer;
              const ready = dueCount(m);
              return (
                <Row
                  key={String(m.id)}
                  onPress={() => router.push(`/autopay/${m.id}` as Href)}
                  icon={<WhoAvatar a={other} size={44} />}
                  title={<Who a={other} me={me} />}
                  sub={
                    isDone(m) ? "Finished"
                      : ready > 0 ? <Text style={{ color: t.good, fontWeight: "600" }}>Ready to collect</Text>
                      : `Next ${dateLabel(nextDue(m))}`
                  }
                  trail={
                    <View style={{ alignItems: "flex-end" }}>
                      <Serif size={24}>{formatMoney(m.amount)}</Serif>
                      <Text style={{ color: t.muted, fontSize: 12 }}>every {unitOf(m.period)}</Text>
                    </View>
                  }
                />
              );
            })}
          </Fragment>
        ),
      )}
      <Footer>
        <Button title="Set up AutoPay" onPress={() => setCreating(true)} />
      </Footer>
    </Screen>
  );
}

function NewAutoPay({ onCancel }: { onCancel: () => void }) {
  useBack(onCancel);
  const t = useTheme();
  const input = useInputStyle();
  const [to, setTo] = useState<Person | null>(null);
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState(30 * DAY);
  const [times, setTimes] = useState("6");
  const { busy, status, error, run } = useAction();

  const each = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const n = Math.min(MAX_TIMES, Math.max(0, Math.floor(Number(times) || 0)));
  const total = each * BigInt(n);
  const unit = unitOf(period);

  async function start() {
    if (!to || !total) return;
    await run(async (say) => {
      const hash = await call(addr.mandate, KinMandateAbi, "create", [to.address, each, period, n], { fund: total });
      say("Setting up AutoPay…");
      const id = await createdId(hash, KinMandateAbi, "MandateCreated");
      void recordPayment(to.address, total);
      router.replace(`/autopay/${id}` as Href);
    });
  }

  return (
    <Screen title="New AutoPay" scroll>
      <PersonPicker label="Who gets paid?" onPick={setTo} />
      <MoneyInput label="How much each time?" value={amount} onChange={setAmount} />
      <Label>How often?</Label>
      <Choice options={EVERY} value={period} onChange={setPeriod} />
      <Field label="How many times?" hint={`Up to ${MAX_TIMES}`}>
        <TextInput style={[input, { fontVariant: ["tabular-nums"] }]} keyboardType="number-pad" value={times} onChangeText={(v) => setTimes(v.replace(/\D/g, ""))} accessibilityLabel="How many times?" />
      </Field>
      {total > 0n && (
        <Card>
          <Caption>Set aside today</Caption>
          <Serif size={44}>{formatMoney(total)}</Serif>
          <Text style={{ color: t.muted, fontSize: 14 }}>
            Pay {to ? `@${to.name}` : "them"} {formatMoney(each)} every {unit}, {n} time{n > 1 ? "s" : ""}. The first one is ready in {EVERY.find((e) => e.value === period)?.wait}. Stop any time and get the rest back.
          </Text>
        </Card>
      )}
      <ErrorText>{error}</ErrorText>
      <Footer>
        <Status>{busy && status}</Status>
        <Button title="Start AutoPay" onPress={start} busy={busy} disabled={!to || !total} />
        <Button title="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
      </Footer>
    </Screen>
  );
}
