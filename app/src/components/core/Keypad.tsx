"use client";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"] as const;

/** Next amount string after a key press: ≤2 decimals, ≤9 whole digits, no leading zeros. */
export function press(v: string, k: string): string {
  if (k === "⌫") return v.slice(0, -1);
  if (k === ".") return v.includes(".") ? v : (v || "0") + ".";
  const [whole, frac] = v.split(".");
  if (frac !== undefined) return frac.length >= 2 ? v : v + k;
  if (whole === "0") return k;
  return whole.length >= 9 ? v : v + k;
}

/** 3×4 number pad for amount entry. */
export function Keypad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {KEYS.map((k) => (
        <button key={k} type="button" onClick={() => onChange(press(value, k))}
          aria-label={k === "⌫" ? "Delete" : k === "." ? "Decimal point" : k}
          className="h-16 rounded-2xl text-2xl font-semibold text-ink transition select-none active:scale-95 active:bg-surface-2">
          {k}
        </button>
      ))}
    </div>
  );
}
