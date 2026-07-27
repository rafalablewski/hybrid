import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  computeEngineTrace,
  readinessWhy,
  whatIfBio,
  whatIfLog,
  SAMPLE_BIOMETRICS,
  SAMPLE_TRAINING_LOG,
  type Biometrics,
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
  const trace = computeEngineTrace(simLog, simBio, { coeffs });
  const actual = whatIfActive ? computeEngineTrace(log, bio, { coeffs }) : trace;

  // Deterministic fallback — the engines' own explanation, always available.
  const engineLines = [
    trace.state.summary,
    ...readinessWhy(simLog, simBio).slice(1),
    trace.injury.flagged.length
      ? `Flagged tissues: ${trace.injury.flagged
          .map((t) => `${t.tissue} ${t.risk}/100 (${t.drivers[0]?.label ?? "elevated"})`)
          .join("; ")}.`
      : "No tissue is flagged for elevated injury risk.",
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

  const userMsg = `Subject: ${subject}. Sessions in the log: ${log.length}. Calibration model: ${version}.
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
