"use client";

import { useEffect, useRef, useState } from "react";
import { fs, space, GOAL_TREE, GOAL_CATEGORIES, goalShelves, libraryCoverView, planDetail, srSingleReps, programFor, planProgramView, planCoverView, goalCoverView, planHeroView, splitInputsTitle, inputEcho, type GoalGroup, type GoalNode, type GoalPlan, type PlanProgram, type PlanWeekBar } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { useMacrocycle } from "@/lib/use-macrocycle";
import { usePlanMaxes, setPlanMax } from "@/lib/plan-maxes";
import LeavePlanSection from "./leave-plan";
import ProgramDays from "../program-days";
import { AuroraIcon } from "./icons";
import { MetaLine } from "./meta";

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 18 } as const;
const chip = (color: string, label: string) => <span style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color, borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: fs.micro, marginRight: 6, marginBottom: 4, display: "inline-block" }}>{label}</span>;

/** AURORA Plans (web) — goal grid → plan list → detail + enroll, reusing the
 *  exact GOAL_TREE / planDetail + /api/macrocycles enroll. */
export default function AuroraPlans({ onEnrolled }: { onEnrolled?: () => void }) {
  const { t } = useLang();
  const [goalId, setGoalId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  // Free-text search over the library. The CATEGORY lever is gone: with every
  // category rendered as its own shelf, filtering to one leaves an empty
  // screen — so the chips navigate to a shelf instead of narrowing to one.
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  useHeroCollapse(rootRef, heroRef); // no dock at the root — collapse + snap only
  const goal = GOAL_TREE.find((g) => g.id === goalId) ?? null;
  const plan = goal?.plans.find((p) => p.id === planId) ?? null;

  if (plan && goal) {
    const program = programFor(plan.id);
    if (program) return <PercentDetail goal={goal} plan={plan} program={program} back={() => setPlanId(null)} onEnrolled={onEnrolled} />;
    return <Detail goal={goal} plan={plan} back={() => setPlanId(null)} onEnrolled={onEnrolled} />;
  }
  if (goal) return <List goal={goal} pick={setPlanId} back={() => { setGoalId(null); setPlanId(null); }} />;

  // ── the library cover: the SAME scaffold the goal and plan screens ride, so
  // every depth of the Plans stack is one object at a different compression.
  // Its accent is the theme's primary (no discipline owns "Plans"), softened by
  // the "library" variant so the root can't out-shout the goals on its shelves.
  const shelves = goalShelves(query);
  const lib = libraryCoverView(GOAL_TREE.length, GOAL_CATEGORIES, {
    chip: t("w.train.plans.libraryChip"),
    title: t("w.train.plans.title"),
    goal: t("w.train.plans.goalCount"),
    goals: t("w.train.plans.goalsCount"),
  });

  return (
    <div ref={rootRef} style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <CoverHero
        cover={{ accent: C("lime"), glyph: lib.glyph, chip: lib.chip, duration: lib.count, title: lib.title, metaParts: lib.metaParts, stats: [], blurb: "", variant: "library" }}
        heroRef={heroRef}
      />
      <CategoryRail categories={shelves.map((s) => s.category)} />
      <div style={{ position: "relative", margin: "14px 0 0" }}>
        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", display: "flex", pointerEvents: "none" }}><AuroraIcon name="search" size={16} color={C("ash")} /></span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("w.train.plans.searchGoals")}
          aria-label={t("w.train.plans.searchGoals")}
          style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px 12px 40px", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, color: C("chalk"), fontFamily: "var(--font-mono)", fontSize: fs.body, outline: "none" }}
        />
      </div>
      <div style={{ marginTop: 16 }}><EnrolledCard /></div>
      {shelves.length === 0 ? (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash"), padding: "8px 2px" }}>{t("w.train.plans.noMatches")}</p>
      ) : (
        shelves.map((group) => <GoalShelf key={group.category} group={group} pick={setGoalId} />)
      )}
    </div>
  );
}

/** Fallback height of the docked chip rail (it measures itself) — the offset a
 *  jump has to clear on top of the collapsed cover bar. */
const RAIL_H = 49;
/** Where a category's shelf anchors, so the chips can find it. */
const shelfId = (category: string) => `plan-shelf-${category.toLowerCase().replace(/[^a-z]+/g, "-")}`;

/** The category chips, sticking directly beneath the collapsed cover bar so
 *  they stay reachable at any scroll position (mobile parity: the scaffold's
 *  `rail` slot). They JUMP, they don't filter — the shelves already are the
 *  categories, so narrowing to one would just empty the screen. */
function CategoryRail({ categories }: { categories: string[] }) {
  const navRef = useRef<HTMLElement>(null);
  const jump = (category: string) => {
    const el = document.getElementById(shelfId(category));
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const railH = navRef.current?.offsetHeight ?? RAIL_H;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - COVER_BAR - railH, behavior: reduced ? "auto" : "smooth" });
  };
  return (
    <nav
      ref={navRef}
      aria-label="Jump to category"
      style={{ position: "sticky", top: COVER_BAR, zIndex: 29, display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", margin: "0 calc(-1 * var(--page-pad-x, 16px))", padding: "9px var(--page-pad-x, 16px)", background: `color-mix(in srgb, ${C("ink")} 86%, transparent)`, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderBottom: `1px solid ${C("line")}` }}
    >
      {categories.map((c) => (
        <button
          key={c}
          onClick={() => jump(c)}
          style={{ flex: "0 0 auto", fontFamily: "var(--font-mono)", fontSize: fs.caption, letterSpacing: ".02em", padding: "7px 13px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", background: "transparent", color: C("ash"), border: `1px solid ${C("line")}` }}
        >
          {c}
        </button>
      ))}
    </nav>
  );
}

/** One category = one full-bleed shelf. The head states the COUNT so a
 *  two-card peek is never mistaken for the whole set, and a hairline track
 *  under the rail shows position — the two halves of making a horizontal rail
 *  honest about its tail. */
function GoalShelf({ group, pick }: { group: GoalGroup; pick: (id: string) => void }) {
  const { t } = useLang();
  const railRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);

  // Drive the hairline straight off the node — no re-render per scroll frame.
  const sync = () => {
    const rail = railRef.current;
    const thumb = thumbRef.current;
    if (!rail || !thumb) return;
    const max = rail.scrollWidth - rail.clientWidth;
    setOverflows(max > 1);
    if (max <= 1) return;
    const frac = rail.clientWidth / rail.scrollWidth;
    thumb.style.width = `${Math.max(12, frac * 100)}%`;
    thumb.style.transform = `translateX(${(rail.scrollLeft / max) * (1 - frac) * rail.clientWidth}px)`;
  };
  useEffect(() => {
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.category, group.goals.length]);

  return (
    <section id={shelfId(group.category)} style={{ marginTop: 24, scrollMarginTop: COVER_BAR + RAIL_H }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, margin: "0 0 10px" }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, letterSpacing: "-.01em", margin: 0 }}>{group.category}</h2>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: C("ash") }}>
          {group.goals.length} {group.goals.length === 1 ? t("w.train.plans.goalCount") : t("w.train.plans.goalsCount")}
        </span>
      </div>
      <div
        ref={railRef}
        onScroll={sync}
        style={{ display: "flex", gap: 12, overflowX: "auto", scrollbarWidth: "none", margin: "0 calc(-1 * var(--page-pad-x, 16px))", padding: "0 var(--page-pad-x, 16px)" }}
      >
        {group.goals.map((g) => (
          <GoalTile key={g.id} goal={g} onOpen={() => pick(g.id)} />
        ))}
      </div>
      {/* always mounted (the thumb ref is what measures the overflow), faded
          out when the shelf fits and there is no tail to report */}
      <div aria-hidden style={{ height: 2, borderRadius: 2, marginTop: 9, background: `color-mix(in srgb, ${C("chalk")} 10%, transparent)`, overflow: "hidden", opacity: overflows ? 1 : 0 }}>
        <span ref={thumbRef} style={{ display: "block", height: "100%", borderRadius: 2, background: `color-mix(in srgb, ${C("chalk")} 34%, transparent)` }} />
      </div>
    </section>
  );
}

