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
  { id: "signal-ontology", area: "Core", status: "shipped", title: "Signal ontology (Athlete Twin foundation)", detail: "Universal time-series in @hybrid/core: every measurement (HRV/RHR/sleep today; GPS load, force-plate, blood tomorrow) is one Signal shape from any source, with rolling baselines + oriented z-scores. A toBiometrics() adapter feeds the readiness engine unchanged. End-to-end loop live: Signal table (reference/sql-signal-table.sql) ← /api/signals (GET/POST, kind-validated) ← manual check-in writes it; dashboard reads it back via useSignals to drive the Twin. Pure + unit-tested." },
  { id: "hpi", area: "Core", status: "shipped", title: "HPI — Hybrid Performance Index", detail: "The headline 0..100 number that fuses strength + endurance + recovery (distinct from readiness, which is muscle-only). Reports its three pillars, its limiter, and a band; sport-weightable. Unit-tested and surfaced in the web dashboard Performance State card + the mobile Home." },

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
  { id: "rls-policies", area: "Backend", status: "shipped", title: "Row-level security policies", detail: "Applied in Supabase (reference/rls-policies.sql): own-rows for Session/Macrocycle/Biometric, coach read via ACTIVE CoachLink, private CoachNotes hidden from clients, Plan readable by signed-in users. Defense-in-depth atop the API-layer enforcement." },

  // ---- AI / Integrations ----
  { id: "ai-coach", area: "AI", status: "blocked", title: "AI coach (server-side Anthropic)", detail: "Wired: /api/ai-coach builds context from your real sessions + signal-derived recovery and grounds the note in the Athlete Twin — HPI + its limiting pillar, ranked state drivers, and tissue-level injury flags. Calls Claude server-side (claude-opus-4-8); falls back to a Twin-aware engine note (state summary + risk warning) when no key is set. Live with the fallback today.", blockedBy: "Set ANTHROPIC_API_KEY in Vercel to switch on the LLM coach (never called from a client)." },
  { id: "biometrics-manual", area: "Data", status: "shipped", title: "Readiness check-in (manual biometrics)", detail: "Enter HRV / resting HR / sleep; persisted to the Biometric table and fed into the readiness engine (today vs. rolling baseline). Web dashboard." },
  { id: "wearables", area: "Integrations", status: "planned", title: "Wearable sync (HealthKit / WHOOP / Garmin)", detail: "Manual check-in already feeds readiness; automatic sync is next. Each device becomes a connector that writes into the Signal ontology — HealthKit (native), WHOOP/Garmin/Oura (OAuth) — without changing the engines." },

  // ---- North-star roadmap (see reference/north-star-strategy.md) ----
  // Year 1 — System of Record
  { id: "athlete-twin", area: "Data", status: "shipped", title: "Athlete Digital Twin + Performance State", detail: "computePerformanceState fuses HPI + readiness + fatigue into one object WITH ranked 'why did it move' drivers (load + recovery attribution) and a one-line summary, fed by the persisted Signal ontology. Surfaced as the web dashboard Performance State cockpit + mobile Home, and grounds the AI coach. Next depth: nightly materialization/caching + trajectory over history." },
  { id: "injury-risk", area: "AI", status: "shipped", title: "Tissue-level injury risk (v0)", detail: "computeInjuryRisk scores every tissue 0..100 from acute:chronic workload (per-tissue ACWR) + absolute load + recovery suppression, each with its drivers and a gated band; flagged tissues surface on the dashboard. Honest heuristic v0. Next: a calibrated/versioned hazard model with offline eval, and auditable return-to-play protocol rails." },
  { id: "ai-copilot", area: "AI", status: "planned", title: "AI Coach Copilot (grounded + agentic)", detail: "Upgrade of /api/ai-coach into an agent grounded in the Twin + the club's own methodology: drafts plans as editable objects, explains with citations to the athlete's data, proposes (never auto-commits) clinical changes. Human-in-the-loop + full audit." },
  // Year 2 — Risk & Teams
  { id: "org-graph", area: "Backend", status: "planned", title: "Team Operating System (Org Graph)", detail: "Multi-tenant org/team hierarchy (first team → academy → U12) with role- and sensitivity-scoped access (medical vs. performance), staff collaboration, comms, and board-grade reporting. Generalizes CoachLink consent + RLS into RBAC/ABAC. Athlete history carries on promotion." },
  // Year 3 — Intelligence & Video
  { id: "video-intel", area: "AI", status: "planned", title: "Video intelligence (markerless motion capture)", detail: "Phone-first pose estimation → joint angles, asymmetry, bar/sprint mechanics → technique scores that become Signals in the Twin, so technique breakdown lines up with fatigue. Fusion to physiology is the edge Hudl structurally lacks." },
  { id: "competition-intel", area: "AI", status: "planned", title: "Competition intelligence + peaking optimizer", detail: "Back-solve periodization to land peak readiness on event day; opponent/field-strength models from results data; environment-aware load (heat/altitude/time-zone). What an Olympic coach opens before a championship." },
  // Year 4 — Network & Talent
  { id: "talent-graph", area: "Data", status: "planned", title: "Talent Graph + benchmarks", detail: "Age/sex/sport percentile norms over the population dataset + maturation-adjusted projection (separate talent from early physical maturity). A two-sided, consent-gated discovery market — 'LinkedIn for athletic talent'." },
  { id: "data-network", area: "Data", status: "planned", title: "Data network effects (the moat)", detail: "Every athlete-day is a labeled state→intervention→outcome record. The flywheel: more athletes → better benchmarks + models → better decisions → more adoption. The 5-year, outcome-labeled, multi-modal corpus no competitor can fast-forward." },

  // ---- Planned features ----
  { id: "coach-layer", area: "Web", status: "shipped", title: "Coach layer", detail: "CoachLink mutual-consent invites (accept/decline), roster, per-client sessions, and coaching notes incl. private (never shown to the client). Coach analytics dashboard computes from the real roster. Authorized by the relationship in the API. On web + mobile (the mobile Coach tab + plan enrollment hit the same API)." },
  { id: "plans-enroll", area: "Backend", status: "shipped", title: "Plan enrollment", detail: "Enrolling in a plan builds a macrocycle from the engine and persists it (POST /api/macrocycles); Periodize renders your enrolled season. Web done; mobile enroll pending." },
  { id: "i18n", area: "Core", status: "shipped", title: "Localization (EN/PL/DE)", detail: "Shared i18n in core; persisted language switchers on web + mobile. All UI labels across mobile (Home/Plans/Sport/Log/History/Coach) and web navigation/headers are translated. Data content (plan descriptions, sport rationales) stays source-language by design." },
];

export function capabilitiesByStatus(status: CapabilityStatus): Capability[] {
  return CAPABILITIES.filter((c) => c.status === status);
}
