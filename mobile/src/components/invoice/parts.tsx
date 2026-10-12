import { useState } from "react";
import { Linking } from "react-native";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Sheet, share, Status } from "@/components/programs/kit";
import { Button, Chip, ErrorText, Serif, Text } from "@/components/ui";
import { API_BASE } from "@/lib/config";
import { api } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { dueLabel } from "@/lib/reminders";
import { useTheme } from "@/theme";
import { partStatus, type Invoice, type Part } from "./meta";

// Port of app/src/components/invoice/parts.tsx: part status, "Mark done", and sending the pay link.

/** The invoice behind a pay link (public read), or null if it's gone. */
export async function fetchInvoice(id: string): Promise<Invoice | null> {
  const r = await fetch(`${API_BASE}/api/invoices?id=${encodeURIComponent(id)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("network: invoice");
  return r.json() as Promise<Invoice>;
}

/** Status chip for one part. `iWork` = I'm the one getting paid. */
export function PartChip({ p, settled, iWork }: { p: Part; settled: boolean; iWork: boolean }) {
  const s = partStatus(p, settled);
  if (s === "paid") return <Chip good>Paid ✓</Chip>;
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
      <Button title="Mark done" variant="soft" onPress={mark} busy={busy} />
    </>
  );
}

/** Bottom sheet: send the pay link to a Kin person, on WhatsApp, or any other way. */
export function SendSheet({ inv, open, onClose }: { inv: Invoice; open: boolean; onClose: () => void }) {
  const t = useTheme();
  const [to, setTo] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");
  const link = `${API_BASE}/invoice/new?i=${inv.id}`;
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
    <Sheet open={open} onClose={() => !busy && onClose()}>
      <Serif size={30}>Send invoice</Serif>
      {sent ? (
        <Text style={{ color: t.good }}>Sent to @{sent} ✓ They&apos;ll get a notification.</Text>
      ) : (
        <>
          <PersonPicker label="Send to someone on Kin" onPick={setTo} />
          <ErrorText>{error}</ErrorText>
          <Status>{busy && "Sending…"}</Status>
          <Button title={to ? `Send to @${to.name}` : "Send"} onPress={send} busy={busy} disabled={!to} />
        </>
      )}
      <Button title="Send on WhatsApp" variant="soft" onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`).catch(() => share(text, link))} />
      <Button title="Share another way" variant="ghost" onPress={() => share(text, link)} />
    </Sheet>
  );
}
