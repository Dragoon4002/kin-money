import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

// #6 Private mode: hide balances on screen. Local-only preference (same as web lib/privacy.ts).
const KEY = "kin.private";
const listeners = new Set<() => void>();
const get = () => SecureStore.getItem(KEY) === "1";

export function setPrivate(on: boolean) {
  SecureStore.setItem(KEY, on ? "1" : "0");
  listeners.forEach((l) => l());
}

export const usePrivate = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), get);
