"use client";
import Link from "next/link";
import QRCode from "qrcode";
import { useState } from "react";
import { share } from "@/components/core/share";
import { Kinko } from "@/components/kinko/Kinko";
import { Button, Card, Screen } from "@/components/ui";
import { useRequireAccount } from "@/lib/account";

/** QR as one SVG path; colors come from tokens (always dark-on-light so every camera reads it). */
function Qr({ text, label }: { text: string; label: string }) {
  const { size, data } = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
  let d = "";
  for (let i = 0; i < data.length; i++) if (data[i]) d += `M${i % size} ${Math.floor(i / size)}h1v1h-1z`;
  return (
    <svg viewBox={`-2 -2 ${size + 4} ${size + 4}`} role="img" aria-label={label} className="aspect-square w-full" shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={size + 4} height={size + 4} fill="var(--fun-ink)" />
      <path d={d} fill="var(--kinko-ink)" />
    </svg>
  );
}

export default function Receive() {
  const { profile } = useRequireAccount();
  const handle = profile?.name;
  const [copied, setCopied] = useState(false);
  const url = handle && typeof location !== "undefined" ? `${location.origin}/send?to=${handle}` : "";

  async function doShare() {
    if (!url) return;
    if ((await share(`Pay me on Kin: @${handle}`, url)) === "copied") setCopied(true);
  }

  return (
    <Screen title="My QR" back="/home">
      {profile && !handle ? (
        <Card className="flex flex-col gap-3 text-center">
          <p>Pick a Kin name first so family can find you.</p>
          <Link href="/" className="font-semibold text-brand">Pick my name</Link>
        </Card>
      ) : (
        <>
          <section className="relative mt-8 flex flex-col items-center rounded-[32px] border border-line bg-surface px-6 pb-6 pt-14 text-center">
            <div className="absolute -top-10"><Kinko size={80} mood="happy" /></div>
            <p className="font-display text-4xl">@{handle}</p>
            <p className="mt-1 text-sm text-muted">Scan with any phone camera to pay me</p>
            <div className="mt-5 w-full max-w-72 overflow-hidden rounded-3xl p-1">
              {url ? <Qr text={url} label={`QR code to pay @${handle}`} /> : <div className="aspect-square w-full animate-pulse rounded-3xl bg-surface-2" />}
            </div>
          </section>
          <div className="mt-auto">
            <Button onClick={doShare} disabled={!url}>{copied ? "Link copied ✓" : "Share my pay link"}</Button>
          </div>
        </>
      )}
    </Screen>
  );
}
