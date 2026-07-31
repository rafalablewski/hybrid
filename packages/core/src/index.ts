/**
 * @hybrid/core — shared logic for both clients.
 *
 * Sprint 0: brand tokens only.
 * Later sprints add: types/ (Session, Macrocycle, …), engines/ (fatigue,
 * readiness, progression, periodization), api-client/, validation/.
 */

// The Aurora theme — one self-contained, swappable folder (tokens, palette,
// templates, icons). See packages/core/src/theme/README.md.
export * from "./theme";
export * from "./story-styles";
export * from "./count-up";
export * from "./workout-caption";
export * from "./semantic";
export * from "./readiness-feeling";
export * from "./checkin-flow";
export * from "./checkin-scales";
export * from "./feel-timing";
export * from "./feel-schedule";
export * from "./readiness-reads";
export * from "./day-key";
export * from "./masthead";
export * from "./motion";
export * from "./engines";
export * from "./volume-view";
export * from "./plans";
export * from "./plan-day";
export * from "./plan-program";
export * from "./plan-programs";
export * from "./plan-schedule";
export * from "./logbook-week";
export * from "./today-rail";
export * from "./nutrition-hud";
export * from "./onboarding";
export * from "./sports";
export * from "./olympic-sports";
export * from "./endurance";
export * from "./endurance-lanes";
export * from "./bodyweight";
export * from "./body-progress";
export * from "./food-facts";
export * from "./nutrition-off";
export * from "./verified-foods";
export * from "./source-marks";
export * from "./recipes";
export * from "./notes";
export * from "./exercise-db";
export * from "./exercise-profile";
export * from "./exercise-animation";
export * from "./exercise-anatomy";
export * from "./body-map";
export * from "./exercise-widget";
export * from "./capabilities";
export * from "./rpe";
export * from "./agents";
export * from "./economics";
export * from "./security";
export * from "./mfa";
export * from "./i18n";
export * from "./athlete-id";
export * from "./flags";
export * from "./biometrics";
export * from "./connectors";
export * from "./org";
export * from "./benchmarks";
export * from "./datanet";
export * from "./tactical";
export * from "./longevity";
export * from "./interval";
export * from "./activity";
export * from "./social";
export * from "./stats";
export * from "./week-verdict";
export * from "./other-sports";
export * from "./contrast";
export * from "./premium-accent";
export * from "./nav";
export * from "./access";
export * from "./analytics";
export * from "./units";
export * from "./plates";
export * from "./logger-prefs";
export * from "./set-focus";
export * from "./live-stats";
export * from "./done-receipt";
export * from "./session-celebration";
export * from "./session-wrapped";
export * from "./session-edit";
export * from "./session-feel";
export * from "./session-device";
export * from "./device-import";
export * from "./device-marks";
export * from "./device-truth";
export * from "./energy";
export * from "./session-signature";
export * from "./guidance";
export * from "./account";
export * from "./settings-nav";
export * from "./password-strength";
export * from "./avatar-presets";
export * from "./profile-completeness";
export * from "./full-benefits";
export * from "./scale";
export * from "./email";
export * from "./format";
export * from "./social-dto";
export * from "./nav-bar";

/** Sprint marker so both clients can show what's wired up. */
export const CORE_VERSION = "0.1.0-sprint2";
