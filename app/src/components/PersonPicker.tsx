"use client";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { useAccount } from "@/lib/account";
import { recentPeople } from "@/lib/contacts";
import { resolveName } from "@/lib/names";
import { Avatar, inputClass } from "./ui";

export type Person = { address: Address; name: string };

/**
 * Pick a recipient. Contract: calls onPick with a resolved Person, or null when cleared.
 * Recent/saved people as a one-tap avatar row; "New" opens the @name field.
 */
export function PersonPicker({ label = "To", onPick }: { label?: string; onPick: (p: Person | null) => void }) {
  const { unlocked } = useAccount();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Person | null>(null);
  const [miss, setMiss] = useState(false);
  const [recents, setRecents] = useState<Person[]>([]);
  const [typing, setTyping] = useState(false);

  // Only when unlocked: loading people must never trigger Face ID on its own.
  useEffect(() => {
    if (unlocked) recentPeople().then(setRecents);
  }, [unlocked]);

  function pick(p: Person) {
    setMiss(false);
    setFound(p);
    onPick(p);
  }

  async function lookup(v: string) {
    setQ(v);
    setMiss(false);
    setFound(null);
    onPick(null);
    const h = v.trim().replace(/^@/, "").toLowerCase();
    if (h.length < 3) return;
    const a = await resolveName(h).catch(() => null);
    if (a) pick({ address: a, name: h });
    else setMiss(true);
  }

  const showField = typing || recents.length === 0;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <span className="text-sm font-medium text-muted">{label}</span>
      {recents.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="Recent people">
          <button
            type="button"
            onClick={() => setTyping((t) => !t)}
            aria-pressed={typing}
            className="flex w-14 shrink-0 flex-col items-center gap-1.5 text-xs text-muted active:scale-95"
          >
            <span className={`grid size-14 place-items-center rounded-full border border-dashed text-2xl ${typing ? "border-brand text-brand" : "border-line text-ink"}`}>+</span>
            Add new
          </button>
          {recents.map((p) => {
            const on = found?.address === p.address;
            return (
              <button
                key={p.address}
                type="button"
                onClick={() => (setTyping(false), setQ(""), pick(p))}
                aria-pressed={on}
                className="flex w-14 shrink-0 flex-col items-center gap-1.5 text-xs active:scale-95"
              >
                <span className={`rounded-full p-0.5 ring-2 transition ${on ? "ring-brand" : "ring-transparent"}`}>
                  <Avatar name={p.name} size={52} />
                </span>
                <span className={`w-full truncate text-center ${on ? "font-semibold text-ink" : "text-muted"}`}>@{p.name}</span>
              </button>
            );
          })}
        </div>
      )}
      {showField && (
        <label className="flex flex-col gap-1.5">
          <span className="sr-only">Kin name</span>
          <input className={inputClass} placeholder="@name" autoCapitalize="none" autoCorrect="off" autoFocus={typing} value={q} onChange={(e) => lookup(e.target.value)} />
          {miss && <span className="text-xs text-muted">No one on Kin with that name yet.</span>}
          {found && q && (
            <span className="flex items-center gap-3 rounded-2xl bg-good/10 px-3 py-2 text-sm font-semibold">
              <Avatar name={found.name} size={28} /> @{found.name} <span className="ml-auto text-good">✓</span>
            </span>
          )}
        </label>
      )}
    </div>
  );
}
