import type { Experience, Equipment } from "@hybrid/core";

// The onboarding intake answers we persist client-side (like the sport
// selection) so the prescription engine can tailor the daily session: how often
// they train, their experience tier, and the equipment they have. Read in a
// client effect to avoid an SSR mismatch.
export interface Intake {
  experience?: Experience;
  equipment?: Equipment;
  daysPerWeek?: number;
}

export function readIntake(): Intake {
  if (typeof window === "undefined") return {};
  try {
    const exp = localStorage.getItem("hybrid.experience");
    const eq = localStorage.getItem("hybrid.equipment");
    const d = Number(localStorage.getItem("hybrid.daysPerWeek"));
    return {
      experience: exp === "beginner" || exp === "intermediate" || exp === "advanced" ? exp : undefined,
      equipment: eq === "full" || eq === "home" || eq === "minimal" ? eq : undefined,
      daysPerWeek: Number.isFinite(d) && d > 0 ? d : undefined,
    };
  } catch {
    return {};
  }
}
