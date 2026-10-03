"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { MyKinko } from "@/components/kinko/PersonKinko";
import { Band, Button, Card, Ico, IconTile, Row, Screen, Tabs } from "@/components/ui";
import { getPayCheck, lock, setPayCheck, signOut, switchAccount, useRequireAccount, type PayCheck } from "@/lib/account";
import { FX, currencySymbol, fromLocal, getCurrency, toDollars } from "@/lib/money";
import { shortAddr } from "@/lib/names";
import { setPrivate, usePrivate } from "@/lib/privacy";
import { disablePush, enablePush, iosNeedsInstall, pushState, type PushState } from "@/lib/push";
import { getTheme, setTheme, type Theme } from "@/lib/theme";

// Tiny local stores so currency/theme changes re-render without React state copies.
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
const notify = () => listeners.forEach((l) => l());
function setCurrency(c: string) {
  localStorage.setItem("kin.currency", c);
  notify();
}

// Static labels: Intl.DisplayNames differs between Node and browser ICU data → hydration mismatch.
const CURRENCY_NAME: Record<string, string> = {
  USD: "US dollar", INR: "Indian rupee", PHP: "Philippine peso", MXN: "Mexican peso",
  NGN: "Nigerian naira", AED: "UAE dirham", GBP: "British pound", EUR: "Euro",
};
const THEMES = [["system", "System"], ["light", "Light"], ["dark", "Dark"]] as const;
const PAY_MODES: [PayCheck["mode"], string, string][] = [
  ["always", "Ask every time", "Face ID for every payment"],
  ["over", "Ask for bigger payments", "Small ones go straight through while Kin is unlocked"],
  ["unlocked", "Don’t ask again while unlocked", "Kin still locks after 5 minutes of no use"],
];

