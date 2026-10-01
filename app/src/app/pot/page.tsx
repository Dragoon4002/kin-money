"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Address } from "viem";
import { Empty, Loading, MoneyInput, Pad, Status, Who, WhoAvatar, useAction, useLoad, useMe } from "@/components/programs/kit";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Band, Button, Chip, ErrorText, Ring, Row, Screen } from "@/components/ui";
import { KinPotAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { formatMoney, fromLocal } from "@/lib/money";
import { createdId, isJar, listPots, same } from "@/lib/programs";
import { call } from "@/lib/tx";

export default function PotPage() {
  const me = useMe();
  const [creating, setCreating] = useState(false);
  // Savings jars are pots too; they live on /jars.
  const { data, error } = useLoad(() => listPots(me!).then((ps) => ps.filter((p) => !isJar(p))), me);

  if (creating) return <NewPot me={me} onCancel={() => setCreating(false)} />;

  return (
    <Screen title="Family pots" back="/money" wide>
      <Pad>
        <p className="text-muted">Chip in together from anywhere. When the pot is full, it pays out by itself.</p>
        <ErrorText>{error}</ErrorText>
        {!data && !error && <Loading />}
        {data && !data.length && <Empty icon="🏺" title="No pots yet" sub="Brothers and sisters abroad, one pot for Mum's monthly costs." />}
      </Pad>
      {!!data?.length && <Band>Your pots</Band>}
      {data?.map((p) => {
        const pct = Number(p.balance) / Number(p.target);
        return (
          <Row
            key={String(p.id)}
            href={`/pot/${p.id}`}
            icon={<WhoAvatar a={p.beneficiary} size={44} />}
            title={<>For <Who a={p.beneficiary} me={me} you="you" /></>}
            sub={p.closed ? <Chip>Closed</Chip> : `${formatMoney(p.balance)} of ${formatMoney(p.target)}`}
            trail={
              !p.closed && (
                <Ring value={pct} size={44} stroke={5}>
                  <span className="text-[10px] font-bold tabular">{Math.floor(pct * 100)}%</span>
                </Ring>
              )
            }
          />
        );
      })}
      <Pad className="mt-auto pt-4">
        <Button onClick={() => setCreating(true)}>Start a pot</Button>
      </Pad>
    </Screen>
  );
}

function NewPot({ me, onCancel }: { me?: Address; onCancel: () => void }) {
  const router = useRouter();
  const [forWho, setForWho] = useState<Person | null>(null);
  const [target, setTarget] = useState("");
  const [others, setOthers] = useState<Address[]>([]);
  const [meToo, setMeToo] = useState(true);
  const [picked, setPicked] = useState<Person | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const { busy, status, error, run } = useAction();
  const value = Number(target) > 0 ? fromLocal(target) : 0n;
  const members = meToo && me ? [me, ...others] : others;

  function add() {
    if (picked && !same(picked.address, me) && !others.some((m) => same(m, picked.address))) setOthers([...others, picked.address]);
    setPicked(null);
    setPickerKey((k) => k + 1);
  }

  async function create() {
    if (!forWho || !value || !members.length) return;
    await run(async (say) => {
      const hash = await call(addr.pot, KinPotAbi, "create", [forWho.address, value, members]);
      say("Setting up your pot…");
      const id = await createdId(hash, KinPotAbi, "PotCreated");
      router.push(`/pot/${id}`);
    });
  }

  const creatorOk = meToo || same(forWho?.address, me);

  return (
    <Screen title="New pot" action={<button onClick={onCancel} className="h-11 px-2 text-muted">Cancel</button>}>
      <PersonPicker label="Who is it for?" onPick={setForWho} />
      <MoneyInput label="Goal each month" value={target} onChange={setTarget} hint="Paid to them the moment the pot reaches it." />
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Who chips in?</span>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setMeToo(!meToo)}
            aria-pressed={meToo}
            className={`flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium ${meToo ? "border-brand bg-brand-soft text-brand" : "border-line text-muted"}`}
          >
            {meToo ? "✓ " : ""}Me
          </button>
          {others.map((m) => (
            <span key={m} className="flex h-11 items-center gap-2 rounded-full border border-line bg-surface pl-1 pr-2">
              <WhoAvatar a={m} size={32} />
              <span className="text-sm font-medium"><Who a={m} me={me} /></span>
              <button aria-label="Remove" onClick={() => setOthers(others.filter((x) => x !== m))} className="grid size-8 place-items-center text-muted">×</button>
            </span>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1"><PersonPicker key={pickerKey} label="Add family" onPick={setPicked} /></div>
          <button onClick={add} disabled={!picked || members.length >= 20} className="h-14 rounded-full bg-brand-soft px-5 font-semibold text-brand disabled:opacity-40">Add</button>
        </div>
      </div>
      <ErrorText>{error || (!creatorOk && forWho ? "Add yourself so you can chip in too." : "")}</ErrorText>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <Status>{busy && status}</Status>
        <Button onClick={create} busy={busy} disabled={!forWho || !value || !members.length || !creatorOk}>Start pot</Button>
      </div>
    </Screen>
  );
}
