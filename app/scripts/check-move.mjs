// Build guard (runs before `next build`): keeps the kin-money.vercel.app → getkin.space account move alive.
// People who signed up on the old hostname can only bring their account over through it (passkeys are bound to
// a hostname). Removing any piece below strands their money and @name. See CLAUDE.md hard rule 12.
import { existsSync, readFileSync } from "node:fs";

const fail = (m) => {
  console.error(`\n✖ check-move: ${m}\n  The old-hostname account move must stay (CLAUDE.md hard rule 12). Restore it before building.\n`);
  process.exit(1);
};
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : fail(`missing ${p}`));

const config = read("next.config.ts");
if (!config.includes('value: "kin-money.vercel.app"')) fail("next.config.ts no longer routes kin-money.vercel.app");
if (!/destination:\s*"\/move"/.test(config)) fail("old hostname must send pages to /move");
for (const keep of ["api/", "\\\\.well-known/", "move$"]) if (!config.includes(keep)) fail(`old-host rule must keep ${keep} reachable`);

const move = read("src/app/move/page.tsx");
for (const s of ['"https://kin-money.vercel.app"', '"https://getkin.space"', "postMessage", "importAccount"]) {
  if (!move.includes(s)) fail(`move page lost ${s}`);
}

const links = read("public/.well-known/assetlinks.json");
if (!links.includes("xyz.kin.app") || !links.includes("get_login_creds")) fail("assetlinks.json must keep the Android app (old passkeys need it)");

const mobile = "../mobile/src/lib/account.ts";
if (existsSync(mobile) && !readFileSync(mobile, "utf8").includes('OLD_RP_ID = "kin-money.vercel.app"')) fail("Android oldAccountKey() lost the old RP ID");

console.log("✓ check-move: old-hostname account move intact");
