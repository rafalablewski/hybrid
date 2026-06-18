/**
 * Feature flags — runtime toggles for app capabilities WITHOUT a redeploy.
 *
 * Same shape as the rest of the CMS: the KNOWN flags + their defaults live here
 * in code (so the app works with an empty DB, and only a flag that code actually
 * reads can gate anything), while the admin console stores sparse OVERRIDES
 * (enabled / audience / value) in the DB, layered over these defaults. Pure +
 * unit-tested; evaluated per request against the caller's role.
 */

export type FlagAudience = "all" | "coaches" | "clients" | "admins";

export interface FeatureFlagDef {
  key: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
  /** Who the flag applies to when on (default "all"). */
  audience?: FlagAudience;
}

/** A sparse, admin-authored override of a flag (only the fields it changes). */
export interface FlagOverride {
  enabled?: boolean;
  audience?: string;
  value?: unknown;
}

/** The registry of every flag the app understands. Add a flag here, then gate
 *  code on it with useFlags()/the /api/flags read. Keep keys dotted + stable. */
export const FEATURE_FLAGS: FeatureFlagDef[] = [
  { key: "app.announcements", label: "In-app announcements", description: "Show the admin-authored announcement banner at the top of the app.", defaultEnabled: true },
  { key: "access.personaNav", label: "Persona nav access", description: "Admin override of which persona can see each nav item. Its value is a { navId: minPersona } map layered over the code defaults — lower a feature's minimum persona to expose it to more users (e.g. give Velocity/Analytics to a casual user).", defaultEnabled: true },
  { key: "nav.nutrition", label: "Nutrition screen", description: "Expose the Nutrition feature in the app navigation.", defaultEnabled: true },
  { key: "nav.talent", label: "Talent graph", description: "Expose the Talent (benchmarks/discovery) screen.", defaultEnabled: true },
  { key: "nav.longevity", label: "Longevity screen", description: "Expose the performance-medicine / longevity screen.", defaultEnabled: true },
  { key: "nav.tactical", label: "Tactical readiness", description: "Expose the tactical / SOF readiness screen.", defaultEnabled: true },
  { key: "coach.groups", label: "Coach client groups", description: "Let coaches bundle clients into groups and assign a plan to a whole group at once (Coach Pro). Off hides the Client groups section.", defaultEnabled: true, audience: "coaches" },
  { key: "coach.programs", label: "Coach program builder", description: "Let coaches author multi-week programs and assign them to a client or group as scheduled sessions. Off hides the Programs section.", defaultEnabled: true, audience: "coaches" },
];

/** Does a flag's audience include this role? Admins always match (god view). */
export function flagAudienceMatches(audience: string, role: string): boolean {
  const r = (role || "").toUpperCase();
  if (r === "ADMIN") return true;
  switch (audience) {
    case "coaches":
      return r === "COACH";
    case "clients":
      return r === "CLIENT";
    case "admins":
      return false; // admins already returned true above
    case "all":
    default:
      return true;
  }
}

/** Effective on/off for one flag, given its override + the caller's role. */
export function evaluateFlag(def: FeatureFlagDef, override: FlagOverride | undefined, role: string): boolean {
  const enabled = override?.enabled ?? def.defaultEnabled;
  if (!enabled) return false;
  const audience = override?.audience ?? def.audience ?? "all";
  return flagAudienceMatches(audience, role);
}

/** Evaluate the whole registry into a `key → boolean` map for a role. */
export function evaluateFlags(
  defs: FeatureFlagDef[],
  overrides: Record<string, FlagOverride>,
  role: string,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const def of defs) out[def.key] = evaluateFlag(def, overrides[def.key], role);
  return out;
}

/** Config values for flags that carry a payload (only included when the flag is
 *  effectively ON for the role). */
export function flagValues(
  defs: FeatureFlagDef[],
  overrides: Record<string, FlagOverride>,
  role: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const def of defs) {
    const o = overrides[def.key];
    if (o?.value !== undefined && evaluateFlag(def, o, role)) out[def.key] = o.value;
  }
  return out;
}
