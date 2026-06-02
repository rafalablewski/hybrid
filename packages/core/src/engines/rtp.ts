/**
 * Return-to-play (RTP) protocol rails.
 *
 * A gated, auditable progression from injury back to performance. Each stage
 * has hard criteria; an athlete cannot advance until every gate is met. This is
 * the pure engine — stage definitions + evaluation. Persistence, sign-offs, and
 * override logging live in the app; the rails live here.
 */

export type RtpStage =
  | "acute"
  | "recovery"
  | "reconditioning"
  | "return_to_train"
  | "return_to_perform"
  | "cleared";

export const RTP_STAGES: RtpStage[] = [
  "acute",
  "recovery",
  "reconditioning",
  "return_to_train",
  "return_to_perform",
  "cleared",
];

export const STAGE_LABEL: Record<RtpStage, string> = {
  acute: "Acute / protection",
  recovery: "Recovery",
  reconditioning: "Reconditioning",
  return_to_train: "Return to train",
  return_to_perform: "Return to perform",
  cleared: "Cleared",
};

export interface RtpGate {
  key: string;
  label: string;
}

/** Gates that must ALL be met to leave a stage. `cleared` is terminal. */
export const RTP_GATES: Record<RtpStage, RtpGate[]> = {
  acute: [
    { key: "pain_free_rest", label: "Pain-free at rest" },
    { key: "swelling_resolved", label: "Swelling resolved" },
  ],
  recovery: [
    { key: "full_rom", label: "Full range of motion" },
    { key: "pain_free_adl", label: "Pain-free daily activity" },
  ],
  reconditioning: [
    { key: "strength_80", label: "Strength symmetry ≥ 80%" },
    { key: "no_compensation", label: "No movement compensation" },
  ],
  return_to_train: [
    { key: "strength_90", label: "Strength symmetry ≥ 90%" },
    { key: "jump_sym_90", label: "Jump asymmetry < 10%" },
    { key: "full_intensity", label: "Tolerates full-intensity drills" },
  ],
  return_to_perform: [
    { key: "sport_specific", label: "Sport-specific load tolerated" },
    { key: "medical_signoff", label: "Medical sign-off" },
    { key: "psych_ready", label: "Psychological readiness" },
  ],
  cleared: [],
};

export interface RtpState {
  stage: RtpStage;
  /** gate keys checked off in the CURRENT stage */
  completed: string[];
}

export interface RtpEvaluation {
  stage: RtpStage;
  label: string;
  gates: { key: string; label: string; done: boolean }[];
  canAdvance: boolean;
  nextStage: RtpStage | null;
  /** labels of gates still blocking advancement */
  blockedBy: string[];
  /** 0..1 overall progress through the protocol */
  progress: number;
}

export function nextStage(stage: RtpStage): RtpStage | null {
  const i = RTP_STAGES.indexOf(stage);
  return i >= 0 && i < RTP_STAGES.length - 1 ? RTP_STAGES[i + 1]! : null;
}

export function evaluateRtp(state: RtpState): RtpEvaluation {
  const stageGates = RTP_GATES[state.stage];
  const gates = stageGates.map((g) => ({ ...g, done: state.completed.includes(g.key) }));
  const blockedBy = gates.filter((g) => !g.done).map((g) => g.label);
  const next = nextStage(state.stage);
  const canAdvance = state.stage !== "cleared" && blockedBy.length === 0;

  // progress = full stages behind + fraction of this stage's gates done
  const stageIdx = RTP_STAGES.indexOf(state.stage);
  const denom = RTP_STAGES.length - 1; // cleared = 1.0
  const frac = stageGates.length ? gates.filter((g) => g.done).length / stageGates.length : 1;
  const progress = Math.min(1, (stageIdx + (state.stage === "cleared" ? 0 : frac)) / denom);

  return { stage: state.stage, label: STAGE_LABEL[state.stage], gates, canAdvance, nextStage: next, blockedBy, progress };
}

/** Advance to the next stage if all gates are met (resets gate checklist). */
export function advanceRtp(state: RtpState): RtpState {
  const ev = evaluateRtp(state);
  if (!ev.canAdvance || !ev.nextStage) return state;
  return { stage: ev.nextStage, completed: [] };
}
