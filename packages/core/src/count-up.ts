/**
 * Count-up helper for the finished-workout "wrapped" spotlight slides.
 *
 * The slide value is already a FORMATTED string ("81", "5.9 t", "13,069 lb").
 * To animate it ticking up on screen we need the numeric target, its decimal
 * places, and a way to re-render an in-flight value with the same prefix/suffix.
 *
 * IMPORTANT: callers render the ORIGINAL `value` string at rest and at the final
 * frame (so the on-screen card stays byte-identical to the shared 9:16 PNG); the
 * `format()` here is only used for the intermediate frames while counting up.
 */
export interface StatCountUp {
  /** The numeric value to animate toward (0 when the string has no number). */
  target: number;
  /** Decimal places to keep mid-animation (e.g. 1 for "5.9 t"). */
  decimals: number;
  /** Render an in-flight number with the original prefix/suffix + grouping. */
  format: (n: number) => string;
}

export function statCountUp(value: string): StatCountUp {
  const m = value.match(/^(\D*)([\d.,\s]*\d)(\D*)$/);
  if (!m) return { target: 0, decimals: 0, format: () => value };
  const [, prefix = "", numRaw = "", suffix = ""] = m;
  // Drop grouping (commas / spaces between digits) but keep the decimal point.
  const cleaned = numRaw.replace(/[,\s](?=\d)/g, "").trim();
  const dot = cleaned.indexOf(".");
  const decimals = dot >= 0 ? cleaned.length - dot - 1 : 0;
  const target = parseFloat(cleaned) || 0;
  const format = (n: number) =>
    `${prefix}${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
  return { target, decimals, format };
}
