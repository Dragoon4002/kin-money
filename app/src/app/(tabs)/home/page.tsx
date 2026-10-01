"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Keypad } from "@/components/core/Keypad";
import { MeButton } from "@/components/core/NavBar";
import type { Person } from "@/components/PersonPicker";
import { Amount, Avatar, Ico, Screen } from "@/components/ui";
import { useRequireAccount } from "@/lib/account";
import { getBalance } from "@/lib/activity";
import { recentPeople } from "@/lib/contacts";
import { formatMoney } from "@/lib/money";
import { useCurrencySymbol } from "@/lib/useCurrencySymbol";

export default function Home() {
  const { profile, unlocked } = useRequireAccount();
  const me = profile?.address;
  const [amount, setAmount] = useState("");
  const [show, setShow] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [failed, setFailed] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);

  function toggle() {
    if (show && !failed) return setShow(false);
    setShow(true);
    setFailed(false);
    setBalance(null);
    if (me) getBalance(me).then(setBalance).catch(() => setFailed(true));
  }

  // Contacts need a signed request — only ask when already unlocked so Home never pops Face ID.
  useEffect(() => {
    if (!unlocked) return;
    let live = true;
    recentPeople().then((p) => live && setPeople(p));
    return () => {
      live = false;
    };
  }, [unlocked]);

  const q = Number(amount) > 0 ? `?amount=${amount}` : "";
  const symbol = useCurrencySymbol();
  const shown = `${symbol}${amount || "0"}`;
  const big = shown.length > 10 ? "text-5xl" : shown.length > 7 ? "text-6xl" : "text-7xl";

  return (
    <>
      <Screen>
        <header className="flex h-12 items-center gap-3">
          <p className="flex-1 truncate text-lg font-semibold">Hi{profile?.name ? `, ${profile.name}` : ""}</p>
          <Link href="/scan" aria-label="Scan to pay" className="grid size-11 place-items-center rounded-full border border-line bg-surface-2 text-ink active:scale-95">
            <Ico name="scan" size={22} />
          </Link>
          <MeButton name={profile?.name} />
        </header>

        <div className="flex justify-center">
          <button onClick={toggle} aria-expanded={show}
            className="flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-muted transition active:scale-95">
            {!show ? (
              <>Check balance <Ico name="chevron" size={16} className="rotate-90" /></>
            ) : failed ? (
              "Couldn't check. Tap to retry"
            ) : balance === null ? (
              <span className="h-5 w-24 animate-pulse rounded-full bg-surface-2" />
            ) : (
              <><Amount value={formatMoney(balance)} size="md" className="text-2xl! text-ink" secret /><Ico name="chevron" size={16} className="-rotate-90" /></>
            )}
          </button>
        </div>

        <div className="flex min-h-36 flex-1 flex-col items-center justify-center">
          <p aria-live="polite" className={`font-display tabular leading-none tracking-tight ${big} ${amount ? "text-ink" : "text-muted"}`}>{shown}</p>
          <p className="mt-3 text-sm text-muted">{amount ? "Who's it for?" : "Type an amount"}</p>
        </div>

        <Keypad value={amount} onChange={setAmount} />

        <div className="grid grid-cols-2 gap-3">
          <Link href={`/request${q}`} className="grid h-14 place-items-center rounded-full border border-line bg-surface font-semibold transition active:scale-[0.98]">Request</Link>
          <Link href={`/send${q}`} className="grid h-14 place-items-center rounded-full bg-brand font-semibold text-brand-ink transition active:scale-[0.98]">Send</Link>
        </div>

        {people.length > 0 && (
          <section className="mt-2">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">People</h2>
            <div className="-mx-5 flex gap-4 overflow-x-auto px-5 pb-1">
              {people.map((p) => (
                <Link key={p.address} href={`/send?to=${p.name}${q ? `&amount=${amount}` : ""}`} className="flex w-16 shrink-0 flex-col items-center gap-1.5 active:scale-95">
                  <Avatar name={p.name} size={52} />
                  <span className="w-full truncate text-center text-xs text-muted">{p.name}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </Screen>
    </>
  );
}
