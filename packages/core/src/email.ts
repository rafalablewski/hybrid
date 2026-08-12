/**
 * Email — the shared, PURE pieces of HYBRID's transactional email (the I/O lives
 * in the web backend's lib/email.ts; the provider keys + Prisma stay server-side).
 *
 * Scope note (2026-08 strategy cuts): the marketing-automation platform —
 * audience segments, lifecycle triggers, campaigns, sequences, enrollment and
 * the suppression list — was REMOVED. HYBRID sends transactional mail only
 * (account verification, coach invites); when lifecycle mail is wanted again it
 * gets bought (Customer.io / Loops / Resend Broadcasts), not rebuilt. What is
 * left here is the {{merge}}-tag renderer both sides share.
 */

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
