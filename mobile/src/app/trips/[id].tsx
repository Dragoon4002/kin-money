import { useLocalSearchParams } from "expo-router";
import { Check, UserPlus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import type { Address } from "viem";
import { Choice, Empty, Loading, Sheet, Status, useLoad, useMe } from "@/components/programs/kit";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { AddExpense, type NewExpense } from "@/components/trips/AddExpense";
import { Avatars, Card, DateField, Pill } from "@/components/trips/bits";
import { Avatar, Band, Button, Chip, ErrorText, Footer, IconTile, Row, Screen, Serif, Text } from "@/components/ui";
import { isUnlocked, readToken } from "@/lib/account";
import { CATEGORIES } from "@/lib/categories";
import { recordPayment } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { ICON } from "@/lib/icons";
import { formatMoney } from "@/lib/money";
import { openKin } from "@/lib/nav";
import { canRemind, dueLabel, endOfDay } from "@/lib/reminders";
import { shareCard } from "@/lib/shareCard";
import { balances, settleUp, shares, type Transfer } from "@/lib/split";
import { addExpense, addTripMember, getTrip, pendingSettlements, remindTrip, removeExpense, setSettleBy, settleTrip, syncSettlements, type TripExpense } from "@/lib/trips";
import { sendDollars } from "@/lib/tx";
import { useTheme } from "@/theme";

// Port of app/src/app/trips/[id]/page.tsx.

type Tab = "expenses" | "balances" | "settle";
const TABS: { value: Tab; label: string }[] = [{ value: "expenses", label: "Expenses" }, { value: "balances", label: "Balances" }, { value: "settle", label: "Settle up" }];
const isoDay = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const catOf = (id: string) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];

