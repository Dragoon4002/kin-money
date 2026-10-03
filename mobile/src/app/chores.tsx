import { useLocalSearchParams } from "expo-router";
import { Fragment, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import type { Address } from "viem";
import { Caption, Delivered } from "@/components/allowance/bits";
import { Kinko } from "@/components/Kinko";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Choice, Empty, Loading, MoneyInput, Status, Who, getMeta, setMeta, share, useAction, useLoad, useMe, useNow, useBack } from "@/components/programs/kit";
import { Band, Button, Chip, ErrorText, Field, Footer, IconTile, Label, Row, Screen, Serif, Text, TextInput, useInputStyle } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { addr, API_BASE } from "@/lib/config";
import { api, recordPayment } from "@/lib/contacts";
import { ICON } from "@/lib/icons";
import { useKinko } from "@/lib/kinko";
import { formatMoney, fromLocal } from "@/lib/money";
import { CHORE_MARK, createdId, expiryAfter, listEscrows, nowSec, same, ZERO, type Escrow } from "@/lib/programs";
import { call } from "@/lib/tx";
import { useTheme } from "@/theme";

// Port of app/src/app/chores/page.tsx. Family chores: parent holds the reward (to = kid, approver = parent,
// unlockAt = CHORE_MARK, 30-day exit). Kid taps "I did it!" (ping) → parent checks and pays (approve).
// Titles aren't onchain: they live on each phone under kin.chore.<id> and travel in the share link (/chores?c=&t=&d=).

type Meta = { t: string; due: number };
const metaKey = (id: bigint | string) => `kin.chore.${id}`;
const titleOf = (id: bigint) => getMeta<Meta>(metaKey(id))?.t || "A chore";
const DAY = 86_400;
const IDEAS = ["Dishes", "Made bed", "Homework", "Walk the dog", "Tidy room"];

export default function ChoresPage() {
  const t = useTheme();
  const me = useMe();
  const { look } = useKinko(me);
  const q = useLocalSearchParams<{ c?: string; t?: string; d?: string }>();
  const [creating, setCreating] = useState(false);
  const { data, error, reload } = useLoad(() => listEscrows(me!, "chore"), me);

  // Kid opened the parent's link: remember the chore's title on this phone.
  useEffect(() => {
    if (q.c && /^\d+$/.test(q.c) && q.t) setMeta(metaKey(q.c), { t: q.t.slice(0, 40), due: Number(q.d) || 0 });
  }, [q.c, q.t, q.d]);

  // Parent sees "done" taps without a refresh.
  useEffect(() => {
    const i = setInterval(reload, 8000);
    return () => clearInterval(i);
  }, [reload]);

  if (creating) return <NewChore me={me} onClose={() => { setCreating(false); reload(); }} />;

  const all = data?.escrows ?? [];
  // ponytail: "done" = a recent ask in the log window (~15 min); older asks fall back to "To do". Add an indexer if that bites.
  const done = (e: Escrow) => (data?.pinged.get(e.id) ?? 0) > 0;
  const check = all.filter((e) => same(e.from, me) && !e.settled && done(e));
  const todo = all.filter((e) => !e.settled && !(same(e.from, me) && done(e)));
  const paid = all.filter((e) => e.settled && e.approved);
  const earned = paid.filter((e) => same(e.to, me)).reduce((a, e) => a + e.amount, 0n);
  const paidOut = paid.filter((e) => same(e.from, me)).reduce((a, e) => a + e.amount, 0n);
  const kid = all.some((e) => same(e.to, me));

  return (
    <Screen title="Chores" back scroll>
      <View style={{ alignItems: "center", gap: 8 }}>
        <Kinko look={look} size={88} mood={check.length ? "happy" : "calm"} />
        <Caption>{kid ? "You've earned" : "Paid for chores"}</Caption>
        {data ? <Serif size={56}>{formatMoney(kid ? earned : paidOut)}</Serif> : <View style={{ height: 56, width: 160, borderRadius: 16, backgroundColor: t.surface2 }} />}
      </View>
      <ErrorText>{error}</ErrorText>
      {!data && !error && <Loading />}
      {data && !all.length && <Empty icon="chores" title="No chores yet" sub="Post a chore with a reward. They tap “I did it!”, you check and pay." />}

      {check.length > 0 && (
        <>
          <Band>Done — check it</Band>
          {check.map((e) => <Chore key={String(e.id)} e={e} me={me} done onDone={reload} />)}
        </>
      )}
      {todo.length > 0 && (
        <>
          <Band>To do</Band>
          {todo.map((e) => <Chore key={String(e.id)} e={e} me={me} done={done(e)} onDone={reload} />)}
        </>
      )}
      {paid.length > 0 && (
        <>
          <Band>Paid</Band>
          {paid.map((e) => (
            <Row
              key={String(e.id)}
              icon={<IconTile icon={ICON.check} />}
              title={titleOf(e.id)}
              sub={same(e.to, me) ? <>From <Who a={e.from} me={me} /></> : <Who a={e.to} me={me} />}
              trail={<Serif size={24} color={t.good}>+{formatMoney(e.amount)}</Serif>}
            />
          ))}
        </>
      )}

      <Footer>
        <Button title="Post a chore" onPress={() => setCreating(true)} />
      </Footer>
    </Screen>
  );
}

