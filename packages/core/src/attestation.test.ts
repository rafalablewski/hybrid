import { describe, it, expect } from "vitest";
import { ATTESTATION_TIERS, prBadge, prSubject, prTier, tierInfo, type PrAttestation } from "./attestation";

const att = (status: PrAttestation["status"]): PrAttestation => ({
  id: "a1",
  sessionId: "s1",
  lift: "Back Squat",
  status,
});

describe("the attestation ladder", () => {
  it("declares all six tiers, in order, with 0–2 live", () => {
    expect(ATTESTATION_TIERS.map((t) => t.tier)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(ATTESTATION_TIERS.filter((t) => t.live).map((t) => t.key)).toEqual(["claimed", "sensed", "witnessed"]);
  });

  it("tierInfo indexes by tier", () => {
    expect(tierInfo(2).key).toBe("witnessed");
  });
});

describe("grading a PR", () => {
  it("a typed PR is claimed", () => {
    expect(prTier({})).toBe(0);
    expect(prTier({ session: { device: null }, attestations: [] })).toBe(0);
  });

  it("a device-matched session lifts the PR to sensed", () => {
    expect(prTier({ session: { device: { durationMin: 45 } as never } })).toBe(1);
  });

  it("a co-sign beats the device", () => {
    expect(prTier({ session: { device: { durationMin: 45 } as never }, attestations: [att("cosigned")] })).toBe(2);
  });

  it("a pending or declined request is not evidence", () => {
    expect(prTier({ attestations: [att("pending")] })).toBe(0);
    expect(prTier({ attestations: [att("declined")] })).toBe(0);
  });
});

describe("the badge", () => {
  it("carries the label and the honest evidence line", () => {
    const b = prBadge(1);
    expect(b.label).toBe("Sensed");
    expect(b.explain).toContain("device recording");
    expect(b.pending).toBe(false);
    expect(prBadge(0, { pending: true }).pending).toBe(true);
  });
});

describe("the subject key", () => {
  it("anchors to session + lift", () => {
    expect(prSubject("s1", "Back Squat")).toBe("s1:Back Squat");
  });
});
