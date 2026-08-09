import { NextResponse } from "next/server";
import { normalizeHandle, isValidHandle, suggestHandle, profileStats } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { tableMissing, allSessionsFor } from "@/lib/social";

// The signed-in user's OWN public social profile (handle, bio, privacy). GET
// returns it (or a suggested handle if not claimed yet); PUT claims/updates it.
// Soft-degrades until reference/sql-social.sql has been run.

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const profile = await prisma.socialProfile.findUnique({ where: { userId: me.id } });
    const sessions = await allSessionsFor(me.id);
    return NextResponse.json({
      profile,
      suggestedHandle: suggestHandle(me.name || me.email || me.id),
      stats: profileStats(sessions),
    });
  } catch (e) {
    if (tableMissing(e))
      return NextResponse.json({ profile: null, suggestedHandle: suggestHandle(me.email || me.id), unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: b, error } = await readJsonLimited<{
    handle?: unknown; displayName?: unknown; bio?: unknown; avatarUrl?: unknown; visibility?: unknown; showcase?: unknown;
  }>(request, 32 * 1024);
  if (error) return error;

  const handle = typeof b.handle === "string" ? normalizeHandle(b.handle) : "";
  if (!handle || !isValidHandle(handle))
    return NextResponse.json({ error: "Handle must be 3–20 chars: a–z, 0–9, _" }, { status: 400 });

  // A missing/invalid visibility NEVER rewrites a stored choice — the update
  // simply leaves the column alone. Only a brand-new profile falls back to the
  // app's default, PUBLIC (every workout publishes to the feed automatically;
  // the athlete opts DOWN to followers-only or private).
  const visibility =
    b.visibility === "public" || b.visibility === "private" || b.visibility === "followers"
      ? b.visibility
      : undefined;
  const data = {
    handle,
    displayName: typeof b.displayName === "string" ? b.displayName.trim().slice(0, 60) || null : null,
    bio: typeof b.bio === "string" ? b.bio.trim().slice(0, 280) || null : null,
    avatarUrl: typeof b.avatarUrl === "string" ? b.avatarUrl.trim().slice(0, 500) || null : null,
    showcase: (b.showcase && typeof b.showcase === "object" ? b.showcase : {}) as object,
  };

  try {
    const profile = await prisma.socialProfile.upsert({
      where: { userId: me.id },
      update: { ...data, ...(visibility ? { visibility } : {}) },
      create: { userId: me.id, ...data, visibility: visibility ?? "public" },
    });
    return NextResponse.json({ profile });
  } catch (e) {
    if (tableMissing(e))
      return NextResponse.json({ error: "Social isn't enabled yet — run reference/sql-social.sql." }, { status: 503 });
    if (e instanceof Object && (e as { code?: string }).code === "P2002")
      return NextResponse.json({ error: "That handle is taken." }, { status: 409 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
