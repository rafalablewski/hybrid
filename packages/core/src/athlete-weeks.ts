/**
 * THE NUMBER — labeled athlete-weeks.
 *
 * The company has exactly one metric, and this file is its definition. Every
 * other figure the platform can print (users, sessions, commits, screens,
 * capabilities shipped) is a counter: it moves when we work, which is why it
 * feels like progress and why it cannot be steered by. A counter can be run up
 * in a week by one person with no users at all — the repository is the proof.
 *
 * A LABELED ATHLETE-WEEK is one athlete × one week in which all three legs of
 * a learnable observation were captured:
 *
 *   STATE        what condition the athlete was in going into the week
 *   INTERVENTION what training was actually delivered
 *   OUTCOME      what measurably came back — the response, not the plan
 *
 * Three legs, because two of them teach nothing. Training with no state is a
 * log; state with no outcome is a diary; an outcome with no intervention is
 * weather. Only the triple is a row a model can learn from, and the corpus of
 * those rows is the one asset in this company that cannot be bought, scraped,
 * copied, or built faster with better tooling — it accrues at one week per
 * week, per athlete, and at no other rate.
 *
 * RETAINED, because the week has to belong to someone who came back. An
 * athlete's first week is real data and is counted separately; it is not yet
 * evidence that anything compounds. A week counts toward THE NUMBER when the
 * same athlete was already logging within `RETENTION_GAP_WEEKS` before it.
 *
 * Everything here is pure and takes rows as given — the SQL that derives the
 * legs lives in apps/web/app/api/admin/athlete-weeks, and the surfaces that
 * render the verdict live in both admin consoles. The definition is written
 * once, here, so a leg cannot quietly get easier to satisfy on one surface.
 */

/** The three legs of a learnable observation. Order is the order they occur. */
export const LABEL_LEGS = ["state", "intervention", "outcome"] as const;
export type LabelLeg = (typeof LABEL_LEGS)[number];

export interface LabelLegSpec {
  id: LabelLeg;
  /** Screen label. */
  label: string;
  /** What the leg answers. */
  question: string;
  /** What, in this product, counts as having captured it. */
  captured: string;
}

export const LABEL_LEG_SPEC: Record<LabelLeg, LabelLegSpec> = {
  state: {
    id: "state",
    label: "State",
    question: "What condition was the athlete in?",
    captured:
      "A readiness read or daily check-in answered, or a wearable state signal landed (HRV, resting HR, sleep).",
  },
  intervention: {
    id: "intervention",
    label: "Intervention",
    question: "What training was actually delivered?",
    captured:
      "At least one session that projected performed rows — sets, or a whole timed effort — into the fact table.",
  },
  outcome: {
    id: "outcome",
    label: "Outcome",
    question: "What came back?",
    captured:
      "A measured RESPONSE to that training: the post-session feel/fatigue report, a device recording matched or streamed onto the session, or a dated body measurement. Never the training numbers themselves — those are the intervention, and letting them stand in for the outcome would make every leg true by construction.",
  },
};

/**
 * How long an athlete may be away and still count as retained on their return.
 * A month off is a training block, a holiday, or an injury — not a churn. Two
 * months and the athlete was re-acquired, and the week starts the clock again.
 */
export const RETENTION_GAP_WEEKS = 4;

/** One athlete's one week, as the database can see it. `week` is the Monday. */
export interface AthleteWeekInput {
  /** Opaque athlete key — never rendered; only used to group and to test retention. */
  userId: string;
  /** Monday of the week as a YYYY-MM-DD key. */
  week: string;
  state: boolean;
  intervention: boolean;
  outcome: boolean;
}

export interface AthleteWeek extends AthleteWeekInput {
  /** All three legs captured. */
  labeled: boolean;
  /** The athlete was already logging within RETENTION_GAP_WEEKS before this week. */
  retained: boolean;
  /** Labeled AND retained — this is the week that counts toward THE NUMBER. */
  counts: boolean;
  /** The legs that were not captured, in leg order. */
  missing: LabelLeg[];
}

const WEEK_MS = 7 * 86_400_000;

/** Whole weeks from Monday-key `a` to Monday-key `b` (b − a). Label math. */
export function weekKeyDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) / WEEK_MS);
}

/**
 * The Monday of the UTC week containing `ms`, as a YYYY-MM-DD key.
 *
 * UTC deliberately: these keys have to line up with Postgres
 * `date_trunc('week', …)` over UTC-stored timestamps, or the window the ledger
 * asks for and the weeks the database groups by are off by a few hours and the
 * first bucket silently loses rows. A per-athlete surface would want the
 * athlete's LOCAL Monday (day-key.ts `localMondayMs`); an aggregate over many
 * timezones has no local Monday to want.
 */
