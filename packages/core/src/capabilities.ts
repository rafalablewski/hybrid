/**
 * Capabilities registry — the single source of truth for everything HYBRID can
 * (and can't yet) do. Surfaced in the web admin "Capabilities" screen.
 *
 * KEEP THIS CURRENT: whenever a feature ships, gets blocked, or is planned,
 * update this file in the same change (see CLAUDE.md).
 */

export type CapabilityStatus = "shipped" | "blocked" | "planned";

export type CapabilityArea =
  | "Core"
  | "Web"
  | "Mobile"
  | "Backend"
  | "Auth"
  | "Data"
  | "AI"
  | "Integrations";

export interface Capability {
  id: string;
  area: CapabilityArea;
  title: string;
  detail: string;
  status: CapabilityStatus;
  /** For `blocked` items: what's needed to unblock it. */
  blockedBy?: string;
}

export const CAPABILITIES: Capability[] = [
  // ---- Core (shared) ----
  { id: "monorepo", area: "Core", status: "shipped", title: "Monorepo + shared core", detail: "Turborepo/pnpm workspace; engines, types, plan library, sport engine, session helpers and brand tokens written once in @hybrid/core and consumed by web + mobile." },
  { id: "engines", area: "Core", status: "shipped", title: "Training engines", detail: "Fatigue (decay), readiness (+ biometric adjustment), per-lift progression signal, periodization (macrocycle/microcycles), and the prescription engine. Pure, unit-tested." },
  { id: "plans-lib", area: "Core", status: "shipped", title: "Plan library", detail: "Goal-first plan tree (Bodybuilding/Hyrox/Triathlon/Hybrid/Powerlifting) with full plan detail (split, sample session, progression)." },
  { id: "sport-engine", area: "Core", status: "shipped", title: "Sport S&C engine", detail: "Per-sport demands + exercise pools; prescribeForSport ranks the strength & conditioning that transfers, by level." },

  // ---- Web ----
  { id: "web-deploy", area: "Web", status: "shipped", title: "Web app on Vercel", detail: "Next.js App Router, auto-deploys from main. Landing + login + authenticated app shell." },
  { id: "web-dashboards", area: "Web", status: "shipped", title: "Analytics dashboards", detail: "Client/Coach/Admin scopes. Client dashboard computes from real logged sessions (volume, e1RM trend, PRs); Coach/Admin still sample data." },
  { id: "web-logger", area: "Web", status: "shipped", title: "Session logger + history", detail: "Engine-prescribed or manual sessions saved to the DB; History lists real sessions." },
  { id: "web-plans-sport", area: "Web", status: "shipped", title: "Plans + Sport screens", detail: "Render the shared plan library and sport engine." },
  { id: "web-periodize", area: "Web", status: "shipped", title: "Periodize", detail: "Renders a real macrocycle (phase timeline + load/recovery microcycles)." },

  // ---- Mobile ----
  { id: "mobile-app", area: "Mobile", status: "shipped", title: "Native app (code)", detail: "Expo app: Supabase auth + tab navigator (Home/Plans/Sport/Log/History) on the same core and the same /api backend. iOS bundle verified." },
  { id: "mobile-preview", area: "Mobile", status: "blocked", title: "On-device preview / App Store", detail: "Can't install on the iPhone until an EAS build is produced.", blockedBy: "Apple Developer Program ($99), an Expo account token, and EXPO_PUBLIC_SUPABASE_ANON_KEY for the build." },

  // ---- Auth ----
  { id: "auth-email", area: "Auth", status: "shipped", title: "Email auth + roles", detail: "Supabase email sign-up/in on web + mobile. Role model CLIENT/COACH/ADMIN; admin can toggle all dashboards." },
  { id: "auth-social", area: "Auth", status: "blocked", title: "Apple + Google sign-in", detail: "Code paths exist (buttons + OAuth callback).", blockedBy: "Enable providers in Supabase: Google Cloud OAuth client; Apple needs the Apple Developer Program + Services ID." },

  // ---- Backend / Data ----
  { id: "db", area: "Data", status: "shipped", title: "Database (Prisma + Supabase)", detail: "7 tables (User, CoachLink, CoachNote, Session, Macrocycle, Biometric, Plan) with RLS enabled." },
  { id: "api", area: "Backend", status: "shipped", title: "Shared API", detail: "/api/me + /api/sessions, scoped to the user, accept both web cookies and mobile Bearer tokens — one backend, both clients." },
  { id: "rls-policies", area: "Backend", status: "planned", title: "Row-level security policies", detail: "Tables have RLS on but no per-row policies yet; enforcement is in API code. Add Supabase policies for the coach/client/admin rules." },

  // ---- AI / Integrations ----
  { id: "ai-coach", area: "AI", status: "blocked", title: "AI coach (server-side Anthropic)", detail: "The rules-based prescription engine is live; the LLM coach is not wired.", blockedBy: "ANTHROPIC_API_KEY set server-side (never called from a client)." },
  { id: "wearables", area: "Integrations", status: "planned", title: "Wearables (HealthKit / WHOOP)", detail: "Readiness already accepts biometrics; no device sync yet. HealthKit (native) + WHOOP OAuth feed real HRV/sleep into readiness." },

  // ---- Planned features ----
  { id: "coach-layer", area: "Web", status: "shipped", title: "Coach layer", detail: "CoachLink mutual-consent invites (accept/decline), roster, per-client sessions, and coaching notes incl. private (never shown to the client). Coach analytics dashboard computes from the real roster. Authorized by the relationship in the API. Web done; mobile coach screen pending." },
  { id: "plans-enroll", area: "Backend", status: "shipped", title: "Plan enrollment", detail: "Enrolling in a plan builds a macrocycle from the engine and persists it (POST /api/macrocycles); Periodize renders your enrolled season. Web done; mobile enroll pending." },
  { id: "i18n", area: "Core", status: "shipped", title: "Localization (EN/PL/DE)", detail: "i18n module in core + web language switcher (persisted); navigation + common labels translated. Screen content translated incrementally; mobile switcher pending." },
];

export function capabilitiesByStatus(status: CapabilityStatus): Capability[] {
  return CAPABILITIES.filter((c) => c.status === status);
}
