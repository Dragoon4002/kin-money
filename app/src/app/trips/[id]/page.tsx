"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { Empty, Loading, Pad, Sheet, Status, useLoad, useMe } from "@/components/programs/kit";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { AddExpense, type NewExpense } from "@/components/trips/AddExpense";
import { Avatars } from "@/components/trips/bits";
import { Avatar, Band, Button, Card, Chip, ErrorText, Ico, IconTile, inputClass, Row, Screen, Tabs } from "@/components/ui";
import { isUnlocked } from "@/lib/account";
import { CATEGORIES } from "@/lib/categories";
import { recordPayment } from "@/lib/contacts";
import { shareCard } from "@/lib/shareCard";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { canRemind, dueLabel, endOfDay } from "@/lib/reminders";
import { balances, settleUp, shares, type Transfer } from "@/lib/split";
import { addExpense, addTripMember, getTrip, pendingSettlements, remindTrip, removeExpense, setSettleBy, settleTrip, syncSettlements, type TripExpense } from "@/lib/trips";
import { sendDollars } from "@/lib/tx";

type Tab = "expenses" | "balances" | "settle";
const isoDay = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const catOf = (id: string) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];

export default function TripPage() {
  const { id } = useParams<{ id: string }>();
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
    const i = setInterval(() => isUnlocked() && reload(), 10_000);
    return () => clearInterval(i);
  }, [reload]);

  if (!data?.trip || !me)
    return (
      <Screen title="Trip" back="/trips">
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
  const mine = plan.filter((t) => t.from === me);
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
    for (const [i, t] of list.entries()) {
      const step = list.length > 1 ? ` ${i + 1} of ${list.length}` : "";
      setProgress(isUnlocked() ? `Paying ${nameOf(t.to)}…${step}` : "Confirm with Face ID…");
      try {
        const hash = await sendDollars(t.to as Address, t.amount);
        setProgress(`Updating the trip…${step}`);
        await settleTrip(id, t.to as Address, t.amount, hash);
        void recordPayment(t.to as Address, t.amount);
        setPaidTo((p) => [...p, `${t.to}:${t.amount}`]);
      } catch (x) {
        setErr(humanError(x));
        break;
      }
    }
    setProgress("");
    reload();
  }

  const open = sheet && typeof sheet === "object" ? sheet : null;

  return (
    <Screen
      title={trip.name}
      back="/trips"
      wide
      action={
        <button onClick={() => setSheet("member")} aria-label="Add someone" className="grid size-11 place-items-center rounded-full bg-surface-2 active:scale-95">
          <Ico name="invite" />
        </button>
      }
    >
      <Pad className="flex items-center gap-3">
        <Avatars people={members} size={32} max={7} />
        <span className="text-sm text-muted">{members.length} people</span>
        <button
          onClick={() => (setDate(trip.settleBy ? isoDay(trip.settleBy) : ""), setSheet("date"))}
          className="ml-auto flex h-11 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm font-semibold active:scale-95"
        >
          {trip.settleBy ? (
            <span className={plan.length && now > trip.settleBy ? "text-bad" : "text-ink"}>
              Settle by {shortDate(trip.settleBy)}
            </span>
          ) : (
            <span className="text-muted">+ Settle-by date</span>
          )}
        </button>
      </Pad>
      <Pad>
        <Tabs value={tab} onChange={setTab} options={[["expenses", "Expenses"], ["balances", "Balances"], ["settle", "Settle up"]] as const} />
      </Pad>
      {err && <Pad><ErrorText>{err}</ErrorText></Pad>}

      {tab === "expenses" && (
        <>
          {!expenses.length && <Empty icon="trip" title="No costs yet" sub="Add what you spend. We'll work out who owes whom." />}
          <ul className="flex flex-col">
            {expenses.map((e) => {
              const cat = catOf(e.category);
              const my = shares(BigInt(e.amount), e.participants).get(me) ?? 0n;
              const saving = e.id.startsWith("new-");
              return (
                <li key={e.id}>
                  <Row
                    onClick={saving ? undefined : () => setSheet(e)}
                    icon={<IconTile name={cat.icon} />}
                    title={e.note || cat.label}
                    sub={`${nameOf(e.payer)} paid ${formatMoney(BigInt(e.amount))} · split ${e.participants.length} ${e.participants.length === 1 ? "way" : "ways"}`}
                    trail={
                      <span className="text-right text-sm">
                        <span className="block text-muted">{saving ? "Saving…" : "Your share"}</span>
                        <span className="block font-semibold tabular">{my ? formatMoney(my) : "—"}</span>
                      </span>
                    }
                  />
                </li>
              );
            })}
          </ul>
          <Pad className="mt-auto pt-2">
            <Button onClick={() => setSheet("add")}>Add expense</Button>
          </Pad>
        </>
      )}

      {tab === "balances" && (
        <ul className="flex flex-col">
          {members.map((m) => {
            const v = bal.get(m.address) ?? 0n;
            return (
              <li key={m.address}>
                <Row
                  icon={<Avatar name={m.name} />}
                  title={nameOf(m.address)}
                  sub={v > 0n ? "Gets back" : v < 0n ? "Owes" : "All square"}
                  trail={<span className={`font-display text-2xl tabular ${v > 0n ? "text-good" : v < 0n ? "text-bad" : "text-muted"}`}>{formatMoney(v < 0n ? -v : v)}</span>}
                />
              </li>
            );
          })}
        </ul>
      )}

      {tab === "settle" && (
        <>
          {!plan.length ? (
            <Pad>
              <Card className="flex flex-col items-center gap-2 text-center">
                <IconTile name="celebrate" size={56} tone="brand" />
                <p className="font-display text-3xl">All settled 🎉</p>
                <p className="text-sm text-muted">{expenses.length ? "Nobody owes anybody." : "Add a cost first, then settle here."}</p>
                {expenses.length > 0 && (
                  <Button variant="ghost" onClick={() => void shareCard({ kind: "settled", amount: expenses.reduce((t, e) => t + BigInt(e.amount), 0n), title: trip.name }, `${trip.name} — all settled on Kin`)}>
                    <span className="inline-flex items-center gap-2"><Ico name="share" /> Share card</span>
                  </Button>
                )}
              </Card>
            </Pad>
          ) : (
            <>
              {mine.length > 0 && (
                <Pad className="flex flex-col gap-2">
                  <Button onClick={() => pay(mine)} busy={paying}>
                    Pay all I owe ({mine.length})
                  </Button>
                  <Status>{progress}</Status>
                </Pad>
              )}
              <ul className="flex flex-col">
                {plan.map((t) => (
                  <li key={`${t.from}-${t.to}`}>
                    <Row
                      icon={<Avatar name={members.find((m) => m.address === t.from)?.name} />}
                      title={`${nameOf(t.from)} ${t.from === me ? "pay" : "pays"} ${nameOf(t.to)}`}
                      sub={t.from === me ? formatMoney(t.amount) : `${formatMoney(t.amount)} · Waiting for ${nameOf(t.from)}`}
                      trail={
                        t.to === me ? (
                          !nudged.includes(t.from) && canRemind(trip.reminders.find((r) => r.from === t.from && r.to === me)?.at) ? (
                            <button onClick={() => remind(t.from)} className="h-11 rounded-full bg-brand-soft px-5 text-sm font-semibold text-brand active:scale-95">
                              Remind
                            </button>
                          ) : (
                            <Chip>Reminded ✓</Chip>
                          )
                        ) : t.from === me ? (
                          paidTo.includes(`${t.to}:${t.amount}`) ? (
                            <Chip tone="good">Paid ✓✓</Chip>
                          ) : (
                            <button
                              onClick={() => pay([t])}
                              disabled={paying}
                              className="h-11 rounded-full bg-brand px-5 text-sm font-semibold text-brand-ink active:scale-95 disabled:opacity-40"
                            >
                              Pay
                            </button>
                          )
                        ) : undefined
                      }
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
          {settlements.length > 0 && (
            <section className="mt-2 flex flex-col">
              <Band>Settled</Band>
              <ul className="flex flex-col">
                {settlements.map((s) => (
                  <li key={s.hash}>
                    <Row
                      href={`/details?tx=${s.hash}`}
                      icon={<Avatar name={members.find((m) => m.address === s.from)?.name} />}
                      title={`${nameOf(s.from)} paid ${nameOf(s.to)}`}
                      sub={new Date(s.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                      trail={
                        <span className="flex items-center gap-2 font-semibold tabular">
                          {formatMoney(BigInt(s.amount))} <Ico name="check" className="text-good" />
                        </span>
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <Sheet open={sheet !== null} onClose={() => setSheet(null)}>
        {sheet === "add" && <AddExpense members={members} me={me} onAdd={onAdd} />}
        {sheet === "date" && (
          <>
            <h2 className="text-lg font-bold">Settle by</h2>
            <p className="text-sm text-muted">Everyone gets a nudge if money is still owed after this day.</p>
            <input type="date" className={inputClass} min={isoDay(now)} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Settle by date" />
            {date && <p className="text-sm text-muted">{dueLabel(endOfDay(date))}</p>}
            <Button onClick={() => onSettleBy(endOfDay(date))} disabled={!date}>
              Save date
            </Button>
            {trip.settleBy && (
              <Button variant="ghost" onClick={() => onSettleBy(null)}>
                Remove date
              </Button>
            )}
          </>
        )}
        {sheet === "member" && (
          <>
            <h2 className="text-lg font-bold">Add someone to the trip</h2>
            <PersonPicker label="Who's joining?" onPick={onMember} />
          </>
        )}
        {open && (
          <>
            <div className="flex items-center gap-3">
              <IconTile name={catOf(open.category).icon} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-bold">{open.note || catOf(open.category).label}</h2>
                <p className="text-sm text-muted">
                  {nameOf(open.payer)} paid · {new Date(open.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </p>
              </div>
              <span className="font-display text-3xl tabular">{formatMoney(BigInt(open.amount))}</span>
            </div>
            <ul className="flex flex-col gap-2">
              {[...shares(BigInt(open.amount), open.participants)].map(([a, v]) => (
                <li key={a} className="flex min-h-11 items-center gap-3">
                  <Avatar name={members.find((m) => m.address === a)?.name} size={32} />
                  <span className="flex-1 font-medium">{nameOf(a)}</span>
                  <span className="tabular text-muted">{formatMoney(v)}</span>
                </li>
              ))}
            </ul>
            {open.by === me && (
              <Button variant="ghost" onClick={() => onRemove(open)}>
                Remove expense
              </Button>
            )}
          </>
        )}
      </Sheet>
    </Screen>
  );
}
