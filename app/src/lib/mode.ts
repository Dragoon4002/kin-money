"use client";
import { useSyncExternalStore } from "react";
import { getMode, subscribeMode, type Mode } from "./chain";

/** Practice ("test") or real money ("main"); re-renders when Me → Real money is switched. */
export const useMode = () => useSyncExternalStore(subscribeMode, getMode, () => "test" as Mode);
