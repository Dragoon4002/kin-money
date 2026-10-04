import { indexer } from "envio";
import { ABIS, activityRows, keepTransfer, type ContractName } from "./lib.ts";

// Register every event of every contract in abis/ with one generic handler (39 events, same mapping).
for (const [contract, abi] of Object.entries(ABIS) as [ContractName, (typeof ABIS)[ContractName]][]) {
  for (const ev of abi.filter((x) => x.type === "event")) {
    const event = ev.name;
    // ponytail: dynamic contract/event names defeat the per-event overload types, so the options are cast.
    indexer.onEvent({ contract, event, fields: { transaction: ["hash"], block: ["timestamp"] } } as never, async ({ event: e, context }: any) => {
      const params = e.params as Record<string, unknown>;
      if (contract === "KinNames") context.Account.set({ id: String(params.owner).toLowerCase(), name: params.handle as string });
      if (contract === "AUSD") {
        const from = String(params.from).toLowerCase(), to = String(params.to).toLowerCase();
        const [a, b] = await Promise.all([context.Account.get(from), context.Account.get(to)]);
        if (!keepTransfer(from, to, !!a || !!b)) return;
      }
      const rows = activityRows({
        contract, event, address: e.srcAddress, params,
        blockNumber: e.block.number, timestamp: e.block.timestamp, txHash: e.transaction.hash, logIndex: e.logIndex,
      });
      for (const row of rows) context.Activity.set(row);
    });
  }
}
