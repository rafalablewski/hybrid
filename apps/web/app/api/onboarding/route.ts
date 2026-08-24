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
  //
  // AND NOT ENROLLED AT ALL FOR A TRACKER. The client stops sending a goal once
  // the persona answer is "casual", but the rule is enforced here too, because
  // this is the only place that can be sure: an older build still asks every
  // athlete for a goal and still sends it, and enrolling those people in a
  // twelve-week season they declined is the defect being fixed. The persona is
  // read out of the answer map, which every client version has always sent.
  const casual = personaFromAnswers(answers) === "casual";
  const goal = !casual && typeof b.goal === "string" && b.goal.trim() ? goalIdToStore(b.goal) : null;
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

/** The persona the athlete chose, out of the raw answer map. The key is stable
 *  ("persona") because it is a system question whose key the admin editor locks. */
function personaFromAnswers(answers: Record<string, unknown>): "casual" | "athlete" | null {
  const v = answers.persona;
  return v === "casual" || v === "athlete" ? v : null;
}
