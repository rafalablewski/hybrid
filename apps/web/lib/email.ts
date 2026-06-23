import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  renderMergeTags,
  greetingName,
  firstSendTime,
  type EmailAudience,
  type EmailTrigger,
  type MergeVars,
} from "@hybrid/core";
import { prisma } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Email — the I/O layer. The PURE pieces (segments, triggers, merge tags,
 * scheduling math) live in @hybrid/core/email; this file talks to Resend, the
 * suppression list and the EmailMessage ledger.
 *
 * Provider-agnostic by design: we call the Resend HTTP API directly with fetch
 * (no SDK dependency). EVERYTHING degrades gracefully — with no RESEND_API_KEY
 * each send is a recorded no-op ("not configured"), never a crash, mirroring the
 * billing module. So the admin console, campaigns and sequences all work end to
 * end the moment the key is set, with zero code change.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function emailStatus(): { configured: boolean; from: string | null } {
  return { configured: emailConfigured(), from: process.env.EMAIL_FROM ?? null };
}

const publicUrl = () =>
  process.env.EMAIL_PUBLIC_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "https://hybrid-web-rosy.vercel.app";

const unsubSecret = () =>
  process.env.EMAIL_UNSUBSCRIBE_SECRET ?? process.env.CRON_SECRET ?? "hybrid-email-unsub";

// ---------------------------------------------------------------------------
// One-click unsubscribe — an HMAC over the email so the link can't be forged
// and we never need to store a per-user token.
// ---------------------------------------------------------------------------

