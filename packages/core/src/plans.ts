/**
 * @hybrid/core — plans data + pure logic.
 *
 * Ported verbatim from the React prototype (reference/HybridApp.jsx).
 * No React/JSX here — data and helpers only.
 */

// Goal accent hues — ONE unique hex per goal, hand-authored (never runtime HSL
// math) so each can be tuned. All sit in the muted, slightly-desaturated
// register of the five brand accents (chartreuse #c6f84f, teal #3c787e, sand
// #d0cd94, terracotta #d56f3e, steel #8296c4) and extend the wheel segments the
// brand already occupies: greens (chartreuse→moss→pine), teals→slate blues,
// sands→ochres→terracottas, plus a muted plum/mauve and stone grey-greens for
// the outliers. The hue only ever drives the cover/tile duotone wash (mixed
// toward cover ink) and the 18% tint in the white chip — never body text — so
// mid-luminance values are safe. Keep every value unique across the tree.

// ============================================================
//  Types
// ============================================================

export interface GoalPlan {
  id: string;
  name: string;
  weeks: number;
  sessions: number;
  tag: string;
  desc: string;
  focus: string[];
  hot?: boolean;
}

/** Broad family a goal belongs to — used to group goals in the UI. */
export type GoalCategory = "Strength" | "Physique" | "Endurance" | "Functional & Sport" | "Health";

/** Display order for goal categories. */
export const GOAL_CATEGORIES: GoalCategory[] = [
  "Strength",
  "Physique",
  "Endurance",
  "Functional & Sport",
  "Health",
];

export interface GoalNode {
  id: string;
  name: string;
  icon: string;
  color: string;
  blurb: string;
  category: GoalCategory;
  plans: GoalPlan[];
}

export interface PlanSampleItem {
  name: string;
  sr: string;
  rest: string;
  rpe: string;
}

export interface PlanSample {
  day: string;
  items: PlanSampleItem[];
}

export interface PlanDetail {
  level: string;
  forWho: string;
  outcome: string;
  sessionLength: string;
  equipment: string;
  split: string[];
  /** Every training day in the plan, each fully spec'd. */
  days: PlanSample[];
  progression: string;
}

// ============================================================
//  GOAL TREE — choose a goal, then see the plans built for it.
// ============================================================

