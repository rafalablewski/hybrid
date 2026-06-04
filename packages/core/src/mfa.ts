/**
 * MFA (TOTP) helpers — pure decision/validation logic shared by the login
 * step-up and the enrollment UI. The actual crypto + challenge lives in
 * Supabase Auth; this is the small, deterministic glue we want unit-tested.
 */

// Supabase reports the assurance level as an open string ("aal1" | "aal2" | …);
// the helpers only compare it, so accept any string.
export type Aal = string | null | undefined;

export interface MfaFactorLike {
  status: string; // "verified" | "unverified"
  factor_type?: string;
}

/** True once the user has at least one *verified* second factor. */
export function mfaEnrolled(factors: MfaFactorLike[] | null | undefined): boolean {
  return Boolean(factors?.some((f) => f.status === "verified"));
}

/** Supabase reports the session's current assurance level and the level it
 *  *could* reach. A gap means a verified factor exists but hasn't been
 *  satisfied this session — i.e. a step-up challenge is required. */
export function stepUpRequired(currentLevel: Aal, nextLevel: Aal): boolean {
  return Boolean(currentLevel && nextLevel && currentLevel !== nextLevel);
}

/** A TOTP code is exactly six digits. Validate before spending a challenge. */
export function isValidTotpCode(code: unknown): boolean {
  return typeof code === "string" && /^\d{6}$/.test(code.trim());
}
