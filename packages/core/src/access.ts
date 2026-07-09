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

/** Free users CAN add nutrition values manually. Saving reusable meals and
 *  products to a personal library is a Full feature. */
export function canSaveMealsAndProducts(persona: Persona): boolean {
  return isFullAccess(persona);
}

/** Free users CAN log and build a one-off workout, but saving it as a REUSABLE
 *  routine (load-and-go template) is a Full feature. The API mirrors this on
 *  POST /api/templates (403 upgrade_required for a free client), so the clients
 *  gate the CTA on this predicate and show an upgrade prompt instead of an
 *  error. */
export function canSaveRoutine(persona: Persona): boolean {
  return isFullAccess(persona);
}
