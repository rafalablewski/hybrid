import { NextResponse } from "next/server";
import { buildSocialNotifications, type SocialNotifEvent } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { tableMissing, authorCards, blockedIdsFor } from "@/lib/social";

// Social + coaching events addressed to me: new followers, follow requests,
// kudos/comments on my items, enrolment requests (as a coach) and enrolment
// status changes (as a client). Formatted by buildSocialNotifications.

const WINDOW = 30 * 86_400_000; // 30 days

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const since = new Date(Date.now() - WINDOW);

  try {
    const [followers, requests, kudos, comments, enrollReqs, myEnrolls] = await Promise.all([
      prisma.follow.findMany({ where: { followeeId: me.id, status: "active", createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.follow.findMany({ where: { followeeId: me.id, status: "pending" }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.kudos.findMany({ where: { ownerId: me.id, userId: { not: me.id }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.comment.findMany({ where: { ownerId: me.id, userId: { not: me.id }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.programEnrollment.findMany({ where: { coachId: me.id, status: "requested" }, orderBy: { createdAt: "desc" }, take: 30, include: { program: { select: { name: true } } } }),
      prisma.programEnrollment.findMany({ where: { clientId: me.id, status: { in: ["active", "declined"] }, startedAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 30, include: { program: { select: { name: true } } } }),
    ]);

    // Resolve actor cards for everyone referenced.
    const ids = new Set<string>();
    followers.forEach((f) => ids.add(f.followerId));
    requests.forEach((f) => ids.add(f.followerId));
    kudos.forEach((k) => ids.add(k.userId));
    comments.forEach((c) => ids.add(c.userId));
    enrollReqs.forEach((e) => ids.add(e.clientId));
    myEnrolls.forEach((e) => ids.add(e.coachId));
    const cards = await authorCards([...ids]);
    // Mutual-invisibility: drop any event whose actor I've blocked or who has
    // blocked me, so a blocked user never surfaces in my notifications.
    const blocked = await blockedIdsFor(me.id);

    const events: SocialNotifEvent[] = [
      ...followers.filter((f) => !blocked.has(f.followerId)).map((f): SocialNotifEvent => ({ kind: "follow", at: f.createdAt.getTime(), actor: cards.get(f.followerId), handle: cards.get(f.followerId)?.handle })),
      ...requests.filter((f) => !blocked.has(f.followerId)).map((f): SocialNotifEvent => ({ kind: "follow_request", at: f.createdAt.getTime(), actor: cards.get(f.followerId), handle: cards.get(f.followerId)?.handle, followerId: f.followerId })),
      ...kudos.filter((k) => !blocked.has(k.userId)).map((k): SocialNotifEvent => ({ kind: "kudos", at: k.createdAt.getTime(), actor: cards.get(k.userId), handle: cards.get(k.userId)?.handle, text: k.subjectType === "pr" ? "PR" : "workout" })),
      ...comments.filter((c) => !blocked.has(c.userId)).map((c): SocialNotifEvent => ({ kind: "comment", at: c.createdAt.getTime(), actor: cards.get(c.userId), handle: cards.get(c.userId)?.handle, text: c.body })),
      ...enrollReqs.filter((e) => !blocked.has(e.clientId)).map((e): SocialNotifEvent => ({ kind: "enroll_request", at: e.createdAt.getTime(), actor: cards.get(e.clientId), handle: cards.get(e.clientId)?.handle, text: e.program.name, enrollmentId: e.id })),
      ...myEnrolls.filter((e) => !blocked.has(e.coachId)).map((e): SocialNotifEvent => ({ kind: e.status === "active" ? "enroll_active" : "enroll_declined", at: (e.startedAt ?? e.createdAt).getTime(), actor: cards.get(e.coachId), handle: cards.get(e.coachId)?.handle, text: e.program.name })),
    ];

    const notifications = buildSocialNotifications(events);
    const unread = notifications.filter((n) => n.actionable).length;
    return NextResponse.json({ notifications, unread });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ notifications: [], unread: 0, unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
