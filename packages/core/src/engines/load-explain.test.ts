import { describe, it, expect } from "vitest";
import { computeLoad, type AcwrBand, type LoadState } from "./load";
import {
  loadExplain, loadVerdict, monotonyBand, LOAD_METRICS, LOAD_METRIC_LABEL_KEY,
  LOAD_VERDICT_KEYS, type LoadMetric, type MonotonyBand,
} from "./load-explain";
import { makeT } from "../i18n";
import type { LoggedSession } from "./session";

const DAY = 86_400_000;
const NOW = Date.parse("2026-06-03T12:00:00.000Z");
const ago = (n: number) => new Date(NOW - n * DAY).toISOString();

/** A 28-day log with something on most days, so `enoughHistory` is true and
 *  every metric has a real figure to explain. */
function log(): LoggedSession[] {
  const out: LoggedSession[] = [];
  for (let d = 0; d < 28; d++) {
    if (d % 3 === 2) continue; // a rest day every third day, so SD > 0
    out.push({
      id: `s${d}`,
      title: "S",
      startedAt: ago(d),
      blocks: [{ kind: "conditioning", name: "Row", minutes: 20 + (d % 4) * 10, rpe: 7 }],
    });
  }
  return out;
}

const state = () => computeLoad(log(), NOW);

