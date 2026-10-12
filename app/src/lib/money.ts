// AUSD has 6 decimals. All onchain amounts are bigint base units.
export const DECIMALS = 6;
const UNIT = 10n ** BigInt(DECIMALS);

export function toUnits(dollars: string | number): bigint {
  const [i, f = ""] = String(dollars).trim().split(".");
  return BigInt(i || "0") * UNIT + BigInt((f + "000000").slice(0, DECIMALS));
}

export function toDollars(units: bigint): number {
  return Number(units) / Number(UNIT);
}

// Built-in table = fallback. In the browser, live rates (Chainlink CRE → KinKeeper onchain, via /api/rates) replace it.
export const FX_STATIC: Record<string, number> = { USD: 1, INR: 96.8, PHP: 62.8, MXN: 18.4, NGN: 1331, AED: 3.67, GBP: 0.756, EUR: 0.893 };
export const FX: Record<string, number> = { ...FX_STATIC };
// ponytail: screens rendered before this lands show the table rate until their next render.
if (typeof window !== "undefined") {
  fetch("/api/rates").then((r) => r.json()).then((j: { rates?: Record<string, number> }) => Object.assign(FX, j.rates)).catch(() => {});
}

export function getCurrency(): string {
  if (typeof localStorage === "undefined") return "USD";
  return localStorage.getItem("kin.currency") ?? "USD";
}

/** "₹4,425.00" for 50 AUSD when currency is INR. */
export function formatMoney(units: bigint, currency = getCurrency()): string {
  const rate = FX[currency] ?? 1;
  return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Math.trunc(toDollars(units) * rate * 100 + (units < 0n ? -1e-9 : 1e-9)) / 100); // round toward zero: never show more than is there ($4.9983 → $4.99)
}

/** Local-currency amount typed by user → AUSD base units. */
export function fromLocal(amount: string, currency = getCurrency()): bigint {
  const usd = Number(amount) / (FX[currency] ?? 1);
  return toUnits(usd.toFixed(DECIMALS));
}


/** "₹" for INR, "$" for USD. */
export const currencySymbol = (currency = getCurrency()) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;

