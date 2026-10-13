import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform, Share } from "react-native";
import type { Look } from "@/components/Kinko";
import { API_BASE } from "./config";
import { getCurrency } from "./money";
import { query } from "./query";

export type CardParams = {
  kind: "sent" | "received" | "goal" | "gift" | "settled" | "receipt"; amount?: bigint; to?: string; from?: string; secs?: string; title?: string;
  look?: Look;
  /** Receipt: the whole ticket (see web app/api/card). */
  dir?: "in" | "out"; note?: string; cat?: string; when?: string; id?: string;
};

/** Public image URL for a share card (web app/api/card). */
export function cardUrl({ amount, look, ...p }: CardParams) {
  const lk = look && JSON.stringify({ skin: look.skin, accessories: look.accessories });
  return `${API_BASE}/api/card?${query({ cur: getCurrency(), ...p, amount: amount?.toString(), look: lk })}`;
}

/** Share the card PNG itself (WhatsApp, Instagram…); falls back to the link if download/sharing fails. */
export async function shareCard(p: CardParams, text: string) {
  const url = cardUrl(p);
  try {
    if (!(await Sharing.isAvailableAsync())) throw new Error("no share sheet");
    const dest = new File(Paths.cache, `kin-card-${Date.now()}.png`);
    const file = await File.downloadFileAsync(url, dest);
    await Sharing.shareAsync(file.uri, { mimeType: "image/png", dialogTitle: text });
  } catch {
    // Android ignores `url`, so it rides in the message there.
    await Share.share(Platform.OS === "ios" ? { message: text, url } : { message: `${text} ${url}` }).catch(() => {});
  }
}
