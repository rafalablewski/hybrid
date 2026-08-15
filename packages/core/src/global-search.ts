import { GOAL_TREE } from "./plans";
import { RECIPES } from "./recipes";
import { NAV_ITEMS } from "./nav";
import { SETTINGS_ALL } from "./settings-nav";
import { HELP_ROWS } from "./help";
import { exerciseGearLine } from "./exercise-db";
import { olympicSport } from "./olympic-sports";
import { buildExerciseIndex } from "./exercise-search";
import { normalizeSearchText, rankEntries, searchEntry, type RankedEntry, type RankedHit, type RankedSearchOptions } from "./ranked-search";

// ─────────────────────────────────────────────────────────────────────────────
// CROSS-APP SEARCH — one field that reaches everything the app holds.
//
// HYBRID had no search entry point at all. Every corpus was reachable only by
// remembering which screen owned it: the lift catalog behind the logger's add
// sheet, the settings behind a screen with its own field, the plan library
// behind two taps of a goal tree, the recipes behind Nutrition. That is fine
// when you know the app and useless when you don't, and it is exactly the
// question a drawer is already trying to answer.
//
// This is the CORPUS, not the scoring: it says what a screen, a setting, a
// lift, a plan and a recipe each answer to, and hands the result to
// ranked-search like every other field. So "hamstrings" reaches the Romanian
// Deadlift, "2fa" reaches Password & security, "rdl" still works, and a typo
// still lands — because none of that is re-implemented here.
//
// The tab bar cannot host it: the iOS 26 detached search slot is deliberately
// spent on the Train action (nav-bar.ts records the trade and a test guards
// it). The drawer is the honest home — it is already the list of everywhere you
// can go, and this makes it searchable rather than only scrollable.
// ─────────────────────────────────────────────────────────────────────────────

export type GlobalResultKind = "screen" | "setting" | "exercise" | "sport" | "plan" | "recipe" | "help";

export interface GlobalResult {
  kind: GlobalResultKind;
  /** Stable identity: a nav id, a settings/help id, an exercise NAME, a plan id. */
  id: string;
  title: string;
  /** One line of context — the gear line, the settings subtitle, the goal name. */
  sub?: string;
  /** The thing this one lives inside — a named plan's GOAL. A client needs both
   *  to land on the plan itself rather than the library root. */
  parentId?: string;
  /** Only set for a screen the athlete has not unlocked; the caller routes to the paywall. */
  locked?: boolean;
}

/** Order the kinds appear in when results are grouped. Screens first: someone
 *  typing into a drawer is usually trying to GO somewhere. */
export const GLOBAL_RESULT_ORDER: GlobalResultKind[] = [
  "screen",
  "setting",
  "exercise",
  "sport",
  "plan",
  "recipe",
  "help",
];

/**
 * How much a kind is worth before anything about the individual item is
 * considered. It only breaks ties INSIDE a band — a lift whose name you typed
 * still beats a screen you only half-matched — but it decides the common case
 * where a word names two things equally well.
 */
const KIND_PROMINENCE: Record<GlobalResultKind, number> = {
  // A drawer is a navigation surface: when a word names a screen AND something
  // else equally well, the screen is what was meant. "plan" tied Plank against
  // Plans to the point, and the alphabet decided it.
  screen: 60,
  setting: 30,
  help: 20,
  plan: 20,
  recipe: 12,
  // Exercises and sports carry their own prominence from the exercise adapter
  // (compound + pattern + implement + canonical list), which is a far better
  // signal than a flat per-kind number. Nothing is added on top.
  exercise: 0,
  sport: 0,
};

export interface GlobalSearchSources {
  /**
   * Resolve an i18n key, returning the fallback when the key is missing. Pass
   * the client's own `t` wrapper so a searched label reads in the athlete's
   * language and matches what the drawer prints beside it.
   */
  label?: (key: string, fallback: string) => string;
  /** Nav ids this athlete can reach, with their lock state (persona + access). */
  screens?: readonly { id: string; locked?: boolean }[];
  /** The pickable exercise catalog — built-ins plus the admin library. */
  exercises?: readonly string[];
  /** Admin-library aliases, so a superseded spelling still finds its lift. */
  aliasMap?: Readonly<Record<string, string>>;
  /** Corpora that are pure core data; each defaults to ON. */
  settings?: boolean;
  plans?: boolean;
  recipes?: boolean;
  help?: boolean;
}

