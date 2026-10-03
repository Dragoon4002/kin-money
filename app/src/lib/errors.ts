import { isMeraError } from "@category-labs/mera";

/** Map any failure to human copy (kin-copy skill). Never show err.message. */
export function humanError(e: unknown): string {
  if (isMeraError(e)) {
    switch (e.code) {
      case "PASSKEY_OPERATION_FAILED": return "Identity check was cancelled. Try again.";
      case "PRF_UNAVAILABLE": return "This device can't hold a Kin account. Use your phone's built-in password manager.";
      case "SESSION_ENDED": return "Locked for safety. Confirm with Identity check.";
    }
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/insufficient|exceeds balance/i.test(msg)) return "Not enough in your balance. Add money first.";
  if (/expired|deadline/i.test(msg)) return "That took too long. Let's try again.";
  if (/name not found/i.test(msg)) return "No one on Kin with that name yet. Send a link instead?";
  if (/fetch|network|timeout|relay/i.test(msg)) return "Couldn't send right now. Your money is safe — try again.";
  return "Something went wrong. Your money is safe.";
}
