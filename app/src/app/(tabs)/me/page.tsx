"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { MyKinko } from "@/components/kinko/PersonKinko";
import { Band, Button, Card, ErrorText, Ico, IconTile, Row, Screen, Tabs, inputClass } from "@/components/ui";
import { lock, signOut, useRequireAccount } from "@/lib/account";
import { saveMyPhone } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { FX, getCurrency } from "@/lib/money";
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

export default function Me() {
  const router = useRouter();
  const { profile } = useRequireAccount();
  const currency = useSyncExternalStore(subscribe, getCurrency, () => "USD");
  const theme = useSyncExternalStore(subscribe, getTheme, (): Theme => "system");
  const [copied, setCopied] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const hidden = usePrivate();
  const [phone, setPhone] = useState("");
  const [phoneState, setPhoneState] = useState<"idle" | "busy" | "saved">("idle");
  const [phoneErr, setPhoneErr] = useState("");
  const e164 = phone.replace(/[\s()-]/g, "");
  const phoneOk = /^\+[1-9]\d{6,14}$/.test(e164);
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

  async function savePhone() {
    setPhoneErr("");
    setPhoneState("busy");
    try {
      await saveMyPhone(e164);
      setPhoneState("saved");
    } catch (e) {
      setPhoneErr(/ 400$/.test(String(e)) ? "Check the number — start with + and your country code." : humanError(e));
      setPhoneState("idle");
    }
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

        <Band>My phone number</Band>
        <div className="flex flex-col gap-3 px-5 py-4">
          <p className="text-sm text-muted">Let people who have your number find you. We never show it to anyone.</p>
          <div className="flex gap-2">
            <input className={inputClass} type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" maxLength={20} aria-label="My phone number"
              value={phone} onChange={(e) => (setPhone(e.target.value), setPhoneState("idle"))} />
            <Button className="w-auto! shrink-0 px-6" onClick={savePhone} busy={phoneState === "busy"} disabled={!phoneOk || phoneState === "saved"}>
              {phoneState === "saved" ? "Saved ✓" : "Save"}
            </Button>
          </div>
          <ErrorText>{phoneErr}</ErrorText>
        </div>

        <Band>Share</Band>
        <Row href="/receive" icon={<IconTile name="qr" size={44} />} title="My QR" sub="Scan to pay me" trail={<Chev />} />
        <Row href="/invite" icon={<IconTile name="invite" size={44} />} title="Invite & earn" sub="You both get a Kinko treat" trail={<Chev />} />

        <Band>Backup</Band>
        <p className="px-5 py-4 text-sm text-muted">
          {"Your account is backed up with your phone’s Face ID and password manager (iCloud Keychain or Google Password Manager). On a new phone, open Kin and tap “Already have Kin on another phone?”."}
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
    </>
  );
}

const Chev = () => <Ico name="chevron" className="text-muted" />;
