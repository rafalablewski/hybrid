"use client";

import { useMemo, useState } from "react";
import {
  fuelToday,
  fuelPlate,
  fuelRail,
  mealPartEmoji,
  mealPartLabelFromKey,
  trainingEnergyOnDay,
  DEFAULT_MEAL_PART_KEYS,
  FUEL_PLATE_OTHER,
  MEAL_PRESETS,
  isFullAccess,
  type FuelToday,
  type FuelMacro,
  type FuelPlateGroup,
  type FuelRailChip,
  type LoggedSession,
} from "@hybrid/core";
import { useSignals } from "@/lib/use-signals";
import { useFoodLogs } from "@/lib/use-food-logs";
import { useRevalidate } from "@/lib/use-invalidate";
import { useLang } from "@/lib/i18n";
import { usePersona } from "@/lib/persona";

const C = (v: string) => `var(--color-${v})`;
// Per the Nutrition surface's colour code: blue = protein, amber = carbs,
// violet = fat, lime = energy/go. Kept here so the widget can't drift.
const MACRO_TEXT: Record<FuelMacro["key"], string> = {
  protein: "var(--blue-text)",
  carbs: "var(--amber-text)",
  fat: "var(--violet-text)",
};
const MACRO_FILL: Record<FuelMacro["key"], string> = {
  protein: "var(--blue-text)",
  carbs: "var(--amber-text)",
  fat: "var(--violet-text)",
};

/**
 * AURORA Fuel (web) — the Today-screen nutrition widget. ONE stateful surface,
 * exactly how the week rail flips done / missed / today: the client reads meaning
 * from the tick-ring + a single headline, not a different card per case. State,
 * targets and macros all come from @hybrid/core's fuelToday() so web + mobile
 * render identically (parity rule).
 *
 * It answers BOTH questions a day's fuel raises: how much (the ring + macros)
 * and WHAT (the plate — the day's logged meals grouped by part of the day, from
 * core's fuelPlate), so seeing what you ate never means digging into Nutrition.
 * The quick-log rail rides OUTSIDE the card, full-bleed to the screen edge (the
 * golden slider rule) — it's an action bar for the whole widget, not a row of
 * the summary, and it's carried through every state so a meal is one tap from
 * anywhere. Mirrored on mobile (aurora/fuel.tsx).
 */