/** A goal as a COVER, not a card — the Explore PlanCover recipe at tile scale,
 *  so clicking one expands it into the same poster at screen scale. A goal with
 *  no authored programs keeps its colour but at 45%, and says so, instead of
 *  printing "0 plans". */
function GoalTile({ goal, onOpen }: { goal: GoalNode; onOpen: () => void }) {
  const cover = goalCoverView(goal);
  return (
    <button
      onClick={onOpen}
      aria-label={`${goal.name} – ${cover.count}`}
      style={{ flex: "0 0 172px", height: 140, position: "relative", overflow: "hidden", borderRadius: 20, border: "1px solid rgba(255,255,255,.07)", background: COVER_INK, color: "#fff", padding: 13, display: "flex", flexDirection: "column", justifyContent: "space-between", textAlign: "left", cursor: "pointer" }}
    >
      <span aria-hidden style={{ position: "absolute", inset: 0, opacity: cover.ready ? 1 : 0.45, background: `linear-gradient(202deg, color-mix(in srgb, ${cover.accent} 52%, ${COVER_INK}) 0%, color-mix(in srgb, ${cover.accent} 15%, ${COVER_INK}) 46%, ${COVER_INK} 100%)` }} />
      <span aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(0deg, ${COVER_INK} 0%, color-mix(in srgb, ${COVER_INK} 55%, transparent) 6%, transparent 58%)` }} />
      <span aria-hidden style={{ position: "absolute", top: -12, right: -10, fontSize: 96, lineHeight: 1, color: `rgba(255,255,255,${cover.ready ? ".09" : ".05"})`, pointerEvents: "none" }}>{cover.glyph}</span>
      <span style={{ position: "relative", alignSelf: "flex-end", fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, letterSpacing: ".08em", color: `rgba(255,255,255,${cover.ready ? ".85" : ".5"})` }}>{cover.count}</span>
      <span style={{ position: "relative", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 16, lineHeight: 1.1, letterSpacing: "-.025em", color: cover.ready ? "#fff" : "rgba(255,255,255,.62)" }}>{goal.name}</span>
    </button>
  );
}

/** The season you're currently enrolled in, shown above the goal grid.
 *  INFO-ONLY by design: no leave affordance here — a permanent exit button on
 *  the browse surface reads as an invitation to quit. Leaving lives at the
 *  bottom of the enrolled plan's own detail page (LeavePlanSection). */
function EnrolledCard() {
  const { t } = useLang();
  const { macro, planId, planStartedAt } = useMacrocycle();
  if (!macro) return null;

  const planName = GOAL_TREE.flatMap((g) => g.plans).find((p) => p.id === planId)?.name ?? macro.goalOrSport;
  const started = planStartedAt ? new Date(planStartedAt) : null;
  return (
    <div style={{ ...card, marginBottom: 24 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>{t("w.train.plans.currentPlan")}</div>
      <div style={{ fontWeight: 800, fontSize: fs.title, marginTop: 4 }}>{planName}</div>
      {started && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 2 }}>{t("w.train.plans.startedOn")} {started.toLocaleDateString()}</div>}
    </div>
  );
}

/** The category screen — the plan cover recipe one level up (idea 02, "the
 *  goal hero"): the goal opens with the SAME full-bleed collapsing cover as
 *  the plan detail (goalCoverView: accent wash, ghost glyph, category chip,
 *  plan-count label) and the plans beneath it, so every depth of the Plans
 *  stack is one physical object at a different compression. NO aggregate hem
 *  on the cover — with a full category those ranges mush into noise; instead
 *  EACH plan card carries its own hem (planHeroView: weeks / sessions / the
 *  discipline's volume), so plans differentiate card-by-card. */
function List({ goal, pick, back }: { goal: GoalNode; pick: (id: string) => void; back: () => void }) {
  const { t } = useLang();
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  useHeroCollapse(rootRef, heroRef); // no dock at goal level — collapse + snap only
  const cover = goalCoverView(goal);
  const rule = `color-mix(in srgb, ${C("chalk")} 14%, transparent)`;
  return (
    <div ref={rootRef} style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <CoverHero cover={{ ...cover, duration: cover.count, stats: [], variant: "goal" }} back={back} backLabel={t("w.train.plans.allGoals")} heroRef={heroRef} />
      {goal.plans.length === 0 && <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash"), marginTop: 16 }}>{t("w.train.plans.noPlansYet")}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: space.lg, marginTop: 16 }}>
        {goal.plans.map((p) => {
          const hero = planHeroView(p, programFor(p.id) ?? undefined);
          return (
            <div key={p.id} role="button" tabIndex={0} style={{ ...card, cursor: "pointer" }} onClick={() => pick(p.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(p.id); } }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{p.tag}</span>
                {p.hot && chip(C("lime"), t("w.train.plans.popular"))}
              </div>
              <div style={{ fontWeight: 800, fontSize: fs.title, marginTop: 6 }}>{p.name}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, margin: "12px 0 10px" }}>
                {hero.stats.map((s) => (
                  <div key={s.label} style={{ borderTop: `2px solid ${rule}`, paddingTop: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-.02em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                      {s.value}{s.unit && <span style={{ fontSize: 12, color: C("ash"), fontWeight: 700 }}>{s.unit}</span>}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".1em", textTransform: "uppercase", color: C("ash"), marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: fs.body, lineHeight: 1.5 }}>{p.desc}</p>
              <div style={{ marginTop: 12 }}>{p.focus.map((f) => <span key={f}>{chip(C("ash"), f)}</span>)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Detail({ goal, plan, back, onEnrolled }: { goal: GoalNode; plan: GoalPlan; back: () => void; onEnrolled?: () => void }) {
  const { t } = useLang();
  const d = planDetail(plan.id, plan);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const docked = useHeroCollapse(rootRef, heroRef);
  // Already enrolled in THIS plan → the dock is a quiet status pill from the start.
  const { planId: enrolledPlanId } = useMacrocycle();
  const displayState = state === "idle" && enrolledPlanId === plan.id ? "done" : state;
  const enroll = async () => {
    setState("busy");
    try { const res = await fetch("/api/macrocycles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal: goal.name, planId: plan.id }) }); if (!res.ok) return setState("error"); setState("done"); onEnrolled?.(); }
    catch { setState("error"); }
  };
  return (
    <div ref={rootRef} style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <PlanHero goal={goal} plan={plan} back={back} heroRef={heroRef} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: space.md, margin: "16px 0" }}>
        <Info label={t("w.train.plans.forWho")} value={d.forWho} /><Info label={t("w.train.plans.outcome")} value={d.outcome} /><Info label={t("w.train.plans.sessionLength")} value={d.sessionLength} /><Info label={t("w.train.plans.equipment")} value={d.equipment} /><Info label={t("w.train.plans.level")} value={d.level} />
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>{t("w.train.plans.weeklySplit")}</div>
        <div style={{ display: "flex", gap: space.xs, marginTop: 10, flexWrap: "wrap" }}>
          {d.split.map((day, i) => <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: day.toLowerCase() === "rest" ? C("ash") : C("chalk"), background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: "8px 12px" }}>{day}</div>)}
        </div>
      </div>

      {d.days.map((session, di) => (
        <div key={di} style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{session.day}</div>
          <div style={{ overflowX: "auto", maxWidth: "100%", marginTop: 10 }}>
          <table style={{ width: "100%", minWidth: 340, borderCollapse: "collapse" }}>
            <thead><tr>{[t("w.train.plans.exercise"), t("w.train.plans.setsReps"), t("w.train.plans.rest"), "RPE"].map((h) => <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), textTransform: "uppercase", textAlign: "left", padding: "6px 0", borderBottom: `1px solid ${C("line")}` }}>{h}</th>)}</tr></thead>
            <tbody>{session.items?.map((it, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600, fontSize: fs.bodyLg, padding: "10px 0", borderBottom: `1px solid ${C("line")}` }}>{it.name}</td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("chalk"), padding: "10px 0", borderBottom: `1px solid ${C("line")}` }}>{srSingleReps(it.sr)}</td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash"), padding: "10px 0", borderBottom: `1px solid ${C("line")}` }}>{it.rest}</td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash"), padding: "10px 0", borderBottom: `1px solid ${C("line")}` }}>{it.rpe}</td>
              </tr>
            ))}</tbody>
          </table>
          </div>
        </div>
      ))}

      <Info label={t("w.train.plans.progression")} value={d.progression} />
      {state === "error" && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, marginTop: 10, color: C("red") }} role="alert">{t("w.train.plans.enrollError")}</div>}
      <LeavePlanSection forPlanId={plan.id} />
      <PlanDock docked={docked} state={displayState} idleLabel={`${t("w.train.plans.enrollIn")} ${plan.name}`} busyLabel={t("w.train.plans.enrolling")} doneLabel={t("w.train.plans.enrolledSee")} onClick={enroll} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div style={card}><div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{label}</div><p style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, lineHeight: 1.5, marginTop: 6, color: C("chalk") }}>{value}</p></div>;
}

// ============================================================
//  The COVER — the Explore PlanCover recipe at screen scale (one shared
//  planCoverView, so the card and the hero can't drift), full-bleed at the very
//  top of the page. It is `position: sticky` with a negative top equal to the
//  collapse range: the page carries it up 1:1 with scroll until only the bar
//  remains, then it pins — no height animation, and no React re-renders:
//  useHeroCollapse publishes ONE number (--hero-collapse, 0→1) and every layer
//  interpolates off it in CSS calc(), the use-scroll-collapse idiom.
// ============================================================

const COVER_INK = "#0c0d0c"; // fixed-dark cover base, both themes (Explore parity)
const COVER_H = 272;
const COVER_BAR = 56;
const COVER_DELTA = COVER_H - COVER_BAR;

/** ── the seam ──────────────────────────────────────────────────────────────
 *  The cover's bottom edge used to butt straight up against the page and read
 *  as a CUT: both sides are near-black, but the cover carries its own accent
 *  wash + title scrim while the page carries the lg-field wash, so the two
 *  never quite match and the join draws a line right above the first card.
 *  This band continues the cover ink DOWN into the page and dissolves it, so
 *  the two washes cross-fade instead of meeting at an edge. `OVER` is an opaque
 *  head that lives BEHIND the sticky cover, hiding the band's own top edge.
 *  Mobile parity: apps/mobile/components/plan-hero.tsx BLEED_*. */
const BLEED_OVER = 64;
const BLEED_FADE = 148;
/** Eased ink→nothing ramp (a linear alpha ramp bands and dies too early). Every
 *  stop shares the cover's RGB, so the interpolation never greys out. */
const BLEED_BG = (() => {
  const head = (BLEED_OVER / (BLEED_OVER + BLEED_FADE)) * 100;
  const at = (f: number) => (head + f * (100 - head)).toFixed(2);
  const ink = (a: number) => `color-mix(in srgb, ${COVER_INK} ${a}%, transparent)`;
  return `linear-gradient(180deg, ${COVER_INK} 0%, ${COVER_INK} ${head.toFixed(2)}%, ${ink(90)} ${at(0.22)}%, ${ink(62)} ${at(0.45)}%, ${ink(30)} ${at(0.68)}%, ${ink(0)} 100%)`;
})();

/** Publishes `--hero-collapse` (0→1 over the cover's collapse range) onto the
 *  detail root, rAF-throttled off window scroll; a release mid-range snaps to
 *  the nearer pole (instantly under Reduce Motion — the scroll-tracking itself
 *  stays, the shipped masthead-compression stance). Returns whether the cover
 *  has collapsed enough to surface the docked CTA. */
function useHeroCollapse(rootRef: React.RefObject<HTMLDivElement | null>, heroRef: React.RefObject<HTMLDivElement | null>): boolean {
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    const hero = heroRef.current;
    if (!root || !hero) return;
    let frame = 0;
    let last = -1;
    let snapT: ReturnType<typeof setTimeout> | null = null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const publish = () => {
      frame = 0;
      const p = Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / COVER_DELTA));
      const rounded = Math.round(p * 1000) / 1000;
      if (rounded === last) return;
      last = rounded;
      root.style.setProperty("--hero-collapse", String(rounded));
      setDocked(rounded > 0.45); // React bails out when the boolean is unchanged
    };
    const snap = () => {
      const risen = -hero.getBoundingClientRect().top;
      if (risen <= 6 || risen >= COVER_DELTA) return;
      window.scrollTo({ top: window.scrollY + ((risen > COVER_DELTA / 2 ? COVER_DELTA : 0) - risen), behavior: reduced ? "auto" : "smooth" });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(publish);
      if (snapT) clearTimeout(snapT);
      snapT = setTimeout(snap, 140);
    };
    publish();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      if (snapT) clearTimeout(snapT);
      root.style.removeProperty("--hero-collapse");
    };
  }, [rootRef, heroRef]);
  return docked;
}

/** The full-bleed collapsing cover + the stats HEM (rule-topped editorial
 *  columns directly on the ink) + the one-line blurb. Shared by BOTH detail
 *  renderers (program + classic). */
function PlanHero({ goal, plan, program, back, heroRef }: { goal: GoalNode; plan: GoalPlan; program?: PlanProgram; back: () => void; heroRef: React.RefObject<HTMLDivElement | null> }) {
  return <CoverHero cover={planCoverView(goal, plan, program)} back={back} backLabel={goal.name} heroRef={heroRef} />;
}

/** What the cover scaffold needs to draw — a structural subset of core's
 *  PlanCoverView, so the GOAL-level cover (goalCoverView) rides the exact same
 *  scaffold with its plan-count label in the duration slot. */
interface CoverSpec {
  accent: string;
  glyph: string;
  chip: string;
  /** top-right mono label — "8 WEEKS" on a plan, "1 PLAN" on a goal. */
  duration: string;
  title: string;
  metaParts: (string | null)[];
  /** rule-topped hem columns; [] skips the hem entirely. */
  stats: { value: string; unit: string | null; label: string }[];
  blurb: string;
  /** Same material, different object. "plan" (default) is the POSTER — wash
   *  from the top-RIGHT corner, modest ghost glyph, mono meta under the title,
   *  blurb below on the ink. "goal" is the EMBLEM — the discipline's mark
   *  blown up as the cover art (bigger, brighter, deeper parallax), the wash
   *  mirrored to the top-LEFT so the two levels never read as the same
   *  cover, and the blurb ON the cover face instead of the meta line.
   *  "library" is the SHELF — the Plans root. Emblem-sized glyph like the goal,
   *  but the wash comes from the right like the plan AND runs at a softer mix:
   *  its accent is the theme's own primary (no discipline owns "Plans"), and
   *  the container must not out-shout the nineteen goal accents it holds. */
  variant?: "plan" | "goal" | "library";
}

/** The generic scaffold behind PlanHero — same sticky collapse, snap detent
 *  and hem for ANY CoverSpec (plan detail, the goal hero, the library root).
 *  `back` is optional: the Plans root is a top-level screen with nowhere to go
 *  back to, so it renders the bar with the label alone. */
function CoverHero({ cover, back, backLabel, heroRef }: { cover: CoverSpec; back?: () => void; backLabel?: string; heroRef: React.RefObject<HTMLDivElement | null> }) {
  const accent = cover.accent;
  const library = cover.variant === "library";
  // Both non-plan levels blow the glyph up as cover art; only the goal mirrors
  // the light source to the left.
  const emblem = cover.variant === "goal" || library;
  const mirrored = cover.variant === "goal";
  const p = "var(--hero-collapse, 0)";
  const rule = `color-mix(in srgb, ${C("chalk")} 18%, transparent)`;
  return (
    <>
      <div ref={heroRef} style={{ position: "sticky", top: -COVER_DELTA, zIndex: 30, height: COVER_H, margin: "calc(-1 * var(--page-pad-top, 16px)) calc(-1 * var(--page-pad-x, 16px)) 0", overflow: "hidden", background: COVER_INK, color: "#fff" }}>
        {/* duotone wash bleeding from the top corner (Explore recipe) —
            mirrored to the LEFT on the goal emblem so the light source itself
            tells you which level you're on, and run at a SOFTER mix on the
            library so the root never out-shouts the goal accents on its
            shelves */}
        <span aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(${mirrored ? "158deg" : "202deg"}, color-mix(in srgb, ${accent} ${library ? 34 : 52}%, ${COVER_INK}) 0%, color-mix(in srgb, ${accent} ${library ? 10 : 15}%, ${COVER_INK}) 46%, ${COVER_INK} 100%)` }} />
        <span aria-hidden style={{ position: "absolute", inset: 0, background: `radial-gradient(120% 92% at ${mirrored ? "14% 8%" : "86% 8%"}, color-mix(in srgb, ${accent} ${library ? 26 : 42}%, transparent), transparent 55%)` }} />
        {/* bottom scrim for title legibility — retired as the title leaves.
            The last sliver runs out to FULLY opaque cover ink (below the title,
            so the poster's wash is untouched) so the bleed band underneath
            starts from exactly the same colour. */}
        <span aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(0deg, ${COVER_INK} 0%, color-mix(in srgb, ${COVER_INK} 50%, transparent) 3%, transparent 52%)`, opacity: `calc(1 - ${p})` }} />
        {/* ghost glyph — the cover art; parallax drift against the frame.
            On the goal emblem it IS the subject: bigger, brighter, deeper. */}
        <span aria-hidden style={{ position: "absolute", top: emblem ? -18 : -36, right: emblem ? -34 : -16, fontSize: emblem ? 218 : 152, lineHeight: 1, color: `rgba(255,255,255,${emblem ? ".09" : ".07"})`, pointerEvents: "none", opacity: `calc(1 - ${p} * .6)`, transform: `translateY(calc(${p} * ${Math.round(COVER_DELTA * (emblem ? 0.66 : 0.55))}px))` }}>{cover.glyph}</span>

        {/* bar chrome — counter-translates so it never moves on screen */}
        <div style={{ position: "absolute", top: 8, left: 16, right: 20, height: 42, display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 3, transform: `translateY(calc(${p} * ${COVER_DELTA}px))` }}>
          {back ? (
            <button onClick={back} aria-label={`← ${backLabel}`} style={{ width: 40, height: 40, borderRadius: 999, background: "rgba(255,255,255,.12)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "none", color: "#fff", cursor: "pointer", fontSize: 17 }}>←</button>
          ) : (
            <span />
          )}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 600, letterSpacing: ".06em", color: "rgba(255,255,255,.88)" }}>{cover.duration}</span>
        </div>

        {/* compact bar title — fades in a beat after the big one leaves */}
        <div aria-hidden style={{ position: "absolute", top: 8, left: back ? 64 : 20, right: 64, height: 42, display: "grid", placeItems: "center", justifyItems: back ? "center" : "start", zIndex: 2, pointerEvents: "none", opacity: `clamp(0, calc((${p} - .62) * 2.7), 1)`, transform: `translateY(calc(${p} * ${COVER_DELTA}px))` }}>
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 15.5, letterSpacing: "-.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{cover.title}</span>
        </div>

        {/* the cover proper — chip, title, meta; slides up with the frame */}
        <div style={{ position: "absolute", left: 20, right: 20, bottom: 18, opacity: `clamp(0, calc(1 - ${p} * 2), 1)` }}>
          <span style={{ display: "inline-block", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: "#0d0e0d", background: `color-mix(in srgb, #fff 82%, ${accent})`, padding: "5px 11px", borderRadius: 999 }}>{cover.chip}</span>
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: "clamp(28px, 6vw, 36px)", lineHeight: 1.04, letterSpacing: "-.03em", margin: "12px 0 0", maxWidth: "16ch", textWrap: "balance", textShadow: "0 2px 18px rgba(0,0,0,.35)" }}>{cover.title}</h2>
          {emblem && !library ? (
            <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.4, color: "rgba(255,255,255,.85)", maxWidth: "44ch", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{cover.blurb}</p>
          ) : (
            <MetaLine parts={cover.metaParts} style={{ display: "flex", marginTop: 9, fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,.82)", letterSpacing: ".03em" }} />
          )}
        </div>

        {/* hairline — the collapsed bar's bottom edge */}
        <span aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 1, background: "rgba(255,255,255,.16)", opacity: p }} />
      </div>

      {/* the cover ink bleeding into the page — in normal flow (so it scrolls
          up under the sticky cover) but zero-height and z-index:-1, so it costs
          no layout and paints BEHIND the hem it fades past. `--cover-bleed` is
          0 on the light theme: there a dark poster meeting warm paper is a real
          boundary, not an artifact, and a dark veil would only muddy the hem. */}
      <div aria-hidden style={{ position: "relative", height: 0, zIndex: -1, pointerEvents: "none" }}>
        <span style={{ position: "absolute", top: -BLEED_OVER, left: "calc(-1 * var(--page-pad-x, 16px))", right: "calc(-1 * var(--page-pad-x, 16px))", height: BLEED_OVER + BLEED_FADE, background: BLEED_BG, opacity: `calc(var(--cover-bleed, 1) * (1 - ${p}))` }} />
      </div>

      {cover.stats.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, margin: "18px 0 14px" }}>
          {cover.stats.map((s) => (
            <div key={s.label} style={{ borderTop: `2px solid ${rule}`, paddingTop: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 28, letterSpacing: "-.02em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {s.value}{s.unit && <span style={{ fontSize: 15, color: C("ash"), fontWeight: 700 }}>{s.unit}</span>}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".14em", textTransform: "uppercase", color: C("ash"), marginTop: 6 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}
      {!emblem && !!cover.blurb && <p style={{ fontSize: fs.bodyLg, lineHeight: 1.55, color: C("ash"), margin: cover.stats.length ? "0 0 4px" : "16px 0 4px", maxWidth: "62ch" }}>{cover.blurb}</p>}
    </>
  );
}

/** The Explore SectionHead vocabulary — display-face title left, mono meta
 *  right. Used for the maxes ledger and the schedule heads. */
function PlanSecHead({ title, meta }: { title: string; meta?: string | null }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, margin: "22px 0 10px" }}>
      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, letterSpacing: "-.01em" }}>{title}</span>
      {meta && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: C("ash"), textAlign: "right" }}>{meta}</span>}
    </div>
  );
}

