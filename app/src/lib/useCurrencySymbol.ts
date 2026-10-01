"use client";
import { useSyncExternalStore } from "react";
import { currencySymbol } from "./money";

const noStore = () => () => {};

/**
 * Currency symbol for render. "" during SSR/hydration (server has no saved currency), then the
 * saved currency's symbol — avoids hydration mismatches for non-USD users.
 */
export const useCurrencySymbol = () => useSyncExternalStore(noStore, () => currencySymbol(), () => "");