export function utcMondayKey(ms: number): string {
  const d = new Date(ms);
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return new Date(monday).toISOString().slice(0, 10);
}

/** Add whole weeks to a Monday key. */
export function addWeeks(week: string, n: number): string {
  return new Date(Date.parse(`${week}T00:00:00.000Z`) + n * WEEK_MS).toISOString().slice(0, 10);
}

/**
 * Grade every row: labeled, retained, counting. Rows may (and should) include
 * up to RETENTION_GAP_WEEKS of lookback before the window being reported, so
 * the earliest reported weeks can be tested for retention against real history
 * rather than against the edge of the query.
 */
export function gradeAthleteWeeks(rows: AthleteWeekInput[]): AthleteWeek[] {
  const byAthlete = new Map<string, string[]>();
  for (const r of rows) {
    const weeks = byAthlete.get(r.userId);
    if (weeks) weeks.push(r.week);
    else byAthlete.set(r.userId, [r.week]);
  }
  for (const weeks of byAthlete.values()) weeks.sort();

  return rows.map((r) => {
    const missing = LABEL_LEGS.filter((leg) => !r[leg]);
    const labeled = missing.length === 0;
    // Retained = this athlete has an EARLIER active week no more than
    // RETENTION_GAP_WEEKS back. Any activity counts as presence; the labeling
    // test is about the week itself, not about the week they returned from.
    const prior = byAthlete.get(r.userId) ?? [];
    const retained = prior.some((w) => {
      const gap = weekKeyDiff(w, r.week);
      return gap > 0 && gap <= RETENTION_GAP_WEEKS;
    });
    return { ...r, labeled, retained, counts: labeled && retained, missing };
  });
}

/** THE NUMBER over the given weeks: retained weeks that were fully labeled. */
export function labeledAthleteWeeks(weeks: AthleteWeek[]): number {
  return weeks.reduce((n, w) => n + (w.counts ? 1 : 0), 0);
}

export interface AthleteWeekLedgerRow {
  /** Monday of the week (YYYY-MM-DD). */
  week: string;
  /** Retained + fully labeled — THE NUMBER banked this week. */
  labeled: number;
  /** Fully labeled, but the athlete's first week (or first back after a gap). */
  firstWeeks: number;
  /** Active but missing at least one leg — the week we half-learned from. */
  partial: number;
  /** Distinct athletes active at all this week. */
  athletes: number;
  /** How many active weeks each leg was missing from. */
  missing: Record<LabelLeg, number>;
}

const emptyLedgerRow = (week: string): AthleteWeekLedgerRow => ({
  week,
  labeled: 0,
  firstWeeks: 0,
  partial: 0,
  athletes: 0,
  missing: { state: 0, intervention: 0, outcome: 0 },
});

/**
 * Per-week ledger, oldest first. `from` (a Monday key) drops lookback weeks.
 *
 * Pass `span` — the number of consecutive weeks the window covers — to get a
 * DENSE ledger: exactly `span` rows from `from`, zero-filled. A week in which
 * nobody logged anything is a nil return, not an absent one, and a sparse
 * ledger renders it as a missing bar (which reads as "no data") and lets a
 * week-on-week comparison silently step over it.
 */
export function athleteWeekLedger(
  weeks: AthleteWeek[],
  from?: string,
  span?: number,
): AthleteWeekLedgerRow[] {
  const rows = new Map<string, AthleteWeekLedgerRow>();
  if (from && span !== undefined) {
    for (let i = 0; i < span; i++) {
      const week = addWeeks(from, i);
      rows.set(week, emptyLedgerRow(week));
    }
  }
  for (const w of weeks) {
    if (from && w.week < from) continue;
    let row = rows.get(w.week);
    if (!row) {
      row = emptyLedgerRow(w.week);
      rows.set(w.week, row);
    }
    row.athletes++;
    if (w.counts) row.labeled++;
    else if (w.labeled) row.firstWeeks++;
    else row.partial++;
    for (const leg of w.missing) row.missing[leg]++;
  }
  return [...rows.values()].sort((a, b) => a.week.localeCompare(b.week));
}

export interface LegCapture {
  leg: LabelLeg;
  /** Active weeks in which this leg WAS captured. */
  captured: number;
  /** Active weeks in which it was not. */
  missing: number;
  /** Capture rate 0..1, or null with no active weeks — no denominator, no rate. */
  rate: number | null;
}

/** Per-leg capture across the given weeks, in leg order. */
export function legCapture(weeks: AthleteWeek[]): LegCapture[] {
  return LABEL_LEGS.map((leg) => {
    const captured = weeks.reduce((n, w) => n + (w[leg] ? 1 : 0), 0);
    return {
      leg,
      captured,
      missing: weeks.length - captured,
      rate: weeks.length === 0 ? null : captured / weeks.length,
    };
  });
}

