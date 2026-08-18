import { renderMergeTags, greetingName, type MergeVars } from "@hybrid/core";
import { prisma } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Email — the I/O layer. The PURE piece (merge tags) lives in
 * @hybrid/core/email; this file talks to Resend and the EmailMessage ledger.
 *
 * TRANSACTIONAL ONLY (2026-08 strategy cuts). The marketing-automation platform
 * — campaigns, sequences, enrollment, audience segments and the suppression
 * list — was removed: building Customer.io was never the work. What remains is
 * the mail HYBRID must send to function (account verification, coach invites).
 * If lifecycle mail is wanted later it gets bought, not rebuilt.
 *
 * Provider-agnostic by design: we call the Resend HTTP API directly with fetch
 * (no SDK dependency). EVERYTHING degrades gracefully — with no RESEND_API_KEY
 * each send is a recorded no-op ("not configured"), never a crash, mirroring the
 * billing module.
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

// ---------------------------------------------------------------------------
// HTML rendering — a minimal, brand-consistent shell around the body text. No
// unsubscribe footer: transactional mail is not marketing, and there is no
// marketing path left to opt out of.
// ---------------------------------------------------------------------------

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function renderHtml(subject: string, bodyText: string): string {
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6;">${esc(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#0c0d0c;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#141614;border:1px solid #2a2c2a;border-radius:16px;padding:32px;font-family:Arial,Helvetica,sans-serif;color:#e9e9e9;">
      <div style="font-weight:800;font-size:20px;letter-spacing:-0.02em;margin-bottom:20px;">HYBRID<span style="color:#c3d363;">.</span></div>
      <h1 style="font-size:20px;margin:0 0 16px;color:#ffffff;">${esc(subject)}</h1>
      ${paragraphs}
    </div>
  </body></html>`;
}

// ---------------------------------------------------------------------------
// The single send primitive. Renders merge tags, calls Resend, and ALWAYS lands
// an EmailMessage row (the deliverability ledger).
// ---------------------------------------------------------------------------

export type SendInput = {
  to: string;
  subject: string;
  body: string;
  kind: "transactional" | "verification";
  vars?: MergeVars;
  userId?: string | null;
};

export type SendResult = { ok: boolean; id?: string; error?: string; skipped?: "unconfigured" };

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
      },
    });
  } catch {
    /* ledger table not migrated yet — never block the send on logging */
  }
}

export async function sendEmail(input: SendInput): Promise<SendResult> {
  const vars: MergeVars = { name: greetingName(null, input.to), email: input.to, ...input.vars };
  const subject = renderMergeTags(input.subject, vars);
  const bodyText = renderMergeTags(input.body, vars);

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
        html: renderHtml(subject, bodyText),
        text: bodyText,
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
    vars: { name: greetingName(user.name, user.email) },
  });
}