const idLabel = (src: GlobalSearchSources, key: string, fallback: string) =>
  src.label ? src.label(key, fallback) : fallback;

/** A phrase and its words — "delete account" has to answer "account" too. */
const terms = (...raw: (string | undefined)[]): string[] =>
  raw.flatMap((r) => {
    const t = normalizeSearchText(r ?? "");
    return t ? [t, ...t.split(" ")] : [];
  });

/**
 * What athletes call a screen when they don't call it by its name. The same
 * species of list as EXERCISE_NICKNAMES and kept just as short: these are the
 * words that were demonstrably missing, not every word that could conceivably
 * apply. "food" reaching Nutrition matters; a thesaurus does not.
 */
const SCREEN_SYNONYMS: Record<string, string[]> = {
  nutrition: ["food", "eating", "meals", "calories", "macros", "diet"],
  checkin: ["sleep", "soreness", "readiness", "recovery", "how i feel", "mood"],
  progress: ["weight", "bodyweight", "photos", "measurements"],
  performance: ["records", "pr", "prs", "1rm", "strength standards"],
  history: ["past sessions", "logbook", "previous workouts"],
  log: ["start a workout", "train", "session", "lift"],
  timer: ["intervals", "emom", "tabata", "stopwatch"],
  runtrack: ["gps", "track a run", "record a run"],
  connections: ["apple watch", "healthkit", "whoop", "oura", "garmin", "wearable", "devices"],
  volume: ["sets per week", "tonnage", "workload"],
  calendar: ["schedule", "week", "upcoming"],
  builder: ["routine", "template", "make a workout"],
  exercises: ["movements", "lifts", "exercise library"],
  notifications: ["alerts", "reminders"],
  profile: ["me", "my account", "avatar"],
  feed: ["friends", "social", "timeline"],
  leaderboard: ["ranking", "board"],
};

/**
 * Build the searchable index. Do it ONCE per session (memoize on the catalog and
 * the athlete's reachable screens) — ranking is cheap, normalizing a few hundred
 * names is not.
 */
