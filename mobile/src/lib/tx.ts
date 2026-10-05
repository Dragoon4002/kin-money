import { encodeFunctionData, toHex, type Abi, type Address, type ContractFunctionName, type Hex, type PublicClient } from "viem";
import { KinForwarderAbi } from "./abi";
import { confirmPayment, getAccount } from "./account";
import { addr, API_BASE, chain, getMode, money, publicClient } from "./config";

// Gasless writes (see .claude/skills/gasless-relay). User signs; /api/relay pays gas.

const AUSD_DOMAIN = { name: "Agora Dollar", version: "1", chainId: chain.id, verifyingContract: addr.ausd } as const;
const AUTH_FIELDS = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
] as const;

const now = () => BigInt(Math.floor(Date.now() / 1000));
const randomNonce = () => toHex(crypto.getRandomValues(new Uint8Array(32)));

async function relay(body: unknown, client: Pick<PublicClient, "waitForTransactionReceipt"> = publicClient): Promise<Hex> {
  const res = await fetch(`${API_BASE}/api/relay`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body, (_, v) => (typeof v === "bigint" ? v.toString() : v)) });
  const json = await res.json();
  if (!res.ok) throw new Error(`relay: ${json.error ?? res.status}`);
  const receipt = await client.waitForTransactionReceipt({ hash: json.hash });
  if (receipt.status !== "success") throw new Error("relay: reverted");
  return json.hash;
}

/** Plain P2P send (EIP-3009 transferWithAuthorization). Returns tx hash once delivered. */
export async function sendDollars(to: Address, value: bigint): Promise<Hex> {
  await confirmPayment(value);
  const account = await getAccount();
  const auth = { from: account.address, to, value, validAfter: 0n, validBefore: now() + 3600n, nonce: randomNonce() };
  // Practice or real money: same signature, the network's chain id + dollar contract (config.ts money()).
  const net = money();
  const domain = { ...AUSD_DOMAIN, chainId: net.chain.id, verifyingContract: net.ausd };
  const signature = await account.signTypedData({ domain, types: { TransferWithAuthorization: AUTH_FIELDS }, primaryType: "TransferWithAuthorization", message: auth });
  return relay({ kind: "3009", net: net.mode, auth, signature }, net.client);
}

/** Signed pull of `value` into `target` — the 5 trailing "fund" args every Kin fund function takes. */
async function fundArgs(target: Address, value: bigint) {
  const account = await getAccount();
  const auth = { from: account.address, to: target, value, validAfter: 0n, validBefore: now() + 3600n, nonce: randomNonce() };
  const signature = await account.signTypedData({ domain: AUSD_DOMAIN, types: { ReceiveWithAuthorization: AUTH_FIELDS }, primaryType: "ReceiveWithAuthorization", message: auth });
  return [value, auth.validAfter, auth.validBefore, auth.nonce, signature] as const;
}

/** Gasless contract call via KinForwarder (ERC-2771). If `fund` is set, the 5 funding args are appended. */
export async function call<const TAbi extends Abi>(
  to: Address,
  abi: TAbi,
  functionName: ContractFunctionName<TAbi, "nonpayable" | "payable">,
  args: readonly unknown[],
  opts: { fund?: bigint } = {},
): Promise<Hex> {
  // Programs + links live on the practice network only. One guard for every caller.
  if (getMode() === "main") throw new Error("practice only");
  if (opts.fund !== undefined) await confirmPayment(opts.fund);
  const account = await getAccount();
  const fullArgs = opts.fund !== undefined ? [...args, ...(await fundArgs(to, opts.fund))] : args;
  const data = encodeFunctionData({ abi, functionName, args: fullArgs } as never);
  const gas = ((await publicClient.estimateGas({ account: account.address, to, data })) * 12n) / 10n;
  const nonce = await publicClient.readContract({ address: addr.forwarder, abi: KinForwarderAbi, functionName: "nonces", args: [account.address] });
  const deadline = Number(now() + 600n);
  const request = { from: account.address, to, value: 0n, gas, nonce, deadline, data };
  const signature = await account.signTypedData({
    domain: { name: "Kin", version: "1", chainId: chain.id, verifyingContract: addr.forwarder },
    types: {
      ForwardRequest: [
        { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
        { name: "gas", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint48" },
        { name: "data", type: "bytes" },
      ],
    },
    primaryType: "ForwardRequest",
    message: request,
  });
  return relay({ kind: "2771", request: { from: request.from, to, value: 0n, gas, deadline, data, signature } });
}
