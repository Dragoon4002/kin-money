"use client";
import { useState } from "react";
import { share } from "@/components/core/share";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Sheet, Status } from "@/components/programs/kit";
import { Button, Chip, ErrorText, Ico } from "@/components/ui";
import { api } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { partStatus, type Invoice, type Part } from "@/lib/invoiceMeta";
import { dueLabel } from "@/lib/reminders";

// Shared by /invoice, /invoice/new and /invoice/[id]: part status, "Mark done", and sending the pay link.

/** The invoice behind a pay link (public read), or null if it's gone. */
export async function fetchInvoice(id: string): Promise<Invoice | null> {
  const r = await fetch(`/api/invoices?id=${encodeURIComponent(id)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("network: invoice");
  return r.json() as Promise<Invoice>;
}

/** Status chip for one part. `iWork` = I'm the one getting paid. */
export function PartChip({ p, settled, iWork }: { p: Part; settled: boolean; iWork: boolean }) {
  const s = partStatus(p, settled);
  if (s === "paid") return <Chip tone="good">Paid ✓</Chip>;
  if (s === "done") return <Chip tone="brand">{iWork ? "Done — waiting for their OK" : "Done — ready for your OK"}</Chip>;
  if (s === "overdue") return <Chip tone="warn">Overdue</Chip>;
  return <Chip>{p.due ? dueLabel(p.due) : "In progress"}</Chip>;
}

/** Freelancer tells the client a part is finished (they get a notification). */
export function MarkDone({ id, n, onDone }: { id: string; n: number; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function mark() {
    setBusy(true);
    setError("");
    try {
      await api("/api/invoices", "POST", { action: "done", id, part: n });
      onDone();
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ErrorText>{error}</ErrorText>
      <Button variant="soft" onClick={mark} busy={busy}>Mark done</Button>
    </>
  );
}

/** Bottom sheet: send the pay link to a Kin person, on WhatsApp, or any other way. */
export function SendSheet({ inv, open, onClose }: { inv: Invoice; open: boolean; onClose: () => void }) {
  const [to, setTo] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}/invoice/new?i=${inv.id}`;
  const text = `Pay for '${inv.title}' on Kin:`;

  async function send() {
    if (!to) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/invoices", "POST", { action: "send", id: inv.id, to: to.address });
      setSent(to.name);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setError(/ 400$/.test(m) ? "That account isn't on Kin." : / 403$/.test(m) ? "You can't send this to them." : humanError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={() => !busy && onClose()} label="Send invoice">
      <h2 className="font-display text-3xl">Send invoice</h2>
      {sent ? (
        <p className="text-good">Sent to @{sent} ✓ They&apos;ll get a notification.</p>
      ) : (
        <>
          <PersonPicker label="Send to someone on Kin" onPick={setTo} />
          <ErrorText>{error}</ErrorText>
          <Status>{busy && "Sending…"}</Status>
          <Button onClick={send} busy={busy} disabled={!to}>{to ? `Send to @${to.name}` : "Send"}</Button>
        </>
      )}
      <a href={`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`} target="_blank" rel="noreferrer"
        className="flex h-14 items-center justify-center gap-2 rounded-full bg-good font-semibold text-fun-ink active:scale-[0.98]">
        <Ico name="share" /> Send on WhatsApp
      </a>
      <Button variant="ghost" onClick={async () => (await share(text, link)) === "copied" && setCopied(true)}>
        {copied ? "Link copied ✓" : "Share another way"}
      </Button>
    </Sheet>
  );
}
