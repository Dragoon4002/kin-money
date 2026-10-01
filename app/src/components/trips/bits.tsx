"use client";
import type { Address } from "viem";
import type { Person } from "@/components/PersonPicker";
import { Avatar } from "@/components/ui";

/** Overlapping Kinko faces, "+3" after `max`. */
export function Avatars({ people, size = 28, max = 5 }: { people: Person[]; size?: number; max?: number }) {
  return (
    <span className="flex items-center" aria-label={`${people.length} people`}>
      {people.slice(0, max).map((p, i) => (
        <span key={p.address} className={`rounded-full ring-2 ring-bg ${i ? "-ml-2" : ""}`}>
          <Avatar name={p.name} size={size} />
        </span>
      ))}
      {people.length > max && <span className="ml-1.5 text-xs font-semibold text-muted">+{people.length - max}</span>}
    </span>
  );
}

/** Member pills; `on` = selected. 44px targets. */
export function MemberChips({ members, me, on, onTap, label }: { members: Person[]; me?: Address; on: (a: Address) => boolean; onTap: (a: Address) => void; label: string }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label={label}>
      {members.map((m) => {
        const sel = on(m.address);
        return (
          <li key={m.address}>
            <button
              type="button"
              aria-pressed={sel}
              onClick={() => onTap(m.address)}
              className={`flex h-11 items-center gap-2 rounded-full pl-1.5 pr-3.5 text-sm font-medium transition active:scale-95 ${sel ? "bg-ink text-bg" : "bg-surface-2 text-muted"}`}
            >
              <Avatar name={m.name} size={32} /> {m.address === me ? "You" : `@${m.name}`}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
