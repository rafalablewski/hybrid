import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  acwrEventsFromHistory,
  computeEngineTrace,
  derivePersonalization,
  effortSamples,
  deriveEffortModel,
  effortTrend,
  EFFORT_BIAS_MAX,
  readinessWhy,
  whatIfBio,
  whatIfLog,
  SAMPLE_BIOMETRICS,
  SAMPLE_TRAINING_LOG,
  SPIKE_ONSET_PRIOR,
  type Biometrics,
  type EffortModel,
  type EffortTrend,
  type TrainingLog,
  type WhatIf,
} from "@hybrid/core";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { athleteInputs } from "@/lib/athlete-state";
import { activeCalibration } from "@/lib/calibration";
import { prisma } from "@/lib/db";

// Engine Room "Explain this athlete": recompute the FULL engine state
// server-side (never trusting client numbers), then ask Claude for a coach
// narrative grounded exclusively on the structured engine output. Without
// ANTHROPIC_API_KEY it degrades to the engines' own deterministic explanation
// (readinessWhy + drivers) and says so — honest either way.
const SYSTEM_PROMPT = `You are the analytics explainer inside HYBRID's admin Engine Room, talking to the platform operator (not the athlete).
You receive the exact structured output of the deterministic training engines: HPI with components and limiter, readiness, per-tissue injury risk with ACWR and per-driver point contributions, the calibrated p(injury), and the model version.
Explain what the numbers mean and what a coach should do, grounded ONLY on the data provided — never invent sessions, tissues, or values that are not in the input. If a what-if simulation is active, contrast simulated vs actual and attribute the change to the transformed inputs.
Rules: 3-6 sentences of plain prose. Name the specific tissues, drivers and figures you reference. No emojis, no headings, no preamble — just the explanation.`;

type Body = { userId?: string; whatIf?: WhatIf };

