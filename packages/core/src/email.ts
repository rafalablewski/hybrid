/**
 * Email — the shared, PURE pieces of HYBRID's email system (the I/O lives in the
 * web backend's lib/email.ts; the provider keys + Prisma stay server-side).
 *
 * Here: the audience-segment + lifecycle-trigger vocabularies (so web admin UI,
 * the API and the cron worker can't drift), the {{merge}}-tag renderer, and the
 * sequence scheduling math. All unit-tested.
 */

// ---------------------------------------------------------------------------
// Audience segments — who a campaign / sequence targets.
// ---------------------------------------------------------------------------

export type EmailAudience = "all" | "free" | "paid" | "coaches" | "clients" | "admins";

export const EMAIL_AUDIENCES: { id: EmailAudience; label: string; help: string }[] = [
  { id: "all", label: "Everyone", help: "Every account with a usable email." },
  { id: "free", label: "Free plan", help: "Accounts on the free entitlement — upgrade targets." },
  { id: "paid", label: "Premium", help: "Paid (Full) subscribers." },
  { id: "coaches", label: "Coaches", help: "Accounts with the COACH role." },
  { id: "clients", label: "Clients", help: "Accounts with the CLIENT role." },
  { id: "admins", label: "Admins", help: "Operators (ADMIN role)." },
];

export function isEmailAudience(v: unknown): v is EmailAudience {
  return typeof v === "string" && EMAIL_AUDIENCES.some((a) => a.id === v);
}

/** The minimal user shape audience-matching needs (kept tiny + serialisable). */
export type AudienceUser = {
  role: "CLIENT" | "COACH" | "ADMIN";
  entitlement: string; // "free" | "paid"
};

/** Whether a user falls inside an audience segment (pure — server builds the
 *  equivalent Prisma `where` for the actual query, this mirrors it for tests
 *  and any client-side preview). */
export function matchesAudience(user: AudienceUser, audience: EmailAudience): boolean {
  switch (audience) {
    case "all":
      return true;
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
  }
}

// ---------------------------------------------------------------------------
// Lifecycle triggers — what enrolls a user into an automated sequence.
// ---------------------------------------------------------------------------

export type EmailTrigger =
  | "signup" // just created an account → welcome series
  | "inactive" // no training for a while → win-back
  | "trial_ending" // trial about to lapse → convert nudge
  | "upgraded" // moved to paid → onboarding for premium
  | "coach_approved" // coach application approved → coach welcome
  | "manual"; // enrolled by hand from the admin console

export const EMAIL_TRIGGERS: { id: EmailTrigger; label: string; help: string }[] = [
  { id: "signup", label: "On signup", help: "Fires once when a new account is created (welcome series)." },
  { id: "inactive", label: "Inactive winback", help: "Fires when an account has had no sessions for the dormancy window." },
  { id: "trial_ending", label: "Trial ending", help: "Fires as a free-trial nears its end (conversion nudge)." },
  { id: "upgraded", label: "On upgrade", help: "Fires when an account moves to the paid entitlement." },
  { id: "coach_approved", label: "Coach approved", help: "Fires when a coach application is approved." },
  { id: "manual", label: "Manual only", help: "Never auto-enrolls — admins add people by hand." },
];

export function isEmailTrigger(v: unknown): v is EmailTrigger {
  return typeof v === "string" && EMAIL_TRIGGERS.some((t) => t.id === v);
}

/** Days of dormancy before the `inactive` trigger enrolls someone. */
export const INACTIVE_TRIGGER_DAYS = 21;

// ---------------------------------------------------------------------------
// Merge-tag rendering — {{name}} / {{email}} substitution.
// ---------------------------------------------------------------------------

export type MergeVars = Record<string, string | null | undefined>;

/** Replace `{{key}}` tokens with their value. Unknown / empty tokens collapse to
 *  the empty string (never leave a raw {{tag}} in a sent email). Whitespace
 *  inside the braces is tolerated: `{{ name }}`. */
export function renderMergeTags(template: string, vars: MergeVars): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

/** A friendly first name from a (possibly null) name + email — for {{name}}. */
export function greetingName(name: string | null | undefined, email: string): string {
  const n = (name ?? "").trim();
  if (n) return n.split(/\s+/)[0]!;
  const local = email.split("@")[0] ?? "";
  return local || "there";
}

// ---------------------------------------------------------------------------
// Sequence scheduling — when the cron should send the next step.
// ---------------------------------------------------------------------------

export type SequenceStepLite = { order: number; delayHours: number };

/** Order steps deterministically (by `order`, then stable). */
export function orderSteps<T extends { order: number }>(steps: T[]): T[] {
  return [...steps].sort((a, b) => a.order - b.order);
}

/** The send time for a given step index, measured from `from` (enrollment time
 *  for step 0, otherwise the previous send). Returns ms epoch. Each step's delay
 *  is relative to the prior step, so total time is the cumulative sum. */
export function stepSendTime(fromMs: number, delayHours: number): number {
  return fromMs + Math.max(0, delayHours) * 3_600_000;
}

/** Given an enrollment's current step + when it should fire, is it due now? */
export function isStepDue(nextSendAt: Date | string | null | undefined, now: Date | number = Date.now()): boolean {
  if (!nextSendAt) return false;
  const t = typeof nextSendAt === "string" ? Date.parse(nextSendAt) : nextSendAt.getTime();
  const n = typeof now === "number" ? now : now.getTime();
  return Number.isFinite(t) && t <= n;
}

/** Compute the next enrollment state after sending `currentStep`. Returns the
 *  new step index, whether the sequence is now complete, and when the next step
 *  is due (null when complete). `steps` must be the ordered step list. */
export function advanceEnrollment(
  currentStep: number,
  steps: SequenceStepLite[],
  fromMs: number = Date.now(),
): { nextStep: number; done: boolean; nextSendAtMs: number | null } {
  const ordered = orderSteps(steps);
  const nextStep = currentStep + 1;
  if (nextStep >= ordered.length) return { nextStep, done: true, nextSendAtMs: null };
  const next = ordered[nextStep]!;
  return { nextStep, done: false, nextSendAtMs: stepSendTime(fromMs, next.delayHours) };
}

/** When the FIRST step of a freshly-enrolled sequence is due (step 0's delay
 *  from enrollment). Null when the sequence has no steps. */
export function firstSendTime(steps: SequenceStepLite[], enrolledAtMs: number = Date.now()): number | null {
  const ordered = orderSteps(steps);
  if (ordered.length === 0) return null;
  return stepSendTime(enrolledAtMs, ordered[0]!.delayHours);
}

export const EMAIL_CAMPAIGN_STATUSES = ["draft", "scheduled", "sending", "sent", "failed"] as const;
export type EmailCampaignStatus = (typeof EMAIL_CAMPAIGN_STATUSES)[number];