describe("loadExplain", () => {
  it("prints the SAME figure the tile prints, for every metric", () => {
    const s = state();
    expect(loadExplain("acwr", s).value).toBe(s.acwr.toFixed(2));
    expect(loadExplain("monotony", s).value).toBe(s.monotony.toFixed(2));
    // The two AU figures are grouped for readability but must round-trip.
    expect(Number(loadExplain("acute", s).value.replace(/\s/g, ""))).toBe(s.acute);
    expect(Number(loadExplain("strain", s).value.replace(/\s/g, ""))).toBe(s.strain);
  });

  // The bug: the sheet's headline came through this module and its input rows
  // called toLocaleString() themselves, so a German or Polish phone printed
  // "2 546" at the top and "2.546" three lines below it. Every figure a client
  // prints is formatted HERE, and grouped with a NO-BREAK space so a tile can
  // never wrap one across two lines.
  it("formats every printable figure itself, in one format", () => {
    const s = state();
    // The separator is a NO-BREAK space. Named, because it is invisible in
    // source and a regular space would let the wrong character pass silently.
    const NB = "\u00a0";
    const grouped = new RegExp(`^\\d{1,3}(${NB}\\d{3})*$`);
    for (const m of LOAD_METRICS) {
      const e = loadExplain(m, s);
      for (const r of e.inputs) {
        expect(r.text, `${m}: ${r.key}`).toMatch(grouped);
        expect(Number(r.text.split(NB).join("")), `${m}: ${r.key}`).toBe(r.value);
      }
      for (const step of e.steps) {
        if (step.value === null) continue;
        expect(step.value, `${m}: ${step.key}`).toMatch(new RegExp(`^(\\d{1,3}(${NB}\\d{3})*|\\d+\\.\\d{2})$`));
      }
      expect(e.value, m).not.toContain(",");
      expect(e.value, m).not.toMatch(/\d\.\d{3}/); // never a locale thousands dot
    }
  });

  it("carries a null step value for the line that states a method, not a figure", () => {
    const e = loadExplain("acute", state());
    const method = e.steps.find((x) => x.key === "w.injury.load.step.perSession")!;
    expect(method.value).toBeNull();
    expect(method.total).toBe(false);
  });

  it("ends every ledger on that same figure — exactly one total line", () => {
    const s = state();
    for (const m of LOAD_METRICS) {
      const e = loadExplain(m, s);
      const totals = e.steps.filter((x) => x.total);
      expect(totals, m).toHaveLength(1);
      expect(totals[0]!.value, m).toBe(e.value);
      // The result is the LAST line, not a total floating mid-ledger.
      expect(e.steps[e.steps.length - 1]!.total, m).toBe(true);
    }
  });

  it("itemises inputs that add up to the figure they explain", () => {
    const s = state();
    // The seven days ARE the 7-day load.
    expect(loadExplain("acute", s).inputs.reduce((a, r) => a + r.value, 0)).toBe(s.acute);
    // Weekly rows are the four weeks behind the ratio, newest first.
    const weeks = loadExplain("acwr", s).inputs;
    expect(weeks).toHaveLength(4);
    expect(weeks[0]!.value).toBe(s.weekly[0]!.load);
  });

  it("marks exactly one heaviest input, and dims the rest", () => {
    const s = state();
    for (const m of LOAD_METRICS) {
      const e = loadExplain(m, s);
      expect(e.inputs.filter((r) => r.top), m).toHaveLength(1);
      expect(e.inputs.every((r) => r.dim !== r.top), m).toBe(true);
      const top = e.inputs.find((r) => r.top)!;
      expect(top.sharePct, m).toBe(100);
      expect(Math.max(...e.inputs.map((r) => r.value)), m).toBe(top.value);
    }
  });

  it("bands ACWR off the engine's own band, and lights exactly one stop", () => {
    const s = state();
    const e = loadExplain("acwr", s);
    expect(e.bands).toHaveLength(4);
    expect(e.bands.filter((b) => b.active)).toHaveLength(1);
    expect(e.readKey).toBe(e.bands.find((b) => b.active)!.key);
  });

  it("names no band while the ratio is still building, and lights none", () => {
    // One session, today: nowhere near the ~2 weeks the ratio needs.
    const thin = computeLoad([{ id: "a", title: "S", startedAt: ago(0), blocks: [{ kind: "conditioning", name: "Row", minutes: 30, rpe: 7 }] }], NOW);
    expect(thin.enoughHistory).toBe(false);
    const e = loadExplain("acwr", thin);
    expect(e.readKey).toBe("w.injury.load.band.building");
    expect(e.bands.some((b) => b.active)).toBe(false);
    expect(e.role).toBe("neutral");
  });

  it("leaves the two arbitrary-unit figures unbanded and uncoloured", () => {
    const s = state();
    for (const m of ["acute", "strain"] as LoadMetric[]) {
      const e = loadExplain(m, s);
      expect(e.bands, m).toHaveLength(0);
      // A number on no published ladder must not be painted as a verdict.
      expect(e.role, m).toBe("neutral");
    }
  });

  it("bands monotony by its own scale", () => {
    const s = state();
    const e = loadExplain("monotony", s);
    expect(e.bands).toHaveLength(3);
    expect(e.bands.filter((b) => b.active)).toHaveLength(1);
  });

  it("resolves every key it emits in EN, PL and DE", () => {
    const s = state();
    for (const lang of ["en", "pl", "de"] as const) {
      const t = makeT(lang);
      for (const m of LOAD_METRICS) {
        const e = loadExplain(m, s);
        const keys = [
          e.titleKey, e.whatKey, e.howKey, e.limitKey, e.readKey, e.unitKey, e.inputsHeadKey,
          LOAD_METRIC_LABEL_KEY[m],
          ...e.steps.map((x) => x.key),
          ...e.inputs.map((x) => x.key),
          ...e.bands.map((x) => x.key),
        ];
        for (const k of keys) expect(t(k), `${lang}: ${k}`).not.toBe(k);
      }
      for (const k of [
        "w.injury.load.sub", "w.injury.load.whatHead", "w.injury.load.howHead",
        "w.injury.load.bandsHead", "w.injury.load.limitHead", "w.injury.load.colLoad",
        "w.injury.load.explainCta", "w.injury.load.rounding", "w.injury.load.band.building",
      ]) {
        expect(t(k), `${lang}: ${k}`).not.toBe(k);
      }
    }
  });

  it("substitutes {n} in every input label that carries an arg", () => {
    const t = makeT("en");
    const s = state();
    for (const m of LOAD_METRICS) {
      for (const r of loadExplain(m, s).inputs) {
        if (r.arg === null) continue;
        expect(t(r.key)).toContain("{n}");
        expect(t(r.key).replace("{n}", String(r.arg))).not.toContain("{n}");
      }
    }
  });

  // The bug exerciseCountKey exists to kill, on this side of the app: a counted
  // label that runs down to 1 says "1 days ago". The one rung that inflects is
  // NAMED instead, in every language, so no {n} label is ever handed a 1.
  it("never counts to one — yesterday and last week are words", () => {
    const s = state();
    for (const lang of ["en", "pl", "de"] as const) {
      const t = makeT(lang);
      for (const m of LOAD_METRICS) {
        for (const r of loadExplain(m, s).inputs) {
          expect(r.arg, `${lang}: ${r.key}`).not.toBe(1);
          const label = r.arg === null ? t(r.key) : t(r.key).replace("{n}", String(r.arg));
          expect(label, `${lang}: ${r.key}`).not.toMatch(/(^|\D)1\s/);
        }
      }
    }
  });

  it("names every offset rung the seven days and four weeks can produce", () => {
    const s = state();
    const keys = new Set([
      ...loadExplain("acute", s).inputs.map((r) => r.key),
      ...loadExplain("acwr", s).inputs.map((r) => r.key),
    ]);
    expect(keys).toContain("w.injury.load.day.today");
    expect(keys).toContain("w.injury.load.day.yesterday");
    expect(keys).toContain("w.injury.load.week.this");
    expect(keys).toContain("w.injury.load.week.last");
    for (const lang of ["en", "pl", "de"] as const) {
      const t = makeT(lang);
      for (const k of keys) expect(t(k), `${lang}: ${k}`).not.toBe(k);
    }
  });
});

describe("computeLoad exposes what the explainer narrates", () => {
  it("returns the seven daily loads that sum to `acute`", () => {
    const s = state();
    expect(s.daily).toHaveLength(7);
    expect(s.daily.reduce((a, b) => a + b, 0)).toBe(s.acute);
  });

  it("returns the mean and SD monotony is the quotient of", () => {
    const s = state();
    expect(s.dailySd).toBeGreaterThan(0);
    // Within a hundredth — all three fields are rounded to 2dp independently.
    expect(Math.abs(s.dailyMean / s.dailySd - s.monotony)).toBeLessThan(0.01);
  });
});

