// What the paid "Full" tier unlocks — one shared list so the upgrade sheet and
// the Subscription settings tab show the SAME benefits on both clients (no drift
// between the web and mobile paywalls).

export interface FullBenefit { title: string; desc: string }

export const FULL_BENEFITS: FullBenefit[] = [
  { title: "Cockpit — auto-adjusting loads", desc: "Every set reshaped to your readiness & fatigue" },
  { title: "Sport plans", desc: "Periodised programs for tennis, running, Hyrox & more" },
  { title: "Pre-made meals & auto macros", desc: "Skip manual entry — tap to log, targets split for you" },
  { title: "Full plan library", desc: "All 5 discipline programs, unlocked" },
  { title: "Unlimited saved routines", desc: "Free includes 2 Builder templates — Full removes the cap" },
];