export function buildGlobalSearchIndex(src: GlobalSearchSources = {}): RankedEntry<GlobalResult>[] {
  const out: RankedEntry<GlobalResult>[] = [];
  const push = (
    result: GlobalResult,
    names: string[],
    opts: { terms?: string[]; weakTerms?: string[]; prominence?: number } = {},
  ) =>
    out.push(
      searchEntry(result, names, {
        ...opts,
        prominence: (opts.prominence ?? 0) + KIND_PROMINENCE[result.kind],
        key: `${result.kind}:${result.id}`,
      }),
    );

  // ── screens ────────────────────────────────────────────────────────────────
  const byId = new Map(NAV_ITEMS.map((i) => [i.id, i]));
  for (const s of src.screens ?? []) {
    const item = byId.get(s.id);
    if (!item) continue;
    const title = idLabel(src, `nav.${s.id}`, item.label);
    push({ kind: "screen", id: s.id, title, locked: s.locked }, [title, item.label, s.id, ...(SCREEN_SYNONYMS[s.id] ?? [])], {
      terms: terms(item.group, "screen", "page"),
    });
  }

  // ── settings ───────────────────────────────────────────────────────────────
  if (src.settings !== false)
    for (const c of SETTINGS_ALL)
      push({ kind: "setting", id: c.id, title: c.title, sub: c.subtitle }, [c.title], {
        // Keywords and the subtitle are what a setting IS ABOUT, never alternate
        // NAMES for it. As names they outrank everything: "plan" is a keyword of
        // Subscription, which made it an exact match and buried the Plans screen
        // under it. As terms they still find the setting and can no longer beat
        // something the query actually named.
        terms: terms(...(c.keywords ?? []), c.subtitle, "settings"),
      });

  // ── exercises + sports ─────────────────────────────────────────────────────
  // Straight off the exercise adapter, so every nickname, rename breadcrumb,
  // muscle term and prominence weight it already knows comes with them.
  for (const e of buildExerciseIndex(src.exercises ?? [], src.aliasMap ?? {})) {
    const sport = olympicSport(e.value);
    out.push({
      ...e,
      value: {
        kind: sport ? "sport" : "exercise",
        id: e.value,
        title: e.value,
        sub: sport ? sport.category : exerciseGearLine(e.value) || undefined,
      },
      key: `${sport ? "sport" : "exercise"}:${e.value}`,
    });
  }

  // ── plans ──────────────────────────────────────────────────────────────────
  if (src.plans !== false)
    for (const g of GOAL_TREE) {
      push({ kind: "plan", id: g.id, title: g.name, sub: g.category }, [g.name], {
        terms: terms(g.category, "goal", "plan", "program"),
        weakTerms: terms(g.blurb),
      });
      for (const p of g.plans)
        push({ kind: "plan", id: p.id, title: p.name, sub: g.name, parentId: g.id }, [p.name], {
          terms: terms(g.name, g.category, ...p.focus, p.tag, "plan", "program"),
          weakTerms: terms(p.desc),
          // A named plan is a more specific answer than its goal, but the goal
          // is the thing most people mean by its name ("Bodybuilding").
          prominence: -6,
        });
    }

  // ── recipes ────────────────────────────────────────────────────────────────
  if (src.recipes !== false)
    for (const r of RECIPES)
      push({ kind: "recipe", id: r.id, title: r.name, sub: `${r.meal} – ${r.macros.kcal} kcal` }, [r.name], {
        terms: terms(r.meal, "recipe", "food", "meal", ...(r.highProtein ? ["high protein"] : [])),
        weakTerms: terms(r.note, ...r.ingredients.map((i) => i.name)),
      });

  // ── help ───────────────────────────────────────────────────────────────────
  if (src.help !== false)
    for (const h of HELP_ROWS) {
      const title = idLabel(src, h.titleKey, h.id);
      push({ kind: "help", id: h.id, title, sub: idLabel(src, h.bodyKey, "") || undefined }, [title, h.id], {
        terms: terms("help", "support"),
      });
    }

  return out;
}

/** Rank the whole app against what was typed. Empty query → nothing. */
export function searchGlobal(
  index: readonly RankedEntry<GlobalResult>[],
  query: string,
  opts: RankedSearchOptions = {},
): RankedHit<GlobalResult>[] {
  return rankEntries(index, query, opts);
}

export interface GlobalResultGroup {
  kind: GlobalResultKind;
  hits: RankedHit<GlobalResult>[];
}

/**
 * Group ranked hits by kind for display, best group first, capping each group.
 *
 * A flat mixed list is the wrong shape for a cross-app search: "press" answers
 * with a lift, a screen and a setting, and reading them interleaved means
 * re-deciding what each row IS on every line. Grouping keeps the ranking (the
 * groups are ordered by their own best hit, and GLOBAL_RESULT_ORDER only breaks
 * ties) while letting the eye skip a whole category at once.
 */
/**
 * Two groups whose best hits are within this of each other matched EQUALLY
 * WELL, and the difference between them is noise — a character of name length,
 * a point of prominence. "plan" put Plank 60 points ahead of the Plans screen
 * out of sixty thousand, which is not a ranking, it is a coin toss with a
 * spreadsheet. Inside this margin the app's own order decides instead.
 */
const GROUP_TIE = 400;

export function groupGlobalResults(
  hits: readonly RankedHit<GlobalResult>[],
  perGroup = 5,
): GlobalResultGroup[] {
  const byKind = new Map<GlobalResultKind, RankedHit<GlobalResult>[]>();
  for (const h of hits) {
    const list = byKind.get(h.value.kind) ?? [];
    if (list.length < perGroup) list.push(h);
    byKind.set(h.value.kind, list);
  }
  return [...byKind.entries()]
    .map(([kind, list]) => ({ kind, hits: list }))
    .sort((a, b) => {
      const gap = (b.hits[0]?.score ?? 0) - (a.hits[0]?.score ?? 0);
      if (Math.abs(gap) > GROUP_TIE) return gap;
      return GLOBAL_RESULT_ORDER.indexOf(a.kind) - GLOBAL_RESULT_ORDER.indexOf(b.kind);
    });
}