export default function AuroraFuel({
  sessions,
  onOpen,
}: {
  /** logged sessions — today's training fuels the target and flips to "refuel". */
  sessions: LoggedSession[];
  /** open the full nutrition surface (the quick-add sheet / hub). */
  onOpen: () => void;
}) {
  const { t } = useLang();
  const { signals, loading } = useSignals();
  const { logs } = useFoodLogs();
  const revalidate = useRevalidate();
  const full = isFullAccess(usePersona());
  // One-tap logging: the chip being written (busy) and the one that just landed
  // (its ✓ flash). Free users can't log from the rail — a tap opens the sheet
  // where the premium framing lives (parity with Nutrition's locked tiles).
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const logChip = async (chip: FuelRailChip) => {
    if (!full) return onOpen();
    if (busy) return;
    setBusy(chip.id);
    setDone(null);
    try {
      // Route through the editable food-log (like the Nutrition screen) so the
      // meal appears in the Diary as a named, editable/deletable entry AND the
      // mirrored Signals the engines read. Attributed to its own part of day.
      const res = await fetch("/api/nutrition/log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: chip.name, source: chip.source, kcal: chip.kcal, protein: chip.protein, carbs: chip.carbs, fat: chip.fat, qty: 1 }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Drops the signals the totals read AND the diary entries the plate lists.
      await revalidate.recovery();
      setDone(chip.id);
      window.setTimeout(() => setDone((d) => (d === chip.id ? null : d)), 1600);
    } catch {
      onOpen(); // network/auth failure — fall back to the manual quick-add sheet
    } finally {
      setBusy(null);
    }
  };

  const fuel = useMemo<FuelToday>(() => {
    const bodyMassKg = [...signals].filter((s) => s.kind === "bodyMass").sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0]?.value;
    const trainingKcal = trainingEnergyOnDay(sessions, bodyMassKg ?? 75);
    return fuelToday(signals, { trainingKcal, bodyMassKg });
  }, [signals, sessions]);

  // The day's logged items, grouped by part of the day. The athlete's CUSTOM
  // parts live in the nutrition prefs this widget doesn't load, so an entry
  // logged under one falls into "Other" and is labelled from its own key —
  // visible either way, which is the point of the summary.
  const plate = useMemo(() => fuelPlate(logs), [logs]);

  // The rail: the meals this athlete actually eats, ranked from their own diary,
  // with the canned presets behind them for a cold start. Built from what was
  // eaten BEFORE today, so a tap can mark a chip but never move it.
  const rail = useMemo(
    () => fuelRail(logs, { presets: MEAL_PRESETS.map((p) => ({ id: p.id, name: presetShort(t(p.labelKey)), source: p.id.split("-")[0] || "snack", emoji: p.emoji, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat })) }),
    [logs, t],
  );

  const { state, targets, kcalLeft, kcalPct, proteinGap, trainingKcal, today, macros } = fuel;
  const nf = (n: number) => Math.round(n).toLocaleString();

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 } as const;
  const goalGlow = state === "goal-hit"
    ? { background: `radial-gradient(120% 80% at 50% -12%, color-mix(in srgb, ${C("lime")} 12%, transparent), transparent 60%), ${C("ink2")}`, border: `1px solid color-mix(in srgb, ${C("lime")} 30%, ${C("line")})` }
    : state === "refuel"
      ? { background: `radial-gradient(120% 80% at 88% -12%, color-mix(in srgb, ${C("lime")} 10%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, ${C("lime")} 4%, ${C("ink2")}), ${C("ink2")})` }
      : {};

  const title = state === "refuel" ? t("w.home.fuel.titleRefuel") : state === "goal-hit" ? t("w.home.fuel.titleGoal") : t("w.home.fuel.title");
  const mono = { fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase" } as const;

  // Hold the widget back until the first signals fetch resolves, so a returning
  // athlete never sees the cold-start "Nothing logged yet" flash before their
  // real intake loads. (The cache is usually already warm from app-shell.)
  if (loading) return null;

  return (
    <>
    <div style={{ ...card, ...goalGlow, marginTop: 12 }}>
      {/* header — title + a state-coloured right meta (calendar's "colour = attention") */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, color: C("chalk") }}>{title}</span>
        <StateMeta state={state} trainingKcal={trainingKcal} today={today} targets={targets} t={t} nf={nf} mono={mono} />
      </div>

      {/* hero — the tick-ring + a state-specific body. Tapping opens Nutrition. */}
      <button onClick={onOpen} style={{ display: "flex", gap: 20, alignItems: "center", marginTop: 14, width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: C("chalk") }}>
        <Ring value={state === "empty" ? 0 : kcalPct} color={state === "goal-hit" ? C("lime") : state === "over" ? "var(--red-text)" : C("lime")} size={96}>
          {state === "goal-hit" ? (
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={C("lime")} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5 10 17.5 19.5 7" /></svg>
          ) : state === "empty" ? (
            <PlateGlyph />
          ) : (
            <span style={{ textAlign: "center", lineHeight: 1 }}>
              <span style={{ display: "block", fontWeight: 800, fontSize: 23, letterSpacing: "-.02em" }}>{nf(Math.abs(kcalLeft))}</span>
              <span style={{ ...mono, fontSize: 9, color: C("ash"), marginTop: 5, display: "block" }}>{t(kcalLeft >= 0 ? "w.home.fuel.kcalLeft" : "w.home.fuel.kcalOver")}</span>
            </span>
          )}
        </Ring>
        <span style={{ flex: 1, minWidth: 0 }}>
          <FuelBody state={state} proteinGap={proteinGap} targets={targets} macros={macros} overKcal={Math.max(0, -kcalLeft)} t={t} nf={nf} />
        </span>
      </button>

      {/* THE PLATE — what was actually eaten today, grouped by part of the day.
          The macros above say how much; this says what, so the answer to "have
          I had lunch" never costs a trip into Nutrition. Every row opens the
          diary, where it can be edited. Hidden when nothing is logged (the
          empty state already speaks for the day). */}
      {plate.count > 0 && (
        <div style={{ marginTop: 16, borderTop: `1px solid ${C("line")}`, paddingTop: 13 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14, color: C("chalk") }}>{t("w.recovery.nutrition.todaysMeals")}</span>
            <button onClick={onOpen} style={{ ...mono, color: "var(--lime-text)", background: "none", border: "none", padding: 0, cursor: "pointer", whiteSpace: "nowrap" }}>{t("w.home.fuel.allMeals")}</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
            {plate.groups.slice(0, PLATE_ROWS).map((g) => (
              <button
                key={g.key}
                onClick={onOpen}
                style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", background: "none", border: "none", padding: "7px 0", cursor: "pointer", textAlign: "left", color: C("chalk") }}
              >
                <span aria-hidden style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>{mealPartEmoji(g.key)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 12.5, letterSpacing: "-.01em" }}>{partLabel(g.key, t)}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: C("ash"), marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{groupLine(g, t)}</span>
                </span>
                <span style={{ flexShrink: 0, textAlign: "right" }}>
                  <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>{nf(g.kcal)} kcal</span>
                  <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--blue-text)", marginTop: 1, fontVariantNumeric: "tabular-nums" }}>{nf(g.protein)}P</span>
                </span>
              </button>
            ))}
            {plate.groups.length > PLATE_ROWS && (
              <button onClick={onOpen} style={{ ...mono, color: C("ash"), background: "none", border: "none", padding: "7px 0 0", cursor: "pointer", textAlign: "left" }}>
                {t("w.home.fuel.plateMore").replace("{n}", nf(plate.groups.slice(PLATE_ROWS).reduce((s, g) => s + g.items.length, 0)))}
              </button>
            )}
          </div>
        </div>
      )}
    </div>

    {/* QUICK-LOG rail — outside the card and FULL-BLEED to the screen edge (the
        golden slider rule: negative margins the width of the shell gutter pull
        the scroll clip to the true edge, with matching padding so resting cards
        still line up with the content column). It's the widget's action bar, not
        a row of the summary: presets ARE the meal types (breakfast / lunch /
        dinner / snack), and the leading dashed "＋ Quick log" card (styled like
        the exercise rail's "All exercises & favourites" card) opens the full
        quick-add. Persistent across every state. */}
    <div style={{ display: "flex", gap: 9, overflowX: "auto", scrollbarWidth: "none", margin: "12px calc(-1 * var(--page-pad-x, 16px)) 0", padding: "0 var(--page-pad-x, 16px) 4px" }}>
      {/* ＋ Quick log — the entry to the full sheet, first so it's always
          reachable. Bare ＋ glyph + lime label (not a boxed tile), echoing
          the exercise rail's "All exercises & favourites" card. */}
      <button
        onClick={onOpen}
        aria-label={t("w.home.fuel.quickLog")}
        style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 10, background: "none", border: `1px dashed color-mix(in srgb, ${C("ash")} 40%, transparent)`, borderRadius: 14, padding: "9px 17px", cursor: "pointer" }}
      >
        <span aria-hidden style={{ fontSize: 20, lineHeight: 1, color: C("ash") }}>＋</span>
        <span style={{ fontWeight: 700, fontSize: 12.5, letterSpacing: "-.01em", whiteSpace: "nowrap", color: "var(--lime-text)" }}>{t("w.home.fuel.quickLog")}</span>
      </button>
      {rail.map((chip) => {
        const isDone = done === chip.id;
        const isBusy = busy === chip.id;
        // ALREADY HAD IT — a quiet ✓ badge on the tile, never a disabled chip:
        // a second helping is a real thing, so the mark reports the day rather
        // than standing in the way of it.
        const had = chip.loggedToday && !isDone;
        return (
          <button
            key={chip.id}
            onClick={() => logChip(chip)}
            disabled={isBusy}
            aria-label={`${t("w.home.fuel.logMeal")} ${chip.name}${had ? ` — ${t("w.home.fuel.hadToday")}` : ""}`}
            style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 9, background: isDone ? `color-mix(in srgb, ${C("lime")} 14%, transparent)` : C("ink2"), border: `1px solid ${isDone ? `color-mix(in srgb, ${C("lime")} 40%, transparent)` : C("line")}`, borderRadius: 14, padding: "9px 13px 9px 9px", cursor: isBusy ? "default" : "pointer", color: C("chalk"), opacity: isBusy ? 0.55 : 1, transition: "opacity .15s ease, background .2s ease, border-color .2s ease" }}
          >
            <span style={{ position: "relative", width: 32, height: 32, borderRadius: 9, background: isDone ? `color-mix(in srgb, ${C("lime")} 20%, transparent)` : C("ink"), border: `1px solid ${isDone ? `color-mix(in srgb, ${C("lime")} 40%, transparent)` : C("line")}`, display: "grid", placeItems: "center", fontSize: 16, flexShrink: 0, color: "var(--lime-text)" }}>
              {isDone ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--lime-text)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5 10 17.5 19.5 7" /></svg> : chip.emoji}
              {had && (
                <span aria-hidden style={{ position: "absolute", top: -5, right: -5, width: 15, height: 15, borderRadius: 999, background: C("lime"), border: `1.5px solid ${C("ink2")}`, display: "grid", placeItems: "center" }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17.5 19.5 7" /></svg>
                </span>
              )}
            </span>
            <span style={{ textAlign: "left" }}>
              <span style={{ display: "block", fontWeight: 700, fontSize: 12.5, letterSpacing: "-.01em", whiteSpace: "nowrap", maxWidth: 148, overflow: "hidden", textOverflow: "ellipsis" }}>{chip.name}</span>
              <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 9.5, color: isDone ? "var(--lime-text)" : C("ash"), whiteSpace: "nowrap", marginTop: 1 }}>{isDone ? `+${chip.kcal} kcal ${t("w.home.fuel.logged")}` : `${chip.kcal} kcal – ${chip.protein}P`}</span>
            </span>
          </button>
        );
      })}
    </div>
    </>
  );
}

