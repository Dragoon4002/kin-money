"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { AmountInput, Bubble, useSignedIn } from "@/components/social/bits";
import { Button, Delivered, ErrorText, Field, Screen, inputClass } from "@/components/ui";
import { createRequest } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { formatMoney, fromLocal } from "@/lib/money";

const EMOJI = ["📚", "🍕", "🏠", "🚕", "💊", "🎁"];

export default function RequestPage() {
  return (
    <Suspense>
      <RequestForm />
    </Suspense>
  );
}

/** #18 Request as message: "Need $50 for books 📚". `?amount=` prefills (local currency). */
function RequestForm() {
  useSignedIn();
  const prefill = useSearchParams().get("amount") ?? "";
  const [person, setPerson] = useState<Person | null>(null);
  const [amount, setAmount] = useState(/^\d{0,9}(\.\d{0,2})?$/.test(prefill) ? prefill : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  const units = Number(amount) > 0 ? fromLocal(amount) : 0n;

  async function send() {
    if (!person || !units) return;
    setBusy(true);
    setErr("");
    try {
      await createRequest(person.address, units, note.trim());
      setSent(true);
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  if (sent && person)
    return (
      <Screen>
        <Delivered title="Request sent" subtitle={`@${person.name} can pay you with one tap.`}>
          <Link href="/requests" className="grid h-14 w-full place-items-center rounded-full bg-brand font-semibold text-brand-ink active:scale-[0.98]">
            See your requests
          </Link>
        </Delivered>
      </Screen>
    );

  return (
    <Screen title="Request" back="/home">
      <PersonPicker label="Ask who?" onPick={setPerson} />
      <AmountInput value={amount} onChange={setAmount} />
      <Field label="What's it for?">
        <input className={`${inputClass} text-center`} placeholder="school books" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="-mt-1 flex justify-center gap-2" aria-label="Add an emoji">
        {EMOJI.map((em) => (
          <button
            key={em}
            type="button"
            aria-label={`Add ${em}`}
            onClick={() => setNote((n) => (n.includes(em) ? n : `${n.trim()} ${em}`.trim()))}
            className="grid size-11 place-items-center rounded-full bg-surface-2 text-xl active:scale-90"
          >
            {em}
          </button>
        ))}
      </div>

      {units > 0n && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted">{person ? `@${person.name} will see` : "Preview"}</span>
          <Bubble mine amount={`Need ${formatMoney(units)}`} note={note.trim() ? `for ${note.trim()}` : undefined} />
        </div>
      )}

      <ErrorText>{err}</ErrorText>
      <div className="mt-auto pt-2">
        <Button onClick={send} disabled={!person || !units} busy={busy}>
          {person ? `Ask @${person.name}` : "Send request"}
        </Button>
      </div>
    </Screen>
  );
}