// NOTE: the old one-size-fits-all gym plans were retired; plans are being
// rebuilt goal-by-goal in the SHAPE that fits each goal (see plan-program.ts +
// reference/plan-model-redesign.md). Olympic Weightlifting now carries the first
// discipline-shaped plan (the Soviet 8-week %-of-1RM block, surfaced via
// programFor()); the rest stay empty until authored in their own shape.
export const GOAL_TREE: GoalNode[] = [
  // ---- Strength ----
  { id: "power", name: "Powerlifting", icon: "▬", color: "#8296c4" /* steel blue — brand accent, kept */, category: "Strength", blurb: "One goal: a bigger squat, bench, and deadlift total.",
    plans: [] },
  { id: "oly", name: "Olympic Weightlifting", icon: "◢", color: "#d0cd94" /* sand — brand accent, kept */, category: "Strength", blurb: "Snatch and clean & jerk. Explosive power, mobility, and technical precision.",
    plans: [
      { id: "oly-soviet-8wk", name: "Soviet 8-Week Peaking", weeks: 8, sessions: 6, tag: "% of 1RM", desc: "A classic Soviet block: percentage-based snatch, clean & jerk, squat and pull work that waves volume and intensity across 8 weeks and tapers into a competition. AM/PM training days, complexes, tempo pulls — programmed by number of lifts, not reps to failure.", focus: ["Power", "Technique"], hot: true },
    ] },
  { id: "strongman", name: "Strongman", icon: "◤", color: "#b3814f" /* worn leather bronze */, category: "Strength", blurb: "Carry, press, and pull heavy odd objects. Raw, full-body, real-world strength.",
    plans: [] },
  // ---- Physique ----
  { id: "bb", name: "Bodybuilding", icon: "■", color: "#a78bba" /* muted plum */, category: "Physique", blurb: "Maximize muscle. Train splits, chase volume and progressive overload.",
    plans: [
      { id: "bb-ppl-6day", name: "6-Day Push/Pull/Legs", weeks: 1, sessions: 6, tag: "Repeat weekly", desc: "The modern bodybuilding split: two push, two pull and two leg days, each built on a big compound you progressively overload. Run the week on repeat, adding weight or reps every cycle.", focus: ["Hypertrophy", "Strength"], hot: true },
    ] },
  { id: "fatloss", name: "Fat Loss", icon: "◐", color: "#d56f3e" /* terracotta — brand accent, the burn */, category: "Physique", blurb: "Drop fat and keep the muscle. Train hard, recover smart, recomp the right way.",
    plans: [
      { id: "fatloss-kb-saturday", name: "Saturday Kettlebell Burn", weeks: 1, sessions: 1, tag: "Circuit", desc: "A single ~90-minute kettlebell circuit for fat loss, core tightening and full-body conditioning — a warm-up, five work blocks (legs, push/pull, core, balance), a no-rest finisher and a cool-down. Run it once a week, ideally fasted, and rotate the emphasis (form → speed → volume → heavier) each week.", focus: ["Conditioning", "Core"], hot: true },
    ] },
  // ---- Endurance ----
  { id: "tri", name: "Triathlon", icon: "◆", color: "#5b84a8" /* harbor slate blue */, category: "Endurance", blurb: "Swim-bike-run endurance. Strength work that supports, not sabotages.",
    plans: [] },
  { id: "run", name: "Running", icon: "▶", color: "#3c787e" /* teal — brand accent, kept */, category: "Endurance", blurb: "Get faster over 5k, 10k, half or full. Build the aerobic engine and durable legs.",
    plans: [
      { id: "run-5k-beginner-9wk", name: "5K Beginner — 9 Weeks", weeks: 9, sessions: 4, tag: "Pace-based", desc: "A 9-week build to your first or fastest 5K: a weekly interval/hills day, a tempo day, easy miles and a long run, all run to your goal paces. Waves up the volume, then tapers into race week.", focus: ["Endurance", "Speed"], hot: true },
    ] },
  { id: "cycling", name: "Cycling", icon: "◉", color: "#9bb85a" /* moss green */, category: "Endurance", blurb: "More power on the bike — road, gravel, or indoor. Strength that drives the pedal stroke.",
    plans: [] },
  { id: "swim", name: "Swimming", icon: "◑", color: "#74a8a2" /* sea-glass aqua */, category: "Endurance", blurb: "Faster in the water — dryland strength, mobility, and shoulder durability.",
    plans: [] },
  // ---- Functional & Sport ----
  { id: "hyrox", name: "Hyrox", icon: "●", color: "#b7b34e" /* olive gold */, category: "Functional & Sport", blurb: "Race the 8-station functional fitness event. Compromised running is everything.",
    plans: [] },
  { id: "crossfit", name: "CrossFit", icon: "✚", color: "#b5533c" /* rust ember */, category: "Functional & Sport", blurb: "Constantly varied, high-intensity functional fitness. Be ready for anything.",
    plans: [] },
  { id: "hybrid", name: "Hybrid Athlete", icon: "▲", color: "#c6f84f" /* chartreuse — brand primary, the flagship goal keeps it */, category: "Functional & Sport", blurb: "Lift heavy and train your sport. Strength that carries over to running, combat, court, or crag.",
    plans: [
      { id: "hybrid-engine-base", name: "Hybrid Base — Strength & Engine", weeks: 1, sessions: 5, tag: "Repeat weekly", desc: "A hybrid base week that carries heavy barbell strength AND an aerobic engine, run on repeat. Two key days are three-a-day — a morning strength session, a midday conditioning piece and an easy evening run — with speed and tempo runs midweek and a long-run-plus-lifting Saturday. Add weight when the lifts feel easy, keep the easy runs easy.", focus: ["Strength", "Endurance"], hot: true },
    ] },
  { id: "calisthenics", name: "Calisthenics", icon: "◯", color: "#9aa78f" /* stone grey-green */, category: "Functional & Sport", blurb: "Master your bodyweight — pull-ups, dips, levers, and the big skills.",
    plans: [] },
  { id: "kettlebell", name: "Kettlebell", icon: "◔", color: "#7d8a92" /* gunmetal — cast iron */, category: "Functional & Sport", blurb: "Swing, snatch, and get-up. One tool, full-body strength and conditioning.",
    plans: [
      { id: "kb-12wk-strong", name: "12-Week Kettlebell — Strong & Athletic", weeks: 12, sessions: 4, tag: "Sets × reps", desc: "A complete 12-week kettlebell block that rotates the split every week — full body, then push/pull/legs, then upper/lower — to build strength, muscle, endurance and mobility. 5–7 exercises a day, 3–5 days a week, with one or two bells.", focus: ["Strength", "Muscle"], hot: true },
    ] },
  { id: "tactical", name: "Tactical & Military", icon: "◣", color: "#7a8663" /* army drab */, category: "Functional & Sport", blurb: "Ruck, carry, and work capacity under load. Built to pass the test and do the job.",
    plans: [] },
  { id: "sport", name: "Sport Performance", icon: "★", color: "#d99a6c" /* apricot */, category: "Functional & Sport", blurb: "Speed, power, and agility for field- and court-sport athletes.",
    plans: [] },
  // ---- Health ----
  { id: "fitness", name: "General Fitness", icon: "✦", color: "#85b88d" /* sage green */, category: "Health", blurb: "Look, feel, and move better. Balanced strength, conditioning, and lasting health.",
    plans: [] },
  { id: "mobility", name: "Mobility & Longevity", icon: "◇", color: "#4f7f5e" /* pine — evergreen */, category: "Health", blurb: "Move freely and stay durable for decades. Mobility, stability, and prehab.",
    plans: [] },
  { id: "prenatal", name: "Pre & Postnatal", icon: "◍", color: "#c793a2" /* dusty rose */, category: "Health", blurb: "Train safely and strong through pregnancy and the return after.",
    plans: [] },
];

