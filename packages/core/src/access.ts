import type { Persona } from "./nav";

/**
 * Free-tier feature access — the single source of truth for what a FREE user is
 * (and isn't) allowed to do, shared by BOTH clients so web and mobile gate the
 * same way (project rule: web ↔ mobile parity).
 *
 * Gating is keyed on the resolved {@link Persona}, not the raw billing
 * entitlement, so it composes with the rest of the app: a client only reaches
 * the "athlete" (Full) surface when they've BOTH chosen athlete mode AND carry a
 * paid entitlement (see `resolvePersona`). Coaches/admins are Full by role.
 *
 * "casual" === the FREE experience. Everything below is unlocked the moment a
 * user is anything other than casual.
 */
export function isFullAccess(persona: Persona): boolean {
  // Whitelist the Full personas so the gate FAILS CLOSED — any unexpected /
  // uninitialised value (undefined, null, a future restricted persona) denies
  // access rather than accidentally granting it.
  return persona === "athlete" || persona === "coach" || persona === "admin";
}

/** Free users cannot SEE the Hybrid Performance Index (HPI) — score, band,
 *  trace and components are a Full feature. */
export function canSeeHPI(persona: Persona): boolean {
  return isFullAccess(persona);
}

/** Free users cannot EDIT a plan they're enrolled in (reschedule / resync the
 *  reconciled week, periodization edits). They can still enrol and follow it. */
export function canEditEnrolledPlan(persona: Persona): boolean {
  return isFullAccess(persona);
}

/** Free users CAN add nutrition values manually. Scanning a product label for an
 *  automatic add is a Full feature. */
export function canScanFoodLabel(persona: Persona): boolean {
  return isFullAccess(persona);
}

/** Free users CAN add nutrition values manually. Logging a PREMADE meal preset
 *  and saving custom PRODUCTS / using the food database are Full features.
 *  (Saving your OWN meals is free up to {@link FREE_MEAL_LIMIT} — see
 *  {@link canSaveMeal}; this predicate stays Full-only for products + presets.) */
export function canSaveMealsAndProducts(persona: Persona): boolean {
  return isFullAccess(persona);
}

/** Saving a custom PRODUCT (a reusable food with per-serving macros) to the
 *  personal library is Full-only — the free tier gets saved MEALS (capped, see
 *  {@link canSaveMeal}) but not a products library. Alias of the Full gate,
 *  named for the call-site so the intent is explicit at both clients + the API. */
export function canSaveProduct(persona: Persona): boolean {
  return isFullAccess(persona);
}

/** How many custom meals a FREE user may keep saved to their personal library.
 *  Building a meal is always free; only the library SIZE is capped — more
 *  requires the Full upgrade. Shared by both clients AND the API gate so the
 *  number can never drift. */
export const FREE_MEAL_LIMIT = 4;

/** Free users CAN create and save their OWN meals (name + macros) — up to
 *  {@link FREE_MEAL_LIMIT} of them. Saving MORE is the paid (Full) upgrade. The
 *  API mirrors this on POST /api/nutrition/meals (403 upgrade_required once a
 *  free client is at the limit), so the clients gate the "save" CTA on this
 *  predicate and show an upgrade prompt instead of an error.
 *  @param savedCount how many meals the user currently has saved. */
export function canSaveMeal(persona: Persona, savedCount: number): boolean {
  if (isFullAccess(persona)) return true;
  return persona === "casual" && savedCount < FREE_MEAL_LIMIT;
}

/** How many reusable routines (WorkoutTemplates) a FREE user may keep saved.
 *  The Builder itself is free; only the library size is capped — more requires
 *  the Full upgrade. Shared by both clients AND the API gate so the number can
 *  never drift. */
export const FREE_TEMPLATE_LIMIT = 2;

/** Free users CAN build and save reusable routines (load-and-go templates) — up
 *  to {@link FREE_TEMPLATE_LIMIT} of them. Saving MORE is a Full feature. The
 *  API mirrors this on POST /api/templates (403 upgrade_required for a free
 *  client already at the limit), so the clients gate the CTA on this predicate
 *  and show an upgrade prompt instead of an error.
 *  @param savedCount how many templates the user currently has saved. */
export function canSaveRoutine(persona: Persona, savedCount: number): boolean {
  if (isFullAccess(persona)) return true;
  return persona === "casual" && savedCount < FREE_TEMPLATE_LIMIT;
}
