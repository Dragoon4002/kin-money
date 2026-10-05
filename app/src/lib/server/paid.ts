import "server-only";
import { erc20Abi, isAddressEqual, parseEventLogs, type Address, type Hex } from "viem";
import { networks } from "../chain";

/** Dollars `from` paid `to` in tx `hash` (practice or real-money network), 0n if no such delivered transfer. */
export async function paidValue(hash: Hex, from: Address, to: Address): Promise<bigint> {
  for (const net of [networks.test, networks.main]) {
    const r = await net.client.getTransactionReceipt({ hash }).catch(() => null);
    if (!r) continue;
    if (r.status !== "success") return 0n;
    const logs = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: r.logs.filter((l) => isAddressEqual(l.address, net.ausd)) });
    return logs.reduce((s, l) => (isAddressEqual(l.args.from, from) && isAddressEqual(l.args.to, to) ? s + l.args.value : s), 0n);
  }
  return 0n;
}