describe("loadVerdict — the sentence over the figures", () => {
  it("names the ACWR band and the monotony band it was composed from", () => {
    const s = state();
    const v = loadVerdict(s)!;
    expect(v).not.toBeNull();
    expect(v.acwrBand).toBe(s.band);
    expect(v.monotonyBand).toBe(monotonyBand(s.monotony));
    expect(v.key).toBe(LOAD_VERDICT_KEYS.find((k) => k === v.key));
  });

  // The honest answer, not a hedge: without ~2 weeks there is no "what you
  // normally do" to compare against, so half the sentence would be invented.
  it("returns null while the ratio is still building", () => {
    const thin = computeLoad(
      [{ id: "a", title: "S", startedAt: ago(0), blocks: [{ kind: "conditioning", name: "Row", minutes: 30, rpe: 7 }] }],
      NOW,
    );
    expect(thin.enoughHistory).toBe(false);
    expect(loadVerdict(thin)).toBeNull();
  });

  it("takes the heavier of the two readings as its severity", () => {
    const s = state();
    const v = loadVerdict(s)!;
    // A sweet-spot ratio under a samey week must not report itself as `go`.
    if (v.acwrBand === "sweet-spot" && v.monotonyBand !== "varied") {
      expect(v.role).not.toBe("go");
    }
    expect(["go", "info", "caution", "danger"]).toContain(v.role);
  });

  it("enumerates all twelve sentences, and every one resolves in EN/PL/DE", () => {
    expect(LOAD_VERDICT_KEYS).toHaveLength(12);
    expect(new Set(LOAD_VERDICT_KEYS).size).toBe(12);
    for (const lang of ["en", "pl", "de"] as const) {
      const t = makeT(lang);
      for (const k of LOAD_VERDICT_KEYS) {
        expect(t(k), `${lang}: ${k}`).not.toBe(k);
        // Whole sentences, not fragments — each must end in a full stop, or a
        // joined `${a} ${b}` would slip through looking like copy.
        expect(t(k).trim(), `${lang}: ${k}`).toMatch(/[.!]$/);
      }
      for (const k of [
        "w.injury.load.sheetTitle", "w.injury.load.readFrom",
        "w.injury.load.theWeek", "w.injury.load.allFigures", "w.injury.load.dayTotal",
      ]) {
        expect(t(k), `${lang}: ${k}`).not.toBe(k);
      }
    }
  });

  it("reaches all twelve — one key per band pair, none colliding", () => {
    // loadVerdict reads exactly three fields, so a synthetic state covers the
    // matrix completely and honestly; a log sweep could only ever sample it.
    const at = (band: AcwrBand, monotony: number): LoadState => ({
      ...state(), band, monotony, enoughHistory: true,
    });
    const acwr: AcwrBand[] = ["detraining", "sweet-spot", "caution", "danger"];
    const monos: [number, MonotonyBand][] = [[1.2, "varied"], [1.7, "watch"], [2.4, "same"]];
    const keys = new Set<string>();
    for (const b of acwr) {
      for (const [m, name] of monos) {
        const v = loadVerdict(at(b, m))!;
        expect(v.monotonyBand, `${b}/${name}`).toBe(name);
        expect(v.acwrBand, `${b}/${name}`).toBe(b);
        expect(LOAD_VERDICT_KEYS, `${b}/${name}`).toContain(v.key);
        keys.add(v.key);
      }
    }
    // Every pair gets its own sentence, and the enumeration is exactly the set.
    expect(keys.size).toBe(12);
    expect([...keys].sort()).toEqual([...LOAD_VERDICT_KEYS].sort());
  });

  it("never lets an insufficient band reach the sentence table", () => {
    // Belt and braces: `enoughHistory` true with an insufficient band should
    // not index VERDICT_ACWR and produce "...verdict.undefined.varied".
    const s = { ...state(), band: "insufficient" as AcwrBand, enoughHistory: true };
    expect(loadVerdict(s)).toBeNull();
  });
});

describe("monotonyBand", () => {
  it("bands on Foster's edges, and one function does it for both callers", () => {
    expect(monotonyBand(1.2)).toBe("varied");
    expect(monotonyBand(1.49)).toBe("varied");
    expect(monotonyBand(1.5)).toBe("watch");
    expect(monotonyBand(1.99)).toBe("watch");
    expect(monotonyBand(2)).toBe("same");
    expect(monotonyBand(3.4)).toBe("same");
  });

  it("agrees with the band the explainer lights", () => {
    const s = state();
    const lit = loadExplain("monotony", s).bands.find((b) => b.active)!;
    expect(lit.key).toBe(`w.injury.load.mono.${monotonyBand(s.monotony)}`);
  });
});
