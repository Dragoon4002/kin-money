import { router, type Href } from "expo-router";
import { Fragment, useState } from "react";
import { Card, Caption } from "@/components/allowance/bits";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Choice, Empty, Loading, MoneyInput, Status, Who, WhoAvatar, useAction, useLoad, useMe, useNow, useBack } from "@/components/programs/kit";
import { Band, Button, ErrorText, Footer, Label, Row, Screen, Serif, Text } from "@/components/ui";
import { KinStreamAbi } from "@/lib/abi";
import { addr } from "@/lib/config";
import { recordPayment } from "@/lib/contacts";
import { formatMoney, fromLocal } from "@/lib/money";
import { createdId, listStreams, same } from "@/lib/programs";
import { call } from "@/lib/tx";
import { useTheme } from "@/theme";

// Port of app/src/app/allowance/page.tsx.

const DAY = 86_400;
const LENGTHS = [
  { value: 7 * DAY, label: "1 week" },
  { value: 30 * DAY, label: "1 month" },
  { value: 90 * DAY, label: "3 months" },
];

export default function AllowancePage() {
  const t = useTheme();
  const me = useMe();
  const [creating, setCreating] = useState(false);
  const { data, error } = useLoad(() => listStreams(me!), me);
  const now = useNow(30_000);

  if (creating) return <NewAllowance onCancel={() => setCreating(false)} />;
  const giving = data?.filter((s) => same(s.payer, me)) ?? [];
  const getting = data?.filter((s) => same(s.payee, me)) ?? [];

  return (
    <Screen title="Live allowance" back scroll>
      <Text style={{ color: t.muted }}>Money that grows in their balance every second. Stop it any time.</Text>
      <ErrorText>{error}</ErrorText>
      {!data && !error && <Loading />}
      {data && !data.length && <Empty icon="allowance" title="No allowances yet" sub="Start one for your kid studying abroad. They watch it grow, live." />}
      {([["You give", giving], ["You get", getting]] as const).map(([label, list]) =>
        list.length > 0 && (
          <Fragment key={label}>
            <Band>{label}</Band>
            {list.map((s) => {
              const other = same(s.payer, me) ? s.payee : s.payer;
              const live = now < s.end;
              return (
                <Row
                  key={String(s.id)}
                  onPress={() => router.push(`/allowance/${s.id}` as Href)}
                  icon={<WhoAvatar a={other} size={44} />}
                  title={<Who a={other} me={me} />}
                  sub={<Text style={{ color: live ? t.good : t.muted }}>{live ? "● Growing now" : "Finished"}</Text>}
                  trail={<Serif size={24}>{formatMoney(s.amount)}</Serif>}
                />
              );
            })}
          </Fragment>
        ),
      )}
      <Footer>
        <Button title="Start an allowance" onPress={() => setCreating(true)} />
      </Footer>
    </Screen>
  );
}

function NewAllowance({ onCancel }: { onCancel: () => void }) {
  useBack(onCancel);
  const t = useTheme();
  const [kid, setKid] = useState<Person | null>(null);
  const [monthly, setMonthly] = useState("");
  const [length, setLength] = useState(30 * DAY);
  const { busy, status, error, run } = useAction();

  const perMonth = Number(monthly) > 0 ? fromLocal(monthly) : 0n;
  const total = (perMonth * BigInt(length)) / BigInt(30 * DAY);
  const perDay = total / BigInt(length / DAY);

  async function start() {
    if (!kid || !total) return;
    await run(async (say) => {
      const hash = await call(addr.stream, KinStreamAbi, "create", [kid.address, length], { fund: total });
      say("Starting their allowance…");
      const id = await createdId(hash, KinStreamAbi, "StreamCreated");
      void recordPayment(kid.address, total);
      router.replace(`/allowance/${id}` as Href);
    });
  }

  return (
    <Screen title="New allowance" scroll>
      <PersonPicker label="Who is it for?" onPick={setKid} />
      <MoneyInput label="How much each month?" value={monthly} onChange={setMonthly} />
      <Label>For how long?</Label>
      <Choice options={LENGTHS} value={length} onChange={setLength} />
      {total > 0n && (
        <Card>
          <Caption>Set aside today</Caption>
          <Serif size={44}>{formatMoney(total)}</Serif>
          <Text style={{ color: t.muted, fontSize: 14 }}>
            About {formatMoney(perDay)} a day lands in {kid ? `@${kid.name}'s` : "their"} balance, a little every second. Stop any time and get the rest back.
          </Text>
        </Card>
      )}
      <ErrorText>{error}</ErrorText>
      <Footer>
        <Status>{busy && status}</Status>
        <Button title="Start allowance" onPress={start} busy={busy} disabled={!kid || !total} />
        <Button title="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
      </Footer>
    </Screen>
  );
}
