"use client";
import Link from "next/link";
import QRCode from "qrcode";
import { useState } from "react";
import { PayQr } from "@/components/core/PayQr";
import { share } from "@/components/core/share";
import { MyKinko } from "@/components/kinko/PersonKinko";
import { Button, Card, Field, Screen, Tabs, inputClass } from "@/components/ui";
import { useRequireAccount } from "@/lib/account";
import { formatMoney, fromLocal } from "@/lib/money";
import { useCurrencySymbol } from "@/lib/useCurrencySymbol";
import { payLink } from "@/lib/payLink";
import { walletUri } from "@/lib/walletUri";

const MODES = [["kin", "Kin app"], ["wallet", "Other wallet"]] as const;

/** My QR card as a PNG: @name, one line, the QR (dark on white so every camera reads it). */
function qrCardFile(qr: string, handle: string, line: string): Promise<File | null> {
  const { size, data } = QRCode.create(qr, { errorCorrectionLevel: "M" }).modules;
  const W = 720;
  const cell = Math.floor((W - 160) / (size + 4));
  const x0 = (W - cell * size) / 2;
  const y0 = 220 + 2 * cell;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = y0 + cell * (size + 2) + 80;
  const g = c.getContext("2d");
  if (!g) return Promise.resolve(null);
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
  g.fillStyle = "#111";
  for (let i = 0; i < data.length; i++) if (data[i]) g.fillRect(x0 + (i % size) * cell, y0 + Math.floor(i / size) * cell, cell, cell);
  return new Promise((ok) => c.toBlob((b) => ok(b ? new File([b], "kin-qr.png", { type: "image/png" }) : null), "image/png"));
}

export default function Receive() {
  const { profile } = useRequireAccount();
  const handle = profile?.name;
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"kin" | "wallet">("kin");
  const [addrCopied, setAddrCopied] = useState(false);
  const symbol = useCurrencySymbol();
  const units = /^\d{1,9}(\.\d{0,2})?$/.test(amount) && Number(amount) > 0 ? fromLocal(amount) : 0n;
  // Amount is optional: with it, the payer's screen opens pre-filled with this exact amount.
  const url = handle && typeof location !== "undefined" ? payLink(handle, units) : "";
  // Other wallet: standard payment code (EIP-681) to my account, same amount.
  const qr = mode === "kin" ? url : profile ? walletUri(profile.address, units) : "";

  async function copyAddress() {
    if (!profile) return;
    await navigator.clipboard?.writeText(profile.address).then(() => setAddrCopied(true), () => {});
  }

  const shareText = units ? `Pay me ${formatMoney(units)} on Kin: @${handle}` : `Pay me on Kin: @${handle}`;

  // Card image when this browser can share files (most phones); else the link.
  async function doShare() {
    if (!url || !handle) return;
    const file = await qrCardFile(url, handle, units ? `Scan to pay ${formatMoney(units)}` : "Scan to pay me on Kin").catch(() => null);
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
          <section className="relative mt-8 flex flex-col items-center rounded-[32px] border border-line bg-surface px-6 pb-6 pt-14 text-center">
            <div className="absolute -top-10"><MyKinko size={80} mood="happy" /></div>
            {mode === "wallet" && <p className="text-sm text-muted">Pay to</p>}
            <p className="font-display text-4xl">@{handle}</p>
            <p className="mt-1 text-sm text-muted">
              {mode === "wallet" ? (units ? `Scan from another app to pay ${formatMoney(units)}` : "Scan from another app to pay me") : units ? `Scan to pay ${formatMoney(units)}` : "Scan with any phone camera to pay me"}
            </p>
            <div className="mt-5 w-full max-w-72 overflow-hidden rounded-3xl p-1">
              {qr && url ? <PayQr text={qr} label={`QR code to pay @${handle}`} /> : <div className="aspect-square w-full animate-pulse rounded-3xl bg-surface-2" />}
            </div>
            {mode === "wallet" && (
              <>
                <p className="mt-3 text-xs text-muted">Works with wallets that support Monad. Send Agora dollars (AUSD) on Monad.</p>
                <button type="button" onClick={copyAddress} className="mt-1 h-11 rounded-full px-4 text-sm font-semibold text-brand active:bg-brand-soft">
                  {addrCopied ? "Copied ✓" : "Copy wallet address"}
                </button>
              </>
            )}
          </section>
          <Tabs value={mode} options={MODES} onChange={setMode} />
          <Field label="Ask for an amount (optional)">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-4 grid place-items-center font-semibold text-muted">{symbol}</span>
              <input className={`${inputClass} pl-10 tabular`} inputMode="decimal" placeholder="0.00" value={amount}
                onChange={(e) => /^\d{0,9}(\.\d{0,2})?$/.test(e.target.value) && (setAmount(e.target.value), setCopied(false))} />
            </div>
          </Field>
          {mode === "kin" && (
            <div className="mt-auto">
              <Button onClick={doShare} disabled={!url}>Share my QR</Button>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <a href={url ? `https://wa.me/?text=${encodeURIComponent(`${shareText} ${url}`)}` : undefined} target="_blank" rel="noopener noreferrer"
                  className="grid h-12 place-items-center rounded-full bg-surface-2 text-sm font-semibold text-ink active:scale-[0.98]">Share on WhatsApp</a>
                <button type="button" onClick={copyLink} disabled={!url}
                  className="h-12 rounded-full bg-surface-2 text-sm font-semibold text-ink active:scale-[0.98]">{copied ? "Copied ✓" : "Copy link"}</button>
              </div>
            </div>
          )}
        </>
      )}
    </Screen>
  );
}
