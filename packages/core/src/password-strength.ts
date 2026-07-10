// Shared password-strength scoring — one source of truth so the web and mobile
// "Password & security" screens render the SAME meter (parity). Deliberately
// dependency-free and heuristic (length + character-class variety + a small
// penalty for obvious patterns); it's a UX hint, not a security control.

export type PasswordStrengthLabel = "weak" | "fair" | "good" | "strong";

export interface PasswordStrength {
  /** 0–4, drives the meter fill (0 = empty/too short). */
  score: 0 | 1 | 2 | 3 | 4;
  /** i18n key suffix — `w.account.settings.pw-strength-${label}`. */
  label: PasswordStrengthLabel;
  /** Whether it clears the app's minimum (8 chars) so callers can gate Save. */
  meetsMinimum: boolean;
}

const COMMON = /^(?:password|passwort|haslo|hasło|qwerty|12345678|letmein|admin\d*|welcome)\b/i;

export function passwordStrength(pw: string): PasswordStrength {
  const value = pw ?? "";
  const len = value.length;
  const meetsMinimum = len >= 8;

  if (len === 0) return { score: 0, label: "weak", meetsMinimum: false };

  // Character-class variety (0–4).
  let classes = 0;
  if (/[a-z]/.test(value)) classes++;
  if (/[A-Z]/.test(value)) classes++;
  if (/[0-9]/.test(value)) classes++;
  if (/[^A-Za-z0-9]/.test(value)) classes++;

  // Raw points from length milestones + variety.
  let points = 0;
  if (len >= 8) points++;
  if (len >= 12) points++;
  if (len >= 16) points++;
  points += Math.max(0, classes - 1); // one class is table stakes

  // Penalise the obvious.
  if (COMMON.test(value)) points = Math.min(points, 1);
  if (/^(.)\1+$/.test(value)) points = Math.min(points, 1); // all one repeated char

  // Below the minimum can never read above "weak".
  if (!meetsMinimum) return { score: 1, label: "weak", meetsMinimum: false };

  const score = (Math.max(1, Math.min(4, points)) as 1 | 2 | 3 | 4);
  const label: PasswordStrengthLabel = score <= 1 ? "weak" : score === 2 ? "fair" : score === 3 ? "good" : "strong";
  return { score, label, meetsMinimum: true };
}
