import { NextResponse } from "next/server";
import { sanitizeVolumeProfile, type AthleteVolumeProfile } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

/**
 * THE QUESTIONNAIRE, ON THE ACCOUNT.
 *
 * Everything the athlete has told the app about themselves — sex, age, height,
 * body mass, training age, years lifting, sessions per week, typical sleep and
 * stress, energy intake. Stored as a JSONB column on User
 * (reference/sql-questionnaire.sql), reached through RAW queries so the app runs
 * safely BEFORE the column is migrated: a missing column reads as `{}` and a
 * write soft-degrades to a 503, exactly like /api/plan-maxes and the other
 * reference-SQL-gated features. The clients mirror the answers on-device and
 * hydrate/write-through here.
 *
 * WHY IT MOVED OFF THE DEVICE. These answers used to live only in AsyncStorage,
 * and two things followed. One athlete on two devices got two different volume
 * models, each confidently labelled "estimated for you". And the server could
 * not read `sex` — while every strength and endurance threshold in the app is
 * published for a male athlete and shifted from there — so a public badge scored
 * her against the men's bar at the same moment her own card scored her
 * correctly. Two surfaces disagreeing about the same person is precisely what
 * one shared estimate exists to prevent.
 *
 * VALIDATION IS `sanitizeVolumeProfile`, the SAME function the clients save
 * through. There is one definition of a legal answer, in core, and this route
 * does not get its own opinion: a bound that drifted between the phone and the
 * server would let a value be typed, stored locally, rejected silently on sync,
 * and then reappear on the next hydrate as the old one.
 */

export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let questionnaire: AthleteVolumeProfile = {};
  try {
    const rows = await prisma.$queryRaw<{ questionnaire: unknown }[]>`
      SELECT "questionnaire" FROM "User" WHERE id = ${user.id} LIMIT 1
    `;
    questionnaire = sanitizeVolumeProfile(rows[0]?.questionnaire);
  } catch {
    // Column not migrated yet — no account-side answers (the clients keep their
    // on-device copy). Not an error from the caller's point of view.
  }
  return NextResponse.json({ questionnaire });
}

export async function PUT(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = await readJsonLimited<{ questionnaire?: unknown }>(request, 4 * 1024);
  if (parsed.error) return parsed.error;
  const questionnaire = sanitizeVolumeProfile(parsed.data.questionnaire);

  try {
    await prisma.$executeRaw`
      UPDATE "User" SET "questionnaire" = ${JSON.stringify(questionnaire)}::jsonb WHERE id = ${user.id}
    `;
  } catch {
    return NextResponse.json(
      { error: "The questionnaire isn't enabled yet — run reference/sql-questionnaire.sql.", questionnaire },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, questionnaire });
}
