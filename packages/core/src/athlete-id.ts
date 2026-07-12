/**
 * A stable, anonymous-looking athlete ID derived from an account seed (the
 * email, else the display name). No PII is exposed — it's a 31-hash rendered as
 * `0xHHHH·NN`. Shared by BOTH clients so the same user sees the SAME ID on web
 * and mobile. An empty/whitespace seed falls back to "guest" so email-less
 * accounts don't all collapse to `0x0000·00`.
 */
export function athleteId(seed: string): string {
  const s = seed && seed.trim() ? seed : "guest";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hex = (h & 0xffff).toString(16).toUpperCase().padStart(4, "0");
  const tail = ((h >>> 16) % 100).toString().padStart(2, "0");
  return `0x${hex}–${tail}`;
}
