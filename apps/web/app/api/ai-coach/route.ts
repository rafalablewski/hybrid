import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  prescribeSession,
  computePerformanceState,
  computeInjuryRisk,
  toBiometrics,
  toTrainingLog,
  velocityProfiles,
  sessionVolume,
  runTotals,
  weeklyMileage,
  paceEffortSplit,
  pacedRunMoves,
  paceSeries,
  paceClock,
  type LoggedSession,
  migrateBlocks,
  type Signal,
} from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { rateLimit } from "@/lib/guard";
import { prisma } from "@/lib/db";

// The AI coach. Builds context from the athlete's REAL sessions + the
// prescription engine, then asks Claude (server-side only) for a coaching note.
// Falls back to the engine's own rationale when no API key is configured —
// so it's useful today and upgrades the moment ANTHROPIC_API_KEY is set.
const SYSTEM_PROMPT = `You are HYBRID's strength & conditioning coach for hybrid athletes (people who lift heavy AND build their engine).
Given an athlete's HPI (Hybrid Performance Index) and its limiting pillar, their readiness, today's engine-prescribed session, recent training, and their tissue-level injury risk, write a short, specific, motivating coaching note.
You are given their HPI and limiter, readiness, today's prescription, recent training, injury risk, AND their cardio/running load (weekly mileage, recent pace, easy-vs-hard balance) and their logged RPE/effort trend.
Rules: 2–4 sentences. Lead from the HPI and its limiter. Be concrete about load/intensity and recovery, and weigh BOTH sides of hybrid training — if endurance is the limiter or mileage/easy-hard balance is off (e.g. too little easy volume, or every run hard), say so; if their logged RPE shows they're grinding (consistently ≥8.5) flag fatigue, if it's low there may be room to push. If any tissue is flagged for injury risk, name it and advise accordingly. Reference their actual data. No emojis, no preamble, no headings — just the note.`;

