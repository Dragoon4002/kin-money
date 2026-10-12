"use client";
import type { Look } from "@/components/kinko/Kinko";
import { share } from "@/components/core/share";
import { getCurrency } from "./money";

export type CardParams = {
  kind: "sent" | "received" | "goal" | "gift" | "settled" | "receipt";
  amount?: bigint;
  to?: string;
  from?: string;
  secs?: string;
  title?: string;
  look?: Look;
  /** Receipt: the whole ticket (see app/api/card). */
  dir?: "in" | "out";
  note?: string;
  cat?: string;
  when?: string;
  id?: string;
};

/** Public image URL for a share card (see app/api/card). */
export function cardUrl({ amount, look, ...p }: CardParams) {
  const q = new URLSearchParams({ cur: getCurrency() });
  for (const [k, v] of Object.entries(p)) if (v) q.set(k, v);
  if (amount !== undefined) q.set("amount", amount.toString());
  if (look) q.set("look", JSON.stringify({ skin: look.skin, accessories: look.accessories }));
  return `${location.origin}/api/card?${q}`;
}

// Fetched ahead (warmCard on render) so the tap → share sheet stays inside the browser's user-gesture window.
const files = new Map<string, Promise<File | null>>();
function cardFile(url: string) {
  let f = files.get(url);
  if (!f) {
    f = fetch(url)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? new File([b], "kin.png", { type: "image/png" }) : null))
      .catch(() => null);
    files.set(url, f);
  }
  return f;
}

export const warmCard = (p: CardParams) => void cardFile(cardUrl(p));

/** Share the card image; if this browser can't share files, share/copy its link with `text`. */
export async function shareCard(p: CardParams, text: string): Promise<"shared" | "copied" | "cancelled"> {
  const url = cardUrl(p);
  const file = await cardFile(url);
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  return share(text, url);
}
