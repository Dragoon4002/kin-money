// Pure mapping logic (no envio runtime import) so test/*.mts can run it under plain node.
import { encodeAbiParameters, encodeEventTopics, type Abi, type AbiEvent } from "viem";
import KinNames from "../abis/KinNames.json" with { type: "json" };
import KinEscrow from "../abis/KinEscrow.json" with { type: "json" };
import KinStream from "../abis/KinStream.json" with { type: "json" };
import KinPot from "../abis/KinPot.json" with { type: "json" };
import KinPotV1 from "../abis/KinPotV1.json" with { type: "json" };
import KinCircle from "../abis/KinCircle.json" with { type: "json" };
import KinMandate from "../abis/KinMandate.json" with { type: "json" };
import KinGiftLink from "../abis/KinGiftLink.json" with { type: "json" };
import KinCashout from "../abis/KinCashout.json" with { type: "json" };
import KinCashoutV2 from "../abis/KinCashoutV2.json" with { type: "json" };
import AUSD from "../abis/AUSD.json" with { type: "json" };

export const ABIS = { KinNames, KinEscrow, KinStream, KinPot, KinPotV1, KinCircle, KinMandate, KinGiftLink, KinCashout, KinCashoutV2, AUSD } as unknown as Record<ContractName, Abi>;
export type ContractName = "KinNames" | "KinEscrow" | "KinStream" | "KinPot" | "KinPotV1" | "KinCircle" | "KinMandate" | "KinGiftLink" | "KinCashout" | "KinCashoutV2" | "AUSD";

export const KIND: Record<ContractName, string> = {
  KinNames: "name", KinEscrow: "escrow", KinStream: "stream", KinPot: "pot", KinPotV1: "pot",
  KinCircle: "circle", KinMandate: "mandate", KinGiftLink: "gift", KinCashout: "cashout", KinCashoutV2: "cashout", AUSD: "transfer",
};

// ponytail: mirrors config.yaml addresses (test checks they match). Upgrade path: read indexer.chains at startup.
export const ADDRESSES: Record<ContractName, string> = {
  KinNames: "0x1ca367edbcf73a357fe60651cfe6af27cfca8476",
  KinEscrow: "0x2f2e58b1b33b30756fa0653672b4ba10cf93a55e",
  KinStream: "0xaf989d7ace5a015875fb5f28b22a091d441e41db",
  KinPot: "0x35e381186b7f5271bdbc6f44cb17ac8d2da72a78",
  KinPotV1: "0x58ab4da1575758be9d4fe53bdb79fabe8f4c2cad",
  KinCircle: "0x0b467a32e1a38b999134da4941cad136390c9b41",
  KinMandate: "0xe770ecfbf2d2d6b8b9c1b210b7a42b92bba8fd53",
  KinGiftLink: "0x7ad1c20d0b96bae5ae72462137384a1924e36bdb",
  KinCashout: "0xddbc1208e84e82676bfc7452f25cecdb3b05b75a",
  KinCashoutV2: "0xca36ce5954e4c4058216b19622106525a894ad37",
  AUSD: "0xa9012a055bd4e0edff8ce09f960291c09d5322dc",
};
const KIN_CONTRACTS = new Set(Object.entries(ADDRESSES).filter(([n]) => n !== "AUSD").map(([, a]) => a));

const ZERO = "0x0000000000000000000000000000000000000000";
const isAddr = (v: unknown): v is string => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
// `key` = throwaway invite-signing key, not a person.
const NOT_ACCOUNTS = new Set(["key"]);

/** Every person touched by an event: address params (incl. address[] members/recipients), lowercased, deduped. */
export function involved(params: Record<string, unknown>): string[] {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(params)) {
    if (NOT_ACCOUNTS.has(k)) continue;
    for (const x of Array.isArray(v) ? v : [v]) if (isAddr(x) && x !== ZERO && !KIN_CONTRACTS.has(x.toLowerCase())) out.add(x.toLowerCase());
  }
  return [...out];
}

/** AUSD has huge transfer volume: keep only transfers touching a Kin account or a Kin contract. */
export function keepTransfer(from: string, to: string, touchesAccount: boolean): boolean {
  return touchesAccount || KIN_CONTRACTS.has(from.toLowerCase()) || KIN_CONTRACTS.has(to.toLowerCase());
}

const AMOUNT_KEYS = ["amount", "value", "total", "covered", "deposit", "ausdIn", "toPayee", "toPayer", "contribution", "target", "settledOut"];
export const json = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));

/** Rebuild the exact raw log (topics + data) from decoded params, so consumers can treat rows as plain logs. */
export function encodeRaw(contract: ContractName, event: string, params: Record<string, unknown>) {
  const ev = ABIS[contract].find((x): x is AbiEvent => x.type === "event" && x.name === event);
  if (!ev) throw new Error(`unknown event ${contract}.${event}`);
  const topics = encodeEventTopics({ abi: [ev], eventName: event, args: params } as never);
  const plain = ev.inputs.filter((i) => !i.indexed);
  const data = encodeAbiParameters(plain, plain.map((i) => params[i.name!]));
  return { topics, data };
}

export type Log = { contract: ContractName; event: string; address: string; params: Record<string, unknown>; blockNumber: number; timestamp: number; txHash: string; logIndex: number };

/** One Activity row per involved account (counterparty set when exactly two people are involved).
 *  Events naming nobody (e.g. Stream Cancelled, Circle Started) get one row keyed by the contract so no log is lost. */
export function activityRows(l: Log) {
  const found = involved(l.params);
  const people = found.length ? found : l.event === "Transfer" ? [] : [l.address.toLowerCase()];
  const amountKey = AMOUNT_KEYS.find((k) => typeof l.params[k] === "bigint");
  const raw = encodeRaw(l.contract, l.event, l.params);
  const base = {
    kind: KIND[l.contract],
    contract: l.address.toLowerCase(),
    event: l.event,
    amount: amountKey ? (l.params[amountKey] as bigint) : undefined,
    token: amountKey ? ADDRESSES.AUSD : undefined,
    blockNumber: l.blockNumber,
    timestamp: l.timestamp,
    txHash: l.txHash,
    logIndex: l.logIndex,
    data: json(l.params),
    topics: json(raw.topics),
    rawData: raw.data,
  };
  return people.map((account) => ({
    ...base,
    id: `${l.txHash}-${l.logIndex}-${account}`,
    account,
    counterparty: people.length === 2 ? people.find((p) => p !== account) : undefined,
  }));
}
