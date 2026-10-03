import { useSyncExternalStore } from "react";
import type { Address } from "viem";
import { DEFAULT_LOOK, lookForName, type Look } from "@/components/Kinko";
import { useAccount } from "./account";
import { KinNamesAbi } from "./abi";
import { API_BASE, addr, publicClient } from "./config";
import { savedLook, subscribeLooks } from "./kinko";
import { Trie } from "./trie";

const ZERO = "0x0000000000000000000000000000000000000000";

/** "@Alice" → address, or null if unclaimed. */
export async function resolveName(handle: string): Promise<Address | null> {
  const h = handle.trim().replace(/^@/, "").toLowerCase();
  if (!h) return null;
  const a = await publicClient.readContract({ address: addr.names, abi: KinNamesAbi, functionName: "resolve", args: [h] });
  return a === ZERO ? null : a;
}

/** address → "alice" or "" if none. */
export function nameOf(address: Address): Promise<string> {
  return publicClient.readContract({ address: addr.names, abi: KinNamesAbi, functionName: "nameOf", args: [address] });
}

export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

/** "0x1a2b…9f0e" — shown only for accounts not on Kin (no @name). */
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// ---------- directory (/api/names): all @names (autocomplete) + published Kinko looks (avatars) ----------

type Directory = { trie: Trie; looks: Map<string, Look> };
let directory: Promise<Directory> | null = null;
let dirLooks = new Map<string, Look>();
const dirListeners = new Set<() => void>();

export function loadDirectory(): Promise<Directory> {
  directory ??= fetch(`${API_BASE}/api/names`)
    .then((r) => r.json())
    .then((j: { names?: string[]; looks?: Record<string, string> }) => {
      const looks = new Map<string, Look>();
      for (const [n, raw] of Object.entries(j.looks ?? {})) {
        try { looks.set(n, { ...DEFAULT_LOOK, ...(JSON.parse(raw) as Partial<Look>) }); } catch {}
      }
      dirLooks = looks;
      dirListeners.forEach((l) => l());
      return { trie: new Trie(j.names ?? []), looks };
    })
    .catch(() => ((directory = null), { trie: new Trie(), looks: new Map<string, Look>() }));
  return directory;
}

export const subscribeDirectory = (l: () => void) => {
  dirListeners.add(l);
  void loadDirectory();
  return () => { dirListeners.delete(l); };
};

/** Look to show for @name: mine from this phone, others' published look, else the stable default (same as web). */
export function useAvatarLook(name = ""): Look {
  const { profile } = useAccount();
  const own = !!name && name === profile?.name;
  const mine = useSyncExternalStore(subscribeLooks, () => (own ? savedLook(profile?.address) : undefined));
  const theirs = useSyncExternalStore(subscribeDirectory, () => dirLooks.get(name));
  return mine ?? theirs ?? lookForName(name);
}
