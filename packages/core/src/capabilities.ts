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
  { id: "vbt-engine", area: "Core", status: "shipped", title: "Velocity-based training engine", detail: "velocity.ts: per-set summaries (best/mean/final mean concentric velocity, velocity loss %, ROM), velocity zones (absolute-strength → starting-speed with %1RM bands), a linear load–velocity profile fit (least squares, r²) that resolves an estimated 1RM at each movement's minimal velocity threshold, %1RM↔velocity conversion, and an autoregulated load recommender (target a bar speed → plate-rounded kg). Reads (load, velocity) straight off logged sessions (StrengthSet.vel) and adds a barVelocity Signal kind. Pure + 23 unit tests. Capture-agnostic: sensor, camera, or manual all feed the same math." },

  // ---- Web ----
  { id: "web-deploy", area: "Web", status: "shipped", title: "Web app on Vercel", detail: "Next.js App Router, auto-deploys from main. Landing + login + authenticated app shell." },
  { id: "web-dashboards", area: "Web", status: "shipped", title: "Analytics dashboards", detail: "Client/Coach/Admin scopes. Client dashboard computes from real logged sessions (volume, e1RM trend, PRs); Coach/Admin still sample data." },
  { id: "web-logger", area: "Web", status: "shipped", title: "Session logger + history", detail: "Engine-prescribed or manual sessions saved to the DB; History lists real sessions." },
  { id: "web-plans-sport", area: "Web", status: "shipped", title: "Plans + Sport screens", detail: "Render the shared plan library and sport engine." },
  { id: "web-periodize", area: "Web", status: "shipped", title: "Periodize", detail: "Renders a real macrocycle (phase timeline + load/recovery microcycles)." },
  { id: "web-velocity", area: "Web", status: "shipped", title: "Velocity (VBT) screen", detail: "Velocity screen on the shared vbt-engine: pick a lift → estimated 1RM from velocity, the load–velocity profile chart (measured sets + fitted line crossing the MVT), the velocity-zone reference, recent sets with bar speed + zone, and the autoregulated 'AI load' recommender (drag a target bar speed → suggested kg + %1RM). Logger now captures an m/s column per set; falls back to a sample back-squat profile until real velocity is logged." },
  { id: "team-compare", area: "Web", status: "shipped", title: "Team compare (group coaching)", detail: "A coach lines up their whole roster side by side on any lift — best e1RM, the velocity-based 1RM, best bar speed, total volume and reps — as a ranked bar chart + table, switchable by exercise and metric. /api/coach/compare computes every stat server-side from each ACTIVE client's real sessions (consent-gated by CoachLink, only the coach's own athletes). Empty-state guides coaches with no roster yet." },

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
  { id: "vbt-capture", area: "Integrations", status: "blocked", title: "Live bar-velocity & trajectory capture", detail: "The whole VBT analytics stack (vbt-engine + Velocity screen + team-compare) is live and consumes velocity from any source. What's missing is the on-device CAPTURE that produces real per-rep velocity and the sagittal bar-path/trajectory: either a bar-mounted IMU sensor over BLE or a phone-camera CV pipeline (extends video.ts pose frames). Until then, velocity is entered manually per set (m/s) in the Logger and still drives the full profile + 1RM + autoregulation. Per-rep trajectory plots are stubbed in the UI.", blockedBy: "A bar-sensor BLE SDK (e.g. an Enode/Vitruve-class device) or a native camera pose-capture module in the EAS build to emit per-rep velocity + bar path." },
  { id: "wearables", area: "Integrations", status: "blocked", title: "Wearable sync (WHOOP / Oura / Garmin / Apple)", detail: "Connector layer built: core registry + normalizers (parseWhoop/parseOura/parseHealthKit → Signal[], unit-tested), prisma Connection model + reference/sql-connection-table.sql, OAuth start/callback + sync routes (/api/connect/[provider]), /api/connections, and a Connections hub screen. Each provider writes into the Signal ontology without touching the engines. OAuth providers show 'setup pending' until creds are set.", blockedBy: "Per-provider OAuth credentials in Vercel env (e.g. WHOOP_CLIENT_ID/SECRET, OURA_CLIENT_ID/SECRET) + NEXT_PUBLIC_SITE_URL. Apple Health needs the native HealthKit module in the EAS build." },

  // ---- North-star roadmap (see reference/north-star-strategy.md) ----
  // Year 1 — System of Record
  { id: "athlete-twin", area: "Data", status: "shipped", title: "Athlete Digital Twin + Performance State", detail: "computePerformanceState fuses HPI + readiness + fatigue into one object WITH ranked 'why did it move' drivers (load + recovery attribution) and a one-line summary, fed by the persisted Signal ontology. Dedicated web Performance screen: HPI cockpit + 14-day HPI/readiness trajectory (performanceTrajectory replays the log) + tissue body map. Also on the dashboard, mobile Home, and grounds the AI coach. Next depth: nightly materialization/caching." },
  { id: "injury-risk", area: "AI", status: "shipped", title: "Tissue-level injury risk + return-to-play", detail: "computeInjuryRisk scores every tissue 0..100 (per-tissue ACWR + absolute load + recovery suppression) AND maps it through a versioned logistic calibration to an injury probability (RISK_MODEL_VERSION; documented prior, refit when the data network has labeled outcomes). Surfaced as a body map + per-tissue table (risk, P(injury), ACWR, drivers). Return-to-play rails (rtp.ts): 5 gated stages (acute→…→return-to-perform), the engine blocks advancement until every gate is met; RtpProtocol model + /api/rtp + a checklist panel. The calibration is a LIVE refit loop: labeled outcomes captured (RiskOutcome — positives recorded when an RTP protocol opens, plus club records fed in), refitCalibration re-fits the logistic, persisted (ModelFit) and applied everywhere once ≥30 samples exist; admin Refit on the Data Network screen, with negative-sample snapshots (/api/datanet/snapshot) so the logistic trains on both classes. RTP is auditable: every gate attestation, advance, and override (reason-required, force-advance) is appended to an immutable audit log with who + role + timestamp. Next: org-role gating of overrides (medical-only)." },
  { id: "ai-copilot", area: "AI", status: "planned", title: "AI Coach Copilot (grounded + agentic)", detail: "Upgrade of /api/ai-coach into an agent grounded in the Twin + the club's own methodology: drafts plans as editable objects, explains with citations to the athlete's data, proposes (never auto-commits) clinical changes. Human-in-the-loop + full audit." },
  // Year 2 — Risk & Teams
  { id: "org-graph", area: "Backend", status: "shipped", title: "Team Operating System (Org Graph)", detail: "Organization + self-referential Team hierarchy + Membership with roles (OWNER/DIRECTOR/COACH/MEDICAL/ANALYST/ATHLETE). Access scoped by role × data sensitivity AND by team subtree in core (org.ts canSeeAthlete/visibleTeamIds, unit-tested). Operational: managers invite staff/athletes by email — existing users join immediately, others get a pending OrgInvite claimed automatically on first sign-in (revocable). Members read an athlete's Twin via /api/org/[id]/athlete/[uid], gated by role (tissue-level injury detail is medical-tier) AND by team scope (a U16 coach sees only their subtree). DB: prisma models + reference/sql-org-graph.sql + sql-org-invite.sql. Next: board reporting, athlete promotion carrying history." },
  // Year 3 — Intelligence & Video
  { id: "video-intel", area: "AI", status: "shipped", title: "Video intelligence (markerless motion analysis)", detail: "Analysis engine shipped (video.ts): consumes pose-keypoint frames → joint angles, rep counting, L/R asymmetry, depth, and a 0..100 technique score with flags; emits an asymmetry Signal that feeds the Twin's injury risk (technique breakdown lines up with fatigue — the fusion Hudl lacks). VideoAnalysis model + /api/video + a Video screen (runs a sample clip). 10 unit tests. Remaining integration: on-device/phone pose-estimation capture to produce the frames (native client)." },
  { id: "competition-intel", area: "AI", status: "shipped", title: "Competition intelligence + peaking optimizer", detail: "Peaking optimizer shipped (peaking.ts): set an event date and optimizeForEvent back-solves the macrocycle to the weeks available and projects a fitness–fatigue–form curve (Banister impulse-response) so the form peak lands ON the event — finals, not heats. Event model + /api/events + a Competition screen (macro timeline + projection chart + 'peak lands on event' readout). 5 unit tests. Next: opponent/field-strength models from results data, environment-aware load (heat/altitude/time-zone)." },
  // Year 4 — Network & Talent
  { id: "talent-graph", area: "Data", status: "shipped", title: "Talent Graph + benchmarks", detail: "benchmarks.ts: age/sex/sport percentile norms (normal-CDF over documented priors, BENCHMARK_MODEL_VERSION) + maturation-adjusted projection that separates talent from early physical maturity (a youth at the adult median reads exceptional potential). HPI pulled live from the Twin. TalentProfile model + /api/talent (own report) + /api/talent/search (consent-gated discovery — only 'discoverable' profiles, rank by percentile or potential) + a Talent screen. 'LinkedIn for athletic talent', v0. Next: refit norms on the real population dataset; richer cohorts." },
  // ---- Year 5 — vertical expansion ----
  { id: "tactical-vertical", area: "AI", status: "shipped", title: "Tactical / SOF readiness", detail: "tactical.ts: a Deployment Readiness Index fuses the Twin (HPI + injury availability) with occupational capacity (load carriage, work capacity) into a duty status (ready/qualified/limited/non-deployable), with a hard medical gate, plus a unit-level go/no-go rollup. /api/state + a Tactical screen (personal DRI + illustrative unit board). 6 unit tests. Next: plug real units through the Org Graph; tactical-specific capacity tests." },

  { id: "longevity-vertical", area: "AI", status: "shipped", title: "Performance medicine / longevity", detail: "longevity.ts: estimates biological age vs chronological from the Twin's recovery markers (resting HR, HRV, VO₂, sleep) with documented marker priors, plus a healthspan score + flags. Longevity screen prefills markers from the Signal ontology. 4 unit tests. Heuristic v0 (not a diagnostic); blood markers (bloodMarker SignalKind) + data-network refit are next." },

  { id: "data-network", area: "Data", status: "shipped", title: "Data network effects (the moat)", detail: "datanet.ts: aggregates consented observations into cohort norms with k-anonymity (≥5), shrinkNorm refits the synthetic priors toward observed data as it accumulates, and refitCalibration re-fits the injury logistic on labeled outcomes (gradient descent from the prior). Admin /api/datanet + a Data Network screen surface the benchmarking-intelligence aggregate (the sellable data layer, not raw rows). 9 unit tests. The flywheel is wired; it sharpens as the population grows. Next: persist refit norms back into the benchmark engine + a federated/clean-room export for federations." },

  // ---- Planned features ----
  { id: "coach-layer", area: "Web", status: "shipped", title: "Coach layer", detail: "CoachLink mutual-consent invites (accept/decline), roster, per-client sessions, and coaching notes incl. private (never shown to the client). Coach analytics dashboard computes from the real roster. Authorized by the relationship in the API. On web + mobile (the mobile Coach tab + plan enrollment hit the same API)." },
  { id: "plans-enroll", area: "Backend", status: "shipped", title: "Plan enrollment", detail: "Enrolling in a plan builds a macrocycle from the engine and persists it (POST /api/macrocycles); Periodize renders your enrolled season. Web done; mobile enroll pending." },
  { id: "i18n", area: "Core", status: "shipped", title: "Localization (EN/PL/DE)", detail: "Shared i18n in core; persisted language switchers on web + mobile. All UI labels across mobile (Home/Plans/Sport/Log/History/Coach) and web navigation/headers are translated. Data content (plan descriptions, sport rationales) stays source-language by design." },
];

export function capabilitiesByStatus(status: CapabilityStatus): Capability[] {
  return CAPABILITIES.filter((c) => c.status === status);
}
