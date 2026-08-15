import { foodLogSignals } from "@hybrid/core";
import { prisma } from "@/lib/db";

/**
 * WRITING ONE DIARY ENTRY — the single implementation, shared by
 * POST /api/nutrition/log (one entry) and POST /api/nutrition/log/batch
 * (a copied day).
 *
 * Extracted rather than duplicated because the write is not one insert: it is
 * the mirrored Signals the engines read, PLUS the editable FoodLog row, PLUS
 * the two-attempt fallback that keeps a named entry on a database that predates
 * the label-panel columns. A second copy of that would drift, and the way it
 * would drift is silent — a copied day whose Signals were written slightly
 * differently would total differently from the day it was copied from.
 */

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** A LABEL-PANEL field. Absence survives as null: an unstated sugar content is
 *  not a sugar-free food, and foodLogSignals writes NO Signal for a null — the
 *  absence in the stream is how a day knows it is only partially described. */
const panelNum = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;
};

export type FoodLogInput = Record<string, unknown>;

/** Written, or null when the body carried no usable name. */
export async function writeFoodLog(userId: string, b: FoodLogInput) {
  if (typeof b.name !== "string" || !b.name.trim()) return null;

  const source = typeof b.source === "string" && b.source ? b.source.slice(0, 40) : "manual";
  const ts = typeof b.ts === "string" && !Number.isNaN(Date.parse(b.ts)) ? new Date(b.ts) : new Date();
  // Macros are PER SINGLE SERVING; qty scales them for the mirrored Signals.
  const kcal = num(b.kcal), protein = num(b.protein), carbs = num(b.carbs), fat = num(b.fat);
  const qty = num(b.qty) || 1;
  const satFat = panelNum(b.satFat), sugar = panelNum(b.sugar), fiber = panelNum(b.fiber), salt = panelNum(b.salt);
  const verifiedId = typeof b.verifiedId === "string" && b.verifiedId.trim() ? b.verifiedId.trim().slice(0, 60) : null;
  // WHAT WAS ACTUALLY ENTERED — 35 "g", 1 "bottle" — so the diary row can say
  // it instead of the 0.35 that qty holds. Both null unless the client sent
  // them; a quick macro line has no amount to record (core/portion.ts).
  const amount = num(b.amount) || null;
  const amountUnit = amount != null && typeof b.amountUnit === "string" && b.amountUnit.trim()
    ? b.amountUnit.trim().slice(0, 24)
    : null;

  // 1) Mirror the scaled totals into the Signal ontology (what the engines
  //    read). ONE builder in core decides which Signals a log means, so this
  //    path, the presets and the quantity edit can never drift apart. Collect
  //    the ids so an edit/delete can target exactly these rows.
  const signalIds: string[] = [];
  for (const { kind, value, unit } of foodLogSignals({ kcal, protein, carbs, fat, satFat, sugar, fiber, salt }, qty)) {
    try {
      const sig = await prisma.signal.create({ data: { userId, kind, value, unit, source, ts } });
      signalIds.push(sig.id);
    } catch {
      /* a duplicate (same kind+ts+source) — skip, don't fail the whole log */
    }
  }

  // 2) The editable entry (best-effort — logging must not hard-fail on this).
  //    Two attempts: WITH the label panel, then without. The panel columns are a
  //    later migration, so on a database that hasn't run it the first insert
  //    fails on unknown columns and the entry would be lost entirely if we
  //    stopped there. The retry keeps the named, editable row; only the panel
  //    is dropped.
  //
  //    THREE tiers, not two, since the amount columns are a migration LATER
  //    than the panel: falling straight from "with amount" to "macros only"
  //    would make a missing amount column silently cost the label panel as
  //    well, on a database that has it.
  const base = {
    userId,
    name: b.name.trim().slice(0, 80),
    subname: typeof b.subname === "string" && b.subname.trim() ? b.subname.trim().slice(0, 60) : null,
    source,
    kcal, protein, carbs, fat, qty,
    signalIds,
    ts,
  };
  const withPanel = { ...base, satFat, sugar, fiber, salt, verifiedId };
  try {
    return await prisma.foodLog.create({ data: { ...withPanel, amount, amountUnit } });
  } catch {
    try {
      return await prisma.foodLog.create({ data: withPanel });
    } catch {
      try {
        return await prisma.foodLog.create({ data: base });
      } catch {
        /* FoodLog not migrated at all — Signals are written, so totals hold */
        return null;
      }
    }
  }
}
