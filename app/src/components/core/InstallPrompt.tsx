"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Ico } from "@/components/ui";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const KEY = "kin.installDismissed";
const SNOOZE_MS = 7 * 86_400_000;

/**
 * "Add Kin to your home screen". Mounted once in the root layout so Android's one-shot
 * `beforeinstallprompt` is caught on any page; the banner itself only shows on /home.
 * iOS has no install API → short Share → "Add to Home Screen" guide instead.
 */
const noStore = () => () => {};

/** Not installed and not snoozed (client only). */
function eligible(): boolean {
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
  try {
    return !standalone && Date.now() - Number(localStorage.getItem(KEY) ?? 0) >= SNOOZE_MS;
  } catch {
    return !standalone;
  }
}

/** iPhone/iPad Safari — no install API there. */
function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function InstallPrompt() {
  const path = usePathname();
  // Device facts: false on the server, real on the client (no hydration mismatch, no effect setState).
  const canShow = useSyncExternalStore(noStore, eligible, () => false);
  const ios = useSyncExternalStore(noStore, isIosSafari, () => false);
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep it for our own button
      setEvt(e as InstallEvent);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {}
  }

  async function install() {
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === "accepted") setHidden(true);
    setEvt(null);
  }

  if (!canShow || hidden || path !== "/home" || (!evt && !ios)) return null;

  return (
    <div role="dialog" aria-label="Add Kin to your home screen"
      className="fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-30 mx-auto w-[calc(100%-2rem)] max-w-sm rounded-3xl border border-line bg-surface p-4 shadow-xl shadow-ink/10">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static icon */}
        <img src="/maskable-192.png" alt="" width={44} height={44} className="rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Add Kin to your home screen</p>
          <p className="text-sm text-muted">
            {ios ? (
              <>Tap <Ico name="share" size={14} className="inline align-[-2px]" /> Share, then &ldquo;Add to Home Screen&rdquo;.</>
            ) : (
              "Opens like an app — full screen, one tap away."
            )}
          </p>
        </div>
        <button onClick={dismiss} aria-label="Not now" className="-m-2 grid size-10 place-items-center rounded-full text-muted active:bg-surface-2">
          <Ico name="close" size={18} />
        </button>
      </div>
      {!ios && (
        <button onClick={install} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand font-semibold text-brand-ink active:scale-[0.98]">
          <Ico name="install" size={18} /> Install Kin
        </button>
      )}
    </div>
  );
}
