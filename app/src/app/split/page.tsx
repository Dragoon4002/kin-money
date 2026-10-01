"use client";
import Link from "next/link";
import { useState } from "react";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { AmountInput, useSignedIn } from "@/components/social/bits";
import { Avatar, Button, Card, Delivered, ErrorText, Field, Ico, Screen, Tabs, inputClass } from "@/components/ui";
import { createRequest } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { formatMoney, fromLocal } from "@/lib/money";

/** #26 Split a bill evenly or by custom amounts; sends a request to each person. */
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
  const [mode, setMode] = useState<"even" | "custom">("even");
  const [custom, setCustom] = useState<Record<string, string>>({}); // address → local amount typed

  const units = Number(total) > 0 ? fromLocal(total) : 0n;
  const ways = BigInt(people.length + (withMe ? 1 : 0));
  // ponytail: floor split; the few leftover cents stay with you.
  const share = people.length && ways ? units / ways : 0n;
  // Custom: everyone's part (incl. mine if included) must add up to the total.
  const owe = (p: Person) => (mode === "even" ? share : Number(custom[p.address]) > 0 ? fromLocal(custom[p.address]) : 0n);
  const mine = withMe && Number(custom.me) > 0 ? fromLocal(custom.me) : 0n;
  const left = units - people.reduce((a, p) => a + owe(p), 0n) - mine;
  // ponytail: fromLocal rounding can leave <1¢ of drift; treat anything under a cent as settled.
  const balanced = left < 10_000n && left > -10_000n;
  const ready = mode === "even" ? share > 0n : units > 0n && people.length > 0 && balanced && people.every((p) => owe(p) > 0n);

  function add(p: Person | null) {
    if (!p) return;
    setPeople((ps) => (ps.some((x) => x.address === p.address) ? ps : [...ps, p]));
    setPickerKey((k) => k + 1); // fresh, empty picker for the next person
  }

  async function send() {
    setBusy(true);
    setErr("");
    const pending = people.filter((p) => !asked.includes(p.address));
    const results = await Promise.allSettled(pending.map((p) => createRequest(p.address, owe(p), note.trim())));
    const ok = pending.filter((_, i) => results[i].status === "fulfilled").map((p) => p.address);
    setAsked((a) => [...a, ...ok]);
    const failed = results.find((r) => r.status === "rejected");
    if (failed) setErr(humanError((failed as PromiseRejectedResult).reason));
    setBusy(false);
  }

  if (people.length && asked.length === people.length)
    return (
      <Screen>
        <Delivered title="Bill split" subtitle={mode === "even" ? `Asked ${people.length} ${people.length === 1 ? "person" : "people"} for ${formatMoney(share)} each.` : `Asked ${people.length} ${people.length === 1 ? "person" : "people"} for their part.`}>
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
                <Avatar name={p.name} size={32} /> @{p.name} <Ico name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="flex min-h-11 items-center justify-between gap-3">
        <span className="font-medium">Include me in the split</span>
        <input type="checkbox" className="size-6 accent-brand" checked={withMe} onChange={(e) => setWithMe(e.target.checked)} />
      </label>

      <Tabs value={mode} options={[["even", "Split evenly"], ["custom", "Custom amounts"]] as const} onChange={setMode} />

      {mode === "custom" && people.length > 0 && (
        <Card className="flex flex-col gap-3">
          {[...(withMe ? [{ address: "me", name: "You" }] : []), ...people].map((p) => (
            <label key={p.address} className="flex min-h-11 items-center gap-3">
              <Avatar name={p.name} size={32} />
              <span className="min-w-0 flex-1 truncate font-medium">{p.address === "me" ? "You" : `@${p.name}`}</span>
              <input
                className={`${inputClass} h-11! w-28! text-right tabular`}
                inputMode="decimal"
                placeholder="0"
                aria-label={p.address === "me" ? "Your part" : `@${p.name}'s part`}
                value={custom[p.address] ?? ""}
                onChange={(e) => {
                  const v = e.target.value.replace(",", ".");
                  if (/^\d{0,9}(\.\d{0,2})?$/.test(v)) setCustom((c) => ({ ...c, [p.address]: v }));
                }}
              />
            </label>
          ))}
          <p aria-live="polite" className={`text-right text-sm font-medium ${balanced ? "text-good" : left < 0n ? "text-bad" : "text-muted"}`}>
            {units === 0n ? "Enter the total first" : balanced ? "Adds up ✓" : left > 0n ? `${formatMoney(left)} left to split` : `${formatMoney(-left)} over the total`}
          </p>
        </Card>
      )}

      {mode === "even" && share > 0n && (
        <Card className="flex items-center justify-between">
          <span className="text-muted">Each person pays</span>
          <span className="font-display tabular text-3xl">{formatMoney(share)}</span>
        </Card>
      )}

      <ErrorText>{err}</ErrorText>
      <div className="mt-auto pt-2">
        <Button onClick={send} disabled={!ready} busy={busy}>
          {people.length ? `Ask ${people.length} ${people.length === 1 ? "person" : "people"}` : "Add people to split with"}
        </Button>
      </div>
    </Screen>
  );
}
