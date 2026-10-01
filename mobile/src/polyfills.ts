import { getRandomValues } from "expo-crypto";

// Hermes has no crypto.getRandomValues; mera/viem/scure need it.
if (typeof globalThis.crypto?.getRandomValues !== "function")
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: { ...globalThis.crypto, getRandomValues } });
