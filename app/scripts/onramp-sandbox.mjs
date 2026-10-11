// Onramp white-label SANDBOX check (off-ramp). Reads ONRAMP_* from app/.env.local; never prints secrets.
//   node scripts/onramp-sandbox.mjs                 → creates a test user, prints its KYC link
//   (open the link, phone shown, OTP 123456 — just log in, skip the KYC buttons)
//   node scripts/onramp-sandbox.mjs <customerId>    → KYC done → bank → quote → order → hash → status
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^ONRAMP_\w+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "")]),
);
if (!env.ONRAMP_BASE_URL?.includes("api-test")) throw new Error("ONRAMP_BASE_URL is not the sandbox — refusing");

async function call(path, body) {
  const timestamp = Date.now().toString();
  const payload = Buffer.from(JSON.stringify({ body, timestamp })).toString("base64");
  const signature = createHmac("sha512", env.ONRAMP_API_SECRET).update(payload).digest("hex");
  // White-label auth headers (docs-whitelabel.onramp.money).
  const res = await fetch(`${env.ONRAMP_BASE_URL}/onramp/api/v2/whiteLabel/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-onramp-apikey": env.ONRAMP_API_KEY, "x-onramp-timestamp": timestamp, "x-onramp-payload": payload, "x-onramp-signature": signature },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  console.log(`${json.status === 1 ? "PASS" : "FAIL"}  ${path}  ${JSON.stringify(json.data ?? json.error).slice(0, 220)}`);
  return json;
}

const customerId = process.argv[2];
if (!customerId) {
  const phone = "+91-98765" + String(Math.floor(Math.random() * 1e5)).padStart(5, "0");
  const u = await call("kyc/url", { email: `sandbox+${Date.now()}@getkin.space`, phoneNumber: phone, clientCustomerId: randomUUID(), type: "INDIVIDUAL" });
  console.log(`\ncustomerId: ${u.data?.customerId}\nphone: ${phone.slice(4)}  OTP: 123456\nlogin link: ${u.data?.kycUrl}\nthen run: node scripts/onramp-sandbox.mjs ${u.data?.customerId}`);
  process.exit(0);
}

await call("test/changeKycStatus", { customerId, status: "COMPLETED" });
await call("kyc/status", { customerId });
// No `details` field: a nested object breaks their payload check ("Body and Payload mismatch").
const bank = await call("bank/addFiatAccount", { customerId, fiatAccount: String(Date.now()).slice(-12), ifsc: "SBIN0000300" });
let chain = "monad";
let quote = await call("offramp/quote", { fromCurrency: "usdc", toCurrency: "INR", fromAmount: "10", chain });
if (quote.status !== 1) {
  chain = "base";
  quote = await call("offramp/quote", { fromCurrency: "usdc", toCurrency: "INR", fromAmount: "10", chain });
}
const fiatAccountId = bank.data?.fiatAccountId;
if (quote.status !== 1 || !fiatAccountId) process.exit(1);
const tx = await call("offramp/createTransaction", {
  customerId, fiatAccountId, fromCurrency: "usdc", toCurrency: "INR", chain, fromAmount: "10", toAmount: quote.data.toAmount, rate: quote.data.rate,
});
const transactionId = tx.data?.transactionId;
if (!transactionId) process.exit(1);
console.log(`\ndeposit address (${chain}): ${tx.data.depositAddress?.address}  expires ${tx.data.expiresAt}`);
await call("offramp/updateTransactionHash", { orderId: String(transactionId), transactionHash: "0x" + "ab".repeat(32), customerId });
await call("test/changeOfframpStatus", { customerId, transactionId: String(transactionId), status: "ON_CHAIN_DEPOSIT_RECEIVED" });
await call("offramp/transaction", { customerId, transactionId: String(transactionId) });
console.log(`\nchain: ${chain}${chain === "monad" ? "" : "  (Monad not enabled yet)"}`);