/** The WAVEFORM week rail — one slim column per week whose bar height is that
 *  week's real volume (shape before numbers: the wave and the taper read at a
 *  glance). Full-bleed, and sticky beneath the collapsed cover so week
 *  switching stays one reach away at any scroll depth. Selection is the accent. */
function PlanWeekRail({ bars, weeks, week, setWeek, wkLabel }: { bars: PlanWeekBar[]; weeks: number[]; week: number; setWeek: (w: number) => void; wkLabel: string }) {
  const byWeek = new Map(bars.map((b) => [b.week, b.value]));
  const max = Math.max(1, ...bars.map((b) => b.value));
  const hasBars = bars.length > 0;
  return (
    <div style={{ position: "sticky", top: COVER_BAR, zIndex: 20, margin: "0 calc(-1 * var(--page-pad-x, 16px))", background: `color-mix(in srgb, ${C("ink")} 88%, transparent)`, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderBottom: `1px solid ${C("line")}` }}>
      <div style={{ display: "flex", gap: 2, overflowX: "auto", scrollbarWidth: "none", padding: "8px var(--page-pad-x, 16px) 9px" }}>
        {weeks.map((w) => {
          const on = w === week;
          const v = byWeek.get(w) ?? 0;
          return (
            <button key={w} onClick={() => setWeek(w)} aria-pressed={on} style={{ flex: "0 0 auto", width: 46, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "3px 0", background: "none", border: "none", cursor: "pointer" }}>
              {hasBars ? (
                <span style={{ width: 16, height: 34, display: "flex", alignItems: "flex-end" }}>
                  <span style={{ width: 16, height: Math.max(5, Math.round((v / max) * 34)), borderRadius: 3, background: on ? C("lime") : `color-mix(in srgb, ${C("chalk")} 16%, transparent)` }} />
                </span>
              ) : (
                <span style={{ width: 22, height: 2, borderRadius: 2, background: on ? C("lime") : `color-mix(in srgb, ${C("chalk")} 16%, transparent)`, marginTop: 16 }} />
              )}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: ".06em", textTransform: "uppercase", color: on ? C("lime") : C("ash") }}>{wkLabel} {w}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The docked CTA — a pill above the pill nav that surfaces once the cover has
 *  collapsed (you commit after you've seen the work). One CTA, never two. */
function PlanDock({ docked, state, idleLabel, busyLabel, doneLabel, onClick }: { docked: boolean; state: "idle" | "busy" | "done" | "error"; idleLabel: string; busyLabel: string; doneLabel: string; onClick: () => void }) {
  const done = state === "done";
  return (
    <div aria-hidden={!docked} style={{ position: "fixed", left: 0, right: 0, bottom: 96, zIndex: 40, display: "flex", justifyContent: "center", padding: "0 16px", pointerEvents: "none", opacity: docked ? 1 : 0, transform: docked ? "none" : "translateY(10px)", transition: "opacity .22s ease, transform .22s ease" }}>
      <button
        onClick={onClick}
        disabled={state === "busy" || done}
        tabIndex={docked ? 0 : -1}
        style={{ pointerEvents: docked ? "auto" : "none", width: "100%", maxWidth: 560, height: 50, borderRadius: 999, border: `1px solid ${done ? C("line") : C("lime")}`, background: done ? C("ink2") : C("lime"), color: done ? C("lime") : C("ink"), fontWeight: 800, fontSize: fs.note, cursor: state === "busy" || done ? "default" : "pointer", boxShadow: done ? "var(--shadow-card)" : `0 18px 40px -10px color-mix(in srgb, ${C("lime")} 45%, transparent)` }}
      >
        {state === "busy" ? busyLabel : done ? doneLabel : idleLabel}
      </button>
    </div>
  );
}

// Aurora rendering of a discipline-shaped program (OWL % blocks, endurance pace
// plans, …) — same shared planProgramView as the classic web + mobile, in the
// rounded Aurora skin.
function PercentDetail({ goal, plan, program, back, onEnrolled }: { goal: GoalNode; plan: GoalPlan; program: PlanProgram; back: () => void; onEnrolled?: () => void }) {
  const { t } = useLang();
  const [week, setWeek] = useState(1);
  // The athlete's maxes persist on-device (shared with Today) — seed each input
  // from the store; the transient `vals` holds only the text being typed.
  const storedMaxes = usePlanMaxes();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const inputValue = (key: string) => vals[key] ?? (storedMaxes[key] != null ? String(storedMaxes[key]) : "");
  const onMaxChange = (key: string, text: string) => {
    setVals((v) => ({ ...v, [key]: text }));
    const n = parseFloat(text);
    setPlanMax(key, Number.isFinite(n) && n > 0 ? n : null);
  };
  const maxes: Record<string, number> = {};
  for (const i of program.inputs) { if (i.kind !== "number") continue; const n = parseFloat(inputValue(i.key)); if (Number.isFinite(n) && n > 0) maxes[i.key] = n; }
  const view = planProgramView(program, { week, maxes });
  const cover = planCoverView(goal, plan, program);
  const inputsHead = splitInputsTitle(view.inputsTitle);
  const multiWeek = view.weeks.length > 1;
  const rootRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const docked = useHeroCollapse(rootRef, heroRef);
  // Already enrolled in THIS plan → the dock is a quiet status pill from the start.
  const { planId: enrolledPlanId } = useMacrocycle();
  const displayState = state === "idle" && enrolledPlanId === plan.id ? "done" : state;
  const enroll = async () => {
    setState("busy");
    try { const res = await fetch("/api/macrocycles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal: goal.name, planId: plan.id }) }); if (!res.ok) return setState("error"); setState("done"); onEnrolled?.(); }
    catch { setState("error"); }
  };
  return (
    <div ref={rootRef} style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <PlanHero goal={goal} plan={plan} program={program} back={back} heroRef={heroRef} />

      {/* the LEDGER — maxes / paces as hairline rows, unit stated once. Typing a
          max echoes the first working weight it unlocks; the matrix below morphs
          from % to kg in place (planProgramView already derives it). */}
      <PlanSecHead title={inputsHead.title} meta={inputsHead.meta} />
      <div style={{ borderTop: `1px solid ${C("line")}` }}>
        {view.inputs.map((inp) => {
          const val = inputValue(inp.key);
          const n = parseFloat(val);
          const echo = inp.kind === "number" && Number.isFinite(n) && n > 0 ? inputEcho(program, inp.key, n) : null;
          return (
            <label key={inp.key} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C("line")}`, cursor: "text" }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>{inp.label}</span>
              {echo && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash"), marginLeft: "auto" }}>→ {echo}</span>}
              <input
                type={inp.kind === "number" ? "number" : "text"}
                inputMode={inp.kind === "number" ? "numeric" : undefined}
                placeholder={inp.placeholder ?? "—"}
                aria-label={inp.label}
                value={val}
                onChange={(e) => (inp.kind === "number" ? onMaxChange(inp.key, e.target.value) : setVals((v) => ({ ...v, [inp.key]: e.target.value })))}
                style={{ fontFamily: "var(--font-mono)", width: inp.kind === "number" ? 74 : 120, marginLeft: echo ? 0 : "auto", textAlign: "right", fontSize: 14, color: C("chalk"), background: "transparent", border: "none", borderBottom: `1.5px solid color-mix(in srgb, ${C("chalk")} 25%, transparent)`, borderRadius: 0, padding: "2px 0", outline: "none", fontVariantNumeric: "tabular-nums" }}
              />
            </label>
          );
        })}
      </div>

      {(multiWeek || view.weekVolume) && (
        <PlanSecHead title="Schedule" meta={view.weekVolume ? `${view.weekVolume} ${t("w.train.plans.thisWeek")}` : view.peakNote ?? undefined} />
      )}
      {multiWeek && <PlanWeekRail bars={cover.weekBars} weeks={view.weeks} week={view.week} setWeek={setWeek} wkLabel={t("w.train.plans.wkShort")} />}

      <div style={{ marginTop: 14 }}>
        <ProgramDays days={view.days} week={view.week} peakNote={view.peakNote} />
      </div>

      <Info label={t("w.train.plans.progression")} value={view.progression} />
      {state === "error" && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, marginTop: 10, color: C("red") }} role="alert">{t("w.train.plans.enrollError")}</div>}
      <LeavePlanSection forPlanId={plan.id} />
      <PlanDock docked={docked} state={displayState} idleLabel={`${t("w.train.plans.enrollIn")} ${plan.name}`} busyLabel={t("w.train.plans.enrolling")} doneLabel={t("w.train.plans.enrolledSee")} onClick={enroll} />
    </div>
  );
}
