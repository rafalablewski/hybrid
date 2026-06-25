import { NextResponse } from "next/server";
import { bestE1rmByLift } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited, rateLimit } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { tableMissing, allSessionsFor } from "@/lib/social";

// Create a first-class feed post: a status update, or — with attachPr — a card
// of the author's current best lift ("shared a PR"). Goes out to followers'
// feeds. Soft-degrades until reference/sql-social.sql has been run.

export async function POST(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = await rateLimit(request, { key: "social-post", limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const { data: b, error } = await readJsonLimited<{ text?: unknown; attachPr?: unknown }>(request);
  if (error) return error;
  const text = typeof b.text === "string" ? b.text.trim().slice(0, 500) : "";

  try {
    let kind = "status";
    let data: object = {};
    if (b.attachPr === true) {
      const best = bestE1rmByLift(await allSessionsFor(me.id))[0];
      if (best) { kind = "pr"; data = { lift: best.lift, e1rm: best.e1rm }; }
    }
    if (kind === "status" && !text) return NextResponse.json({ error: "Write something to share." }, { status: 400 });

    const post = await prisma.post.create({ data: { authorId: me.id, kind, text: text || null, data } });
    return NextResponse.json({ post }, { status: 201 });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ error: "Posts aren't enabled yet — run reference/sql-social.sql." }, { status: 503 });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