export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Expensive (LLM) endpoint — cap per IP to blunt cost-abuse / hammering.
  const limited = rateLimit(request, { key: "ai-coach", limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const rows = await prisma.session.findMany({
    // Archived sessions are excluded from analytics (the athlete hid them).
    where: { userId: user.id, archivedAt: null },
    orderBy: { startedAt: "desc" },
    take: 30,
  });
  const sessions: LoggedSession[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    blocks: migrateBlocks(r.blocks),
    readiness: r.readiness,
  }));

  // Recovery from the Signal ontology (manual check-in + wearables write here).
  const sigRows = await prisma.signal.findMany({
    where: { userId: user.id },
    orderBy: { ts: "desc" },
    take: 200,
  });
  const coreSignals: Signal[] = sigRows.map((r) => ({
    athleteId: r.userId,
    kind: r.kind as Signal["kind"],
    value: r.value,
    unit: r.unit,
    source: r.source,
    ts: r.ts.toISOString(),
  }));
  const bio = toBiometrics(coreSignals);

  const log = toTrainingLog(sessions);
  const rx = prescribeSession(log, bio, { profiles: velocityProfiles(sessions) });
  const state = computePerformanceState(log, bio);
  const risk = computeInjuryRisk(log, bio);
  const riskNote = risk.flagged.length
    ? ` Watch ${risk.flagged[0]!.tissue} — ${risk.flagged[0]!.drivers[0]?.label ?? "elevated risk"}.`
    : "";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Engine fallback — already real and specific, now Twin-aware.
    return NextResponse.json({
      source: "engine",
      text: state.summary + riskNote,
      readiness: rx.readiness,
      hpi: state.hpi.score,
    });
  }

  const recent = sessions
    .slice(0, 6)
    .map((s) => `- ${s.title} (${new Date(s.startedAt).toLocaleDateString()}): ${sessionVolume(s.blocks).toLocaleString()}kg, ${s.blocks.length} blocks`)
    .join("\n");
  const prescribed = rx.blocks
    .map((b) =>
      b.kind === "strength"
        ? `${b.name} ${b.sets.length}×${b.sets[0]?.reps ?? ""} @ ${b.sets[0]?.load ?? ""}kg`
        : b.kind === "cardio"
          ? `${b.name} ${b.distance ?? "?"}km${b.paceTarget ? ` @ ${b.paceTarget}` : ""}`
          : `${b.name} (${b.format})`,
    )
    .join("; ");

  // Cardio context — mileage, recent pace, and the easy/hard balance.
  const cardio = runTotals(sessions);
  const km4 = weeklyMileage(sessions, 4).map((w) => w.km);
  const split = paceEffortSplit(sessions);
  const splitTotal = split.easy + split.moderate + split.hard;
  const easyPct = splitTotal ? Math.round((split.easy / splitTotal) * 100) : null;
  const topRun = pacedRunMoves(sessions)[0];
  const runPace = topRun ? paceSeries(sessions, topRun) : [];
  const recentPace = runPace.length ? paceClock(runPace[runPace.length - 1]!.secPerKm) : null;
  const cardioLine =
    cardio.efforts > 0
      ? `Cardio: ${cardio.distanceKm}km over ${cardio.efforts} efforts; last 4 weeks (km) ${km4.join("/")}` +
        (easyPct != null ? `; ${easyPct}% of cardio minutes at an easy pace (vs harder)` : "") +
        (recentPace ? `; recent ${topRun} pace ${recentPace}/km` : "") +
        "."
      : "Cardio: none logged.";

  // RPE / effort trend across recent efforts (strength set RPE + cardio RPE).
  const rpeVals: number[] = [];
  for (const s of sessions.slice(0, 10))
    for (const b of s.blocks) {
      if (b.kind === "strength") for (const st of b.sets) { const r = parseFloat(st.rpe ?? ""); if (Number.isFinite(r)) rpeVals.push(r); }
      else if (b.rpe != null) rpeVals.push(b.rpe);
    }
  const avgRpe = rpeVals.length ? Math.round((rpeVals.reduce((a, b) => a + b, 0) / rpeVals.length) * 10) / 10 : null;
  const rpeLine =
    avgRpe != null
      ? `Logged effort: average RPE ${avgRpe}/10 across ${rpeVals.length} recent efforts` +
        (avgRpe >= 8.5 ? " — grinding, watch accumulated fatigue." : avgRpe <= 6 ? " — conservative, likely room to push." : ".")
      : "Logged effort: RPE not recorded.";

  const drivers = state.drivers
    .map((d) => `${d.impact === "positive" ? "+" : "−"}${d.factor} (${d.detail})`)
    .join("; ");
  const flagged = risk.flagged.length
    ? risk.flagged.map((t) => `${t.tissue} ${t.risk}/100 [${t.drivers[0]?.label ?? ""}]`).join(", ")
    : "none";

  const userMsg = `HPI: ${state.hpi.score}/100 (${state.hpi.band}), limiting pillar: ${state.hpi.limiter}.
Pillars — strength ${state.hpi.components.strength}, endurance ${state.hpi.components.endurance}, recovery ${state.hpi.components.recovery >= 0 ? "+" : ""}${state.hpi.components.recovery}.
State drivers: ${drivers || "(none notable)"}.
Injury risk: overall ${risk.overall}/100 (${risk.band}); flagged tissues: ${flagged}.
Readiness: ${rx.readiness}/100 (confidence ${Math.round(rx.confidence * 100)}%).
Engine prescription for today: ${prescribed}.
Engine rationale: ${rx.why}
${cardioLine}
${rpeLine}
Recent sessions:\n${recent || "(none logged yet)"}

Write today's coaching note.`;

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMsg }],
    });
    const text = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return NextResponse.json({ source: "ai", text: text || state.summary, readiness: rx.readiness, hpi: state.hpi.score });
  } catch {
    return NextResponse.json({ source: "engine", text: state.summary + riskNote, readiness: rx.readiness, hpi: state.hpi.score });
  }
}
