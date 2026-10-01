"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Onboard } from "@/components/core/Onboard";
import { Kinko } from "@/components/kinko/Kinko";
import { Button, ErrorText, Screen } from "@/components/ui";
import { setName, unlock, useAccount } from "@/lib/account";
import { humanError } from "@/lib/errors";
import { captureRef } from "@/lib/kinko";
import { nameOf } from "@/lib/names";

// Where to go after signup/unlock: same-origin `?next=/path` (e.g. an invoice link), else home.
const nextPath = () => {
  const n = new URLSearchParams(location.search).get("next");
  return n?.startsWith("/") && !n.startsWith("//") ? n : "/home";
};

export default function Welcome() {
  const router = useRouter();
  const { profile, unlocked, ready } = useAccount();
  const [onboard, setOnboard] = useState<"name" | "handle" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Remember who invited us (?ref=handle) for the Kinko invite reward.
  useEffect(captureRef, []);

  // Already unlocked with a name → straight in.
  useEffect(() => {
    if (!onboard && unlocked && profile?.name) router.replace(nextPath());
  }, [onboard, unlocked, profile, router]);

  async function doUnlock() {
    setBusy(true);
    setErr("");
    try {
      const p = await unlock();
      if (!p.name) {
        const n = await nameOf(p.address).catch(() => "");
        if (n) setName(n);
        else setOnboard("handle");
      }
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  if (onboard) {
    return (
      <Screen>
        <Onboard start={onboard} onDone={() => router.replace(nextPath())} />
      </Screen>
    );
  }

  return (
    <Screen>
      <div className="flex flex-1 flex-col">
        <p className="font-display text-4xl leading-none text-brand">kin</p>
        <div className="flex flex-1 flex-col justify-center gap-5">
          <div className="relative w-fit">
            <div aria-hidden className="absolute inset-0 scale-150 rounded-full bg-brand/20 blur-3xl" />
            <div className="relative"><Kinko size={120} mood={profile ? "calm" : "happy"} /></div>
          </div>
          {ready && profile ? (
            <>
              <h1 className="font-display text-5xl leading-[1.05]">Welcome back{profile.name ? <>,<br />@{profile.name}</> : ""}</h1>
              <p className="text-lg text-muted">Your money is locked for safety.</p>
            </>
          ) : (
            <>
              <h1 className="font-display text-[3.4rem] leading-[1.02] tracking-tight">Money for the people you <span className="text-brand">love</span>, anywhere.</h1>
              <p className="text-lg text-muted">Send dollars home in a second. Free, with just Face ID.</p>
            </>
          )}
        </div>
        <ErrorText>{err}</ErrorText>
        {ready && (
          <div className="mt-4 flex flex-col gap-2">
            {profile ? (
              <Button busy={busy} onClick={doUnlock}>Unlock with Face ID</Button>
            ) : (
              <>
                <Button onClick={() => setOnboard("name")}>Create my account</Button>
                <button onClick={doUnlock} disabled={busy} className="h-12 text-sm font-semibold text-muted active:text-ink">
                  Already have Kin on another phone?
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </Screen>
  );
}
