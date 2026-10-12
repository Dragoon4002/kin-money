import * as SecureStore from "expo-secure-store";
import { API_BASE } from "./config";

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

// Built-in table = fallback; live rates (Chainlink CRE → KinKeeper onchain, via /api/rates) replace it. Same as web.
export const FX_STATIC: Record<string, number> = { USD: 1, INR: 88.5, PHP: 57.5, MXN: 18.4, NGN: 1530, AED: 3.67, GBP: 0.75, EUR: 0.86 };
export const FX: Record<string, number> = { ...FX_STATIC };
/** Pull live rates into FX (app start + back to foreground). Cash-out quotes read FX.INR, so they follow. */
export const loadRates = () =>
  fetch(`${API_BASE}/api/rates`).then((r) => r.json()).then((j: { rates?: Record<string, number> }) => void Object.assign(FX, j.rates)).catch(() => {});
// ponytail: screens rendered before this lands show the table rate until their next render.
void loadRates();

const CURRENCY = "kin.currency";
let currency: string | null = null;

export function getCurrency(): string {
  if (currency === null) {
    try {
      currency = SecureStore.getItem(CURRENCY) ?? "USD";
    } catch {
      currency = "USD";
    }
  }
  return currency;
}

export function setCurrency(c: string) {
  currency = c;
  SecureStore.setItem(CURRENCY, c);
}

/** "₹4,425.00" for 50 AUSD when currency is INR. */
export function formatMoney(units: bigint, c = getCurrency()): string {
  const rate = FX[c] ?? 1;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: c, minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(toDollars(units) * rate);
}

/** Local-currency amount typed by user → AUSD base units. */
export function fromLocal(amount: string, c = getCurrency()): bigint {
  const usd = Number(amount) / (FX[c] ?? 1);
  return toUnits(usd.toFixed(DECIMALS));
}

/** "₹" for INR, "$" for USD. */
export function currencySymbol(c = getCurrency()): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: c }).formatToParts(0).find((p) => p.type === "currency")?.value ?? c;
  } catch {
    return c === "USD" ? "$" : c; // ponytail: Hermes without formatToParts
  }
}
