/**
 * Force-plate / jump-test CSV ingestion — the buildable "hardware loop".
 *
 * Vendors (Hawkin, VALD ForceDecks, etc.) export a CSV. This parser normalizes
 * it into the Signal ontology so jump height / asymmetry land in the same stream
 * the Performance State + injury engine already read — no special integration, capture-
 * agnostic. Supports a WIDE shape (a date column + metric columns) and a LONG
 * shape (date,metric,value[,unit]). Pure data + math; unknown columns are
 * skipped, not guessed.
 */

import type { Signal, SignalKind } from "./signals";
import { signalUnit } from "./signals";

export interface ForcePlateImport {
  signals: Signal[];
  /** data rows seen (excluding header) */
  rows: number;
  /** signals produced */
  imported: number;
  /** metric column headers that were recognized */
  recognized: string[];
  /** metric column headers that were ignored (no matching Signal kind) */
  ignored: string[];
}

/** True for a force/Newton column label, which must never be read as kg mass. */
const isForceLabel = (s: string) => s.includes("force") || s.includes("newton") || /\(\s*n\s*\)/.test(s);
/** True for a unit string that denotes force (Newtons), not mass. */
export const isForceUnit = (u: string) => /^\s*n\s*$|newton/i.test(u.trim());

/** Map a column/metric label to a Signal kind, or null if unrecognized. */
export function mapMetric(label: string): SignalKind | null {
  const s = label.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("jump") || s.includes("cmj") || s === "height" || s.includes("jh")) return "jumpHeight";
  if (s.includes("asymmet") || s.includes("imbalance")) return "asymmetry";
  // A "Weight (N)" / "Peak Force" / "System Weight (N)" column is a FORCE reading
  // in Newtons (~700 for an 70kg athlete) — ingesting it as bodyMass poisoned the
  // weight-trend + nutrition engines with absurd "700 kg" body masses.
  if (isForceLabel(s)) return null;
  if (s.includes("body") && s.includes("mass")) return "bodyMass";
  if (s === "weight" || s === "mass" || s.includes("bodyweight")) return "bodyMass";
  return null;
}

const splitLine = (line: string) => line.split(",").map((c) => c.trim());
const isDateHeader = (h: string) => /date|time|day/i.test(h);

/** Parse a force-plate / jump-test CSV into normalized Signals. */
export function parseForcePlateCsv(
  text: string,
  opts: { athleteId: string; source?: string } = { athleteId: "" },
): ForcePlateImport {
  const source = opts.source ?? "forceplate";
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const empty: ForcePlateImport = { signals: [], rows: 0, imported: 0, recognized: [], ignored: [] };
  if (lines.length < 2) return empty;

  const header = splitLine(lines[0]!);
  const lower = header.map((h) => h.toLowerCase());
  const dateIdx = lower.findIndex(isDateHeader);
  const metricIdx = lower.findIndex((h) => h === "metric" || h === "test" || h === "measure");
  const valueIdx = lower.findIndex((h) => h === "value" || h === "result");
  const unitIdx = lower.findIndex((h) => h === "unit" || h === "units");

  const signals: Signal[] = [];
  const recognized = new Set<string>();
  const ignored = new Set<string>();
  let rows = 0;

  const isLong = dateIdx >= 0 && metricIdx >= 0 && valueIdx >= 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]!);
    rows++;
    const ts = dateIdx >= 0 ? Date.parse(cols[dateIdx] ?? "") : NaN;
    if (Number.isNaN(ts)) continue;
    const iso = new Date(ts).toISOString();

    if (isLong) {
      const label = cols[metricIdx] ?? "";
      const kind = mapMetric(label);
      const value = parseFloat(cols[valueIdx] ?? "");
      if (!kind) { ignored.add(label); continue; }
      if (!Number.isFinite(value)) continue;
      const unit = (unitIdx >= 0 && cols[unitIdx]) || signalUnit(kind);
      // A "Weight" column whose unit is Newtons is a force reading, not kg mass.
      if (kind === "bodyMass" && unitIdx >= 0 && isForceUnit(cols[unitIdx] ?? "")) { ignored.add(label); continue; }
      recognized.add(label);
      signals.push({ athleteId: opts.athleteId, kind, value, unit, source, ts: iso });
    } else {
      // wide: every non-date column is a metric
      for (let c = 0; c < header.length; c++) {
        if (c === dateIdx) continue;
        const kind = mapMetric(header[c] ?? "");
        const value = parseFloat(cols[c] ?? "");
        if (!kind) { if (header[c]) ignored.add(header[c]!); continue; }
        if (!Number.isFinite(value)) continue;
        recognized.add(header[c]!);
        signals.push({ athleteId: opts.athleteId, kind, value, unit: signalUnit(kind), source, ts: iso });
      }
    }
  }

  return { signals, rows, imported: signals.length, recognized: [...recognized], ignored: [...ignored] };
}
