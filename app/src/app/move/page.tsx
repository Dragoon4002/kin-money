"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { hexToBytes, type Hex } from "viem";
import { KinMark } from "@/components/KinMark";
import { Button, Card, ErrorText, Screen } from "@/components/ui";
import { importAccount, kinProfile, revealSecrets, signUp, unlock, useAccount } from "@/lib/account";
import { humanError } from "@/lib/errors";
import { nameOf } from "@/lib/names";

// Kin moved from kin-money.vercel.app to getkin.space. Passkeys belong to one hostname, so accounts can't follow
// on their own: the old site unlocks the account with its old passkey and hands it, tab to tab (postMessage, exact
// origins; never a URL or our server), to getkin.space, which seals it under the new passkey and makes it active.
const OLD = "https://kin-money.vercel.app";
const NEW = "https://getkin.space";
type Moving = { type: "kin-move"; key: Hex; name: string };

export default function Move() {
  const host = useSyncExternalStore(
    () => () => {},
    () => (location.origin === OLD ? "old" : "new"),
    () => null,
  );
  if (!host) return null;
  return host === "old" ? <FromOld /> : <ToNew />;
}

/** kin-money.vercel.app: unlock with the old passkey, then open getkin.space and hand the account over. */
function FromOld() {
  const secret = useRef<Moving | null>(null);
  const [step, setStep] = useState<"start" | "ready" | "sent">("start");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function unlockOld() {
    setBusy(true);
    setErr("");
    try {
      if (!kinProfile()) await unlock(); // new browser: the OS shows the old passkey
      const { privateKeyHex } = await revealSecrets();
      const me = kinProfile()!.address;
      secret.current = { type: "kin-move", key: privateKeyHex, name: await nameOf(me).catch(() => "") };
      setStep("ready");
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  // Separate tap: the new tab must open straight from a click (popup rules), after the passkey prompt is done.
  function openNew() {
    const w = window.open(`${NEW}/move`, "kin-move");
    if (!w) return setErr("Allow pop-ups for this site, then tap again.");
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== NEW || e.source !== w || e.data !== "kin-move-ready" || !secret.current) return;
      w.postMessage(secret.current, NEW);
      secret.current = null; // drop our copy as soon as it's handed over
      window.removeEventListener("message", onMsg);
      setStep("sent");
    };
    window.addEventListener("message", onMsg);
  }

  return (
    <Screen>
      <div className="flex flex-1 flex-col gap-5">
        <p className="flex items-center gap-2 font-display text-4xl leading-none text-brand"><KinMark />kin</p>
        <h1 className="font-display text-5xl leading-[1.05]">Kin has moved to getkin.space</h1>
        <p className="text-lg text-muted">Bring your account with you: your @name, your money and your history. It takes two taps.</p>
        <Card className="text-sm text-muted">
          {step === "start" && "1. Confirm it's you with your usual Identity check."}
          {step === "ready" && "2. Open getkin.space. Your account moves over in the new tab."}
          {step === "sent" && "Done here. Finish in the getkin.space tab: one more Identity check and you're in."}
        </Card>
        <ErrorText>{err}</ErrorText>
        <div className="mt-auto flex flex-col gap-3">
          {step === "start" && <Button onClick={unlockOld} busy={busy}>Unlock my account</Button>}
          {step === "ready" && <Button onClick={openNew}>Move to getkin.space</Button>}
          {step === "sent" && <Button onClick={() => (location.href = NEW)}>Go to getkin.space</Button>}
          <a href={NEW} className="text-center text-sm font-semibold text-muted">New to Kin? Start on getkin.space</a>
        </div>
      </div>
    </Screen>
  );
}

/** getkin.space: receive the old account, create (or unlock) this site's passkey, seal it, switch to it. */
function ToNew() {
  const { profile } = useAccount();
  const got = useRef<Moving | null>(null);
  const [state, setState] = useState<"waiting" | "got" | "done">("waiting");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as Moving;
      if (e.origin !== OLD || d?.type !== "kin-move" || !/^0x[0-9a-fA-F]{64}$/.test(d.key)) return;
      got.current = d;
      setName(d.name);
      setState("got");
    };
    window.addEventListener("message", onMsg);
    window.opener?.postMessage("kin-move-ready", OLD);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  async function finish() {
    const m = got.current;
    if (!m) return;
    setBusy(true);
    setErr("");
    try {
      if (!kinProfile()) await signUp(m.name || "Kin"); // this site's passkey (a vault for the moved account)
      await importAccount(hexToBytes(m.key), m.name || undefined); // sealed under it, then made active
      got.current = null;
      setState("done");
      location.replace("/money");
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <div className="flex flex-1 flex-col gap-5">
        <p className="flex items-center gap-2 font-display text-4xl leading-none text-brand"><KinMark />kin</p>
        <h1 className="font-display text-5xl leading-[1.05]">{state === "waiting" ? "Moving your account" : "Your account is here"}</h1>
        <p className="text-lg text-muted">
          {state === "waiting"
            ? "Open kin-money.vercel.app in this browser and tap Move. This page picks it up."
            : `Save it to this site with an Identity check${name ? ` and carry on as @${name}` : ""}.`}
        </p>
        {profile && state === "waiting" && <p className="text-sm text-muted">You&apos;re already on getkin.space. The moved account is added next to it.</p>}
        <ErrorText>{err}</ErrorText>
        <div className="mt-auto">
          <Button onClick={finish} busy={busy} disabled={state !== "got"}>Finish moving</Button>
        </div>
      </div>
    </Screen>
  );
}