function Pill({ title, onPress, brand, disabled }: { title: string; onPress: () => void; brand?: boolean; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => ({ height: 44, justifyContent: "center", borderRadius: 22, paddingHorizontal: 16, backgroundColor: brand ? t.brand : t.surface2, opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      <Text style={{ color: brand ? t.brandInk : t.ink, fontSize: 14, fontWeight: "600" }}>{title}</Text>
    </Pressable>
  );
}

function Chore({ e, me, done, onDone }: { e: Escrow; me?: Address; done: boolean; onDone: () => void }) {
  const t = useTheme();
  const now = useNow(30_000);
  const { busy, status, error, run } = useAction();
  const [asked, setAsked] = useState(false);
  const iDo = same(e.to, me);
  const iCheck = same(e.from, me);
  const due = getMeta<Meta>(metaKey(e.id))?.due;
  const expired = now >= e.expiresAt;

  async function act(fn: "ping" | "approve" | "refund") {
    const ok = await run(async (say) => {
      await call(addr.escrow, KinEscrowAbi, fn, [e.id]);
      if (fn === "approve") say("Paying…");
      return true;
    });
    if (!ok) return;
    if (fn === "approve") void recordPayment(e.to, e.amount);
    if (fn === "ping") setAsked(true);
    onDone();
  }

  let trail;
  if (busy) trail = <ActivityIndicator color={t.brand} />;
  else if (iCheck && expired) trail = <Pill title="Take it back" onPress={() => act("refund")} />;
  else if (iCheck && done) trail = <Pill title="Looks good — pay" brand onPress={() => act("approve")} />;
  else if (iDo && (done || asked)) trail = <Chip>Waiting for OK</Chip>;
  else if (iDo && !expired) trail = <Pill title="I did it!" brand onPress={() => act("ping")} />;
  else trail = <Chip>Not done yet</Chip>;

  const dueText = due ? ` · due ${dueLabel(due)}` : "";
  return (
    <Fragment>
      <Row
        icon={<IconTile icon={ICON.chores} />}
        title={<>{titleOf(e.id)} · {formatMoney(e.amount)}</>}
        sub={busy ? status : iDo ? <>From <Who a={e.from} me={me} />{dueText}</> : <><Who a={e.to} me={me} />{dueText}</>}
        trail={trail}
      />
      <ErrorText>{error}</ErrorText>
    </Fragment>
  );
}

const dueLabel = (t: number) => {
  const d = Math.round((new Date(t * 1000).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "tomorrow" : new Date(t * 1000).toLocaleDateString(undefined, { weekday: "long" });
};

const DUE = [
  { value: 0, label: "Today" },
  { value: 1, label: "Tomorrow" },
  { value: 7, label: "This week" },
];

function NewChore({ me, onClose }: { me?: Address; onClose: () => void }) {
  useBack(onClose);
  const th = useTheme();
  const input = useInputStyle();
  const [kid, setKid] = useState<Person | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dueIn, setDueIn] = useState(0);
  const [posted, setPosted] = useState<{ id: bigint; due: number } | null>(null);
  const { busy, status, error, run } = useAction();
  const value = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const t = title.trim();
  const selfKid = same(kid?.address, me);

  async function post() {
    if (!kid || !me || !t || !value || selfKid) return;
    const due = nowSec() + dueIn * DAY;
    await run(async (say) => {
      const hash = await call(addr.escrow, KinEscrowAbi, "create", [kid.address, ZERO, me, CHORE_MARK, expiryAfter(nowSec()), 0], { fund: value });
      say("Posting the chore…");
      const id = await createdId(hash, KinEscrowAbi, "Created");
      setMeta(metaKey(id), { t, due });
      void api("/api/notify-added", "POST", { kind: "chore", id: id.toString(), addresses: [kid.address] }).catch(() => {});
      setPosted({ id, due });
    });
  }

  function tell() {
    if (!posted || !kid) return;
    const url = `${API_BASE}/chores?c=${posted.id}&t=${encodeURIComponent(t)}&d=${posted.due}`;
    void share(`New chore for you on Kin: ${t} — earn ${formatMoney(value)}`, url);
  }

  if (posted) {
    return (
      <Screen>
        <Delivered title="Chore posted" subtitle={`${formatMoney(value)} is held safely. @${kid!.name} gets it when you OK their “${t}”.`} />
        <Footer>
          <Button title={`Tell @${kid!.name}`} onPress={tell} />
          <Button title="Done" variant="ghost" onPress={onClose} />
        </Footer>
      </Screen>
    );
  }

  return (
    <Screen title="New chore" scroll>
      <PersonPicker label="Who's doing it?" onPick={setKid} />
      <Field label="What's the chore?">
        <TextInput style={input} placeholder="Dishes" placeholderTextColor={th.muted} value={title} maxLength={40} onChangeText={setTitle} accessibilityLabel="What's the chore?" />
      </Field>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: -8 }}>
        {IDEAS.map((i) => (
          <Pressable key={i} onPress={() => setTitle(i)} accessibilityRole="button"
            style={({ pressed }) => ({ height: 44, justifyContent: "center", borderRadius: 22, paddingHorizontal: 16, backgroundColor: th.surface2, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
            <Text style={{ color: th.muted, fontSize: 14, fontWeight: "500" }}>{i}</Text>
          </Pressable>
        ))}
      </View>
      <MoneyInput label="Reward" value={amount} onChange={setAmount} />
      <Label>Due</Label>
      <Choice options={DUE} value={dueIn} onChange={setDueIn} />
      <ErrorText>{error || (selfKid ? "Pick someone else to do it." : "")}</ErrorText>
      <Footer>
        <Status>{busy && status}</Status>
        <Button title={value ? `Post chore · ${formatMoney(value)}` : "Post chore"} onPress={post} busy={busy} disabled={!kid || !t || !value || selfKid} />
        <Button title="Cancel" variant="ghost" onPress={onClose} disabled={busy} />
      </Footer>
    </Screen>
  );
}