export default function TripPage() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const { data, error, reload } = useLoad(async () => {
    await syncSettlements(id);
    return { trip: await getTrip(id), pending: pendingSettlements(id, me!) };
  }, me && id);
  const [tab, setTab] = useState<Tab>("expenses");
  const [sheet, setSheet] = useState<"add" | "member" | "date" | TripExpense | null>(null);
  const [adds, setAdds] = useState<TripExpense[]>([]); // optimistic, until the server has them
  const [dels, setDels] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState("");
  const [paidTo, setPaidTo] = useState<string[]>([]);
  const [nudged, setNudged] = useState<string[]>([]); // debtors I just reminded
  const [date, setDate] = useState("");
  const [now] = useState(Date.now); // render-stable "today"

  // Friends add costs and pay from their phones — keep this current (never prompts Face ID).
  useEffect(() => {
    const i = setInterval(() => (isUnlocked() || readToken()) && reload(), 10_000);
    return () => clearInterval(i);
  }, [reload]);

  if (!data?.trip || !me)
    return (
      <Screen title="Trip" back>
        {error ? <ErrorText>We couldn&apos;t open this trip right now. Try again soon.</ErrorText> : data ? <ErrorText>We couldn&apos;t find this trip.</ErrorText> : <Loading />}
      </Screen>
    );

  const { trip } = data;
  const members = [...trip.members].sort((a, b) => Number(b.address === me) - Number(a.address === me));
  const nameOf = (a: string) => (a === me ? "You" : `@${members.find((m) => m.address === a)?.name || "friend"}`);
  const expenses = [...adds.filter((a) => !trip.expenses.some((e) => e.id === a.id)), ...trip.expenses].filter((e) => !dels.includes(e.id));
  const settlements = [...data.pending.filter((p) => !trip.settlements.some((s) => s.hash === p.hash.toLowerCase())), ...trip.settlements];
  const bal = balances(
    members.map((m) => m.address),
    expenses.map((e) => ({ payer: e.payer, amount: BigInt(e.amount), participants: e.participants })),
    settlements.map((s) => ({ from: s.from, to: s.to, amount: BigInt(s.amount) })),
  );
  const plan = settleUp(bal);
  const mine = plan.filter((x) => x.from === me);
  const paying = !!progress;

  async function onAdd(e: NewExpense) {
    const temp: TripExpense = { id: `new-${Date.now()}`, ...e, participants: [...e.participants].sort(), amount: e.amount.toString(), at: Date.now(), by: me! };
    setSheet(null);
    setErr("");
    setAdds((a) => [temp, ...a]);
    try {
      const { id: eid } = await addExpense(id, e);
      setAdds((a) => a.map((x) => (x === temp ? { ...x, id: eid } : x)));
      reload();
    } catch (x) {
      setAdds((a) => a.filter((y) => y !== temp));
      setErr(humanError(x));
    }
  }

  async function onRemove(e: TripExpense) {
    setSheet(null);
    setDels((d) => [...d, e.id]);
    try {
      await removeExpense(id, e.id);
      reload();
    } catch (x) {
      setDels((d) => d.filter((y) => y !== e.id));
      setErr(humanError(x));
    }
  }

  async function onMember(p: Person | null) {
    if (!p) return;
    setSheet(null);
    setErr("");
    try {
      await addTripMember(id, p.address);
      reload();
    } catch (x) {
      setErr(humanError(x));
    }
  }

  async function remind(from: string) {
    setErr("");
    setNudged((n) => [...n, from]);
    try {
      await remindTrip(id, from as Address);
    } catch (x) {
      if (String(x).includes("429")) return; // reminded recently — keep "Reminded"
      setNudged((n) => n.filter((y) => y !== from));
      setErr(humanError(x));
    }
  }

  async function onSettleBy(at: number | null) {
    setSheet(null);
    setErr("");
    try {
      await setSettleBy(id, at);
      reload();
    } catch (x) {
      setErr(humanError(x));
    }
  }

  /** Pay each transfer in turn; stop at the first failure (earlier ones stay paid and recorded). */
  async function pay(list: Transfer[]) {
    setErr("");
    for (const [i, x] of list.entries()) {
      const step = list.length > 1 ? ` ${i + 1} of ${list.length}` : "";
      setProgress(isUnlocked() ? `Paying ${nameOf(x.to)}…${step}` : "Confirm with Face ID…");
      try {
        const hash = await sendDollars(x.to as Address, x.amount);
        setProgress(`Updating the trip…${step}`);
        await settleTrip(id, x.to as Address, x.amount, hash);
        void recordPayment(x.to as Address, x.amount);
        setPaidTo((p) => [...p, `${x.to}:${x.amount}`]);
      } catch (e) {
        setErr(humanError(e));
        break;
      }
    }
    setProgress("");
    reload();
  }

  const open = sheet && typeof sheet === "object" ? sheet : null;
  const personOf = (a: string) => members.find((m) => m.address === a)?.name;

  return (
    <Screen title={trip.name} back scroll>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Avatars people={members} size={32} max={4} />
        <Text style={{ color: t.muted, fontSize: 14 }}>{members.length} people</Text>
        <Pressable onPress={() => setSheet("member")} accessibilityRole="button" accessibilityLabel="Add someone" hitSlop={4}
          style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: t.surface2, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
          <UserPlus color={t.ink} size={20} />
        </Pressable>
        <Pressable onPress={() => (setDate(trip.settleBy ? isoDay(trip.settleBy) : ""), setSheet("date"))} accessibilityRole="button"
          style={({ pressed }) => ({ marginLeft: "auto", height: 44, justifyContent: "center", borderRadius: 22, paddingHorizontal: 16, backgroundColor: t.surface2, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
          {trip.settleBy ? (
            <Text style={{ fontSize: 14, fontWeight: "600", color: plan.length && now > trip.settleBy ? t.bad : t.ink }}>Settle by {shortDate(trip.settleBy)}</Text>
          ) : (
            <Text style={{ fontSize: 14, fontWeight: "600", color: t.muted }}>+ Settle-by date</Text>
          )}
        </Pressable>
      </View>
      <Choice options={TABS} value={tab} onChange={setTab} />
      <ErrorText>{err}</ErrorText>

      {tab === "expenses" && (
        <>
          {!expenses.length && <Empty icon="trip" title="No costs yet" sub="Add what you spend. We'll work out who owes whom." />}
          {expenses.map((e) => {
            const cat = catOf(e.category);
            const my = shares(BigInt(e.amount), e.participants).get(me) ?? 0n;
            const saving = e.id.startsWith("new-");
            return (
              <Row
                key={e.id}
                onPress={saving ? undefined : () => setSheet(e)}
                icon={<IconTile icon={cat.icon} />}
                title={e.note || cat.label}
                sub={`${nameOf(e.payer)} paid ${formatMoney(BigInt(e.amount))} · split ${e.participants.length} ${e.participants.length === 1 ? "way" : "ways"}`}
                trail={
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: t.muted, fontSize: 14 }}>{saving ? "Saving…" : "Your share"}</Text>
                    <Text style={{ color: t.ink, fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{my ? formatMoney(my) : "—"}</Text>
                  </View>
                }
              />
            );
          })}
          <Footer>
            <Button title="Add expense" onPress={() => setSheet("add")} />
          </Footer>
        </>
      )}

      {tab === "balances" &&
        members.map((m) => {
          const v = bal.get(m.address) ?? 0n;
          return (
            <Row
              key={m.address}
              icon={<Avatar name={m.name} />}
              title={nameOf(m.address)}
              sub={v > 0n ? "Gets back" : v < 0n ? "Owes" : "All square"}
              trail={<Serif size={24} color={v > 0n ? t.good : v < 0n ? t.bad : t.muted}>{formatMoney(v < 0n ? -v : v)}</Serif>}
            />
          );
        })}

      {tab === "settle" && (
        <>
          {!plan.length ? (
            <Card style={{ alignItems: "center", gap: 8 }}>
              <IconTile icon={ICON.celebrate} size={56} brand />
              <Serif size={30}>All settled 🎉</Serif>
              <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>{expenses.length ? "Nobody owes anybody." : "Add a cost first, then settle here."}</Text>
              {expenses.length > 0 && (
                <Button title="Share card" variant="ghost"
                  onPress={() => void shareCard({ kind: "settled", amount: expenses.reduce((a, e) => a + BigInt(e.amount), 0n), title: trip.name }, `${trip.name} — all settled on Kin`)} />
              )}
            </Card>
          ) : (
            <>
              {mine.length > 0 && (
                <View style={{ gap: 8 }}>
                  <Button title={`Pay all I owe (${mine.length})`} onPress={() => pay(mine)} busy={paying} />
                  <Status>{progress}</Status>
                </View>
              )}
              {plan.map((x) => (
                <Row
                  key={`${x.from}-${x.to}`}
                  icon={<Avatar name={personOf(x.from)} />}
                  title={`${nameOf(x.from)} ${x.from === me ? "pay" : "pays"} ${nameOf(x.to)}`}
                  sub={x.from === me ? formatMoney(x.amount) : `${formatMoney(x.amount)} · Waiting for ${nameOf(x.from)}`}
                  trail={
                    x.to === me ? (
                      !nudged.includes(x.from) && canRemind(trip.reminders.find((r) => r.from === x.from && r.to === me)?.at) ? (
                        <Pill soft title="Remind" onPress={() => remind(x.from)} />
                      ) : (
                        <Chip>Reminded ✓</Chip>
                      )
                    ) : x.from === me ? (
                      paidTo.includes(`${x.to}:${x.amount}`) ? <Chip good>Paid ✓✓</Chip> : <Pill title="Pay" onPress={() => pay([x])} disabled={paying} />
                    ) : undefined
                  }
                />
              ))}
            </>
          )}
          {settlements.length > 0 && (
            <>
              <Band>Settled</Band>
              {settlements.map((s) => (
                <Row
                  key={s.hash}
                  onPress={() => openKin(`/details?tx=${s.hash}`)}
                  icon={<Avatar name={personOf(s.from)} />}
                  title={`${nameOf(s.from)} paid ${nameOf(s.to)}`}
                  sub={shortDate(s.at)}
                  trail={
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={{ color: t.ink, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{formatMoney(BigInt(s.amount))}</Text>
                      <Check color={t.good} size={20} />
                    </View>
                  }
                />
              ))}
            </>
          )}
        </>
      )}

      <Sheet open={sheet !== null} onClose={() => setSheet(null)}>
        {sheet === "add" && <AddExpense members={members} me={me} onAdd={onAdd} />}
        {sheet === "date" && (
          <>
            <Text style={{ color: t.ink, fontSize: 18, fontWeight: "700" }}>Settle by</Text>
            <Text style={{ color: t.muted, fontSize: 14 }}>Everyone gets a nudge if money is still owed after this day.</Text>
            <DateField label="Settle by date" min={isoDay(now)} value={date} onChange={setDate} />
            {!!date && <Text style={{ color: t.muted, fontSize: 14 }}>{dueLabel(endOfDay(date))}</Text>}
            <Button title="Save date" onPress={() => onSettleBy(endOfDay(date))} disabled={!date} />
            {!!trip.settleBy && <Button title="Remove date" variant="ghost" onPress={() => onSettleBy(null)} />}
          </>
        )}
        {sheet === "member" && (
          <>
            <Text style={{ color: t.ink, fontSize: 18, fontWeight: "700" }}>Add someone to the trip</Text>
            <PersonPicker label="Who's joining?" onPick={onMember} />
          </>
        )}
        {open && (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <IconTile icon={catOf(open.category).icon} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: t.ink, fontSize: 18, fontWeight: "700" }}>{open.note || catOf(open.category).label}</Text>
                <Text style={{ color: t.muted, fontSize: 14 }}>{nameOf(open.payer)} paid · {shortDate(open.at)}</Text>
              </View>
              <Serif size={30}>{formatMoney(BigInt(open.amount))}</Serif>
            </View>
            {[...shares(BigInt(open.amount), open.participants)].map(([a, v]) => (
              <View key={a} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Avatar name={personOf(a)} size={32} />
                <Text style={{ flex: 1, color: t.ink, fontWeight: "500" }}>{nameOf(a)}</Text>
                <Text style={{ color: t.muted, fontVariant: ["tabular-nums"] }}>{formatMoney(v)}</Text>
              </View>
            ))}
            {open.by === me && <Button title="Remove expense" variant="ghost" onPress={() => onRemove(open)} />}
          </>
        )}
      </Sheet>
    </Screen>
  );
}
