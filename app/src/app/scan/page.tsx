"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type QrScannerType from "qr-scanner";
import { Button, ErrorText, Ico, Screen } from "@/components/ui";
import { useRequireAccount } from "@/lib/account";
import { kinTarget } from "@/lib/scan";
import { walletTarget } from "@/lib/walletUri";

/** Scan & pay: camera QR scanner → opens the pre-filled Pay (or claim/invoice) screen. */
export default function ScanPage() {
  useRequireAccount();
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const scanner = useRef<QrScannerType | null>(null);
  const done = useRef(false);
  const [err, setErr] = useState("");
  const [noCamera, setNoCamera] = useState(false);
  const [torch, setTorch] = useState<boolean | null>(null); // null = no torch on this device

  function handle(text: string) {
    if (done.current) return;
    // Kin links first, then codes from other apps (EIP-681 / plain account) → same prefilled Pay screen.
    const wallet = walletTarget(text);
    const path = kinTarget(text, location.origin) ?? (wallet === "other" ? null : wallet);
    if (wallet === "other") return setErr("That code can't be paid from Kin.");
    if (!path) return setErr("That's not a Kin code. Ask them to open My QR in Kin.");
    done.current = true;
    navigator.vibrate?.(30);
    scanner.current?.stop();
    router.replace(path);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const { default: QrScanner } = await import("qr-scanner"); // client-only (uses window/worker)
      if (!alive || !video.current) return;
      const s = new QrScanner(video.current, (r) => handle(r.data), {
        preferredCamera: "environment",
        highlightScanRegion: true,
        highlightCodeOutline: true,
        returnDetailedScanResult: true,
      });
      scanner.current = s;
      try {
        await s.start();
        if (alive) setTorch((await s.hasFlash()) ? false : null);
      } catch {
        if (alive) setNoCamera(true);
      }
    })();
    return () => {
      alive = false;
      scanner.current?.destroy();
      scanner.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start the camera once
  }, []);

  async function fromPhoto(file?: File) {
    if (!file) return;
    setErr("");
    const { default: QrScanner } = await import("qr-scanner");
    try {
      const r = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
      handle(r.data);
    } catch {
      setErr("Couldn't find a Kin code in that photo. Try again closer.");
    }
  }

  async function toggleTorch() {
    const s = scanner.current;
    if (!s || torch === null) return;
    await s.toggleFlash().catch(() => {});
    setTorch(s.isFlashOn());
  }

  return (
    <Screen title="Scan to pay" back="/home">
      <div className="relative overflow-hidden rounded-[28px] border border-line bg-surface-2" style={{ aspectRatio: "3 / 4" }}>
        <video ref={video} muted playsInline className="absolute inset-0 size-full object-cover" />
        {noCamera && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted">
            Camera isn&apos;t available. Allow camera access in your browser settings, or pick a photo of the code below.
          </div>
        )}
        {torch !== null && (
          <button onClick={toggleTorch} aria-label="Flashlight" aria-pressed={torch}
            className={`absolute bottom-4 right-4 grid size-12 place-items-center rounded-full ${torch ? "bg-ink text-bg" : "bg-surface/80 text-ink"} backdrop-blur`}>
            <Ico name="torch" />
          </button>
        )}
      </div>
      <p className="text-center text-sm text-muted">Point at someone&apos;s Kin QR. Their name and amount fill in for you.</p>
      <ErrorText>{err}</ErrorText>
      <label className="mt-auto">
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => fromPhoto(e.target.files?.[0])} />
        <Button variant="ghost" className="pointer-events-none" tabIndex={-1}>
          <span className="inline-flex items-center gap-2"><Ico name="qr" /> Scan from a photo</span>
        </Button>
      </label>
    </Screen>
  );
}
