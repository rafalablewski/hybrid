import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  prescribeSession,
  toTrainingLog,
  sessionVolume,
  SAMPLE_TRAINING_LOG,
  SAMPLE_BIOMETRICS,
  type LoggedSession,
  type SessionBlock,
} from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// The AI coach. Builds context from the athlete's REAL sessions + the
// prescription engine, then asks Claude (server-side only) for a coaching note.
// Falls back to the engine's own rationale when no API key is configured —
// so it's useful today and upgrades the moment ANTHROPIC_API_KEY is set.
const SYSTEM_PROMPT = `You are HYBRID's strength & conditioning coach for hybrid athletes (people who lift heavy AND build their engine).
Given an athlete's readiness, today's engine-prescribed session, and recent training, write a short, specific, motivating coaching note.
Rules: 2–4 sentences. Be concrete about load/intensity and recovery. Reference their actual data. No emojis, no preamble, no headings — just the note.`;

export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await prisma.session.findMany({
    where: { userId: user.id },
    orderBy: { startedAt: "desc" },
    take: 30,
  });
  const sessions: LoggedSession[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    blocks: r.blocks as unknown as SessionBlock[],
    readiness: r.readiness,
  }));

  const log = sessions.length ? toTrainingLog(sessions) : SAMPLE_TRAINING_LOG;
  const rx = prescribeSession(log, SAMPLE_BIOMETRICS);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Engine fallback — already real and specific.
    return NextResponse.json({ source: "engine", text: rx.why, readiness: rx.readiness });
  }

  const recent = sessions
    .slice(0, 6)
    .map((s) => `- ${s.title} (${new Date(s.startedAt).toLocaleDateString()}): ${sessionVolume(s.blocks).toLocaleString()}kg, ${s.blocks.length} blocks`)
    .join("\n");
  const prescribed = rx.blocks
    .map((b) => (b.kind === "strength" ? `${b.name} ${b.sets.length}×${b.sets[0]?.reps ?? ""} @ ${b.sets[0]?.load ?? ""}kg` : `${b.name} (${b.format})`))
    .join("; ");

  const userMsg = `Readiness: ${rx.readiness}/100 (confidence ${Math.round(rx.confidence * 100)}%).
Engine prescription for today: ${prescribed}.
Engine rationale: ${rx.why}
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
    return NextResponse.json({ source: "ai", text: text || rx.why, readiness: rx.readiness });
  } catch {
    return NextResponse.json({ source: "engine", text: rx.why, readiness: rx.readiness });
  }
}
