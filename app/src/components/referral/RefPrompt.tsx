"use client";
import { useEffect, useState } from "react";
import { Sheet } from "@/components/programs/kit";
import { Avatar, Button, inputClass } from "@/components/ui";
import { addContact, listContacts, listInvites } from "@/lib/contacts";
import { resolveName } from "@/lib/names";

const SKIP = "kin.refprompt.skip";

/** "You joined with @a. Save as a friend?" Shows until saved with a name; "Skip for now" hides it for this visit. */
export function RefPrompt({ enabled }: { enabled: boolean }) {
  const [who, setWho] = useState<{ name: string; address: `0x${string}` } | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled || sessionStorage.getItem(SKIP)) return;
    (async () => {
      const { invitedBy } = await listInvites();
      if (!invitedBy) return;
      const [address, book] = await Promise.all([resolveName(invitedBy), listContacts()]);
      if (!address || book.contacts.some((c) => c.address.toLowerCase() === address.toLowerCase() && c.label)) return;
      setWho({ name: invitedBy, address });
    })().catch(() => {});
  }, [enabled]);

  const skip = () => (sessionStorage.setItem(SKIP, "1"), setWho(null));
  async function save() {
    if (!who) return;
    setBusy(true);
    await addContact({ address: who.address, name: who.name }, label.trim() || who.name).catch(() => {});
    setWho(null);
    setBusy(false);
  }

  return (
    <Sheet open={!!who} onClose={skip} label="Save friend">
      {who && (
        <>
          <div className="flex flex-col items-center gap-2 text-center">
            <Avatar name={who.name} size={64} />
            <h2 className="font-display text-3xl leading-tight">You joined with @{who.name}</h2>
            <p className="text-muted">Save them as a friend so they&apos;re easy to find.</p>
          </div>
          <input className={inputClass} placeholder={`Name (e.g. ${who.name})`} value={label} maxLength={30} onChange={(e) => setLabel(e.target.value)} />
          <Button busy={busy} onClick={save}>Save friend</Button>
          <button onClick={skip} className="h-11 text-sm font-semibold text-muted active:text-ink">Skip for now</button>
        </>
      )}
    </Sheet>
  );
}