export function unsubscribeToken(email: string): string {
  return crypto.createHmac("sha256", unsubSecret()).update(email.toLowerCase()).digest("hex").slice(0, 32);
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = unsubscribeToken(email);
  // Constant-time compare to avoid leaking via timing.
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function unsubscribeUrl(email: string): string {
  const u = new URL("/api/email/unsubscribe", publicUrl());
  u.searchParams.set("e", email);
  u.searchParams.set("t", unsubscribeToken(email));
  return u.toString();
}

// ---------------------------------------------------------------------------
// Suppression — opted-out / bounced addresses are never marketed to again.
// ---------------------------------------------------------------------------

export async function isSuppressed(email: string): Promise<boolean> {
  try {
    return Boolean(await prisma.emailSuppression.findUnique({ where: { email: email.toLowerCase() } }));
  } catch (e) {
    const code = (e as { code?: string })?.code;
    // Table not migrated yet → fail OPEN (the feature isn't live, and nothing
    // sends without email configured anyway). But a transient/live DB error must
    // fail CLOSED: treat as suppressed and skip the send, so a blip never mails
    // someone who opted out (CAN-SPAM / GDPR exposure).
    if (code === "P2021" || code === "P2010") return false;
    console.error("[email] suppression check failed — failing closed (skipping send)", e);
    return true;
  }
}

export async function suppress(email: string, reason = "unsubscribe"): Promise<void> {
  try {
    await prisma.emailSuppression.upsert({
      where: { email: email.toLowerCase() },
      create: { email: email.toLowerCase(), reason },
      update: { reason },
    });
  } catch {
    /* table not migrated yet */
  }
}

// ---------------------------------------------------------------------------
// HTML rendering — a minimal, brand-consistent shell around the body text.
// ---------------------------------------------------------------------------

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function renderHtml(subject: string, bodyText: string, opts: { marketing: boolean; email: string }): string {
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6;">${esc(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  const footer = opts.marketing
    ? `<p style="margin:24px 0 0;font-size:12px;color:#8a8a8a;line-height:1.6;">
         You're receiving this because you have a HYBRID account.
         <a href="${unsubscribeUrl(opts.email)}" style="color:#8a8a8a;">Unsubscribe</a>.
       </p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#0c0d0c;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#141614;border:1px solid #2a2c2a;border-radius:16px;padding:32px;font-family:Arial,Helvetica,sans-serif;color:#e9e9e9;">
      <div style="font-weight:800;font-size:20px;letter-spacing:-0.02em;margin-bottom:20px;">HYBRID<span style="color:#c6f135;">.</span></div>
      <h1 style="font-size:20px;margin:0 0 16px;color:#ffffff;">${esc(subject)}</h1>
      ${paragraphs}
      ${footer}
    </div>
  </body></html>`;
}

// ---------------------------------------------------------------------------
// The single send primitive — used by transactional, campaign and sequence
// paths. Renders merge tags, honours suppression (marketing only), calls Resend,
// and ALWAYS lands an EmailMessage row (the deliverability ledger).
// ---------------------------------------------------------------------------

export type SendInput = {
  to: string;
  subject: string;
  body: string;
  kind: "campaign" | "sequence" | "transactional" | "verification";
  vars?: MergeVars;
  userId?: string | null;
  campaignId?: string | null;
  sequenceId?: string | null;
  /** Marketing mail respects the suppression list + carries an unsubscribe
   *  footer; transactional mail (verification, invites) does not. */
  marketing?: boolean;
};

export type SendResult = { ok: boolean; id?: string; error?: string; skipped?: "suppressed" | "unconfigured" };

async function logMessage(input: SendInput, status: string, providerId: string | null, error: string | null) {
  try {
    await prisma.emailMessage.create({
      data: {
        email: input.to.toLowerCase(),
        subject: input.subject.slice(0, 300),
        kind: input.kind,
        status,
        providerId: providerId ?? undefined,
        error: error ?? undefined,
        userId: input.userId ?? undefined,
        campaignId: input.campaignId ?? undefined,
        sequenceId: input.sequenceId ?? undefined,
      },
    });
  } catch {
    /* ledger table not migrated yet — never block the send on logging */
  }
}

export async function sendEmail(input: SendInput): Promise<SendResult> {
  const marketing = input.marketing ?? (input.kind !== "transactional" && input.kind !== "verification");
  const vars: MergeVars = { name: greetingName(null, input.to), email: input.to, ...input.vars };
  const subject = renderMergeTags(input.subject, vars);
  const bodyText = renderMergeTags(input.body, vars);

  if (marketing && (await isSuppressed(input.to))) {
    await logMessage({ ...input, subject }, "skipped", null, "suppressed");
    return { ok: false, skipped: "suppressed" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    await logMessage({ ...input, subject }, "skipped", null, "unconfigured");
    return { ok: false, skipped: "unconfigured", error: "Email not configured (set RESEND_API_KEY + EMAIL_FROM)." };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject,
        html: renderHtml(subject, bodyText, { marketing, email: input.to }),
        text: bodyText,
        ...(marketing ? { headers: { "List-Unsubscribe": `<${unsubscribeUrl(input.to)}>` } } : {}),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      await logMessage({ ...input, subject }, "failed", null, json.message ?? `HTTP ${res.status}`);
      return { ok: false, error: json.message ?? `Resend returned ${res.status}` };
    }
    await logMessage({ ...input, subject }, "sent", json.id ?? null, null);
    return { ok: true, id: json.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "send failed";
    await logMessage({ ...input, subject }, "failed", null, msg);
    return { ok: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Audience → Prisma query. The single source of truth for "who gets a campaign"
// (mirrors matchesAudience in core, for the actual DB select).
// ---------------------------------------------------------------------------

export function audienceWhere(audience: EmailAudience): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { email: { not: "" } };
  switch (audience) {
    case "free":
      return { ...base, entitlement: { not: "paid" } };
    case "paid":
      return { ...base, entitlement: "paid" };
    case "coaches":
      return { ...base, role: "COACH" };
    case "clients":
      return { ...base, role: "CLIENT" };
    case "admins":
      return { ...base, role: "ADMIN" };
    case "all":
    default:
      return base;
  }
}

/** Count the deliverable size of an audience (for the admin preview). */
export async function audienceSize(audience: EmailAudience): Promise<number> {
  return prisma.user.count({ where: audienceWhere(audience) });
}

// ---------------------------------------------------------------------------
// Campaign send — fan out to every user in the audience, in batches, logging
// each. Returns the tallies the caller persists onto the campaign row.
// ---------------------------------------------------------------------------

// Recipients processed per invocation. Bounds one cron tick / request to well
// under the serverless timeout; larger audiences resume on the next tick via the
// id cursor.
const CAMPAIGN_BATCH = 500;

/**
 * Send ONE batch of a campaign, resuming from its `sendCursor` (recipients are
 * processed in id order). Persists progress atomically — increments the tallies,
 * advances the cursor, flips to "sent" only when the final batch is done — and
 * always clears the lease so the next tick can pick up where this left off.
 * Returns `done: false` while more recipients remain.
 *
 * The whole-audience-in-one-pass version timed out (and lost progress) at scale;
 * this makes a 100k-recipient send a sequence of bounded, resumable batches.
 */
export async function sendCampaign(campaign: {
  id: string;
  subject: string;
  body: string;
  audience: string;
  sendCursor?: string | null;
}): Promise<{ sent: number; failed: number; done: boolean }> {
  const recipients = await prisma.user.findMany({
    where: {
      ...audienceWhere(campaign.audience as EmailAudience),
      email: { not: "" },
      id: { gt: campaign.sendCursor ?? "" },
    },
    select: { id: true, email: true, name: true },
    orderBy: { id: "asc" },
    take: CAMPAIGN_BATCH + 1, // one extra row tells us whether more remain
  });
  const done = recipients.length <= CAMPAIGN_BATCH;
  const batch = done ? recipients : recipients.slice(0, CAMPAIGN_BATCH);

  let sent = 0;
  let failed = 0;
  for (const r of batch) {
    if (!r.email) continue;
    const res = await sendEmail({
      to: r.email,
      subject: campaign.subject,
      body: campaign.body,
      kind: "campaign",
      campaignId: campaign.id,
      userId: r.id,
      marketing: true,
      vars: { name: greetingName(r.name, r.email) },
    });
    if (res.ok) sent++;
    else if (res.skipped !== "suppressed") failed++;
  }
  const cursor = batch.length ? batch[batch.length - 1]!.id : campaign.sendCursor ?? null;

  await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: {
      sentCount: { increment: sent },
      failedCount: { increment: failed },
      sendCursor: cursor,
      lockedUntil: null, // release the lease for the next batch / tick
      ...(done ? { status: "sent", sentAt: new Date() } : { status: "sending" }),
    },
  });

  return { sent, failed, done };
}

// ---------------------------------------------------------------------------
// Lifecycle automation — enroll a user into every active sequence whose trigger
// just fired (and whose audience they match). Best-effort + idempotent (the
// unique [sequenceId,userId] guard means a re-fire never double-enrolls).
// ---------------------------------------------------------------------------

export async function enrollInTrigger(
  trigger: EmailTrigger,
  user: { id: string; email: string; role: string; entitlement: string },
): Promise<number> {
  if (!user.email) return 0;
  let enrolled = 0;
  try {
    const sequences = await prisma.emailSequence.findMany({
      where: { trigger, active: true },
      include: { steps: true },
    });
    for (const seq of sequences) {
      if (!audienceMatch(seq.audience as EmailAudience, user)) continue;
      const firstMs = firstSendTime(seq.steps, Date.now());
      if (firstMs == null) continue; // sequence has no steps yet
      try {
        await prisma.emailEnrollment.create({
          data: {
            sequenceId: seq.id,
            userId: user.id,
            email: user.email.toLowerCase(),
            currentStep: 0,
            nextSendAt: new Date(firstMs),
          },
        });
        enrolled++;
      } catch {
        /* already enrolled (unique constraint) — fine */
      }
    }
  } catch {
    /* tables not migrated yet */
  }
  return enrolled;
}

function audienceMatch(audience: EmailAudience, user: { role: string; entitlement: string }): boolean {
  switch (audience) {
    case "free":
      return user.entitlement !== "paid";
    case "paid":
      return user.entitlement === "paid";
    case "coaches":
      return user.role === "COACH";
    case "clients":
      return user.role === "CLIENT";
    case "admins":
      return user.role === "ADMIN";
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// Account verification — generate a Supabase confirmation link and deliver it
// via Resend (so we control the look + don't depend on Supabase's mailer). Both
// sides degrade gracefully: no service-role key OR no Resend → recorded no-op.
// ---------------------------------------------------------------------------

export async function sendAccountVerification(user: {
  id: string;
  email: string;
  name: string | null;
}): Promise<SendResult> {
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, skipped: "unconfigured", error: "Set SUPABASE_SERVICE_ROLE_KEY to generate verification links." };
  }
  let link = `${publicUrl()}/login`;
  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.email });
    if (!error && data?.properties?.action_link) link = data.properties.action_link;
  } catch {
    /* fall back to the login URL */
  }
  return sendEmail({
    to: user.email,
    subject: "Verify your HYBRID account",
    body: `Hi {{name}},\n\nConfirm your email to finish setting up HYBRID:\n\n${link}\n\nIf you didn't create this account, you can ignore this email.`,
    kind: "verification",
    userId: user.id,
    marketing: false,
    vars: { name: greetingName(user.name, user.email) },
  });
}
