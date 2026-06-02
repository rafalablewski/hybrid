/**
 * Tactical / SOF vertical — occupational readiness.
 *
 * Special-operations and tactical units don't ask "are you fit?" — they ask
 * "are you deployable?". This composes the same Twin signals (HPI, injury risk)
 * with occupational capacities (load carriage, work capacity) into a Deployment
 * Readiness Index and a unit-level go/no-go. Pure; mission-critical, auditable.
 */

export type DutyStatus = "ready" | "qualified" | "limited" | "non-deployable";

export interface TacticalInputs {
  /** Hybrid Performance Index from the Twin (0..100) */
  hpi: number;
  /** overall injury risk from the injury engine (0..100) */
  injuryRisk: number;
  /** load-carriage / rucking capacity readiness (0..100), optional */
  loadCarriage?: number;
  /** work-capacity / metabolic readiness (0..100), optional */
  workCapacity?: number;
}

export interface DeploymentReadiness {
  /** 0..100 occupational readiness */
  dri: number;
  status: DutyStatus;
  limiters: string[];
}

function dutyStatus(dri: number, injuryRisk: number): DutyStatus {
  if (injuryRisk >= 70) return "non-deployable"; // hard medical gate
  if (dri >= 80) return "ready";
  if (dri >= 65) return "qualified";
  if (dri >= 50) return "limited";
  return "non-deployable";
}

/**
 * Deployment Readiness Index. Physical readiness (HPI) and availability
 * (inverse injury risk) are the backbone; occupational capacities adjust it.
 * High injury risk hard-gates to non-deployable regardless of fitness.
 */
export function deploymentReadiness(inp: TacticalInputs): DeploymentReadiness {
  const availability = 100 - inp.injuryRisk;
  const parts: { v: number; w: number }[] = [
    { v: inp.hpi, w: 0.4 },
    { v: availability, w: 0.3 },
  ];
  if (inp.loadCarriage != null) parts.push({ v: inp.loadCarriage, w: 0.15 });
  if (inp.workCapacity != null) parts.push({ v: inp.workCapacity, w: 0.15 });

  const wSum = parts.reduce((a, p) => a + p.w, 0);
  const dri = Math.round(Math.max(0, Math.min(100, parts.reduce((a, p) => a + p.v * p.w, 0) / wSum)));

  const limiters: string[] = [];
  if (inp.injuryRisk >= 50) limiters.push(`injury risk ${inp.injuryRisk}/100`);
  if (inp.hpi < 60) limiters.push(`physical readiness ${inp.hpi}/100`);
  if (inp.loadCarriage != null && inp.loadCarriage < 60) limiters.push("load carriage");
  if (inp.workCapacity != null && inp.workCapacity < 60) limiters.push("work capacity");

  return { dri, status: dutyStatus(dri, inp.injuryRisk), limiters };
}

export interface UnitMember {
  name: string;
  dri: number;
  status: DutyStatus;
}

export interface UnitReadiness {
  members: UnitMember[];
  deployable: number;
  total: number;
  pctReady: number;
  /** mission go/no-go at the readiness threshold */
  go: boolean;
}

const DEPLOYABLE: DutyStatus[] = ["ready", "qualified"];

/** Roll member readiness into a unit go/no-go (default: 80% deployable). */
export function unitReadiness(members: UnitMember[], threshold = 0.8): UnitReadiness {
  const total = members.length;
  const deployable = members.filter((m) => DEPLOYABLE.includes(m.status)).length;
  const pctReady = total ? deployable / total : 0;
  return {
    members: [...members].sort((a, b) => b.dri - a.dri),
    deployable,
    total,
    pctReady: Math.round(pctReady * 100),
    go: total > 0 && pctReady >= threshold,
  };
}
