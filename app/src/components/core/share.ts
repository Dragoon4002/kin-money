"use client";

/** Web Share sheet, falling back to clipboard. Resolves "copied" when it fell back. */
export async function share(text: string, url?: string): Promise<"shared" | "copied" | "cancelled"> {
  if (navigator.share) {
    try {
      await navigator.share({ text, url });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  await navigator.clipboard.writeText(url ? `${text} ${url}` : text);
  return "copied";
}
