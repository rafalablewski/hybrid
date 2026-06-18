import { planDayToBlocks, type PlanSampleItem } from "@hybrid/core";

// A coach-authored program is weeks → days → exercises, reusing the core plan
// shape so planDayToBlocks() turns each day into session blocks at assign time.
export type ProgramItem = { name: string; sr: string; rpe?: string };
export type ProgramDay = { day: string; items: ProgramItem[] };
export type ProgramWeek = { days: ProgramDay[] };

const MAX_WEEKS = 26;
const MAX_DAYS = 7;
const MAX_ITEMS = 20;

const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

/** Validate/clamp an untrusted program-weeks payload into the stored shape. */
export function sanitizeProgramWeeks(raw: unknown): ProgramWeek[] {
  return asArr(raw)
    .slice(0, MAX_WEEKS)
    .map((w) => ({
      days: asArr(asObj(w).days)
        .slice(0, MAX_DAYS)
        .map((d) => {
          const o = asObj(d);
          return {
            day: str(o.day, 60) || "Day",
            items: asArr(o.items)
              .slice(0, MAX_ITEMS)
              .map((it) => {
                const io = asObj(it);
                const rpe = str(io.rpe, 10);
                return { name: str(io.name, 80), sr: str(io.sr, 30), ...(rpe ? { rpe } : {}) };
              })
              .filter((it) => it.name),
          };
        }),
    }));
}

/** Materialize a program into Assignment rows for one athlete, dated from a
 *  start date (week i, day j → start + (i*7 + j) days). */
export function programAssignments(
  weeks: ProgramWeek[],
  athleteId: string,
  assignedById: string,
  start: Date,
): { athleteId: string; assignedById: string; name: string; blocks: object; date: Date }[] {
  const rows: { athleteId: string; assignedById: string; name: string; blocks: object; date: Date }[] = [];
  weeks.forEach((w, wi) => {
    w.days.forEach((d, di) => {
      const date = new Date(start.getTime() + (wi * 7 + di) * 86400000);
      const items: PlanSampleItem[] = d.items.map((it) => ({ name: it.name, sr: it.sr, rest: "", rpe: it.rpe ?? "" }));
      rows.push({
        athleteId,
        assignedById,
        name: (d.day || `Week ${wi + 1} Day ${di + 1}`).slice(0, 120),
        blocks: planDayToBlocks(items) as unknown as object,
        date,
      });
    });
  });
  return rows;
}
