"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Address } from "viem";
import { Choice, Empty, Loading, MoneyInput, Pad, Status, Who, WhoAvatar, useAction, useLoad, useMe } from "@/components/programs/kit";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Band, Button, Card, Chip, ErrorText, Ico, Row, Screen } from "@/components/ui";
import { Kinko } from "@/components/kinko/Kinko";
import { KinCircleAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { formatMoney, fromLocal } from "@/lib/money";
import { circlePhase, createdId, listCircles, same } from "@/lib/programs";
import { call } from "@/lib/tx";

const ROUND_LENGTHS = [
  { value: 7 * 86_400, label: "Weekly" },
  { value: 30 * 86_400, label: "Monthly" },
  { value: 300, label: "5 min (demo)" },
];

export default function CirclePage() {
  const me = useMe();
  const [creating, setCreating] = useState(false);
  const { data, error } = useLoad(() => listCircles(me!), me);

  if (creating) return <NewCircle me={me} onCancel={() => setCreating(false)} />;

  return (
    <Screen title="Savings circles" back="/explore" wide>
      <Pad>
        <p className="text-muted">Friends put in the same amount each round. Each round, one person takes it all home.</p>
        <ErrorText>{error}</ErrorText>
        {!data && !error && <Loading />}
        {data && !data.length && <Empty icon="circle" title="No circles yet" sub="Save together like a chit fund or tanda — Kin keeps everyone's turn fair." />}
      </Pad>
      {!!data?.length && <Band>Your circles</Band>}
      {data?.map((c) => {
        const phase = circlePhase(c);
        const turn = c.members[c.round]?.address;
        return (
          <Row
            key={String(c.id)}
            href={`/circle/${c.id}`}
            icon={<Kinko size={44} mood={phase === "running" ? "happy" : "calm"} />}
            title={<>{c.members.length} people · {formatMoney(c.contribution)} each</>}
            sub={phase === "running" ? <>Turn {c.round + 1}: <Who a={turn} me={me} /></> : `${formatMoney(c.contribution * BigInt(c.members.length))} each turn`}
            trail={
              phase === "gathering" ? <Chip tone="brand">{c.joined}/{c.members.length} joined</Chip>
                : phase === "stalled" ? <Chip tone="warn">Didn&apos;t start</Chip>
                : phase === "done" ? <Chip tone="good">Finished ✓✓</Chip>
                : <Chip tone="good">Live</Chip>
            }
          />
        );
      })}
      <Pad className="mt-auto pt-4">
        <Button onClick={() => setCreating(true)}>Start a circle</Button>
      </Pad>
    </Screen>
  );
}

function NewCircle({ me, onCancel }: { me?: Address; onCancel: () => void }) {
  const router = useRouter();
  const [others, setOthers] = useState<Address[]>([]);
  const [picked, setPicked] = useState<Person | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [amount, setAmount] = useState("");
  const [length, setLength] = useState(ROUND_LENGTHS[1].value);
  const { busy, status, error, run } = useAction();
  const value = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const members = me ? [me, ...others] : [];
  const n = BigInt(members.length);

  function add() {
    if (picked && !same(picked.address, me) && !others.some((m) => same(m, picked.address))) setOthers([...others, picked.address]);
    setPicked(null);
    setPickerKey((k) => k + 1);
  }

  function move(i: number, d: -1 | 1) {
    const next = [...others];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setOthers(next);
  }

  async function create() {
    if (members.length < 2 || !value) return;
    await run(async (say) => {
      const hash = await call(addr.circle, KinCircleAbi, "create", [members, value, length]);
      say("Setting up your circle…");
      const id = await createdId(hash, KinCircleAbi, "CircleCreated");
      router.push(`/circle/${id}`);
    });
  }

  return (
    <Screen title="New circle" action={<button onClick={onCancel} className="h-11 px-2 text-muted">Cancel</button>}>
      <MoneyInput label="Everyone puts in, each round" value={amount} onChange={setAmount} />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">How often?</span>
        <Choice options={ROUND_LENGTHS} value={length} onChange={setLength} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Turn order</span>
        {members.map((m, i) => (
          <div key={m} className="flex h-14 items-center gap-3 rounded-full border border-line bg-surface pl-3 pr-1">
            <span className="w-5 text-center font-bold text-muted">{i + 1}</span>
            <WhoAvatar a={m} size={32} />
            <span className="flex-1 truncate font-medium"><Who a={m} me={me} /></span>
            {value > 0n && <span className="text-xs text-muted">{formatMoney((n - 1n - BigInt(i)) * value)} deposit</span>}
            {i > 1 && <button aria-label="Move up" onClick={() => move(i - 1, -1)} className="grid size-11 place-items-center text-muted"><Ico name="chevron" className="-rotate-90" /></button>}
            {i > 0 && <button aria-label="Remove" onClick={() => setOthers(others.filter((x) => x !== m))} className="grid size-11 place-items-center text-muted"><Ico name="close" /></button>}
          </div>
        ))}
        <div className="flex items-end gap-2">
          <div className="flex-1"><PersonPicker key={pickerKey} label="Add a friend" onPick={setPicked} /></div>
          <button onClick={add} disabled={!picked || members.length >= 20} className="h-14 rounded-full bg-brand-soft px-5 font-semibold text-brand disabled:opacity-40">Add</button>
        </div>
      </div>
      {value > 0n && members.length > 1 && (
        <Card className="text-sm text-muted">
          Each round someone takes home <b className="text-ink">{formatMoney(n * value)}</b>. A small safety deposit keeps everyone honest — earlier turns put down a bigger one, and it&apos;s returned at the end.
        </Card>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <Status>{busy && status}</Status>
        <Button onClick={create} busy={busy} disabled={members.length < 2 || !value}>Start circle</Button>
      </div>
    </Screen>
  );
}
