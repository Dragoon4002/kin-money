import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

// KinAddMoney on Monad mainnet (USDC → AUSD via the Uniswap v4 pool). Shared by the relay and the client.
export const ADD_MONEY = (process.env.NEXT_PUBLIC_KIN_ADDMONEY ?? "") as Address | "";

export type AddTerms = { to: Address; minOut: bigint; salt: Hex };

/** Mirrors KinAddMoney.termsNonce: keccak256(abi.encode(chainid, contract, to, minOut, salt)). */
export const addMoneyNonce = (t: AddTerms): Hex =>
  keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }],
      [143n, ADD_MONEY as Address, t.to, t.minOut, t.salt],
    ),
  );
