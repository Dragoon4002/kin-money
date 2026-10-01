import { createPublicClient, http, type Address } from "viem";
import { monadTestnet } from "viem/chains";

// Same rpId as the PWA → same passkey → same account on web and phone.
export const RP_ID = "kin-money.vercel.app";
export const API_BASE = "https://kin-money.vercel.app";

export const chain = monadTestnet;
export const publicClient = createPublicClient({ chain, transport: http("https://testnet-rpc.monad.xyz") });

// From contracts/deployments/10143.json.
export const addr = {
  ausd: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
  forwarder: "0xdF70AaC88E464c78cDe367B5d2879776C2994102",
  names: "0x1cA367edbCf73A357Fe60651cFE6af27cfCA8476",
  escrow: "0x2F2e58b1B33B30756fa0653672B4ba10cF93a55e",
  stream: "0xaF989d7acE5a015875Fb5f28b22a091D441e41DB",
  pot: "0x58ab4Da1575758be9d4Fe53bdB79fabe8F4C2caD",
  circle: "0x37eC9DB78376CE7104eD5e0bD91dcfa96B9D6150",
} as const satisfies Record<string, Address>;
