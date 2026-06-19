/**
 * @hybrid/core — shared logic for both clients.
 *
 * Sprint 0: brand tokens only.
 * Later sprints add: types/ (Session, Macrocycle, …), engines/ (fatigue,
 * readiness, progression, periodization), api-client/, validation/.
 */

export * from "./brand";
export * from "./semantic";
export * from "./engines";
export * from "./plans";
export * from "./plan-day";
export * from "./onboarding";
export * from "./sports";
export * from "./capabilities";
export * from "./rpe";
export * from "./agents";
export * from "./economics";
export * from "./security";
export * from "./mfa";
export * from "./i18n";
export * from "./flags";
export * from "./biometrics";
export * from "./connectors";
export * from "./org";
export * from "./benchmarks";
export * from "./datanet";
export * from "./tactical";
export * from "./longevity";
export * from "./theme";
export * from "./templates";
export * from "./aurora-icons";
export * from "./interval";
export * from "./activity";
export * from "./stats";
export * from "./contrast";
export * from "./nav";
export * from "./analytics";
export * from "./units";
export * from "./plates";
export * from "./logger-prefs";
export * from "./guidance";
export * from "./account";

/** Sprint marker so both clients can show what's wired up. */
export const CORE_VERSION = "0.1.0-sprint2";
