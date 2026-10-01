"use client";
import { useSyncExternalStore } from "react";

// #6 Private mode: hide balances on screen. Local-only preference.
const KEY = "kin.private";
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
const get = () => localStorage.getItem(KEY) === "1";

export function setPrivate(on: boolean) {
  localStorage.setItem(KEY, on ? "1" : "0");
  listeners.forEach((l) => l());
}

export const usePrivate = () => useSyncExternalStore(subscribe, get, () => false);
