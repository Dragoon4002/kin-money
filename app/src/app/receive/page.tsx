"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { PayQr, qrImage } from "@/components/core/PayQr";
import { share } from "@/components/core/share";
import { Button, Card, Field, Screen, inputClass } from "@/components/ui";
import { useRequireAccount } from "@/lib/account";
import { useMode } from "@/lib/mode";
import { formatMoney, fromLocal } from "@/lib/money";
import { useCurrencySymbol } from "@/lib/useCurrencySymbol";
import { payLink } from "@/lib/payLink";
import { shortAddr } from "@/lib/names";
import { walletUri } from "@/lib/walletUri";

const SCAN_LINE = "Scan with Kin or any wallet app";

/** My QR card as a PNG: @name, one line, the styled QR. */
async function qrCardFile(svg: SVGSVGElement, handle: string, line: string): Promise<File | null> {
  const qr = await qrImage(svg);
  const W = 720, Q = 560, y0 = 220;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = y0 + Q + 90;
  const g = c.getContext("2d");
  if (!g) return null;
  const font = getComputedStyle(document.body).fontFamily;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, W, c.height);
  g.fillStyle = "#111";
  g.textAlign = "center";
  g.font = `700 60px ${font}`;
  g.fillText(`@${handle}`, W / 2, 120);
  g.fillStyle = "#666";
  g.font = `400 30px ${font}`;
  g.fillText(line, W / 2, 175);
  g.drawImage(qr, (W - Q) / 2, y0, Q, Q);
  g.fillText(SCAN_LINE, W / 2, y0 + Q + 50);
  return new Promise((ok) => c.toBlob((b) => ok(b ? new File([b], "kin-qr.png", { type: "image/png" }) : null), "image/png"));
}

export default function Receive() {
  const { profile } = useRequireAccount();
  const mode = useMode();
  const handle = profile?.name;
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [addrCopied, setAddrCopied] = useState(false);
  const qrRef = useRef<SVGSVGElement>(null);
  const symbol = useCurrencySymbol();
  const units = /^\d{1,9}(\.\d{0,2})?$/.test(amount) && Number(amount) > 0 ? fromLocal(amount) : 0n;
  // Amount is optional: with it, the payer's screen opens pre-filled with this exact amount.
  // The link reaches people without an app; the QR is the standard payment code Kin and other apps both read.
  const url = handle && typeof location !== "undefined" ? payLink(handle, units) : "";
  const qr = profile ? walletUri(profile.address, units, mode) : "";

  const shareText = units ? `Pay me ${formatMoney(units)} on Kin: @${handle}` : `Pay me on Kin: @${handle}`;

  // Card image when this browser can share files (most phones); else the link.
  async function doShare() {
    if (!url || !handle) return;
    const file = qrRef.current ? await qrCardFile(qrRef.current, handle, units ? `Scan to pay ${formatMoney(units)}` : "Scan to pay me").catch(() => null) : null;
    if (file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: `${shareText} ${url}` });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    if ((await share(shareText, url)) === "copied") setCopied(true);
  }

  // Some wallets show the scanned address instead of a pay screen: let people copy it to compare or paste.
  async function copyAddress() {
    if (!profile) return;
    await navigator.clipboard?.writeText(profile.address).then(() => setAddrCopied(true), () => {});
  }

  async function copyLink() {
    await navigator.clipboard?.writeText(url).then(() => setCopied(true), () => {});
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
          <section className="flex flex-col items-center rounded-[32px] border border-line bg-surface p-6 text-center">
            <p className="font-display text-4xl">@{handle}</p>
            <p className="mt-1 text-sm text-muted">{units ? `Pay ${formatMoney(units)}` : "Pay me"}</p>
            <div className="mt-5 w-full max-w-72 overflow-hidden rounded-3xl">
              {qr && url ? <PayQr svgRef={qrRef} text={qr} label={`QR code to pay @${handle}`} /> : <div className="aspect-square w-full animate-pulse rounded-3xl bg-surface-2" />}
            </div>
            <p className="mt-3 text-sm text-muted">{SCAN_LINE}</p>
            {profile && (
              <button type="button" onClick={copyAddress} className="mt-2 flex min-h-11 flex-col items-center rounded-full px-4 py-1 active:bg-brand-soft">
                <span className="text-sm font-semibold text-brand">{addrCopied ? "Copied ✓" : "Copy wallet address"}</span>
                <span className="font-mono text-xs text-muted">{shortAddr(profile.address)}</span>
              </button>
            )}
          </section>
          <Field label="Ask for an amount (optional)">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-4 grid place-items-center font-semibold text-muted">{symbol}</span>
              <input className={`${inputClass} pl-10 tabular`} inputMode="decimal" placeholder="0.00" value={amount}
                onChange={(e) => /^\d{0,9}(\.\d{0,2})?$/.test(e.target.value) && (setAmount(e.target.value), setCopied(false))} />
            </div>
          </Field>
          <div className="mt-auto">
            <Button onClick={doShare} disabled={!url}>Share my QR</Button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <a href={url ? `https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}` : undefined} target="_blank" rel="noopener noreferrer"
                className="grid h-12 place-items-center rounded-full bg-surface-2 text-sm font-semibold text-ink active:scale-[0.98]">Share on WhatsApp</a>
              <button type="button" onClick={copyLink} disabled={!url}
                className="h-12 rounded-full bg-surface-2 text-sm font-semibold text-ink active:scale-[0.98]">{copied ? "Copied ✓" : "Copy link"}</button>
            </div>
          </div>
        </>
      )}
    </Screen>
  );
}
