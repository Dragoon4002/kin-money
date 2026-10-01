"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Hex } from "viem";
import { share } from "@/components/core/share";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { AmountInput } from "@/components/social/bits";
import { Avatar, Button, Delivered, ErrorText, inputClass, Screen, Tabs } from "@/components/ui";
import { getAccount, isUnlocked, useRequireAccount } from "@/lib/account";
import { getBalance } from "@/lib/activity";
import { CATEGORIES, setCategory, setNote, type CategoryId } from "@/lib/categories";
import { createLink } from "@/lib/claimLink";
import { recordPayment } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { formatMoney, fromLocal, getCurrency } from "@/lib/money";
import { resolveName } from "@/lib/names";
import { sendDollars } from "@/lib/tx";

type Mode = "person" | "link";
const MODES = [["person", "To a person"], ["link", "As a link"]] as const;
const AMOUNT_RE = /^\d{0,9}(\.\d{0,2})?$/;

/** Settle time for the "Delivered in 0.8s" tick (Face ID already done, so this is network time). */
async function timed<T>(run: () => Promise<T>): Promise<[T, number]> {
  const t0 = performance.now();
  const v = await run();
  return [v, performance.now() - t0];
}

// Rendered client-only (useSearchParams under Suspense), so reading localStorage in initial state is safe.
export function SendForm() {
  useRequireAccount();
  const router = useRouter();
  const params = useSearchParams();
  const to = params.get("to")?.replace(/^@/, "").toLowerCase() ?? "";
  const [currency] = useState(getCurrency);
  const [mode, setMode] = useState<Mode>("person");
  const [person, setPerson] = useState<Person | null>(null);
  const [picking, setPicking] = useState(!to);
  const [amount, setAmount] = useState(() => {
    const a = params.get("amount") ?? "";
    return AMOUNT_RE.test(a) ? a : "";
  });
  const [note, setNoteText] = useState("");
  const [cat, setCat] = useState<CategoryId | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [link, setLink] = useState<{ url: string; units: bigint } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!to) return;
    resolveName(to)
      .then((a) => (a ? setPerson({ address: a, name: to }) : setPicking(true)))
      .catch(() => setPicking(true));
  }, [to]);

  const units = Number(amount) > 0 ? fromLocal(amount, currency) : 0n;
  const ready = units > 0n && (mode === "link" || person);

  function label(hash: Hex) {
    if (cat) setCategory(hash, cat);
    setNote(hash, note);
  }

  async function send() {
    if (!ready) return;
    setErr("");
    setStatus(isUnlocked() ? "Sending…" : "Confirm with Face ID");
    const slow = setTimeout(() => setStatus("Almost there…"), 2500);
    try {
      const account = await getAccount();
      if ((await getBalance(account.address)) < units) throw new Error("insufficient balance");
      setStatus(mode === "link" ? "Holding it safely…" : `Sending to @${person!.name}…`);
      if (mode === "link") {
        const { url, hash } = await createLink(account.address, units);
        label(hash);
        setLink({ url, units });
      } else {
        const [hash, ms] = await timed(() => sendDollars(person!.address, units));
        label(hash);
        recordPayment(person!.address, units).catch(() => {});
        router.replace(`/details?tx=${hash}&fresh=1&ms=${Math.round(ms)}`);
        return; // keep the progress screen up while the receipt loads
      }
    } catch (e) {
      setErr(humanError(e));
    } finally {
      clearTimeout(slow);
    }
    setStatus(null);
  }

  if (link) {
    const money = formatMoney(link.units, currency);
    const text = `I sent you ${money} on Kin.${note.trim() ? ` "${note.trim()}"` : ""} Tap to collect it:`;
    return (
      <Screen>
        <Delivered title="Your link is ready" subtitle={`${money} is held safely for 7 days. Whoever opens the link can collect it.`}>
          <div className="flex flex-col gap-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(`${text} ${link.url}`)}`} target="_blank" rel="noreferrer"
              className="grid h-14 place-items-center rounded-full bg-good font-semibold text-fun-ink active:scale-[0.98]">
              Send on WhatsApp
            </a>
            <Button variant="soft" onClick={async () => (await share(text, link.url)) === "copied" && setCopied(true)}>
              {copied ? "Link copied ✓" : "Share another way"}
            </Button>
            <Link href="/home" className="grid h-14 place-items-center font-semibold text-muted">Done</Link>
          </div>
        </Delivered>
      </Screen>
    );
  }

  if (status) {
    return (
      <Screen>
        <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <div className="relative">
            <Avatar name={mode === "link" ? "Link" : person?.name} size={88} />
            <span className="absolute -inset-2 animate-spin rounded-full border-4 border-brand border-t-transparent" />
          </div>
          <p className="font-display tabular text-6xl leading-none">{formatMoney(units, currency)}</p>
          <p className="text-muted" aria-live="polite">{status}</p>
        </div>
      </Screen>
    );
  }

  return (
    <Screen title="Pay" back="/home">
      <Tabs value={mode} options={MODES} onChange={setMode} />

      {mode === "person" ? (
        picking || !person ? (
          picking ? <PersonPicker onPick={setPerson} /> : <p className="text-sm text-muted">Finding @{to}…</p>
        ) : (
          <div className="flex items-center gap-3 rounded-[28px] border border-line bg-surface p-3">
            <Avatar name={person.name} size={48} />
            <span className="flex-1">
              <span className="block text-xs text-muted">To</span>
              <span className="font-semibold">@{person.name}</span>
            </span>
            <button onClick={() => (setPerson(null), setPicking(true))} className="h-11 rounded-full px-4 text-sm font-semibold text-brand active:bg-brand-soft">
              Change
            </button>
          </div>
        )
      ) : (
        <p className="rounded-[28px] bg-brand-soft px-5 py-4 text-sm">
          For someone not on Kin yet. We&apos;ll hold the money safely and give you a link for WhatsApp. Not collected in 7 days? You can take it back.
        </p>
      )}

      <AmountInput label={`Amount in ${currency}`} value={amount} onChange={setAmount}
        hint={currency !== "USD" && units > 0n ? `≈ ${formatMoney(units, "USD")}` : undefined} />

      <label className="flex flex-col gap-1.5">
        <span className="sr-only">Note</span>
        <input className={`${inputClass} text-center`} placeholder="Add a note" value={note} maxLength={80} onChange={(e) => setNoteText(e.target.value)} />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Category</span>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Category">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)}
              className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition active:scale-95 ${cat === c.id ? "bg-ink text-bg" : "bg-surface-2 text-muted"}`}>
              <span aria-hidden>{c.emoji}</span> {c.label}
            </button>
          ))}
        </div>
      </div>

      <ErrorText>{err}</ErrorText>

      <div className="mt-auto pt-2">
        <Button disabled={!ready} onClick={send}>
          {mode === "link" ? (units > 0n ? `Create link for ${formatMoney(units, currency)}` : "Enter an amount") : "Send now"}
        </Button>
      </div>
    </Screen>
  );
}