// The preset labels read "Breakfast – oats & eggs"; the rail wants just the meal
// name, so trim at the en-dash separator.
function presetShort(label: string): string {
  return label.split(" – ")[0] ?? label;
}

/** How many plate rows the widget shows before deferring to "+N more". Five
 *  covers the four built-in parts plus "Other"; only custom parts overflow. */
const PLATE_ROWS = 5;

/** A part-of-day row label: the built-ins are i18n, "Other" mirrors the Diary's
 *  own group, and a custom part (whose authored label lives in prefs this
 *  widget doesn't load) reads from its key. Mirrored on mobile. */
function partLabel(key: string, t: (k: string) => string): string {
  if (key === FUEL_PLATE_OTHER) return t("w.recovery.nutrition.otherEntries");
  if ((DEFAULT_MEAL_PART_KEYS as readonly string[]).includes(key)) return t(`w.recovery.nutrition.meal.${key}`);
  return mealPartLabelFromKey(key);
}

/** The row's line: the items eaten in that part. An entry logged before names
 *  were stored has none to show, so it's counted rather than invented.
 *  Mirrored on mobile. */
function groupLine(g: FuelPlateGroup, t: (k: string) => string): string {
  const parts = [...g.names];
  if (g.unnamed === 1) parts.push(t("w.recovery.nutrition.loggedEntry"));
  else if (g.unnamed > 1) parts.push(`${g.unnamed} × ${t("w.recovery.nutrition.loggedEntry")}`);
  return parts.join(", ");
}

