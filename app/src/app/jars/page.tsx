"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Address } from "viem";
import { Empty, Loading, MoneyInput, Pad, Status, jarKey, jarMeta, setMeta, useAction, useLoad, useMe } from "@/components/programs/kit";
import { Amount, Band, Button, Chip, ErrorText, Field, Ring, Row, Screen, inputClass } from "@/components/ui";
import { KinPotAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { formatMoney, fromLocal } from "@/lib/money";
import { createdId, isJar, listPots } from "@/lib/programs";
import { call } from "@/lib/tx";

// Savings jars: a KinPot where I'm the only member and the beneficiary. When the jar hits its goal,
// the pot pays the goal back to me (PotPaid) — that's the "goal reached" moment.

export default function JarsPage() {
  const me = useMe();
  const [creating, setCreating] = useState(false);
  const { data, error } = useLoad(() => listPots(me!).then((ps) => ps.filter((p) => isJar(p) && !p.closed)), me);

  if (creating) return <NewJar me={me} onCancel={() => setCreating(false)} />;
  const saved = data?.reduce((a, p) => a + p.balance, 0n) ?? 0n;

  return (
    <Screen title="Savings jars" back="/money" wide>
      <Pad className="flex flex-col items-center gap-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Saved so far</p>
        <Amount value={formatMoney(saved)} size="xl" />
        <ErrorText>{error}</ErrorText>
      </Pad>
      {!data && !error && <Loading />}
      {data && !data.length && <Empty icon="🫙" title="No jars yet" sub="Saving for a bike, a trip or a phone? Give it a jar and watch it fill." />}
      {!!data?.length && <Band>Your jars</Band>}
      {data?.map((p) => {
        const { name, emoji } = jarMeta(p.id);
        const pct = Number(p.balance) / Number(p.target);
        return (
          <Row
            key={String(p.id)}
            href={`/jars/${p.id}`}
            icon={<span className="grid size-11 place-items-center rounded-full bg-surface-2 text-2xl">{emoji}</span>}
            title={name}
            sub={p.round > 0n ? <Chip tone="good">Goal reached ✓✓</Chip> : `${formatMoney(p.balance)} of ${formatMoney(p.target)}`}
            trail={
              <Ring value={pct} size={44} stroke={5}>
                <span className="text-[10px] font-bold tabular">{Math.floor(pct * 100)}%</span>
              </Ring>
            }
          />
        );
      })}
      <Pad className="mt-auto pt-4">
        <Button onClick={() => setCreating(true)}>New jar</Button>
      </Pad>
    </Screen>
  );
}

const EMOJIS = ["🫙", "🚲", "🎮", "📱", "✈️", "🎓", "👟", "🎁"];

function NewJar({ me, onCancel }: { me?: Address; onCancel: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [goal, setGoal] = useState("");
  const { busy, status, error, run } = useAction();
  const value = Number(goal) > 0 ? fromLocal(goal) : 0n;
  const n = name.trim();

  async function create() {
    if (!me || !n || !value) return;
    await run(async (say) => {
      const hash = await call(addr.pot, KinPotAbi, "create", [me, value, [me]]);
      say("Setting up your jar…");
      const id = await createdId(hash, KinPotAbi, "PotCreated");
      setMeta(jarKey(id), { name: n, emoji });
      router.push(`/jars/${id}`);
    });
  }

  return (
    <Screen title="New jar" action={<button onClick={onCancel} className="h-11 px-2 text-muted">Cancel</button>}>
      <div className="grid size-24 place-items-center self-center rounded-full bg-surface-2 text-5xl">{emoji}</div>
      <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Pick an icon">
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={e === emoji}
            onClick={() => setEmoji(e)}
            className={`grid size-12 place-items-center rounded-full text-2xl transition active:scale-95 ${e === emoji ? "bg-ink" : "bg-surface-2"}`}
          >
            {e}
          </button>
        ))}
      </div>
      <Field label="What are you saving for?">
        <input className={inputClass} placeholder="New bike" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
      </Field>
      <MoneyInput label="Goal" value={goal} onChange={setGoal} hint="When the jar is full, the money lands in your balance." />
      <ErrorText>{error}</ErrorText>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <Status>{busy && status}</Status>
        <Button onClick={create} busy={busy} disabled={!n || !value}>Start saving</Button>
      </div>
    </Screen>
  );
}