// flat list still used by the landing carousel (top plan per goal).
// Skips goals that have no plans yet.
export const PLANS: (GoalPlan & { color: string })[] = GOAL_TREE.flatMap((g) =>
  g.plans[0] ? [{ ...g.plans[0], color: g.color }] : [],
);

/** Plan-library preview — the top plan for each goal that has one, carrying its
 *  goal's name + icon + colour. The SINGLE source for any preview rail on either
 *  client, so the preview can never drift from the real library (no duplicated
 *  names/metas) and its facts (discipline, scheme) come straight from the plan
 *  data. */
export const PLAN_PREVIEWS: { goalId: string; goalName: string; icon: string; color: string; plan: GoalPlan }[] =
  GOAL_TREE.flatMap((g) => (g.plans[0] ? [{ goalId: g.id, goalName: g.name, icon: g.icon, color: g.color, plan: g.plans[0] }] : []));

/** Editor's-pick plan ids, in cover order — the curated hero slots for the plan
 *  Cover Flow. Chosen for spread across disciplines (strength, endurance,
 *  physique), NOT tree order, so the featured trio is intentional rather than
 *  "whatever's first in the goal tree". Ids that don't resolve are skipped. */
export const FEATURED_PLAN_IDS = ["oly-soviet-8wk", "run-5k-beginner-9wk", "bb-ppl-6day"];

/** PLAN_PREVIEWS reordered so the editor's picks lead (in FEATURED_PLAN_IDS
 *  order), then every other preview in library order. A Cover Flow takes the
 *  first three as covers and the rest as the rail, so curation lives HERE —
 *  never lost, never a raw slice of the tree. Always contains every preview.
 *
 *  NOTE: no screen mounts this today. The Explore tab that carried the Cover
 *  Flow is gone (Nutrition took its bar slot); the curation is kept intact so
 *  the block can be rehomed — tracked as `plans-cover-flow-rehome` in
 *  capabilities.ts. */
