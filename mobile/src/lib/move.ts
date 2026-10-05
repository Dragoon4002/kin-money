import { importAccount, kinProfile, oldAccountKey, signUp } from "./account";
import { keyAddress } from "./keys";
import { nameOf } from "./names";

/**
 * Bring an account made on Kin's old hostname (kin-money.vercel.app) onto this one: same address, @name, money,
 * history. Old passkey → its key; then this site's passkey (created if needed) seals it and it becomes active.
 * Mirrors app/src/app/move (web hands it over tab-to-tab; the app can ask for the old passkey directly).
 */
export async function moveOldAccount(): Promise<string> {
  const key = await oldAccountKey();
  try {
    const name = await nameOf(keyAddress(key)).catch(() => "");
    if (!kinProfile()) await signUp(name || "Kin");
    await importAccount(key, name || undefined); // seals, zeroes, switches
    return name;
  } finally {
    key.fill(0);
  }
}
