import { isEmailAudience, isEmailTrigger, EMAIL_CAMPAIGN_STATUSES } from "@hybrid/core";

// Shared validation for the admin Email console routes. Mirrors the announcements
// `shared.ts` pattern: coerce + bound the input, return a clean subset or an error
// string. Server-only.

export type CampaignInput = {
  subject?: unknown;
  body?: unknown;
  audience?: unknown;
  status?: unknown;
  scheduledAt?: unknown;
};

export type CleanCampaign = {
  subject: string;
  body: string;
  audience: string;
  status: string;
  scheduledAt: Date | null;
};

export function parseCampaign(
  b: CampaignInput,
  requireCore: boolean,
): { ok: true; data: Partial<CleanCampaign> } | { ok: false; error: string } {
  const out: Partial<CleanCampaign> = {};

  if (b.subject !== undefined || requireCore) {
    const s = String(b.subject ?? "").trim();
    if (!s) return { ok: false, error: "Subject is required." };
    out.subject = s.slice(0, 300);
  }
  if (b.body !== undefined || requireCore) {
    const body = String(b.body ?? "").trim();
    if (!body) return { ok: false, error: "Body is required." };
    out.body = body.slice(0, 20_000);
  }
  if (b.audience !== undefined) {
    if (!isEmailAudience(b.audience)) return { ok: false, error: "Unknown audience." };
    out.audience = b.audience;
  } else if (requireCore) {
    out.audience = "all";
  }
  if (b.status !== undefined) {
    if (!EMAIL_CAMPAIGN_STATUSES.includes(b.status as (typeof EMAIL_CAMPAIGN_STATUSES)[number]))
      return { ok: false, error: "Unknown status." };
    // Sending/sent are server-driven transitions, not client-set.
    if (b.status === "sending" || b.status === "sent" || b.status === "failed")
      return { ok: false, error: "That status is set by the system, not directly." };
    out.status = b.status as string;
  }
  if (b.scheduledAt !== undefined) {
    if (b.scheduledAt === null || b.scheduledAt === "") {
      out.scheduledAt = null;
    } else {
      const d = new Date(String(b.scheduledAt));
      if (Number.isNaN(d.getTime())) return { ok: false, error: "Invalid scheduled date." };
      out.scheduledAt = d;
    }
  }

  return { ok: true, data: out };
}

export type SequenceStepInput = { delayHours?: unknown; subject?: unknown; body?: unknown };

export type CleanStep = { order: number; delayHours: number; subject: string; body: string };

export function parseSteps(steps: unknown): { ok: true; data: CleanStep[] } | { ok: false; error: string } {
  if (!Array.isArray(steps)) return { ok: false, error: "steps must be an array." };
  if (steps.length > 20) return { ok: false, error: "A sequence can have at most 20 steps." };
  const out: CleanStep[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i] as SequenceStepInput;
    const subject = String(s.subject ?? "").trim();
    const body = String(s.body ?? "").trim();
    if (!subject || !body) return { ok: false, error: `Step ${i + 1} needs a subject and body.` };
    const delayHours = Math.max(0, Math.min(24 * 365, Math.round(Number(s.delayHours ?? 0)) || 0));
    out.push({ order: i, delayHours, subject: subject.slice(0, 300), body: body.slice(0, 20_000) });
  }
  return { ok: true, data: out };
}

export function parseSequenceMeta(b: {
  name?: unknown;
  trigger?: unknown;
  audience?: unknown;
  active?: unknown;
}): { ok: true; data: { name?: string; trigger?: string; audience?: string; active?: boolean } } | { ok: false; error: string } {
  const out: { name?: string; trigger?: string; audience?: string; active?: boolean } = {};
  if (b.name !== undefined) {
    const n = String(b.name).trim();
    if (!n) return { ok: false, error: "Name is required." };
    out.name = n.slice(0, 160);
  }
  if (b.trigger !== undefined) {
    if (!isEmailTrigger(b.trigger)) return { ok: false, error: "Unknown trigger." };
    out.trigger = b.trigger;
  }
  if (b.audience !== undefined) {
    if (!isEmailAudience(b.audience)) return { ok: false, error: "Unknown audience." };
    out.audience = b.audience;
  }
  if (b.active !== undefined) out.active = Boolean(b.active);
  return { ok: true, data: out };
}