export default function Me() {
  const router = useRouter();
  const { profile, accounts } = useRequireAccount();
  const currency = useSyncExternalStore(subscribe, getCurrency, () => "USD");
  const theme = useSyncExternalStore(subscribe, getTheme, (): Theme => "system");
  const [copied, setCopied] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const hidden = usePrivate();
  const payRaw = useSyncExternalStore(subscribe, () => JSON.stringify(getPayCheck()), () => "");
  const pay = payRaw ? (JSON.parse(payRaw) as PayCheck) : null;
  const [limitDraft, setLimitDraft] = useState<string | null>(null);
  const limitShown = limitDraft ?? (pay ? String(Math.round(toDollars(BigInt(pay.limit)) * (FX[currency] ?? 1))) : "");
  function savePay(p: PayCheck) {
    setPayCheck(p);
    notify();
  }
  const handle = profile?.name;
  // null = still checking; "ios" = iPhone in the browser (push needs the home-screen app).
  const [push, setPush] = useState<PushState | "ios" | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushErr, setPushErr] = useState(false);
  useEffect(() => {
    pushState().then((s) => setPush(s === "unsupported" && iosNeedsInstall() ? "ios" : s)).catch(() => setPush("unsupported"));
  }, []);

  async function togglePush(on: boolean) {
    const before = push;
    setPush(on ? "on" : "off"); // optimistic
    setPushBusy(true);
    setPushErr(false);
    try {
      if (on) setPush(await enablePush());
      else await disablePush();
    } catch {
      setPush(before);
      setPushErr(true);
    }
    setPushBusy(false);
  }

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
          <MyKinko size={140} mood="happy" />
          {handle ? (
            <button onClick={copy} className="flex min-h-11 items-center gap-2 rounded-full px-4 font-display text-4xl active:bg-surface-2">
              @{handle}
              <span className="font-sans text-xs font-semibold text-muted">{copied ? "Copied ✓" : "Copy"}</span>
            </button>
          ) : (
            <p className="font-display text-4xl">Your account</p>
          )}
          <p className="text-sm text-muted">Family pays you with this name</p>
          {accounts.length > 1 && (
            <div role="radiogroup" aria-label="Account in use" className="flex w-full flex-wrap justify-center gap-2">
              {accounts.map((a) => (
                <button key={a.address} role="radio" aria-checked={a.address === profile?.address} onClick={() => switchAccount(a.address)}
                  className={`min-h-11 rounded-full px-4 text-sm font-semibold ${a.address === profile?.address ? "bg-brand text-brand-ink" : "bg-surface-2 text-ink"}`}>
                  {a.kin ? `Kin account${a.name ? ` (@${a.name})` : ""}` : a.name ? `@${a.name}` : shortAddr(a.address)}
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 w-full">
            <Link href="/kinko" className="grid h-14 place-items-center rounded-full bg-brand-soft font-semibold text-brand active:scale-[0.98]">Customize Kinko</Link>
          </div>
        </section>

        <Band>Appearance</Band>
        <div className="px-5 py-4">
          <Tabs value={theme} options={THEMES} onChange={(t) => (setTheme(t), notify())} />
        </div>

        <Band>Privacy</Band>
        <label className="flex min-h-16 items-center gap-4 px-5">
          <span className="flex-1">
            <span className="block font-semibold">Hide amounts</span>
            <span className="block text-sm text-muted">Your balance shows as •••• — tap it to peek</span>
          </span>
          <input type="checkbox" role="switch" className="size-6 accent-brand" checked={hidden} onChange={(e) => setPrivate(e.target.checked)} />
        </label>

        <Band>When I pay</Band>
        <div role="radiogroup" aria-label="When I pay">
          {PAY_MODES.map(([mode, title, sub]) => (
            <label key={mode} className="flex min-h-16 items-center gap-4 px-5">
              <span className="flex-1">
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm text-muted">{sub}</span>
              </span>
              <input type="radio" name="pay-check" className="size-6 accent-brand" checked={pay?.mode === mode}
                onChange={() => pay && savePay({ ...pay, mode })} />
            </label>
          ))}
        </div>
        {pay?.mode === "over" && (
          <label className="flex min-h-16 items-center gap-4 px-5">
            <span className="flex-1 font-semibold">Ask for payments over</span>
            <span className="font-semibold text-muted">{currencySymbol(currency)}</span>
            <input inputMode="decimal" aria-label="Ask for payments over" value={limitShown}
              className="h-11 w-32 rounded-full border border-line bg-surface px-4 text-right text-base font-semibold text-ink outline-none focus:border-brand"
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, "");
                setLimitDraft(v);
                if (Number(v) > 0) savePay({ mode: "over", limit: fromLocal(v, currency).toString() });
              }}
              onBlur={() => setLimitDraft(null)} />
          </label>
        )}
        <p className="px-5 pb-3 text-xs text-muted">When Kin is locked, every payment asks for Face ID. Nothing that can spend your money is saved on this phone.</p>

        <Band>Notifications</Band>
        <label className="flex min-h-16 items-center gap-4 px-5">
          <span className="flex-1">
            <span className="block font-semibold">Notifications</span>
            <span className="block text-sm text-muted">
              {pushErr ? "Couldn’t turn on alerts. Try again."
                : push === "ios" ? "Add Kin to your home screen first"
                : push === "unsupported" ? "This browser can’t show alerts from Kin"
                : push === "denied" ? "Allow notifications for Kin in your phone settings"
                : "Money in, chores done, gifts opened"}
            </span>
          </span>
          <input type="checkbox" role="switch" aria-label="Notifications" className="size-6 accent-brand" checked={push === "on"}
            disabled={pushBusy || (push !== "on" && push !== "off")} onChange={(e) => togglePush(e.target.checked)} />
        </label>

        <Band>Show my money in</Band>
        <label className="flex min-h-16 items-center gap-4 px-5">
          <span className="flex-1 font-semibold">Currency</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}
            className="h-11 max-w-48 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink outline-none focus:border-brand">
            {Object.keys(FX).map((c) => <option key={c} value={c}>{CURRENCY_NAME[c] ?? c}</option>)}
          </select>
        </label>
        <p className="px-5 pb-3 text-xs text-muted">Your balance is kept in US dollars. We show it in the currency you pick.</p>

        {/* ponytail: phone-number lookup removed (SMS verification not free); old phoneHash props in Neo4j are inert. */}
        <Band>Share</Band>
        <Row href="/receive" icon={<IconTile name="qr" size={44} />} title="My QR" sub="Scan to pay me" trail={<Chev />} />
        <Row href="/invite" icon={<IconTile name="invite" size={44} />} title="Invite & earn" sub="You both get a Kinko treat" trail={<Chev />} />

        <Band>Backup</Band>
        <p className="px-5 py-4 text-sm text-muted">
          {"Your account is backed up with your phone’s Face ID and password manager (iCloud Keychain or Google Password Manager). On a new phone, open Kin and tap “Already have Kin on another phone?”."}
        </p>
        <Row href="/security" icon={<IconTile name="safe" size={44} />} title="Security" sub="Recovery phrase, other accounts" trail={<Chev />} />

        <div className="mt-auto flex flex-col gap-2 px-5 pt-4">
          <Button variant="ghost" onClick={() => (lock(), router.replace("/"))}>Lock now</Button>
          {confirmOut ? (
            <Card className="flex flex-col gap-3 text-sm">
              <p>Remove Kin from this phone? Your money stays safe — come back anytime with Face ID.{accounts.length > 1 && " Accounts you added from other wallets are forgotten too: you’ll need their recovery phrase to add them again."}</p>
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
    </>
  );
}

const Chev = () => <Ico name="chevron" className="text-muted" />;
