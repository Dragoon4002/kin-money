"use client";

// Onramp white-label (docs-whitelabel.onramp.money): our server signs every call; the browser only asks /api/onramp/*.
export type OnrampQuote = { rupees: number; rate: number; fees: { onramp: number; gateway: number; tds: number }; sandbox: boolean };

/** Onramp's own quote for selling `usdc` (decimal string) for INR, via /api/onramp/quote (keys stay on the server). */
export async function onrampQuote(usdc: string): Promise<OnrampQuote> {
  const res = await fetch("/api/onramp/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ usdc }) });
  const json = await res.json();
  if (!res.ok) throw new Error(`offramp: ${json.error ?? res.status}`);
  return json;
}
