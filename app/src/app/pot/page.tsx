"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Address } from "viem";
import { Choice, Empty, Loading, MoneyInput, Pad, PotFor, Status, Who, WhoAvatar, useAction, useLoad, useMe } from "@/components/programs/kit";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Band, Button, Chip, ErrorText, Ico, IconTile, Ring, Row, Screen } from "@/components/ui";
import { KinPotAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { formatMoney, fromLocal } from "@/lib/money";
import { keepKey, newKey } from "@/lib/potLinks";
import { createdId, isJar, listOldPots, listPots, potPath, same, ZERO } from "@/lib/programs";
import { call } from "@/lib/tx";
import { notifyAdded } from "@/lib/live";

export default function PotPage() {
  const me = useMe();
  const [creating, setCreating] = useState(false);
  // Savings jars are pots too; they live on /jars.
  const { data, error } = useLoad(() => Promise.all([listPots(me!), listOldPots(me!).catch(() => [])]).then(([ps, old]) => [...ps, ...old].filter((p) => !isJar(p))), me);

  if (creating) return <NewPot me={me} onCancel={() => setCreating(false)} />;

  return (
    <Screen title="Family pots" back="/money" wide>
      <Pad>
        <p className="text-muted">Chip in together from anywhere. When the pot is full, it pays out by itself.</p>
        <ErrorText>{error}</ErrorText>
        {!data && !error && <Loading />}
        {data && !data.length && <Empty icon="pot" title="No pots yet" sub="Brothers and sisters abroad, one pot for Mum's monthly costs." />}
      </Pad>
      {!!data?.length && <Band>Your pots</Band>}
      {data?.map((p) => {
        const pct = Number(p.balance) / Number(p.target);
        return (
          <Row
            key={potPath(p)}
            href={`/pot/${potPath(p)}`}
            icon={p.toAll ? <IconTile name="pot" size={44} tone="brand" /> : <WhoAvatar a={p.beneficiaries[0]} size={44} />}
            title={<>For <PotFor p={p} me={me} /></>}
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

type ForWhom = "all" | "some" | "one";

/** Chips of picked people + a picker to add more. */
function People({ list, set, me, label, max = 20 }: { list: Address[]; set: (l: Address[]) => void; me?: Address; label: string; max?: number }) {
  const [picked, setPicked] = useState<Person | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  function add() {
    if (picked && !list.some((m) => same(m, picked.address))) set([...list, picked.address]);
    setPicked(null);
    setPickerKey((k) => k + 1);
  }
  return (
    <>
      {list.map((m) => (
        <span key={m} className="flex h-11 items-center gap-2 rounded-full border border-line bg-surface pl-1 pr-2">
          <WhoAvatar a={m} size={32} />
          <span className="text-sm font-medium"><Who a={m} me={me} /></span>
          <button aria-label="Remove" onClick={() => set(list.filter((x) => x !== m))} className="grid size-8 place-items-center text-muted">×</button>
        </span>
      ))}
      <div className="flex w-full items-end gap-2">
        <div className="min-w-0 flex-1"><PersonPicker key={pickerKey} label={label} onPick={setPicked} exclude={new Set(list.map((a) => a.toLowerCase()))} /></div>
        <button onClick={add} disabled={!picked || list.length >= max} className="h-14 rounded-full bg-brand-soft px-5 font-semibold text-brand disabled:opacity-40">Add</button>
      </div>
    </>
  );
}

function NewPot({ me, onCancel }: { me?: Address; onCancel: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<ForWhom>("one");
  const [one, setOne] = useState<Person | null>(null);
  const [some, setSome] = useState<Address[]>([]);
  const [target, setTarget] = useState("");
  const [others, setOthers] = useState<Address[]>([]);
  const [meToo, setMeToo] = useState(true);
  const { busy, status, error, run } = useAction();
  const value = Number(target) > 0 ? fromLocal(target) : 0n;
  const members = meToo && me ? [me, ...others.filter((m) => !same(m, me))] : others;
  const beneficiaries = mode === "all" ? [] : mode === "one" ? (one ? [one.address] : []) : some;
  const forOk = mode === "all" || beneficiaries.length > 0;

  async function create() {
    if (!forOk || !value || !members.length || !me) return;
    await run(async (say) => {
      const link = newKey(); // my invite link exists from the start (only members can hold one)
      const hash = await call(addr.pot, KinPotAbi, "create", [beneficiaries, mode === "all", value, members, meToo ? link.address : ZERO]);
      say("Setting up your pot…");
      const id = await createdId(hash, KinPotAbi, "PotCreated");
      if (meToo) keepKey(id, me, link.key);
      notifyAdded("pot", id, members);
      router.push(`/pot/${id}`);
    });
  }

  const creatorOk = meToo || beneficiaries.some((b) => same(b, me));

  return (
    <Screen title="New pot" action={<button onClick={onCancel} className="h-11 px-2 text-muted">Cancel</button>}>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Who is it for?</span>
        <Choice<ForWhom>
          options={[{ value: "all", label: "Everyone" }, { value: "some", label: "Some people" }, { value: "one", label: "One person" }]}
          value={mode}
          onChange={setMode}
        />
        {mode === "all" && <p className="text-sm text-muted">Each payout is split between everyone in the pot, including family who join later.</p>}
        {mode === "one" && <PersonPicker label="Person" onPick={setOne} />}
        {mode === "some" && <div className="flex flex-wrap gap-2"><People list={some} set={setSome} me={me} label="Add a person" /></div>}
        {mode === "some" && some.length > 1 && <p className="text-sm text-muted">Each payout is split between {some.length} people.</p>}
      </div>
      <MoneyInput label="Goal each month" value={target} onChange={setTarget} hint="Paid out the moment the pot reaches it." />
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Who chips in?</span>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setMeToo(!meToo)}
            aria-pressed={meToo}
            className={`flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium ${meToo ? "border-brand bg-brand-soft text-brand" : "border-line text-muted"}`}
          >
            {meToo && <Ico name="check" size={16} />}Me
          </button>
          <People list={others} set={(l) => setOthers(l.filter((m) => !same(m, me)))} me={me} label="Add family" max={meToo ? 19 : 20} />
        </div>
        <p className="text-sm text-muted">You can also invite family with a link once the pot is ready.</p>
      </div>
      <ErrorText>{error || (!creatorOk && forOk ? "Add yourself so you can chip in too." : "")}</ErrorText>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <Status>{busy && status}</Status>
        <Button onClick={create} busy={busy} disabled={!forOk || !value || !members.length || !creatorOk}>Start pot</Button>
      </div>
    </Screen>
  );
}