function StateMeta({ state, trainingKcal, today, targets, t, nf, mono }: { state: FuelToday["state"]; trainingKcal: number; today: FuelToday["today"]; targets: FuelToday["targets"]; t: (k: string) => string; nf: (n: number) => string; mono: React.CSSProperties }) {
  if (state === "refuel") return <span style={{ ...mono, color: "var(--lime-text)", whiteSpace: "nowrap" }}>{t("w.home.fuel.trained").replace("{n}", nf(trainingKcal))}</span>;
  if (state === "on-track") return <Pill tone="lime">{t("w.home.fuel.onTrack")}</Pill>;
  if (state === "goal-hit") return <Pill tone="lime">✓ {t("w.home.fuel.goalPill")}</Pill>;
  if (state === "over") return <Pill tone="red">{t("w.home.fuel.overPill")}</Pill>;
  // empty / protein — the plain "eaten / target" figure
  return <span style={{ ...mono, color: C("ash"), whiteSpace: "nowrap" }}>{t("w.home.fuel.ofTarget").replace("{n}", nf(today.kcal)).replace("{t}", nf(targets.kcal))}</span>;
}

function FuelBody({ state, proteinGap, targets, macros, overKcal, t, nf }: { state: FuelToday["state"]; proteinGap: number; targets: FuelToday["targets"]; macros: FuelToday["macros"]; overKcal: number; t: (k: string) => string; nf: (n: number) => string }) {
  const head = { fontWeight: 800, fontSize: 18, letterSpacing: "-.02em", lineHeight: 1.2 } as const;
  const sub = { fontSize: 12.5, lineHeight: 1.5, color: C("ash"), marginTop: 6 } as const;

  if (state === "empty")
    return (<><div style={head}>{t("w.home.fuel.emptyHead")}</div><div style={sub}>{t("w.home.fuel.emptySub")}</div></>);

  if (state === "refuel" || state === "protein")
    return (
      <>
        <div style={head}><span style={{ color: "var(--blue-text)" }}>{t("w.home.fuel.proteinToGo").replace("{n}", nf(proteinGap))}</span></div>
        {state === "refuel" && <div style={sub}>{t("w.home.fuel.refuelSub").replace("{t}", nf(targets.kcal))}</div>}
        <div style={{ marginTop: 12 }}><MacroBar m={macros.protein} label={t("w.recovery.nutrition.protein")} thick /></div>
      </>
    );

  if (state === "goal-hit")
    return (
      <>
        <div style={head}>{t("w.home.fuel.goalHead")}</div>
        <div style={sub}>{t("w.home.fuel.goalSub")}</div>
        <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
          {(["protein", "carbs", "fat"] as const).map((k) => (
            <span key={k} style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: MACRO_TEXT[k], display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: MACRO_FILL[k] }} />{k[0]!.toUpperCase()} {macros[k].pct}%
            </span>
          ))}
        </div>
      </>
    );

  if (state === "over")
    return (
      <>
        <div style={head}>{t("w.home.fuel.overHead")}</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: C("ash"), marginTop: 6 }}>{t("w.home.fuel.overSub").replace("{n}", nf(overKcal))}</div>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {(["protein", "carbs", "fat"] as const).map((k) => (<MacroBar key={k} m={macros[k]} label={t(`w.recovery.nutrition.${k}`)} />))}
        </div>
      </>
    );

  // on-track — the everyday in-progress state: all three macros as hairline bars
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {(["protein", "carbs", "fat"] as const).map((k) => (<MacroBar key={k} m={macros[k]} label={t(`w.recovery.nutrition.${k}`)} />))}
    </div>
  );
}

