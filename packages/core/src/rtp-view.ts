import { RTP_STAGES, RTP_GATES, evaluateRtp, type RtpStage } from "./engines/rtp";
import { localDayKey, dayKeyDiff } from "./day-key";

/**
 * THE PROTOCOL, AS SOMETHING YOU CAN SEE.
 *
 * The rails live in engines/rtp.ts — stages, gates, what may advance. This is
 * the one PRESENTATION of them both clients draw, so a protocol looks and
 * counts identically on the phone and on the web.
 *
 * The old surface drew a stage pill, a progress bar and a checklist: three
 * separate claims about the same fact, none of which said where you were in
 * the journey or how long you had been in it. A protocol is a PATH — six
 * stages, one of them yours — so this returns the whole path with every stage
 * placed behind you, under you, or ahead, and the date you entered each one
 * recovered from the audit trail we were already keeping. The client draws the
 * ladder; the position, the dates, the day count and the wording all come from
 * here.
 *
 * Every label is an i18n KEY, never an English string: the old surface printed
 * `STAGE_LABEL` and every gate name in English into a Polish or German UI.
 */

export const RTP_STAGE_KEY: Record<RtpStage, string> = {
  acute: "w.rtp.stage.acute",
  recovery: "w.rtp.stage.recovery",
  reconditioning: "w.rtp.stage.reconditioning",
  return_to_train: "w.rtp.stage.returnToTrain",
  return_to_perform: "w.rtp.stage.returnToPerform",
  cleared: "w.rtp.stage.cleared",
};

/** What the stage you are IN is actually for — shown on the open rung only,
 *  because "Reconditioning" is our word, not an answer. */
export const RTP_STAGE_SUB_KEY: Record<RtpStage, string> = {
  acute: "w.rtp.stageSub.acute",
  recovery: "w.rtp.stageSub.recovery",
  reconditioning: "w.rtp.stageSub.reconditioning",
  return_to_train: "w.rtp.stageSub.returnToTrain",
  return_to_perform: "w.rtp.stageSub.returnToPerform",
  cleared: "w.rtp.stageSub.cleared",
};

export const RTP_GATE_KEY: Record<string, string> = {
  pain_free_rest: "w.rtp.gate.painFreeRest",
  swelling_resolved: "w.rtp.gate.swellingResolved",
  full_rom: "w.rtp.gate.fullRom",
  pain_free_adl: "w.rtp.gate.painFreeAdl",
  strength_80: "w.rtp.gate.strength80",
  no_compensation: "w.rtp.gate.noCompensation",
  strength_90: "w.rtp.gate.strength90",
  jump_sym_90: "w.rtp.gate.jumpSym90",
  full_intensity: "w.rtp.gate.fullIntensity",
  sport_specific: "w.rtp.gate.sportSpecific",
  medical_signoff: "w.rtp.gate.medicalSignoff",
  psych_ready: "w.rtp.gate.psychReady",
};

export const RTP_ACTION_KEY: Record<string, string> = {
  attest: "w.rtp.log.attest",
  retract: "w.rtp.log.retract",
  advance: "w.rtp.log.advance",
  override: "w.rtp.log.override",
  abandon: "w.rtp.log.abandon",
};

/** One entry of the immutable audit trail, as stored by the API. */
export interface RtpAudit {
  action: string;
  by: string;
  role: string;
  ts: string;
  from?: string;
  to?: string;
  gate?: string;
  reason?: string;
}

export interface RtpProtocolInput {
  stage: RtpStage;
  completed: string[];
  injuryDate?: string | null;
  audit?: RtpAudit[];
}

/** One rung of the ladder. */
export interface RtpStep {
  stage: RtpStage;
  labelKey: string;
  subKey: string;
  /** where this stage sits relative to the athlete. */
  state: "done" | "now" | "ahead";
  /** when they entered it (ISO), if we can know — the injury date for the
   *  first stage, the advancing audit entry for the rest. */
  onISO: string | null;
  /** entered by forcing past unmet gates, rather than by meeting them. */
  forced: boolean;
}