export const FEATURED_PREVIEWS: typeof PLAN_PREVIEWS = (() => {
  const picks = FEATURED_PLAN_IDS
    .map((id) => PLAN_PREVIEWS.find((p) => p.plan.id === id))
    .filter((p): p is (typeof PLAN_PREVIEWS)[number] => p !== undefined);
  const rest = PLAN_PREVIEWS.filter((p) => !FEATURED_PLAN_IDS.includes(p.plan.id));
  return [...picks, ...rest];
})();

/** The named library plans for a goal (matched by GoalNode name, e.g.
 *  "Bodybuilding"). Empty when that goal has no uploaded plans yet (most don't
 *  — see the `plans-lib` capability). Powers the coach's named-plan picker. */
export function plansForGoal(goalName: string): GoalPlan[] {
  return GOAL_TREE.find((g) => g.name === goalName)?.plans ?? [];
}

export interface GoalGroup {
  category: GoalCategory;
  goals: GoalNode[];
}

/** GOAL_TREE grouped by category, in display order (empty groups dropped). */
export const GOAL_GROUPS: GoalGroup[] = GOAL_CATEGORIES.map((category) => ({
  category,
  goals: GOAL_TREE.filter((g) => g.category === category),
})).filter((group) => group.goals.length > 0);

/** Filter the goal groups for the Plans browse screen by a free-text `query`
 *  (matched case-insensitively against each goal's name + blurb) and/or a
 *  `category`. `""` + `"all"` returns GOAL_GROUPS unchanged; groups left with no
 *  matching goals are dropped, so the result is always render-ready. Pure — both
 *  clients call it so the browse filter can't drift as the library scales. */
export function filterGoalGroups(query = "", category: GoalCategory | "all" = "all"): GoalGroup[] {
  const q = query.trim().toLowerCase();
  return GOAL_GROUPS
    .filter((group) => category === "all" || group.category === category)
    .map((group) => ({
      category: group.category,
      goals: q ? group.goals.filter((g) => g.name.toLowerCase().includes(q) || g.blurb.toLowerCase().includes(q)) : group.goals,
    }))
    .filter((group) => group.goals.length > 0);
}

/** The Plans ROOT's shelves — `filterGoalGroups` with each category's goals
 *  ordered READY FIRST (goals that actually have plans, then the ones still
 *  coming), preserving GOAL_TREE order within each half. The root renders every
 *  category as a horizontal shelf, so what sits past the fold is what isn't
 *  built yet rather than an arbitrary slice of the library. Pure + shared so
 *  both clients order identically. */
export function goalShelves(query = ""): GoalGroup[] {
  return filterGoalGroups(query).map((group) => ({
    category: group.category,
    goals: [...group.goals.filter((g) => g.plans.length > 0), ...group.goals.filter((g) => g.plans.length === 0)],
  }));
}

// ============================================================
//  PLAN DETAIL — every plan's full workout summary (level, who it's for,
//  outcome, duration/frequency, split, every training day spec'd, progression).
//  Retired alongside the saved plans — empty until real plans are uploaded.
//  planDetail() below fills sane defaults, so consumers never break on a miss.
// ============================================================

export const PLAN_DETAIL: Record<string, PlanDetail> = {};

// resolve a plan id to its full detail, filling any gaps with sane defaults
export function planDetail(id: string, _plan?: unknown): PlanDetail {
  const d = PLAN_DETAIL[id] || ({} as Partial<PlanDetail>);
  return {
    level: d.level || "All levels",
    forWho: d.forWho || "Suitable for most trainees at the stated level.",
    outcome: d.outcome || "Consistent progress toward your goal.",
    sessionLength: d.sessionLength || "60 min",
    equipment: d.equipment || "Basic gym",
    split: d.split || ["Train", "Rest", "Train", "Rest", "Train", "Rest", "Rest"],
    days: Array.isArray(d.days) && d.days.length ? d.days : [{ day: "Sample day", items: [{ name: "—", sr: "—", rest: "—", rpe: "—" }] }],
    progression: d.progression || "Progressive overload week to week, with a deload every 4th week.",
  };
}
