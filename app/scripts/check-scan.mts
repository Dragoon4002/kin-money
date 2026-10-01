// Run: node --experimental-strip-types --no-warnings scripts/check-scan.mts
import assert from "node:assert/strict";
import { kinTarget } from "../src/lib/scan.ts";

const O = "https://kin-money.vercel.app";
assert.equal(kinTarget(`${O}/send?to=sounak&amt=5000000&note=tea`, O), "/send?to=sounak&amt=5000000&note=tea");
assert.equal(kinTarget("http://localhost:3000/send?to=a_b", "http://localhost:3000"), "/send?to=a_b");
assert.equal(kinTarget(`${O}/claim#2.0xabc`, "http://localhost:3000"), "/claim#2.0xabc"); // prod links work from any origin
assert.equal(kinTarget("@Sounak", O), "/send?to=sounak");
assert.equal(kinTarget("https://evil.example/send?to=x", O), null);
assert.equal(kinTarget(`${O}/me`, O), null);
assert.equal(kinTarget("upi://pay?pa=x@y", O), null);
assert.equal(kinTarget("hello world", O), null);
console.log("scan ok");