export interface BindingLeg {
  /** The leg missing from the most active weeks, or null when nothing is active
   *  (or when every active week is already complete — nothing is binding). */
  leg: LabelLeg | null;
  /** Weeks it cost us. */
  weeksBlocked: number;
  /** Weeks that would become labeled if ONLY this leg were fixed — the honest
   *  prize, which is smaller than `weeksBlocked` whenever a week is missing two. */
  weeksRecoverable: number;
}

/**
 * The one leg to go and fix. This is what makes the metric a strategy rather
 * than a scoreboard: it names the next piece of work by pointing at whichever
 * leg the corpus is actually losing weeks to.
 */
export function bindingLeg(weeks: AthleteWeek[]): BindingLeg {
  let best: BindingLeg = { leg: null, weeksBlocked: 0, weeksRecoverable: 0 };
  for (const leg of LABEL_LEGS) {
    const blocked = weeks.reduce((n, w) => n + (w.missing.includes(leg) ? 1 : 0), 0);
    if (blocked === 0 || blocked <= best.weeksBlocked) continue;
    best = {
      leg,
      weeksBlocked: blocked,
      weeksRecoverable: weeks.reduce(
        (n, w) => n + (w.missing.length === 1 && w.missing[0] === leg ? 1 : 0),
        0,
      ),
    };
  }
  return best;
}

export interface NumberMovement {
  /** THE NUMBER banked in the most recent complete week in the ledger. */
  latest: number;
  /** The week before it. */
  previous: number;
  /** latest − previous. */
  delta: number;
  /** Mean over the last four ledger weeks, or null with none. */
  run4: number | null;
  /** Cumulative over the whole ledger. */
  total: number;
}

/**
 * Movement of THE NUMBER. `ledger` is oldest-first; the CURRENT week is still
 * accruing and would always read as a fall, so pass `excludeCurrent` (the
 * default) to judge the last complete week against the one before it.
 */
export function numberMovement(ledger: AthleteWeekLedgerRow[], excludeCurrent = true): NumberMovement {
  const rows = excludeCurrent ? ledger.slice(0, -1) : ledger;
  const at = (i: number) => rows[rows.length - i]?.labeled ?? 0;
  const last4 = rows.slice(-4);
  return {
    latest: at(1),
    previous: at(2),
    delta: at(1) - at(2),
    run4: last4.length === 0 ? null : last4.reduce((n, r) => n + r.labeled, 0) / last4.length,
    total: ledger.reduce((n, r) => n + r.labeled, 0),
  };
}

/**
 * The judgement any piece of work has to face: what did it do to THE NUMBER?
 * `before` and `after` are the metric over two comparable windows. This is a
 * before/after read and says so — it is not a causal claim, and the verdict
 * deliberately has no "probably would have" branch.
 */
export function judgeEffect(before: number, after: number): {
  delta: number;
  /** Relative change, or null when there was nothing to move. */
  pct: number | null;
  verdict: "moved" | "flat" | "lost" | "unstarted";
} {
  const delta = after - before;
  if (before === 0 && after === 0) return { delta: 0, pct: null, verdict: "unstarted" };
  return {
    delta,
    pct: before === 0 ? null : delta / before,
    verdict: delta > 0 ? "moved" : delta < 0 ? "lost" : "flat",
  };
}

/**
 * The counters that are NOT the metric, named here so they cannot drift back
 * into the hero slot of a dashboard. They are worth showing as context — an
 * unexplained figure is its own kind of dishonesty — and worth showing as what
 * they are: numbers that move when we work rather than when the athlete does.
 */
export const VANITY_METRICS: { label: string; why: string }[] = [
  { label: "Total users", why: "A registration is not a week of training. It moves on marketing and never comes back down." },
  { label: "Sessions logged", why: "Counts intervention alone — the leg that was never the hard one." },
  { label: "Avg sessions / user", why: "A ratio of two counters, dominated by whoever signed up and left." },
  { label: "Capabilities shipped", why: "Measures our output, not the athlete's. It ran to 480 at zero users." },
  { label: "Commits", why: "Construction is the input that got cheap. It is no longer evidence of anything." },
];

/** One line, same words on every surface, so the definition cannot fork. */
export const THE_NUMBER_DEFINITION =
  "Retained weeks of logging in which state, intervention and outcome were all captured.";

/** What to say when nothing has been banked yet — true, and not a zero dressed up. */
export const THE_NUMBER_UNSTARTED =
  "No labeled athlete-week has been banked. The clock that cannot be compressed has not started.";
