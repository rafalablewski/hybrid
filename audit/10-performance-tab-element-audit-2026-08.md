# Performance tab — element-by-element audit (Aug 2026)

Scope: the Performance tab on **both** clients (`apps/web/components/aurora/performance.tsx`,
`apps/mobile/components/aurora/performance.tsx`) including the Volume, Trends and
Tissue modules it absorbed, plus the `packages/core` engines that feed them.
Read statically against `af7ce62`. Pixel heights are estimates derived from
layout constants, not measurements — the ratios are the argument, not the totals.

**20 card surfaces — 26 elements judged.** Keep 4 — Fix 6 — Merge 4 — Move 6 — Cut 6.

---

## The read

1. **This is an archive, not a tab.** Twenty card surfaces, ~100 distinct figures,
   one scroll. Volume and Trends were absorbed whole and account for an
   estimated **68% of the tab's height**. The merge preserved everything; merging
   is a deletion exercise, and this page has not had one.
2. **The headline metric rewards not training.** `computeHpi` is `100 − fatigue`.
   Rest raises it; a hard block lowers it; the top band is called "peak".
3. **The page contradicts itself in two places** (see the integrity register).
4. **~20% of the surface is the same fact twice** — endurance/sport/velocity each
   appear in both Breakdown and Horizon; ACWR in the chips and the Tissue card;
   week X of Y three times.
5. **A settings screen is hidden inside an analytics tab** — ~50 controls behind
   Volume's edit toggle.

## Where the scroll goes (estimated, phone, populated athlete)

| Surface | px | Share |
| --- | ---: | ---: |
| Masthead + chips | 130 | 2% |
| Performance State | 300 | 5% |
| 14-day trajectory | 280 | 4% |
| Tissue (calm) | 260 | 4% |
| Your week | 260 | 4% |
| Breakdown tabs | 220 | 4% |
| **Volume (7 sections)** | **2350** | **38%** |
| **Trends (sheet + table)** | **1870** | **30%** |
| Goal + Season duo | 160 | 3% |
| Horizon rows | 220 | 4% |
| 4 group markers | 176 | 3% |

The four blocks answering *"how am I doing right now"* occupy ~16%. The two
absorbed screens occupy ~68%.

---

## Integrity register (defects, not opinions)

### R1 — The big HPI number and its own sparkline disagree
The headline comes from `computePerformanceState(log, bio)` (applies the ±15
wearable adjustment). The sparkline beside it and the trajectory chart below come
from `performanceTrajectory()` → `computeHpi(fatigue)` with **no biometrics**.
With a wearable connected, the last sparkline bar is a different number from the
46px figure 8px away. Same fault for readiness: the ring reads
`prescribeSession`'s score (with bio + subjective check-in); the chart's
Readiness series is `computeReadiness(fatigue)` (neither).

`performance-state.ts:180-186` — `engines/hpi.ts:95` — `engines/prescription.ts:120`
— `aurora/performance.tsx:140,148,215,225`

### R2 — Two "weeks", one hub, different windows
This tab's **Your week** = `weeklyRecap()`, rolling `now − 7 days`
(`engines/recap.ts:104`). The Today tab's **This week** = `resolveActivityRange()`,
anchored on the local Monday (`activity-window.ts:147`). Different session counts,
tonnage and set counts under two labels a reader treats as synonyms — in two
segments of the same control. The Monday anchor was introduced deliberately as a
correction; it was never applied here.

### R3 — The flagship metric rewards not training
`computeHpi`: `strength = 100 − muscleAvg`, `endurance = 100 − enduranceFatigue`,
blended, nudged by recovery. It is a **freshness** index with bands named *peak,
primed, moderate, compromised, depleted*. It climbs through a deload and a
layoff, and falls during the most productive block of a season. Naming and
modelling decision — no layout work fixes it. `engines/hpi.ts:40-120`

### R4 — Three columns, two scales, one type treatment
STR / END / REC render as three identical 24px figures. Strength and Endurance are
0–100 indices; Recovery is an additive **±15**. The `+` sign is the only cue.
`engines/hpi.ts:45-52` — `aurora/performance.tsx:219-223`

