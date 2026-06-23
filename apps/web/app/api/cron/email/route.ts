import { NextResponse } from "next/server";
import { orderSteps, advanceEnrollment, greetingName, INACTIVE_TRIGGER_DAYS } from "@hybrid/core";
import { prisma } from "@/lib/db";
import { sendEmail, sendCampaign, emailConfigured, enrollInTrigger } from "@/lib/email";
import { verifyBearerSecret } from "@/lib/crypto";

// Email worker. Hit by Vercel Cron (see apps/web/vercel.json) — NOT admin-gated;
// authenticated by CRON_SECRET (Bearer). Each run, bounded for cost/latency:
//   1. sends any scheduled campaign that's now due,
//   2. advances every sequence enrollment whose next step is due,
//   3. enrolls newly-dormant users into active `inactive` win-back sequences.
// Everything degrades: no email config → reports a reason instead of throwing.
const MAX_CAMPAIGNS = 3;
const MAX_STEPS = 200;
const MAX_NEW_INACTIVE = 200;

// Give the worker headroom (60s is the safe ceiling across Vercel plans, incl.
// Hobby; per-run work is bounded by the MAX_* caps above).
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  if (!verifyBearerSecret(request.headers.get("authorization"), secret))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!emailConfigured()) return NextResponse.json({ ran: 0, reason: "email not configured (RESEND_API_KEY/EMAIL_FROM)" });

  const now = new Date();
  const result = { campaigns: 0, steps: 0, completed: 0, enrolledInactive: 0 };

  // --- 1. Due scheduled campaigns -----------------------------------------
  try {
    const dueCampaigns = await prisma.emailCampaign.findMany({
      where: { status: "scheduled", scheduledAt: { lte: now } },
      orderBy: { scheduledAt: "asc" },
      take: MAX_CAMPAIGNS,
    });
    for (const c of dueCampaigns) {
      await prisma.emailCampaign.update({ where: { id: c.id }, data: { status: "sending" } });
      try {
        const { sent, failed } = await sendCampaign(c);
        await prisma.emailCampaign.update({
          where: { id: c.id },
          data: { status: failed > 0 && sent === 0 ? "failed" : "sent", sentAt: new Date(), sentCount: sent, failedCount: failed },
        });
        result.campaigns++;
      } catch (e) {
        console.error("[cron email] campaign send failed", c.id, e);
        await prisma.emailCampaign.update({ where: { id: c.id }, data: { status: "failed" } });
      }
    }
  } catch {
    return NextResponse.json({ ran: 0, reason: "email tables missing" });
  }

  // --- 2. Due sequence steps ----------------------------------------------
  try {
    const dueEnrollments = await prisma.emailEnrollment.findMany({
      where: { status: "active", nextSendAt: { lte: now } },
      orderBy: { nextSendAt: "asc" },
      take: MAX_STEPS,
      include: { sequence: { include: { steps: true } } },
    });
    // Batch-fetch the recipients once (avoid an N+1 user lookup per enrollment).
    const dueUsers = await prisma.user.findMany({
      where: { id: { in: dueEnrollments.map((en) => en.userId) } },
      select: { id: true, name: true, email: true },
    });
    const userById = new Map(dueUsers.map((u) => [u.id, u]));
    for (const en of dueEnrollments) {
      const seq = en.sequence;
      // A deactivated sequence pauses its enrollments (don't keep sending).
      if (!seq.active) {
        await prisma.emailEnrollment.update({ where: { id: en.id }, data: { nextSendAt: null } });
        continue;
      }
      const ordered = orderSteps(seq.steps);
      const step = ordered[en.currentStep];
      if (!step) {
        await prisma.emailEnrollment.update({ where: { id: en.id }, data: { status: "completed", nextSendAt: null } });
        result.completed++;
        continue;
      }
      const user = userById.get(en.userId);
      await sendEmail({
        to: en.email,
        subject: step.subject,
        body: step.body,
        kind: "sequence",
        sequenceId: seq.id,
        userId: en.userId,
        marketing: true,
        vars: { name: greetingName(user?.name ?? null, en.email) },
      });
      const adv = advanceEnrollment(en.currentStep, ordered, Date.now());
      await prisma.emailEnrollment.update({
        where: { id: en.id },
        data: adv.done
          ? { status: "completed", currentStep: adv.nextStep, nextSendAt: null }
          : { currentStep: adv.nextStep, nextSendAt: adv.nextSendAtMs ? new Date(adv.nextSendAtMs) : null },
      });
      result.steps++;
      if (adv.done) result.completed++;
    }
  } catch (e) {
    console.error("[cron email] sequence processing failed", e);
  }

  // --- 3. Enroll newly-dormant users into win-back sequences --------------
  try {
    const inactiveSeqs = await prisma.emailSequence.findMany({
      where: { trigger: "inactive", active: true },
      select: { id: true },
    });
    if (inactiveSeqs.length > 0) {
      // EXCLUDE users already enrolled in an inactive sequence — otherwise the
      // bounded scan would re-fetch the same first N dormant users every run
      // (the unique guard blocks the duplicate insert, but the cron would never
      // progress to the rest), starving everyone past the first page.
      const enrolled = await prisma.emailEnrollment.findMany({
        where: { sequenceId: { in: inactiveSeqs.map((s) => s.id) } },
        select: { userId: true },
      });
      const cutoff = new Date(now.getTime() - INACTIVE_TRIGGER_DAYS * 86_400_000);
      // Users whose most recent session predates the cutoff (or who have none),
      // not already enrolled. Bounded scan.
      const candidates = await prisma.user.findMany({
        where: {
          email: { not: "" },
          id: { notIn: enrolled.map((e) => e.userId) },
          sessions: { none: { startedAt: { gte: cutoff } } },
          createdAt: { lte: cutoff },
        },
        select: { id: true, email: true, role: true, entitlement: true },
        take: MAX_NEW_INACTIVE,
      });
      for (const u of candidates) {
        result.enrolledInactive += await enrollInTrigger("inactive", u);
      }
    }
  } catch (e) {
    console.error("[cron email] inactive enrollment failed", e);
  }

  return NextResponse.json({ ran: result.steps + result.campaigns, ...result });
}
