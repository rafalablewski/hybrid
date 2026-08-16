import { describe, it } from "vitest";
import { lapDerivationFor, sanitizeSessionStream, splitsFromDistance, bestEffortsFromDistance, deriveSessionLaps, downsampleStream, hrZoneSeconds } from "./session-streams";
import { olympicSport, sportPacePerMeters } from "./olympic-sports";
import { deviceTrueSession } from "./device-truth";
import { sessionSetFacts } from "./session-facts";

describe("probe2", () => {
  it("lapDerivationFor", () => {
    for (const l of ["Running", "Cycling", "Swimming", "Walking", "Rowing", "Traditional Strength Training", "", "Yoga", "Functional Strength Training", "High Intensity Interval Training"]) {
      console.log(JSON.stringify(l), "->", JSON.stringify(lapDerivationFor(l)), "sport:", olympicSport(l)?.name);
    }
  });
  it("splits + bests on a 10k", () => {
    // 10 km in 50 min, 1 sample/10s
    const offsets: number[] = []; const values: number[] = [];
    for (let t = 0; t <= 3000; t += 10) { offsets.push(t); values.push((10 * t) / 3000); }
    const s = sanitizeSessionStream({ kind: "distance", startedAt: "2026-01-01T00:00:00Z", offsets, values, provider: "apple", uuid: "u" })!;
    const sp = splitsFromDistance(s, 1);
    console.log("splits:", sp.length, JSON.stringify(sp.slice(0, 2)), JSON.stringify(sp[sp.length - 1]));
    const b = bestEffortsFromDistance(s, [1, 5, 10, 21.0975]);
    console.log("bests:", JSON.stringify(b));
  });
  it("device truth identity", () => {
    const sess: any = { id: "s1", title: "t", startedAt: "2026-01-01T00:00:00Z", blocks: [{ kind: "cardio", name: "Run", distance: 5, minutes: 25 }] };
    console.log("no device same ref:", deviceTrueSession(sess) === sess);
    const facts = sessionSetFacts(sess);
    console.log("facts:", JSON.stringify(facts.map(f => ({ k: f.kind, m: f.measured, d: f.durationSec, p: f.paceSecPerKm }))));
  });
  it("downsample first sample", () => {
    const offsets: number[] = []; const values: number[] = [];
    for (let t = 0; t < 10000; t++) { offsets.push(t); values.push(t); }
    const d = downsampleStream({ kind: "hr", startedAt: "x", offsets, values, provider: "a", uuid: "u" } as any, 3000);
    console.log("first offset:", d.offsets[0], "last:", d.offsets[d.offsets.length - 1], "n:", d.offsets.length);
  });
});
