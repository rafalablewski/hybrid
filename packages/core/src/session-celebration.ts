/**
 * SESSION CELEBRATION — which single personal best a finished workout should
 * headline, and how big a moment it is. One pure model both clients render so
 * the PR-reveal hero on the individual-workout page (web session-detail + mobile
 * session/[id]) headlines the SAME record with the SAME copy.
 *
 * A strength PR always leads (the heaviest e1RM reads as the most "hero"); a
 * cardio PR only takes the headline when there's no strength PR in the session.
 * `total` carries the full PR count so the reveal can add "and N more".
 */
import type { PrHit, CardioPrHit } from "./engines/records";

export type Celebration =
  | {
      kind: "strength";
      /** the lift that set the record */
      lift: string;
      /** new best estimated 1RM (kg, rounded) */
      e1rm: number;
      /** prior best (kg), or null when it's the first time trained */
      previous: number | null;
      /** true when this lift had never been trained before */
      firstEver: boolean;
      /** total PRs (strength + cardio) set in the session */
      total: number;
    }
  | {
      kind: "cardio";
      /** the movement that set the record */
      move: string;
      /** "distance" → furthest ever; "pace" → fastest ever over ≥ that far */
      prKind: "distance" | "pace";
      /** distance in km (distance PR) or pace in sec/km (pace PR) */
      value: number;
      /** prior best, or null when it's a first */
      previous: number | null;
      firstEver: boolean;
      total: number;
    };

/**
 * The one record to celebrate, or null when the session set none. Strength wins
 * the headline (re-picked by heaviest e1RM, since `prsForSession` orders by
 * gain); cardio headlines only in a PR-but-no-lift session.
 */
export function sessionCelebration(prs: PrHit[], cardioPrs: CardioPrHit[]): Celebration | null {
  const total = prs.length + cardioPrs.length;
  if (total === 0) return null;

  if (prs.length > 0) {
    const top = [...prs].sort((a, b) => b.e1rm - a.e1rm)[0]!;
    return {
      kind: "strength",
      lift: top.lift,
      e1rm: top.e1rm,
      previous: top.previous,
      firstEver: top.previous == null,
      total,
    };
  }

  // Cardio-only PR session — the list is already distance-first, best-first.
  const top = cardioPrs[0]!;
  return {
    kind: "cardio",
    move: top.move,
    prKind: top.kind,
    value: top.value,
    previous: top.previous,
    firstEver: top.previous == null,
    total,
  };
}
