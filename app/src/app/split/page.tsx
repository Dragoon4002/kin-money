"use client";
import Link from "next/link";
import { useState } from "react";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { AmountInput, useSignedIn } from "@/components/social/bits";
import { Avatar, Button, Card, Delivered, ErrorText, Field, Screen, inputClass } from "@/components/ui";
import { createRequest } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { formatMoney, fromLocal } from "@/lib/money";

/** #26 Split a bill evenly; sends a request to each person. */
export default function SplitPage() {
  useSignedIn();
  const [people, setPeople] = useState<Person[]>([]);
  const [pickerKey, setPickerKey] = useState(0);
  const [total, setTotal] = useState("");
  const [note, setNote] = useState("");
  const [withMe, setWithMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [asked, setAsked] = useState<string[]>([]);

  const units = Number(total) > 0 ? fromLocal(total) : 0n;
  const ways = BigInt(people.length + (withMe ? 1 : 0));
  // ponytail: floor split; the few leftover cents stay with you.
  const share = people.length && ways ? units / ways : 0n;

  function add(p: Person | null) {
    if (!p) return;
    setPeople((ps) => (ps.some((x) => x.address === p.address) ? ps : [...ps, p]));
    setPickerKey((k) => k + 1); // fresh, empty picker for the next person
  }

  async function send() {
    setBusy(true);
    setErr("");
    const pending = people.filter((p) => !asked.includes(p.address));
    const results = await Promise.allSettled(pending.map((p) => createRequest(p.address, share, note.trim())));
    const ok = pending.filter((_, i) => results[i].status === "fulfilled").map((p) => p.address);
    setAsked((a) => [...a, ...ok]);
    const failed = results.find((r) => r.status === "rejected");
    if (failed) setErr(humanError((failed as PromiseRejectedResult).reason));
    setBusy(false);
  }

  if (people.length && asked.length === people.length)
    return (
      <Screen>
        <Delivered title="Bill split" subtitle={`Asked ${people.length} ${people.length === 1 ? "person" : "people"} for ${formatMoney(share)} each.`}>
          <Link href="/requests" className="grid h-14 w-full place-items-center rounded-full bg-brand font-semibold text-brand-ink active:scale-[0.98]">
            Track who paid
          </Link>
        </Delivered>
      </Screen>
    );

  return (
    <Screen title="Split a bill" back="/home">
      <AmountInput label="Total bill" value={total} onChange={setTotal} />
      <Field label="What was it?">
        <input className={`${inputClass} text-center`} placeholder="Dinner 🍕" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <PersonPicker key={pickerKey} label="Split with" onPick={add} />

      {people.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Splitting with">
          {people.map((p) => (
            <li key={p.address}>
              <button
                type="button"
                onClick={() => setPeople((ps) => ps.filter((x) => x.address !== p.address))}
                aria-label={`Remove @${p.name}`}
                className="flex h-11 items-center gap-2 rounded-full bg-brand-soft pl-1.5 pr-3 text-sm font-medium text-brand active:scale-95"
              >
                <Avatar name={p.name} size={32} /> @{p.name} <span aria-hidden>✕</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="flex min-h-11 items-center justify-between gap-3">
        <span className="font-medium">Include me in the split</span>
        <input type="checkbox" className="size-6 accent-brand" checked={withMe} onChange={(e) => setWithMe(e.target.checked)} />
      </label>

      {share > 0n && (
        <Card className="flex items-center justify-between">
          <span className="text-muted">Each person pays</span>
          <span className="font-display tabular text-3xl">{formatMoney(share)}</span>
        </Card>
      )}

      <ErrorText>{err}</ErrorText>
      <div className="mt-auto pt-2">
        <Button onClick={send} disabled={!share} busy={busy}>
          {people.length ? `Ask ${people.length} ${people.length === 1 ? "person" : "people"}` : "Add people to split with"}
        </Button>
      </div>
    </Screen>
  );
}
