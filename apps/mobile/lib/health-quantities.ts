/**
 * HEALTHKIT QUANTITY NORMALIZATION — the bridge's units → ours.
 *
 * Split out of healthkit.ts for ONE reason: these are the only part of the
 * HealthKit read that can be tested off-device, and the one place a silent
 * failure costs a whole metric. A quantity arrives as `{unit, quantity}` and
 * every converter here returns null for a unit it doesn't recognise — so an
 * unhandled unit doesn't throw, it just makes the metric VANISH. That is
 * exactly how a 510 m pool swim came to display no distance and no pace: the
 * bridge hands `totalDistance` back with the hard-coded literal "meters" while
 * everything else uses HKUnit's own symbol ("m"), and the converter accepted
 * only the symbol.
 *
 * So the unit tables here are deliberately generous — symbol AND spelled-out
 * name, case-insensitive — and health-quantities.test.ts pins the literal
 * strings the native side is known to emit. Adding a read? Add its unit here
 * and assert it there; do not trust that the bridge speaks HKUnit.
 *
 * Pure by construction: no react-native, no native module, no I/O. Everything
 * that actually touches HealthKit stays in healthkit.ts.
 */

/** A quantity as the bridge serialises it. */
export interface HKQuantityLike {
  unit: string;
  quantity: number;
}

const normalizeUnit = (unit: string): string => unit.trim().toLowerCase();

const convert = (
  q: HKQuantityLike | null | undefined,
  table: Record<string, number>,
): number | null => {
  if (!q || typeof q.quantity !== "number" || !Number.isFinite(q.quantity)) return null;
  if (typeof q.unit !== "string") return null;
  const factor = table[normalizeUnit(q.unit)];
  return factor == null ? null : q.quantity * factor;
};

/** Minutes per unit of time. The bridge serialises a workout's `duration` with
 *  `HKUnit.second().unitString` — "s". */
const MIN_PER_UNIT: Record<string, number> = {
  s: 1 / 60,
  sec: 1 / 60,
  secs: 1 / 60,
  second: 1 / 60,
  seconds: 1 / 60,
  min: 1,
  mins: 1,
  minute: 1,
  minutes: 1,
  h: 60,
  hr: 60,
  hrs: 60,
  hour: 60,
  hours: 60,
  d: 1440,
  day: 1440,
  days: 1440,
};

/** Kilocalories per unit of energy. `totalEnergyBurned` comes through as
 *  `HKUnit.kilocalorie().unitString` — "kcal". */
const KCAL_PER_UNIT: Record<string, number> = {
  kcal: 1,
  cal: 1, // HealthKit's "Cal" IS the kilocalorie — the dietary Calorie.
  kilocalorie: 1,
  kilocalories: 1,
  smallcal: 0.001,
  kj: 1 / 4.184,
  kilojoule: 1 / 4.184,
  kilojoules: 1 / 4.184,
  j: 1 / 4184,
  joule: 1 / 4184,
  joules: 1 / 4184,
};

/** Kilometres per unit of length. "meters" is the literal the bridge writes for
 *  a workout's `totalDistance`; "m" is what the statistics path returns. Both
 *  must work — see the module comment. */
const KM_PER_UNIT: Record<string, number> = {
  m: 0.001,
  meter: 0.001,
  meters: 0.001,
  metre: 0.001,
  metres: 0.001,
  km: 1,
  kilometer: 1,
  kilometers: 1,
  kilometre: 1,
  kilometres: 1,
  mi: 1.609344,
  mile: 1.609344,
  miles: 1.609344,
  yd: 0.0009144,
  yard: 0.0009144,
  yards: 0.0009144,
  ft: 0.0003048,
  foot: 0.0003048,
  feet: 0.0003048,
  cm: 0.00001,
  in: 0.0000254,
};

/** A time quantity → minutes. */
export const qtyMinutes = (q?: HKQuantityLike | null): number | null => convert(q, MIN_PER_UNIT);

/** An energy quantity → kcal. */
export const qtyKcal = (q?: HKQuantityLike | null): number | null => convert(q, KCAL_PER_UNIT);

/** A length quantity → km. */
export const qtyKm = (q?: HKQuantityLike | null): number | null => convert(q, KM_PER_UNIT);

/** A dimensionless count (strokes, flights, steps). The unit is always "count"
 *  and carries no scale, so the number passes through unread. */
export const qtyCount = (q?: HKQuantityLike | null): number | null =>
  q && typeof q.quantity === "number" && Number.isFinite(q.quantity) ? q.quantity : null;

/** A metadata value, which may arrive as a bare number OR a serialized quantity
 *  ({unit, quantity}) depending on the key — normalize to the latter. A bare
 *  number carries no unit, so it is left for the caller to interpret. */
export const metaQty = (v: unknown): HKQuantityLike | null => {
  if (typeof v === "number" && Number.isFinite(v)) return { unit: "", quantity: v };
  if (typeof v === "object" && v !== null) {
    const o = v as { unit?: unknown; quantity?: unknown };
    if (typeof o.quantity === "number" && Number.isFinite(o.quantity))
      return { unit: typeof o.unit === "string" ? o.unit : "", quantity: o.quantity };
  }
  return null;
};

/** A metadata length → metres. An unmarked bare number is read as metres, which
 *  is what HealthKit's length metadata is documented in. */
export const metaMetres = (v: unknown): number | null => {
  const q = metaQty(v);
  if (!q) return null;
  if (normalizeUnit(q.unit) === "") return q.quantity;
  const km = qtyKm(q);
  return km == null ? null : km * 1000;
};

/** A metadata temperature → °C. Bare numbers and HealthKit's "degC" pass
 *  through; only Fahrenheit needs converting. */
export const metaCelsius = (v: unknown): number | null => {
  const q = metaQty(v);
  if (!q) return null;
  const unit = normalizeUnit(q.unit);
  if (unit === "degf" || unit === "f") return ((q.quantity - 32) * 5) / 9;
  if (unit === "k") return q.quantity - 273.15;
  return q.quantity; // degC or already-bare
};
