import { describe, it, expect } from "vitest";
import { jointAngle, kneeAngle, asymmetryPct, countReps, analyzeSquat, motionSignals } from "./index";
import type { PoseFrame } from "./index";

describe("geometry", () => {
  it("computes a right angle", () => {
    expect(jointAngle({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(90, 5);
  });
  it("computes a straight angle", () => {
    expect(jointAngle({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(180, 5);
  });
  it("asymmetry is 0 when equal, positive when not", () => {
    expect(asymmetryPct(90, 90)).toBe(0);
    expect(asymmetryPct(80, 100)).toBeCloseTo(20, 5);
  });
});

describe("kneeAngle", () => {
  it("returns null when keypoints are missing", () => {
    expect(kneeAngle({}, "left")).toBeNull();
  });
  it("reads the hip-knee-ankle angle", () => {
    const pose = { leftHip: { x: 0, y: 2 }, leftKnee: { x: 0, y: 1 }, leftAnkle: { x: 0, y: 0 } };
    expect(kneeAngle(pose, "left")).toBeCloseTo(180, 5); // straight leg
  });
});

describe("countReps", () => {
  it("counts dips below low that recover above high", () => {
    const sig = [160, 100, 160, 95, 155, 90, 160];
    expect(countReps(sig)).toBe(3);
  });
  it("ignores a dip that never recovers", () => {
    expect(countReps([160, 100, 105, 108])).toBe(0);
  });
});

// build a synthetic squat: 2 reps, slight L/R asymmetry, good depth
function squatFrames(): PoseFrame[] {
  const frames: PoseFrame[] = [];
  const angles = [170, 95, 170, 92, 170]; // two clear reps
  angles.forEach((a, i) => {
    frames.push({
      t: i * 0.5,
      pose: {
        leftHip: { x: 0, y: 2 }, leftKnee: { x: 0.1, y: 1 }, leftAnkle: { x: 0, y: 0 },
        rightHip: { x: 1, y: 2 }, rightKnee: { x: 1.1, y: 1 }, rightAnkle: { x: 1, y: 0 },
      },
    });
    // overwrite knee positions to realize the target angle is overkill; instead
    // fake angle via straight/bent geometry below
    void a;
  });
  return frames;
}

describe("analyzeSquat", () => {
  it("detects reps, depth, asymmetry and scores technique", () => {
    // construct frames where mean knee angle dips to ~90 twice
    const mk = (angle: number): PoseFrame => {
      // hip at (0,2), knee at (0,1); place ankle so the hip-knee-ankle angle
      // equals `angle`. knee→hip is (0,1); a unit vector at `angle` from it is
      // (sinθ, cosθ), so ankle = knee + that.
      const rad = (angle * Math.PI) / 180;
      const ax = Math.sin(rad), ay = 1 + Math.cos(rad);
      return {
        t: 0,
        pose: {
          leftHip: { x: 0, y: 2 }, leftKnee: { x: 0, y: 1 }, leftAnkle: { x: ax, y: ay },
          rightHip: { x: 0, y: 2 }, rightKnee: { x: 0, y: 1 }, rightAnkle: { x: ax, y: ay },
        },
      };
    };
    const frames = [mk(170), mk(90), mk(170), mk(88), mk(170)];
    const a = analyzeSquat(frames);
    expect(a.reps).toBe(2);
    expect(a.minKneeAngle!).toBeLessThan(100);
    expect(a.kneeAsymmetryPct).toBeCloseTo(0, 1);
    expect(a.techniqueScore).toBeGreaterThan(80);
  });

  it("flags insufficient depth", () => {
    const shallow: PoseFrame[] = [
      { t: 0, pose: { leftHip: { x: 0, y: 2 }, leftKnee: { x: 0, y: 1 }, leftAnkle: { x: 0, y: 0 } } },
    ];
    const a = analyzeSquat(shallow);
    expect(a.flags).toContain("insufficient depth");
  });

  it("emits an asymmetry signal", () => {
    const sigs = motionSignals("a1", { movement: "squat", reps: 1, minKneeAngle: 90, kneeAsymmetryPct: 14, techniqueScore: 70, flags: [] });
    expect(sigs[0]!.kind).toBe("asymmetry");
    expect(sigs[0]!.source).toBe("video");
    void squatFrames;
  });
});
