import { NextResponse } from "next/server";
import { buildMacrocycle, goalIdToStore } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// Finish onboarding: persist the answer map + mark the user onboarded (the
// server-side source of truth the clients gate on), and — when a goal/plan was
// chosen — enroll the recommended macrocycle in the same call. Soft-guarded so
// the request still succeeds before reference/sql-onboarding.sql is applied
// (the answers/state just aren't persisted server-side until then).
export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = await readJsonLimited<{ answers?: unknown; goal?: unknown; planId?: unknown }>(request, 32 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data;

  const answers =
    b.answers && typeof b.answers === "object" && !Array.isArray(b.answers)
      ? (b.answers as Record<string, unknown>)
      : {};

  // 1) Persist completion + answers (its own table; tolerate the migration not
  //    being applied yet — the flow must never hard-fail on this).
  let persisted = true;
  try {
    await prisma.onboardingState.upsert({
      where: { userId: user.id },
      update: { answers: answers as object, onboardedAt: new Date() },
      create: { userId: user.id, answers: answers as object },
    });
  } catch {
    persisted = false;
  }

  // 2) Enroll the chosen plan, if any (mirrors POST /api/macrocycles).
  let macrocycle = null;
  // A GOAL_TREE id (see core goal-id.ts). Normalised rather than trusted, so a
  // client still sending the display name stores the id anyway.
  const goal = typeof b.goal === "string" && b.goal.trim() ? goalIdToStore(b.goal) : null;
  if (goal) {
    const macro = buildMacrocycle(goal, null);
    const planId = typeof b.planId === "string" && b.planId.trim() ? b.planId.trim().slice(0, 64) : null;
    try {
      macrocycle = await prisma.macrocycle.create({
        data: { userId: user.id, goal, planId, eventDate: null, blocks: macro.blocks as object },
      });
    } catch {
      // planId column not migrated (reference/sql-macrocycle-planid.sql) — still enroll.
      macrocycle = await prisma.macrocycle.create({
        data: { userId: user.id, goal, eventDate: null, blocks: macro.blocks as object },
      });
    }
  }

  return NextResponse.json({ ok: true, persisted, macrocycle }, { status: 201 });
}