---

## Element ledger

### STATE

| # | Element | Verdict | Judgment |
| --- | --- | --- | --- |
| S1 | Masthead (caption, title, sub) | **Fix** | Title and season caption earn their place. The subtitle promises "one read" above a twenty-card scroll — a claim the page falsifies. |
| S2 | Chip rail (phase, event, ACWR, HPI) | **Merge** | Every pill is a smaller, earlier copy of something stated in full below — the HPI card is ~90px under the HPI pill. Keep event + phase at most. |
| S3 | Performance State card | **Fix** | Correct anatomy, correct position. Sparkline disagrees with the number (R1); metric rises with rest (R3); the actionable word (limiter) is last and smallest. |
| S4 | STR / END / REC columns | **Fix** | Right question, wrong encoding (R4). Keep two indices as peers; render recovery as a signed adjustment on the headline. |
| S5 | Readiness ring + `readinessWhy` lines | **Keep** | Best-built thing on the page: a number that explains itself in the athlete's terms, honest on an empty log. Must never disagree with Today's ring (R1). |
| S6 | Readiness nudge pill | **Keep** | Conditional, consequential, closes the loop the athlete opened. Highest value-per-pixel here. |
| S7 | 14-day trajectory card | **Merge** | 280px + a chart library for two series already summarised above. No session/deload annotation, so a dip is unattributable. Fold into the state card as an expandable pulse. |
| S8 | Tissue card — calm state | **Keep** | Structurally exemplary: height tracks severity, refuses to state an all-clear without data. The pattern the rest of the page should copy. |
| S9 | Tissue card — opened state | **Keep** | Conditional depth attached to its trigger; opens itself when flagged. |
| S10 | Active RTP protocols | **Move** | A protocol is a *daily* object with steps and dates. Belongs in Today's Recover cluster; leave a live status line here that opens it. |
| S11 | Model-version footnote | **Cut** | Team-facing metadata on the card face; lends the numbers false precision. Keep it inside the "how is this calculated" disclosure. |

### TRAINING

| # | Element | Verdict | Judgment |
| --- | --- | --- | --- |
| T1 | "Your week" card | **Cut** | Disagrees with the sibling tab's week (R2); its destination (Statistics) was demoted out of nav and this card is the last thing keeping it reachable; Today's activity card is a strict superset. Fold the PR rows into Today. |
| T2 | Breakdown tabs | **Cut** | Three of four panels duplicate the Horizon rows verbatim (same `runTotals()`, same links), hidden behind tabs so the duplication is never visible at once. Move the one unique line — the top driver — into the state card. |
| T3 | Volume hero (week-shape) | **Move** | Genuinely good information design, and the one Volume block that belongs on this tab — as a compact block with a door. |
| T4 | Volume block ramp / prescriptions / rails | **Move** | ~1,600px of a programming tool with its own chart grammar (bands, notches, calipers, carets) that nothing else here uses. It was a screen; make it one. |
| T5 | Volume "Whose numbers are these" | **Move** | Serious work answering the trust question — buried at ~pixel 4,000 of a tab that opens with an unexplained index. Generalise the provenance ladder to HPI. |
| T6 | Landmark editing + profile form | **Cut** | ~50 controls (35 landmark fields, 6 numeric + 6 toggles, block steppers, model switches) inside a read-only tab. These are model parameters: an edit silently rewrites every band and verdict above with no confirmation or history. Own route. |
| T7 | Band glossary | **Cut** | The interactive band spotlight already teaches this better; the card is the pre-interactive version left in place. |
| T8 | Trends sets + tonnage measures | **Move** | Figures-first redesign is right, but weekly sets is now stated three times on one page at three grains. Pick one home. |
| T9 | Exercise table | **Fix** | Every exercise ever logged, period `all`, no cap, no virtualization, one dashboard pass per exercise. Cap + bound the default period + virtualize, then give it to the Exercises destination. |

### SEASON

