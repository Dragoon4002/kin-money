"use client";
import { useRef, useState } from "react";
import { Kinko } from "@/components/kinko/Kinko";
import { Button, ErrorText, Field, inputClass } from "@/components/ui";
import { KinNamesAbi } from "@/lib/abi";
import { setName, signUp, useAccount } from "@/lib/account";
import { registerMe } from "@/lib/contacts";
import { addr } from "@/lib/chain";
import { humanError } from "@/lib/errors";
import { formatMoney, toUnits } from "@/lib/money";
import { HANDLE_RE, nameOf, resolveName } from "@/lib/names";
import { call } from "@/lib/tx";

type Step = "name" | "handle" | "gift";
type Check = "idle" | "checking" | "free" | "taken";

const suggest = (name: string) => name.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);

/** New account: first name → Face ID → @handle → welcome money. Used by welcome and claim screens. */
export function Onboard({ onDone, start = "name" }: { onDone: () => void; start?: Step }) {
  const { profile } = useAccount();
  const [step, setStep] = useState<Step>(start);
  const [first, setFirst] = useState("");
  const [handle, setHandle] = useState("");
  const [check, setCheck] = useState<Check>("idle");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const seq = useRef(0);

  function onHandle(v: string) {
    const h = v.toLowerCase().replace(/^@/, "").replace(/\s/g, "");
    setHandle(h);
    setErr("");
    const n = ++seq.current;
    if (!HANDLE_RE.test(h)) return setCheck("idle");
    setCheck("checking");
    resolveName(h)
      .then((a) => n === seq.current && setCheck(a ? "taken" : "free"))
      .catch(() => n === seq.current && setCheck("idle"));
  }

  async function createAccount() {
    setBusy(true);
    setErr("");
    try {
      await signUp(first.trim());
      onHandle(suggest(first));
      setStep("handle");
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveHandle() {
    if (!profile) return;
    setBusy(true);
    setErr("");
    try {
      await call(addr.names, KinNamesAbi, "claim", [handle]);
      setName(handle);
    } catch (e) {
      // Already has a name (e.g. set up earlier) → keep it; name just got taken → say so.
      const existing = await nameOf(profile.address).catch(() => "");
      if (existing) setName(existing);
      else {
        const taken = await resolveName(handle).catch(() => null);
        setErr(taken ? "Someone just took that name. Try another." : humanError(e));
        if (taken) setCheck("taken");
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    setStep("gift");
    void registerMe(); // show up in other people's phonebook right away
    // Testnet welcome gift; failure is fine — the account works without it.
    await fetch("/api/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: profile.address }) }).catch(() => {});
    onDone();
  }

  if (step === "gift") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="animate-bounce"><Kinko size={120} mood="celebrate" /></div>
        <h2 className="font-display text-4xl leading-tight">Adding {formatMoney(toUnits(10_000))} welcome money</h2>
        <p className="text-muted">Practice money so you can try Kin. Just a moment…</p>
      </div>
    );
  }

  if (step === "handle") {
    const hint = {
      idle: handle && !HANDLE_RE.test(handle) ? "3–20 letters, numbers or _" : "Family finds you by this name.",
      checking: "Checking…",
      free: `@${handle} is yours to take ✓`,
      taken: `@${handle} is taken. Try another.`,
    }[check];
    return (
      <form className="flex flex-1 flex-col gap-4" onSubmit={(e) => (e.preventDefault(), saveHandle())}>
        <h2 className="font-display text-4xl leading-tight">Pick your Kin name</h2>
        <Field label="Your name on Kin" hint={hint}>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">@</span>
            <input className={`${inputClass} pl-9`} value={handle} onChange={(e) => onHandle(e.target.value)}
              autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={20} autoFocus />
          </div>
        </Field>
        <ErrorText>{err}</ErrorText>
        <div className="mt-auto">
          <Button type="submit" busy={busy} disabled={check !== "free"}>
            {busy ? "Saving" : `Continue as @${handle || "…"}`}
          </Button>
          {busy && <p className="mt-3 text-center text-sm text-muted">Saving @{handle} — a few seconds…</p>}
        </div>
      </form>
    );
  }

  return (
    <form className="flex flex-1 flex-col gap-4" onSubmit={(e) => (e.preventDefault(), createAccount())}>
      <div className="flex items-end gap-3">
        <Kinko size={56} mood="happy" />
        <h2 className="font-display text-4xl leading-tight">What should family call you?</h2>
      </div>
      <Field label="First name">
        <input className={inputClass} value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="given-name" maxLength={40} autoFocus />
      </Field>
      <p className="text-sm text-muted">No password, no forms. Your phone&apos;s Face ID keeps your account safe.</p>
      <ErrorText>{err}</ErrorText>
      <div className="mt-auto">
        <Button type="submit" busy={busy} disabled={!first.trim()}>Create with Face ID</Button>
      </div>
    </form>
  );
}
