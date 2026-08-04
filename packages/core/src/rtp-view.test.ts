import { describe, it, expect } from "vitest";
import { rtpView, daysSince, RTP_STAGE_KEY, RTP_GATE_KEY, type RtpAudit } from "./rtp-view";
import { RTP_STAGES, RTP_GATES } from "./engines/rtp";

const NOW = Date.parse("2026-08-04T10:00:00.000Z");

describe("rtpView", () => {
  it("lays the whole path out, with one rung under the athlete", () => {
    const v = rtpView({ stage: "reconditioning", completed: [] }, NOW);
    expect(v.steps.map((s) => s.stage)).toEqual(RTP_STAGES);
    expect(v.steps.filter((s) => s.state === "now").map((s) => s.stage)).toEqual(["reconditioning"]);
    expect(v.steps.filter((s) => s.state === "done").map((s) => s.stage)).toEqual(["acute", "recovery"]);
    expect(v.stageNumber).toBe(3);
    expect(v.stageCount).toBe(6);
  });

  it("keys every stage and every gate, so no English leaks into PL/DE", () => {
    for (const stage of RTP_STAGES) {
      const v = rtpView({ stage, completed: [] }, NOW);
      expect(v.labelKey).toBe(RTP_STAGE_KEY[stage]);
      expect(v.subKey).toMatch(/^w\.rtp\.stageSub\./);
      for (const g of v.gates) expect(g.labelKey).toMatch(/^w\.rtp\.gate\./);
    }
    for (const gates of Object.values(RTP_GATES)) {
      for (const g of gates) expect(RTP_GATE_KEY[g.key]).toBeTruthy();
    }
  });

  it("counts the gates met and blocks advancing until they all are", () => {
    const open = rtpView({ stage: "acute", completed: ["pain_free_rest"] }, NOW);
    expect(open.doneGates).toBe(1);
    expect(open.totalGates).toBe(2);
    expect(open.blockedCount).toBe(1);
    expect(open.canAdvance).toBe(false);

    const ready = rtpView({ stage: "acute", completed: ["pain_free_rest", "swelling_resolved"] }, NOW);
    expect(ready.canAdvance).toBe(true);
    expect(ready.nextStage).toBe("recovery");
    expect(ready.nextStageKey).toBe(RTP_STAGE_KEY.recovery);
  });

  it("recovers the date each stage began from the trail we already keep", () => {
    const audit: RtpAudit[] = [
      { action: "attest", by: "A", role: "USER", ts: "2026-07-20T08:00:00.000Z", gate: "pain_free_rest" },
      { action: "advance", by: "A", role: "USER", ts: "2026-07-22T08:00:00.000Z", from: "acute", to: "recovery" },
      { action: "override", by: "Doc", role: "MEDICAL", ts: "2026-07-30T08:00:00.000Z", from: "recovery", to: "reconditioning", reason: "scan clear" },
    ];
    const v = rtpView({ stage: "reconditioning", completed: [], injuryDate: "2026-07-18T08:00:00.000Z", audit }, NOW);
    const on = Object.fromEntries(v.steps.map((s) => [s.stage, s.onISO]));
    expect(on.acute).toBe("2026-07-18T08:00:00.000Z");
    expect(on.recovery).toBe("2026-07-22T08:00:00.000Z");
    expect(on.reconditioning).toBe("2026-07-30T08:00:00.000Z");
    expect(on.cleared).toBeNull();
    // a stage entered by force is marked as such — the ladder must not present
    // a forced step as a met one
    expect(v.steps.find((s) => s.stage === "reconditioning")!.forced).toBe(true);
    expect(v.steps.find((s) => s.stage === "recovery")!.forced).toBe(false);
  });

  it("resolves the trail to keys, keeping the author's own words verbatim", () => {
    const audit: RtpAudit[] = [
      { action: "attest", by: "A", role: "USER", ts: "2026-07-20T08:00:00.000Z", gate: "full_rom" },
      { action: "override", by: "Doc", role: "MEDICAL", ts: "2026-07-30T08:00:00.000Z", from: "recovery", to: "reconditioning", reason: "scan clear" },
    ];
    const v = rtpView({ stage: "reconditioning", completed: [], audit }, NOW);
    expect(v.log[0]!.verbKey).toBe("w.rtp.log.attest");
    expect(v.log[0]!.gateKey).toBe(RTP_GATE_KEY.full_rom);
    expect(v.log[1]!.override).toBe(true);
    expect(v.log[1]!.reason).toBe("scan clear");
    expect(v.log[1]!.fromKey).toBe(RTP_STAGE_KEY.recovery);
    expect(v.log[1]!.toKey).toBe(RTP_STAGE_KEY.reconditioning);
  });

  it("counts the days since the injury, and says nothing without a date", () => {
    expect(rtpView({ stage: "acute", completed: [], injuryDate: "2026-07-28T10:00:00.000Z" }, NOW).days).toBe(7);
    expect(rtpView({ stage: "acute", completed: [] }, NOW).days).toBeNull();
    expect(rtpView({ stage: "acute", completed: [], injuryDate: "not a date" }, NOW).days).toBeNull();
  });

  it("never counts a day backwards from a future-dated injury", () => {
    expect(daysSince("2026-08-09T10:00:00.000Z", NOW)).toBe(0);
  });

  it("ends: cleared has nothing left to do", () => {
    const v = rtpView({ stage: "cleared", completed: [] }, NOW);
    expect(v.cleared).toBe(true);
    expect(v.gates).toEqual([]);
    expect(v.canAdvance).toBe(false);
    expect(v.nextStage).toBeNull();
    expect(v.progress).toBe(1);
    expect(v.steps.every((s) => s.state !== "ahead")).toBe(true);
  });
});