function MacroBar({ m, label, thick }: { m: FuelMacro; label: string; thick?: boolean }) {
  // Surpassed target — a distinctive treatment: the track fills to the WHOLE
  // logged amount, chartreuse-macro up to the target line, then a terracotta
  // overflow past it, and the readout calls out "+Ng" in the over colour.
  const h = thick ? 7 : 5;
  const targetFrac = m.over && m.value > 0 ? Math.max(0, Math.min(100, (m.target / m.value) * 100)) : 100;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 11 }}>
        <span style={{ color: MACRO_TEXT[m.key] }}>{label}</span>
        <span style={{ color: C("ash") }}>
          <span style={{ color: m.over ? "var(--red-text)" : C("ash") }}>{m.value}</span> / {m.target} g
          {m.over && <span style={{ color: "var(--red-text)", fontWeight: 600 }}> +{m.overBy}</span>}
        </span>
      </div>
      <div style={{ height: h, borderRadius: 5, background: C("line"), overflow: "hidden" }}>
        {m.over ? (
          <div style={{ display: "flex", height: "100%", width: "100%" }}>
            <span style={{ width: `${targetFrac}%`, background: MACRO_FILL[m.key] }} />
            <span style={{ flex: 1, background: C("red") }} />
          </div>
        ) : (
          <span style={{ display: "block", height: "100%", width: `${m.pct}%`, background: MACRO_FILL[m.key], borderRadius: 5 }} />
        )}
      </div>
    </div>
  );
}

function Pill({ tone, children }: { tone: "lime" | "red"; children: React.ReactNode }) {
  const text = tone === "lime" ? "var(--lime-text)" : "var(--red-text)";
  const bg = tone === "lime" ? `color-mix(in srgb, ${C("lime")} 14%, transparent)` : `color-mix(in srgb, ${C("red")} 14%, transparent)`;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 999, padding: "4px 10px", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: text, background: bg, whiteSpace: "nowrap" }}>{children}</span>;
}

// The readiness/score tick-ring (mirrors Today's <Ring/> and the mobile kit Ring)
// — a fan of ticks lit up to the value, number in the middle.
function Ring({ value, color, size = 96, ticks = 32, children }: { value: number; color: string; size?: number; ticks?: number; children: React.ReactNode }) {
  const pct = Math.max(0, Math.min(100, value));
  const lit = Math.round((pct / 100) * ticks);
  const tickLen = Math.max(4, Math.round(size * 0.15));
  const tickW = Math.max(2, Math.round(size * 0.045));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "grid", placeItems: "center" }}>
      {Array.from({ length: ticks }).map((_, i) => (
        <span key={i} style={{ position: "absolute", top: 0, left: "50%", width: tickW, height: size / 2, transformOrigin: "bottom center", transform: `translateX(-50%) rotate(${(i / ticks) * 360}deg)` }}>
          <span style={{ display: "block", width: tickW, height: tickLen, borderRadius: tickW, background: i < lit ? color : C("line") }} />
        </span>
      ))}
      <span style={{ position: "relative", color: C("chalk") }}>{children}</span>
    </div>
  );
}

function PlateGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C("ash")} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 3v7a4 4 0 0 0 8 0V3M8 3v18M17 3c-1.5 1.5-2 4-2 7s.5 4 2 4 2-1 2-4-.5-5.5-2-7zM17 14v7" />
    </svg>
  );
}
