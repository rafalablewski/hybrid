/**
 * @hybrid/core — shared logic for both clients.
 *
 * Sprint 0: brand tokens only.
 * Later sprints add: types/ (Session, Macrocycle, …), engines/ (fatigue,
 * readiness, progression, periodization), api-client/, validation/.
 */

export * from "./brand";
export * from "./engines";
export * from "./plans";
export * from "./sports";

/** Sprint marker so both clients can show what's wired up. */
export const CORE_VERSION = "0.1.0-sprint2";
