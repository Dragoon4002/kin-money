"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PayQr } from "@/components/core/PayQr";
import { share } from "@/components/core/share";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { AmountInput, Bubble, useSignedIn } from "@/components/social/bits";
import { Button, Card, Delivered, ErrorText, Field, Ico, Screen, Tabs, inputClass } from "@/components/ui";
import { createRequest } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { formatMoney, fromLocal } from "@/lib/money";
import { payLink } from "@/lib/payLink";
import { dueLabel, endOfDay } from "@/lib/reminders";

const MODES = [["person", "From a person"], ["link", "As a link"]] as const;
const DUE = [["none", "Anytime"], ["3", "In 3 days"], ["7", "In a week"], ["pick", "Pick a date"]] as const;
const isoDay = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

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
  const profile = useSignedIn();
  const handle = profile?.name;
  const [mode, setMode] = useState<"person" | "link">("person");
  const [copied, setCopied] = useState(false);
  const prefill = useSearchParams().get("amount") ?? "";
  const [person, setPerson] = useState<Person | null>(null);
  const [amount, setAmount] = useState(/^\d{0,9}(\.\d{0,2})?$/.test(prefill) ? prefill : "");
  const [note, setNote] = useState("");
  const [dueMode, setDueMode] = useState<(typeof DUE)[number][0]>("none");
  const [picked, setPicked] = useState("");
  const [now] = useState(Date.now); // render-stable "today"
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  const units = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const due = dueMode === "3" || dueMode === "7" ? endOfDay(now, Number(dueMode)) : dueMode === "pick" && picked ? endOfDay(picked) : null;

  async function send() {
    if (!person || !units) return;
    setBusy(true);
    setErr("");
    try {
      await createRequest(person.address, units, note.trim(), due);
      setSent(true);
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  // Link mode: a pay-me link (and QR) anyone can open — even people not on Kin yet.
  const link = mode === "link" && handle && units ? payLink(handle, units, note.trim()) : "";
  const linkText = `Hi! Please pay me ${formatMoney(units)}${note.trim() ? ` for ${note.trim()}` : ""} on Kin:`;

  async function shareLink() {
    if (link && (await share(linkText, link)) === "copied") setCopied(true);
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
      <Tabs value={mode} options={MODES} onChange={(m) => (setMode(m), setCopied(false))} />
      {mode === "person" && <PersonPicker label="Ask who?" onPick={setPerson} />}
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

      {mode === "person" && (
        <div className="flex flex-col gap-1.5" role="group" aria-label="Pay by">
          <span className="text-sm font-medium text-muted">Pay by</span>
          <Tabs value={dueMode} options={DUE} onChange={setDueMode} />
          {dueMode === "pick" && (
            <input type="date" className={inputClass} min={isoDay(now)} max={isoDay(now + 365 * 86_400_000)} value={picked} onChange={(e) => setPicked(e.target.value)} aria-label="Pay by date" />
          )}
          {due && <span className="text-xs text-muted">{new Date(due).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span>}
        </div>
      )}

      {mode === "person" && units > 0n && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted">{person ? `@${person.name} will see` : "Preview"}</span>
          <Bubble mine amount={`Need ${formatMoney(units)}`} note={note.trim() ? `for ${note.trim()}` : undefined} />
          {due && <span className="self-end text-sm text-muted">{dueLabel(due)}</span>}
        </div>
      )}

      {mode === "link" && !handle && (
        <Card className="text-center text-sm">Pick a Kin name first so people know who they&apos;re paying.</Card>
      )}
      {link && (
        <Card className="flex flex-col items-center gap-2 text-center">
          <div className="w-full max-w-56"><PayQr text={link} label={`QR code to pay @${handle} ${formatMoney(units)}`} /></div>
          <p className="text-sm text-muted">They scan or tap the link — amount and your name are filled in.</p>
        </Card>
      )}

      <ErrorText>{err}</ErrorText>
      <div className="mt-auto flex flex-col gap-2 pt-2">
        {mode === "person" ? (
          <Button onClick={send} disabled={!person || !units} busy={busy}>
            {person ? `Ask @${person.name}` : "Send request"}
          </Button>
        ) : (
          <>
            <a
              href={link ? `https://wa.me/?text=${encodeURIComponent(`${linkText} ${link}`)}` : undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!link}
              className={`flex h-14 items-center justify-center gap-2 rounded-full bg-good font-semibold text-fun-ink active:scale-[0.98] ${link ? "" : "pointer-events-none opacity-40"}`}
            >
              <Ico name="share" /> Send on WhatsApp
            </a>
            <Button variant="ghost" onClick={shareLink} disabled={!link}>
              {copied ? "Link copied ✓" : "Share or copy link"}
            </Button>
          </>
        )}
      </div>
    </Screen>
  );
}
