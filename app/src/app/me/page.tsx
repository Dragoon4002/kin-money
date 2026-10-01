"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { NavBar } from "@/components/core/NavBar";
import { Kinko } from "@/components/kinko/Kinko";
import { Band, Button, Card, Row, Screen, Tabs } from "@/components/ui";
import { lock, signOut, useRequireAccount } from "@/lib/account";
import { FX, getCurrency } from "@/lib/money";
import { getTheme, setTheme, type Theme } from "@/lib/theme";

// Tiny local stores so currency/theme changes re-render without React state copies.
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
const notify = () => listeners.forEach((l) => l());
function setCurrency(c: string) {
  localStorage.setItem("kin.currency", c);
  notify();
}

const names = new Intl.DisplayNames(undefined, { type: "currency" });
const THEMES = [["system", "System"], ["light", "Light"], ["dark", "Dark"]] as const;

export default function Me() {
  const router = useRouter();
  const { profile } = useRequireAccount();
  const currency = useSyncExternalStore(subscribe, getCurrency, () => "USD");
  const theme = useSyncExternalStore(subscribe, getTheme, (): Theme => "system");
  const [copied, setCopied] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const handle = profile?.name;

  async function copy() {
    if (!handle) return;
    await navigator.clipboard.writeText(`@${handle}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <Screen wide title="Me" back="/home">
        <section className="flex flex-col items-center gap-3 px-5 pb-4 text-center">
          <Kinko size={140} mood="happy" />
          {handle ? (
            <button onClick={copy} className="flex min-h-11 items-center gap-2 rounded-full px-4 font-display text-4xl active:bg-surface-2">
              @{handle}
              <span className="font-sans text-xs font-semibold text-muted">{copied ? "Copied ✓" : "Copy"}</span>
            </button>
          ) : (
            <p className="font-display text-4xl">Your account</p>
          )}
          <p className="text-sm text-muted">Family pays you with this name</p>
          <div className="mt-2 w-full">
            <Link href="/kinko" className="grid h-14 place-items-center rounded-full bg-brand-soft font-semibold text-brand active:scale-[0.98]">Customize Kinko</Link>
          </div>
        </section>

        <Band>Appearance</Band>
        <div className="px-5 py-4">
          <Tabs value={theme} options={THEMES} onChange={(t) => (setTheme(t), notify())} />
        </div>

        <Band>Show my money in</Band>
        <label className="flex min-h-16 items-center gap-4 px-5">
          <span className="flex-1 font-semibold">Currency</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}
            className="h-11 max-w-48 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink outline-none focus:border-brand">
            {Object.keys(FX).map((c) => <option key={c} value={c}>{names.of(c)}</option>)}
          </select>
        </label>
        <p className="px-5 pb-3 text-xs text-muted">Your balance is kept in US dollars. We show it in the currency you pick.</p>

        <Band>Share</Band>
        <Row href="/receive" icon={<Ico>▦</Ico>} title="My QR" sub="Scan to pay me" trail={<Chev />} />
        <Row href="/invite" icon={<Ico>💌</Ico>} title="Invite & earn" sub="You both get a Kinko treat" trail={<Chev />} />

        <Band>Backup</Band>
        <p className="px-5 py-4 text-sm text-muted">
          Your account is backed up with your phone&apos;s Face ID and password manager (iCloud Keychain or Google Password Manager).
          On a new phone, open Kin and tap &ldquo;Already have Kin on another phone?&rdquo;.
        </p>

        <div className="mt-auto flex flex-col gap-2 px-5 pt-4">
          <Button variant="ghost" onClick={() => (lock(), router.replace("/"))}>Lock now</Button>
          {confirmOut ? (
            <Card className="flex flex-col gap-3 text-sm">
              <p>Remove Kin from this phone? Your money stays safe — come back anytime with Face ID.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={() => setConfirmOut(false)}>Keep</Button>
                <Button onClick={() => (signOut(), router.replace("/"))}>Remove</Button>
              </div>
            </Card>
          ) : (
            <button onClick={() => setConfirmOut(true)} className="h-12 text-sm font-semibold text-bad">Remove Kin from this phone</button>
          )}
        </div>
      </Screen>
      <NavBar />
    </>
  );
}

const Ico = ({ children }: { children: string }) => (
  <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-lg" aria-hidden>{children}</span>
);
const Chev = () => <span className="text-2xl text-muted" aria-hidden>›</span>;