function isFiniteOr(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  // Expensive (LLM) endpoint — cap per IP like the AI coach.
  const limited = await rateLimit(request, { key: "engine-explain", limit: 12, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited<Body>(request, 16 * 1024);
  if (parsed.error) return parsed.error;
  const body = parsed.data ?? {};

  // Sanitize the what-if: bounded numbers only (it transforms inputs, so a
  // hostile value can at worst skew this one explanation, but keep it sane).
  const whatIf: Required<Pick<WhatIf, "loadPct">> & WhatIf = {
    loadPct: Math.max(0, Math.min(300, isFiniteOr(body.whatIf?.loadPct) ?? 100)),
    hrv: isFiniteOr(body.whatIf?.hrv),
    restingHr: isFiniteOr(body.whatIf?.restingHr),
    sleep: isFiniteOr(body.whatIf?.sleep),
  };
  const whatIfActive =
    whatIf.loadPct !== 100 || whatIf.hrv != null || whatIf.restingHr != null || whatIf.sleep != null;

  // Assemble inputs server-side: the sample athlete, or a real user's stored data.
  let log: TrainingLog = SAMPLE_TRAINING_LOG;
  let bio: Biometrics | undefined = SAMPLE_BIOMETRICS;
  let subject = "the built-in sample athlete";
  let spikeOnset = SPIKE_ONSET_PRIOR;
  // The effort model behind the numbers — see the grounding line below for why
  // the narrative needs it.
  let effort: { model: EffortModel; trend: EffortTrend | null; rated: number } | null = null;
  if (body.userId) {
    const user = await prisma.user.findUnique({
      where: { id: String(body.userId) },
      select: { id: true, email: true },
    });
    if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });
    const inputs = await athleteInputs(user.id);
    log = inputs.log;
    bio = inputs.bio;
    subject = `athlete ${user.id}`;
    const samples = effortSamples(inputs.sessions);
    effort = { model: deriveEffortModel(samples), trend: effortTrend(samples), rated: samples.length };
    // Same personal spike onset the Engine Room feed computes, so the
    // narrative matches the numbers on screen.
    const outcomes = await prisma.riskOutcome.findMany({
      where: { userId: user.id },
      select: { injured: true, ts: true },
      orderBy: { ts: "desc" },
      take: 200,
    });
    const now = Date.now();
    spikeOnset = derivePersonalization(
      acwrEventsFromHistory(
        log,
        outcomes.map((o) => ({ daysAgo: (now - o.ts.getTime()) / 86_400_000, injured: o.injured })),
      ),
    ).spikeOnset;
    await audit({
      actor: gate.admin,
      action: "user.engine.explain",
      targetType: "user",
      targetId: user.id,
      summary: `Engine Room explanation for ${user.email}`,
      req: request,
    });
  }

  const { coeffs, version } = await activeCalibration();
  const simLog = whatIfActive ? whatIfLog(log, whatIf.loadPct) : log;
  const simBio = whatIfActive ? whatIfBio(bio, whatIf) : bio;
  const trace = computeEngineTrace(simLog, simBio, { coeffs, spikeOnset });
  const actual = whatIfActive ? computeEngineTrace(log, bio, { coeffs, spikeOnset }) : trace;

  // WHY THIS LINE EXISTS: the log these numbers come from is personalTrainingLog,
  // so a session the athlete rated carries THEIR reported effort rather than the
  // engine's constant — and that moves ACWR hard (the same month of training
  // reads 1.43 or 0.40 depending only on what they said it cost them). Without
  // this, the model would be asked to explain an elevated risk while blind to
  // the input driving it, and would confidently attribute it to something else.
  const effortLine = !effort || effort.rated === 0
    // Zero ratings is NOT "they report what the log implies" — that would be a
    // claim about an athlete who has said nothing. It is the absence of data.
    ? "Effort model: this athlete has not rated any sessions, so every session's intensity is the engine's own estimate and no reported effort is shaping the numbers above."
    : `Effort model: ${effort.rated} session${effort.rated === 1 ? "" : "s"} rated by the athlete via the post-workout "how did that feel?" prompt. ` +
      (effort.model.personalized
        ? `They report this training ${effort.model.bias > 0 ? `${effort.model.bias} RPE HARDER` : `${Math.abs(effort.model.bias)} RPE EASIER`} than the log implies (bounded ±${EFFORT_BIAS_MAX}). `
        : "They report roughly what the log implies, so no personalization is applied. ") +
      (effort.model.mae != null && effort.model.baselineMae != null
        ? `Held-out error ${effort.model.mae.toFixed(2)} RPE vs ${effort.model.baselineMae.toFixed(2)} unpersonalized. `
        : "") +
      (effort.trend
        ? `Over ${effort.trend.days} days the same objective work is reporting ${effort.trend.direction === "fitter" ? "EASIER" : effort.trend.direction === "harder" ? "HARDER" : "unchanged"} (${effort.trend.perMonth} RPE/month).`
        : "Not enough rated sessions yet for a trend.") +
      " Rated sessions enter the training log at the athlete's OWN reported intensity, so this directly shapes the ACWR and injury numbers above.";

  // Deterministic fallback — the engines' own explanation, always available.
  const engineLines = [
    trace.state.summary,
    ...readinessWhy(simLog, simBio).slice(1),
    trace.injury.flagged.length
      ? `Flagged tissues: ${trace.injury.flagged
          .map((t) => `${t.tissue} ${t.risk}/100 (${t.drivers[0]?.label ?? "elevated"})`)
          .join("; ")}.`
      : "No tissue is flagged for elevated injury risk.",
    // The deterministic path is what the operator actually reads until
    // ANTHROPIC_API_KEY is configured, so it carries the effort read as well —
    // otherwise the fallback explains an ACWR without naming the input that
    // moved it most.
    effortLine,
  ];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      source: "engine",
      text: engineLines.join(" "),
      note: "ANTHROPIC_API_KEY is not set — this is the deterministic engine explanation. The Claude narrative activates the moment the key is configured.",
    });
  }

  const tissueLines = trace.injury.tissues
    .map(
      (t) =>
        `- ${t.tissue}: risk ${t.risk}/100 (${t.band}), p(injury) ${(t.prob * 100).toFixed(1)}%, ACWR ${
          t.enoughHistory ? t.acwr.toFixed(2) : "n/a (no chronic history)"
        }${t.drivers.length ? `, drivers: ${t.drivers.map((d) => `${d.kind} +${d.contribution}`).join(", ")}` : ""}`,
    )
    .join("\n");
  const drivers = trace.state.drivers
    .map((d) => `${d.impact === "positive" ? "+" : "−"}${d.factor}: ${d.detail}`)
    .join("; ");
  const whatIfLine = whatIfActive
    ? `WHAT-IF ACTIVE — inputs transformed: recent training scaled to ${whatIf.loadPct}%${
        whatIf.hrv != null ? `, HRV today set to ${whatIf.hrv}` : ""
      }${whatIf.restingHr != null ? `, resting HR today set to ${whatIf.restingHr}` : ""}${
        whatIf.sleep != null ? `, sleep today set to ${whatIf.sleep} h` : ""
      }. Actual (untransformed) state: HPI ${actual.state.hpi.score}, readiness ${actual.state.readiness.score}, overall risk ${actual.injury.overall} (p ${(actual.injury.prob * 100).toFixed(1)}%).`
    : "No what-if is active — this is the live state.";

  const personalLine =
    spikeOnset !== SPIKE_ONSET_PRIOR
      ? `Personal model: this athlete's ACWR spike onset is personalized to ${spikeOnset} (population prior ${SPIKE_ONSET_PRIOR}), learned from their labeled outcome history.`
      : `Personal model: no personalization — the ACWR spike onset is the population prior ${SPIKE_ONSET_PRIOR}.`;

  const userMsg = `Subject: ${subject}. Sessions in the log: ${log.length}. Calibration model: ${version}. ${personalLine} ${effortLine}
HPI ${trace.state.hpi.score}/100 (${trace.state.hpi.band}); components — strength ${trace.state.hpi.components.strength}, endurance ${trace.state.hpi.components.endurance}, recovery ${trace.state.hpi.components.recovery >= 0 ? "+" : ""}${trace.state.hpi.components.recovery}; limiter: ${trace.state.hpi.limiter}.
Readiness ${trace.state.readiness.score}/100 (wearable adjustment ${trace.state.readiness.bioAdj >= 0 ? "+" : ""}${trace.state.readiness.bioAdj}).
State drivers: ${drivers || "(none notable)"}.
Injury risk overall ${trace.injury.overall}/100 (${trace.injury.band}), calibrated p(injury) ${(trace.injury.prob * 100).toFixed(1)}%.
Per tissue:
${tissueLines}
${whatIfLine}

Explain this state to the operator.`;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMsg }],
    });
    const text = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return NextResponse.json({ source: "ai", text: text || engineLines.join(" ") });
  } catch {
    return NextResponse.json({
      source: "engine",
      text: engineLines.join(" "),
      note: "The Claude call failed — this is the deterministic engine explanation.",
    });
  }
}
