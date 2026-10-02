"use client";
import { useEffect } from "react";
import { useAccount } from "@/lib/account";
import { startLive } from "@/lib/live";

/** One realtime connection for the whole app (root layout). Only when loading won't pop Face ID. */
export function Live() {
  const { profile, canRead } = useAccount();
  const me = canRead ? profile?.address : undefined;
  useEffect(() => (me ? startLive(me) : undefined), [me]);
  return null;
}
