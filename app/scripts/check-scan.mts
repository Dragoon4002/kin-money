// Run: node --experimental-strip-types --no-warnings scripts/check-scan.mts
import assert from "node:assert/strict";
import { kinTarget } from "../src/lib/scan.ts";
import { AUSD, walletTarget, walletUri } from "../src/lib/walletUri.ts";

const O = "https://kin-money.vercel.app";
assert.equal(kinTarget(`${O}/send?to=sounak&amt=5000000&note=tea`, O), "/send?to=sounak&amt=5000000&note=tea");
assert.equal(kinTarget("http://localhost:3000/send?to=a_b", "http://localhost:3000"), "/send?to=a_b");
assert.equal(kinTarget(`${O}/claim#2.0xabc`, "http://localhost:3000"), "/claim#2.0xabc"); // prod links work from any origin
assert.equal(kinTarget("@Sounak", O), "/send?to=sounak");
assert.equal(kinTarget("https://evil.example/send?to=x", O), null);
assert.equal(kinTarget(`${O}/me`, O), null);
assert.equal(kinTarget("upi://pay?pa=x@y", O), null);
assert.equal(kinTarget("hello world", O), null);

// EIP-681 / other wallets
const ME = "0x1111111111111111111111111111111111111111";
assert.equal(walletUri(ME, 5_000_000n), `ethereum:${AUSD}@10143/transfer?address=${ME}&uint256=5000000`);
assert.equal(walletUri(ME), `ethereum:${AUSD}@10143/transfer?address=${ME}`);
assert.equal(walletTarget(walletUri(ME, 5_000_000n)), `/send?to=${ME}&amt=5000000`); // round-trip
assert.equal(walletTarget(walletUri(ME)), `/send?to=${ME}`);
assert.equal(walletTarget(`ethereum:${AUSD.toLowerCase()}@10143/transfer?address=${ME.toUpperCase().replace("0X", "0x")}&uint256=2.5e6`), `/send?to=${ME}&amt=2500000`);
assert.equal(walletTarget(`ethereum:${AUSD}/transfer?address=${ME}&uint256=1e6`), `/send?to=${ME}&amt=1000000`); // no chain = current
assert.equal(walletTarget(`ethereum:${AUSD}@10143/transfer?address=${ME}&uint256=1.5`), null); // fractional base units
assert.equal(walletTarget(`ethereum:${AUSD}@10143/transfer?address=nope`), null);
assert.equal(walletTarget(`ethereum:${AUSD}@1/transfer?address=${ME}&uint256=1`), "other"); // other chain
assert.equal(walletTarget(`ethereum:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48@10143/transfer?address=${ME}&uint256=1`), "other"); // other token
assert.equal(walletTarget(`ethereum:${AUSD}@10143/approve?address=${ME}&uint256=1`), "other");
assert.equal(walletTarget(`ethereum:${ME}@10143?value=1e18`), `/send?to=${ME}`);
assert.equal(walletTarget(`ethereum:pay-${ME}@10143`), `/send?to=${ME}`);
assert.equal(walletTarget(`ethereum:${ME}@8453`), "other");
assert.equal(walletTarget(`  0xAbCdEf0123456789abcdef0123456789ABCDEF01 `), "/send?to=0xabcdef0123456789abcdef0123456789abcdef01");
assert.equal(walletTarget("0x1234"), null);
assert.equal(walletTarget("@sounak"), null);
assert.equal(walletTarget(`${O}/send?to=sounak`), null);
assert.equal(kinTarget(walletUri(ME, 1n), O), null); // Kin parser leaves wallet codes alone
console.log("scan ok");
