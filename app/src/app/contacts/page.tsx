"use client";
import { NavBar } from "@/components/core/NavBar";
import { useEffect, useState } from "react";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { PersonRow, Section, SkeletonRows, useSignedIn } from "@/components/social/bits";
import { Button, Card, ErrorText, Field, Screen, inputClass } from "@/components/ui";
import { addContact, listContacts, type Phonebook } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";

const sendTo = (p: Person) => `/send?to=${encodeURIComponent(p.name)}`;

export default function ContactsPage() {
  useSignedIn();
  const [book, setBook] = useState<Phonebook | null>(null);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [person, setPerson] = useState<Person | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listContacts().then(setBook, (e) => setErr(humanError(e)));
  }, []);

  async function save(p: Person, nick: string) {
    setErr("");
    const prev = book;
    // Optimistic: show them in "Your people" right away.
    setBook((b) => b && {
      ...b,
      contacts: [...b.contacts.filter((c) => c.address !== p.address), { ...p, label: nick }],
      suggested: b.suggested.filter((s) => s.address !== p.address),
    });
    try {
      await addContact(p, nick);
      return true;
    } catch (e) {
      setBook(prev);
      setErr(humanError(e));
      return false;
    }
  }

  async function submit() {
    if (!person) return;
    setBusy(true);
    if (await save(person, label.trim())) {
      setAdding(false);
      setPerson(null);
      setLabel("");
    }
    setBusy(false);
  }

  const known = new Set(book?.contacts.map((c) => c.address));
  const recents = book?.recents.filter((r) => r.name && !known.has(r.address)) ?? [];
  const empty = book && !book.contacts.length && !recents.length && !book.suggested.length;

  return (
    <>
    <Screen
      wide
      title="People"
      back="/home"
      action={
        !adding && (
          <button onClick={() => setAdding(true)} className="h-11 rounded-full bg-brand-soft px-4 text-sm font-semibold text-brand active:scale-95">
            + Add
          </button>
        )
      }
    >
      {adding && (
        <Card className="mx-5 flex flex-col gap-4">
          <PersonPicker label="Who?" onPick={setPerson} />
          <Field label="What do you call them?" hint="Only you see this.">
            <input className={inputClass} placeholder="Mum, Ravi, Landlord…" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!person} busy={busy}>
              Save
            </Button>
          </div>
        </Card>
      )}

      {err && <div className="px-5"><ErrorText>{err}</ErrorText></div>}

      {!book && !err && <div className="px-5"><SkeletonRows n={4} /></div>}

      {empty && !adding && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 text-center">
          <p className="text-4xl">👋</p>
          <p className="font-semibold">No one here yet</p>
          <p className="text-sm text-muted">Add the people you send money to.</p>
        </div>
      )}

      {!!book?.contacts.length && (
        <Section title="Your people">
          {book.contacts.map((c) => (
            <PersonRow key={c.address} name={c.label || `@${c.name}`} sub={c.label && c.name ? `@${c.name}` : undefined} href={c.name ? sendTo(c) : undefined} />
          ))}
        </Section>
      )}

      {recents.length > 0 && (
        <Section title="Recent">
          {recents.map((r) => (
            <PersonRow key={r.address} name={`@${r.name}`} sub={`You've sent ${formatMoney(BigInt(r.total))}`} href={sendTo(r)} />
          ))}
        </Section>
      )}

      {!!book?.suggested.length && (
        <Section title="People you may know">
          {book.suggested.map((s) => (
            <PersonRow
              key={s.address}
              name={`@${s.name}`}
              sub={`${s.mutual} ${s.mutual === 1 ? "friend" : "friends"} in common`}
              href={sendTo(s)}
              action={
                <button onClick={() => save(s, "")} className="h-11 shrink-0 rounded-full bg-brand-soft px-4 text-sm font-semibold text-brand active:scale-95">
                  Add
                </button>
              }
            />
          ))}
        </Section>
      )}
    </Screen>
    <NavBar />
    </>
  );
}
