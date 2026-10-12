"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Empty, Sheet, useLoad, useMe } from "@/components/programs/kit";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { SkeletonRows } from "@/components/social/bits";
import { Avatars } from "@/components/trips/bits";
import { Avatar, Button, ErrorText, Field, Ico, IconTile, Row, Screen, inputClass } from "@/components/ui";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { createTrip, listTrips } from "@/lib/trips";

/** Group trips: who paid what, settled in one tap. */
export default function TripsPage() {
  const me = useMe();
  const { data: trips, error } = useLoad(listTrips, me);
  const [open, setOpen] = useState(false);

  return (
    <Screen title="Trips" back="/explore" wide>
      {error && <div className="px-5"><ErrorText>We couldn&apos;t load your trips. Try again soon.</ErrorText></div>}
      {!trips && !error && <div className="px-5"><SkeletonRows /></div>}
      {trips?.length === 0 && <Empty icon="trip" title="No trips yet" sub="Add everyone once, log costs as you go, settle up at the end." />}
      {!!trips?.length && (
        <ul className="flex flex-col">
          {trips.map((t) => {
            const net = BigInt(t.net);
            return (
              <li key={t.id}>
                <Row
                  href={`/trips/${t.id}`}
                  icon={<IconTile name="trip" />}
                  title={t.name}
                  sub={<Avatars people={t.members} size={22} />}
                  trail={
                    <span className={`text-right text-sm font-semibold ${net > 0n ? "text-good" : net < 0n ? "text-bad" : "text-muted"}`}>
                      {net > 0n ? <>You&apos;re owed<br />{formatMoney(net)}</> : net < 0n ? <>You owe<br />{formatMoney(-net)}</> : "All settled"}
                    </span>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-auto px-5 pt-2">
        <Button onClick={() => setOpen(true)}>New trip</Button>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} label="New trip">
        <NewTrip />
      </Sheet>
    </Screen>
  );
}

function NewTrip() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [pickerKey, setPickerKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function add(p: Person | null) {
    if (!p) return;
    setPeople((ps) => (ps.some((x) => x.address === p.address) || ps.length >= 19 ? ps : [...ps, p]));
    setPickerKey((k) => k + 1);
  }

  async function create() {
    setBusy(true);
    setErr("");
    try {
      const { id } = await createTrip(name.trim(), people.map((p) => p.address));
      router.push(`/trips/${id}`);
    } catch (e) {
      setErr(humanError(e));
      setBusy(false);
    }
  }

  return (
    <div className="-mx-5 flex max-h-[80dvh] flex-col gap-3 overflow-y-auto px-5">
      <h2 className="text-lg font-bold">New trip</h2>
      <Field label="Trip name">
        <input className={inputClass} placeholder="Goa with the gang" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <PersonPicker key={pickerKey} label="Who's coming?" onPick={add} exclude={new Set(people.map((p) => p.name))} />
      {people.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Coming along">
          {people.map((p) => (
            <li key={p.address}>
              <button
                type="button"
                onClick={() => setPeople((ps) => ps.filter((x) => x.address !== p.address))}
                aria-label={`Remove @${p.name}`}
                className="flex h-11 items-center gap-2 rounded-full bg-brand-soft pl-1.5 pr-3 text-sm font-medium text-brand active:scale-95"
              >
                <Avatar name={p.name} size={32} /> @{p.name} <Ico name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <ErrorText>{err}</ErrorText>
      <Button onClick={create} busy={busy} disabled={!name.trim()}>
        {people.length ? `Start trip with ${people.length + 1}` : "Start trip"}
      </Button>
    </div>
  );
}
