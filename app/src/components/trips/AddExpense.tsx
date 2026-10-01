"use client";
import { useState } from "react";
import type { Address } from "viem";
import type { Person } from "@/components/PersonPicker";
import { MoneyInput } from "@/components/programs/kit";
import { Button, Field, Ico, inputClass } from "@/components/ui";
import { CATEGORIES, type CategoryId } from "@/lib/categories";
import { formatMoney, fromLocal } from "@/lib/money";
import { MemberChips } from "./bits";

export type NewExpense = { payer: Address; amount: bigint; participants: Address[]; note: string; category: CategoryId };

/** Sheet body: amount, who paid, split between, note + category. */
export function AddExpense({ members, me, onAdd }: { members: Person[]; me: Address; onAdd: (e: NewExpense) => void }) {
  const [amount, setAmount] = useState("");
  const [payer, setPayer] = useState<Address>(me);
  const [split, setSplit] = useState<Address[]>(() => members.map((m) => m.address));
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<CategoryId>("food");

  const units = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const each = split.length ? units / BigInt(split.length) : 0n;
  const toggle = (a: Address) => setSplit((s) => (s.includes(a) ? s.filter((x) => x !== a) : [...s, a]));

  return (
    <div className="-mx-5 flex max-h-[80dvh] flex-col gap-4 overflow-y-auto px-5">
      <h2 className="text-lg font-bold">Add expense</h2>
      <MoneyInput label="How much?" value={amount} onChange={setAmount} />

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Who paid?</span>
        <MemberChips label="Who paid" members={members} me={me} on={(a) => a === payer} onTap={setPayer} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted">Split between</span>
          <span className="flex gap-1">
            <button type="button" className="h-11 rounded-full px-3 text-sm font-semibold text-brand active:scale-95" onClick={() => setSplit(members.map((m) => m.address))}>
              Everyone
            </button>
            <button type="button" className="h-11 rounded-full px-3 text-sm font-semibold text-muted active:scale-95" onClick={() => setSplit([])}>
              Clear
            </button>
          </span>
        </div>
        <MemberChips label="Split between" members={members} me={me} on={(a) => split.includes(a)} onTap={toggle} />
        {units > 0n && split.length > 0 && (
          <p aria-live="polite" className="text-sm text-muted">
            {split.length === 1 ? "One person covers it all" : `About ${formatMoney(each)} each, ${split.length} ways`}
          </p>
        )}
      </div>

      <Field label="What was it for?">
        <input className={inputClass} placeholder="Dinner by the beach" maxLength={80} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <ul className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="Category">
        {CATEGORIES.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              aria-pressed={c.id === category}
              onClick={() => setCategory(c.id)}
              className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap active:scale-95 ${c.id === category ? "bg-ink text-bg" : "bg-surface-2 text-muted"}`}
            >
              <Ico name={c.icon} size={16} /> {c.label}
            </button>
          </li>
        ))}
      </ul>

      <Button disabled={units <= 0n || !split.length} onClick={() => onAdd({ payer, amount: units, participants: split, note: note.trim(), category })}>
        {units > 0n ? `Add ${formatMoney(units)}` : "Add expense"}
      </Button>
    </div>
  );
}