/** One line of the trail, resolved to keys + the parts a client lays out. */
export interface RtpLogRow {
  ts: string;
  by: string;
  role: string;
  action: string;
  verbKey: string;
  /** the gate that was attested/retracted. */
  gateKey: string | null;
  fromKey: string | null;
  toKey: string | null;
  /** the athlete's or clinician's own words — printed verbatim, never a key. */
  reason: string | null;
  override: boolean;
}

export interface RtpView {
  stage: RtpStage;
  labelKey: string;
  subKey: string;
  cleared: boolean;
  /** the whole path, always six long. */
  steps: RtpStep[];
  /** 1-based position, for "stage 3 of 6". */
  stageNumber: number;
  stageCount: number;
  gates: { key: string; labelKey: string; done: boolean }[];
  doneGates: number;
  totalGates: number;
  canAdvance: boolean;
  nextStage: RtpStage | null;
  nextStageKey: string | null;
  /** gates still to meet before this stage can be left. */
  blockedCount: number;
  /** 0..1 through the whole protocol. */
  progress: number;
  /** whole days since the injury, or null without a date. */
  days: number | null;
  log: RtpLogRow[];
}

/** Days between an ISO instant and now, counted in LOCAL days so "yesterday"
 *  is one day regardless of the hour either happened at. Never negative. */
export function daysSince(iso: string | null | undefined, now: number | Date = Date.now()): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return Math.max(0, dayKeyDiff(localDayKey(ms), localDayKey(now)));
}

export function rtpView(p: RtpProtocolInput, now: number | Date = Date.now()): RtpView {
  const audit = p.audit ?? [];
  const ev = evaluateRtp({ stage: p.stage, completed: p.completed ?? [] });
  const here = RTP_STAGES.indexOf(p.stage);

  // When each stage began: the injury itself starts the first one, and every
  // later one starts at the entry that advanced (or forced) into it.
  const entered = new Map<string, { ts: string; forced: boolean }>();
  for (const a of audit) {
    if ((a.action === "advance" || a.action === "override") && a.to) {
      entered.set(a.to, { ts: a.ts, forced: a.action === "override" });
    }
  }

  const steps: RtpStep[] = RTP_STAGES.map((stage, i) => {
    const e = stage === "acute" ? { ts: p.injuryDate ?? null, forced: false } : entered.get(stage) ?? null;
    return {
      stage,
      labelKey: RTP_STAGE_KEY[stage],
      subKey: RTP_STAGE_SUB_KEY[stage],
      state: i < here ? "done" : i === here ? "now" : "ahead",
      onISO: e?.ts ?? null,
      forced: e?.forced ?? false,
    };
  });

  const log: RtpLogRow[] = audit.map((a) => ({
    ts: a.ts,
    by: a.by,
    role: a.role,
    action: a.action,
    verbKey: RTP_ACTION_KEY[a.action] ?? a.action,
    gateKey: a.gate ? RTP_GATE_KEY[a.gate] ?? a.gate : null,
    fromKey: a.from ? RTP_STAGE_KEY[a.from as RtpStage] ?? null : null,
    toKey: a.to ? RTP_STAGE_KEY[a.to as RtpStage] ?? null : null,
    reason: a.reason ?? null,
    override: a.action === "override",
  }));

  return {
    stage: p.stage,
    labelKey: RTP_STAGE_KEY[p.stage],
    subKey: RTP_STAGE_SUB_KEY[p.stage],
    cleared: p.stage === "cleared",
    steps,
    stageNumber: here + 1,
    stageCount: RTP_STAGES.length,
    gates: RTP_GATES[p.stage].map((g) => ({
      key: g.key,
      labelKey: RTP_GATE_KEY[g.key] ?? g.label,
      done: (p.completed ?? []).includes(g.key),
    })),
    doneGates: ev.gates.filter((g) => g.done).length,
    totalGates: ev.gates.length,
    canAdvance: ev.canAdvance,
    nextStage: ev.nextStage,
    nextStageKey: ev.nextStage ? RTP_STAGE_KEY[ev.nextStage] : null,
    blockedCount: ev.blockedBy.length,
    progress: ev.progress,
    days: daysSince(p.injuryDate, now),
    log,
  };
}