| # | Element | Verdict | Judgment |
| --- | --- | --- | --- |
| P1 | Goal widget | **Merge** | Every token already printed in the masthead caption and phase chip. |
| P2 | Season progress widget | **Merge** | The percentage is a third rendering of "week 4 of 12". The enrollment-state handling is careful and deserves a better-scoped card. |
| P3 | "Open setup" | **Move** | Web expands the whole onboarding flow inline mid-scroll with the old season's analytics still beneath it; mobile routes. Parity break on the one control that rewrites the athlete's year. Make web match mobile. |

### EXPLORE

| # | Element | Verdict | Judgment |
| --- | --- | --- | --- |
| E1 | Horizon rows | **Fix** | Right pattern — value-bearing doors. The AI Coach row's value is the static string "Ask about today"; give it a real value or drop it (the coach is reachable from Today). |
| E2 | Four group markers | **Cut** | Signposting is a symptom of length treated as a feature; two of four clusters hold a single block. If the page still needs four labels after the cuts, the cuts didn't go far enough. |
| E3 | Casual-persona teaser | **Fix** | Six identical padlocks tell a free user nothing about their own data. Show one real computed figure, lock the depth behind it. Also: six decorative leading dots, against the project's no-decorative-marker rule. |

---

## Render cost (per mount — this is a hub segment, so it runs on a tap)

| Call | Cost | Note |
| --- | --- | --- |
| `performanceTrajectory(log, 14)` | ×2 | Once for the chart, again for the sparkline — 28 fatigue replays where 14 would do. The sparkline then re-sorts a series already returned oldest-first (no-op). |
| `velocityProfiles(sessions)` | ×2 | Inline in the prescription memo and again as its own memo. |
| `exerciseTable(sessions, "all")` | ×1 | Per-exercise dashboard pass over full history, for every exercise ever logged. Heaviest call on the page, at the bottom of it. |
| `replayLandmarks(...)` | ×1 | One landmark resolve per week of history, to draw four rows behind a collapsed disclosure. |
| `weeklyMuscleSets(...)` | ×7 | Computed for all seven muscles whether or not a row is expanded. |
| recharts (web) | 1 chart | A charting library for a single 14-point line, on a page whose other charts use the shared `sparkline()` helper. |

## Parity and dead weight

| Element | Web | Mobile | Judgment |
| --- | --- | --- | --- |
| Open setup | Inline onboarding, mid-card | Pushes `/onboarding` | Real IA divergence. Mobile is right. |
| Trajectory chart | Line chart, axes, tooltip | Bars + tick markers, hard-coded `-13d`, no per-point read | Same data, different legibility. |
| Trajectory legend | Readiness dash-encoded (line style carries identity) | Two solid swatches, hue only | Web's own comment explains why hue alone fails on the light theme; mobile does exactly that. |
| Entry points | 4 screen ids resolve here + hub tab | Hub tab + `/performance` from More | The masthead has to work in two contexts and is tuned for neither. |
| `macroReady` | Declared, never read | — | Dead prop. Delete. |

---

## Recommended sequence

1. **Make the page agree with itself** — one computation behind the HPI figure and
   its sparkline, one behind the readiness ring and the readiness series; move
   "Your week" onto the Monday window or delete the card. Defects, no design call.
2. **Settle what HPI is** — rename it to the freshness index it computes (and let
   the band words follow), or add the capability signal that makes "performance"
   true. Nothing else here matters as much.
3. **Give Volume and Trends their screens back** — the tab keeps the Volume hero
   and one door. ~3,900px returned; two tools that get to be tools again.
4. **Delete the second copies** — Breakdown, "Your week", the HPI and ACWR chips,
   the goal/season split, the band glossary. None is the only statement of anything.
5. **Move the settings out** — landmark editing, volume profile and model toggles
   become one route that shows the athlete what their edit changed.
6. **Re-read it** — what remains is masthead, state card, Tissue, volume hero, one
   season block, exit rows. Six surfaces. At that length the group markers have
   nothing to signpost and the subtitle's "one read" becomes true.

**The test applied throughout:** if this were the only thing on the screen, would
an athlete open the app for it?
