"use client";

import { createElement, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  fs, space, volumeStatus, weeklyMuscleSets, athleteLandmarks,
  replayLandmarks, testedMuscles, REPLAY_VERDICT_KEY, type LandmarkReplay,
  railGeometry, railScale, railX, bandRegion, BAND_KEYS, volumeSummary, sortByUrgency, setsLabel, deltaLabel,
  blockVolumePlan, blockRamp, blockKindKey, resolveBlock,
  volumeProfileCompleteness, estimateFitnessLevel, resolveExperience, LEVEL_KEY, LEVEL_BASIS_KEY,
  formatPace, paceClock,
  VOLUME_PROFILE_FIELD_KEY, fmtWeight,
  sourceWhyKey, factorLabelKey, factorPercent, targetVerdict, TARGET_VERDICT_KEY,
  provenanceLadder, rungMeta, factorAffectsKey,
  type LoggedSession, type MuscleVolumeStatus, type VolumeZone, type MuscleGroup, type VolumeBandKey,
  type AthleteVolumeProfile, type VolumeBlock, type RampColumn, type BlockMuscleTarget,
  type LandmarkFactor, type LandmarkSource, type WeightUnit,
} from "@hybrid/core";
import { setLoggerPref } from "@/lib/logger-prefs";
import { useVolumeModel } from "@/lib/use-volume-model";
import { useLang } from "@/lib/i18n";
import { HeroScreen, HeroAccessory } from "./hero";
import Sheet from "./sheet";

const MUSCLE_KEY: Record<string, string> = { quads: "w.analyze.vol.muscleQuads", glutes: "w.analyze.vol.muscleGlutes", posterior: "w.analyze.vol.musclePosteriorChain", back: "w.analyze.vol.muscleBack", chest: "w.analyze.vol.muscleChest", shoulders: "w.analyze.vol.muscleShoulders", triceps: "w.analyze.vol.muscleTriceps" };
const ZONE_KEY: Record<VolumeZone, string> = { under: "w.analyze.vol.zoneUnder", productive: "w.analyze.vol.zoneProductive", peak: "w.analyze.vol.zonePeak", overreaching: "w.analyze.vol.zoneOver" };
const C = (v: string) => `var(--color-${v})`;
const mix = (token: string, amount: number) => `color-mix(in srgb, ${C(token)} ${amount}%, transparent)`;
const pct = (v: number) => `${v * 100}%`;
const BAND_LABEL: Record<VolumeBandKey, string> = { mev: "MEV", mav: "MAV", mrv: "MRV" };
const GLOSS_KEY: Record<VolumeBandKey, string> = { mev: "w.analyze.vol.glossMev", mav: "w.analyze.vol.glossMav", mrv: "w.analyze.vol.glossMrv" };

const ZONE_TOKEN: Record<VolumeZone, string> = { overreaching: "red", under: "amber", peak: "blue", productive: "lime" };

const card: CSSProperties = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 };
const mono = (size: number): CSSProperties => ({ fontFamily: "var(--font-mono)", fontSize: size });
const eyebrow: CSSProperties = { ...mono(fs.nano), textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") };
const sectionTitle: CSSProperties = { fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.title, color: C("chalk"), margin: 0 };

/**
 * AURORA Volume (web) — weekly working sets against the athlete's own
 * MEV/MAV/MRV. Mirrors apps/mobile/components/aurora/volume.tsx exactly: one
 * hero (how many muscles are in range + the week drawn as a seven-column
 * shape), then where the athlete is in the block, then the week's prescription,
 * then the per-muscle rails, then — only on request — whose numbers these
 * actually are. The rail geometry is normalised in @hybrid/core (`railX`), so
 * every muscle's band lands at the same x and the rows stack into one readable
 * picture.
 *
 * TWO DEPTHS, ONE SURFACE. The compact block used to answer "5/7 in range" and
 * then send the athlete to a DIFFERENT SCREEN for the block ramp, the
 * prescription and the muscle rails — a full context switch to read the detail
 * of the card you were already looking at, with the shape you had just read
 * left behind. The detail now EASES OPEN UNDERNEATH the shape instead (a
 * 0fr → 1fr grid row, the same drawer the Activity card's figures pull out —
 * see week-verdict.tsx), so "ease off" and "by muscle" arrive in place, under
 * the columns that raised the question, and closing puts them back.
 *
 * The landmarks themselves come from ONE core call (`athleteLandmarks`), which
 * layers population table → profile estimate → what the log observed → the
 * athlete's own edits, and hands back the provenance so this screen never
 * presents a population average as a personal fact. That provenance — and the
 * working behind it — is a DIFFERENT KIND of question from "what should I do
 * this week", so it is dispatched as a Sheet rather than stacked as a seventh
 * card at the foot of the reading.
 */
export default function AuroraVolume({ sessions, unified = false, compact = false, onOpenModel }: {
  sessions: LoggedSession[];
  /** True when these sections render INSIDE another page rather than as their
   *  own screen: the page title demotes to a section head, since the page
   *  already has one masthead. Every section, control and number is otherwise
   *  identical. */
  unified?: boolean;
  /** COMPACT — the hero week-shape, and the rest of the screen folded into a
   *  drawer under it. This is what the Performance page carries: "5/7 in
   *  range", the seven columns, the verdict naming names, and — on request,
   *  in place — the block, the prescription and the rails. The landmarks are
   *  resolved by the SAME code either way, so the card and the screen can
   *  never disagree. */
  compact?: boolean;
  /** Where the "edit the model" door goes — the settings route that owns the
   *  landmark fields, the profile form and the model switches. They used to be
   *  ~50 controls revealed inside this read surface by an edit toggle. */
  onOpenModel?: () => void;
}) {
  const { t } = useLang();
  const ml = (m: string) => (MUSCLE_KEY[m] ? t(MUSCLE_KEY[m]) : m);
  // ONE resolution, shared with the settings route that edits this model
  // (lib/use-volume-model.ts) — so an edit and its effect can never be computed
  // two different ways.
  const { prefs, recovery, measuredKeys, levelEstimate, experience, profile, resolved } = useVolumeModel(sessions);
  const lm = resolved.landmarks;

  // THE DRAWER, and the sheet the provenance is dispatched to. `deep` is the
  // one flag the expensive passes read: a Performance page that only wants the
  // week's shape pays for the week's shape, and everything heavier is bought
  // the moment the athlete opens the detail.
  const [drawer, setDrawer] = useState(false);
  // Once opened the detail STAYS MOUNTED — unmounting it on close would give
  // the collapse nothing to collapse, and the passes are already paid for.
  const [everOpen, setEverOpen] = useState(false);
  const [source, setSource] = useState(false);
  const deep = !compact || everOpen;

  // HAS THE CEILING SETTLED? The same resolver re-run at every week of the
  // athlete's own history — a screen-level computation, deliberately memoised
  // apart from `resolved` because it costs one resolve per replayed week.
  const replay = useMemo(
    () =>
      // Not until the detail is open: one landmark resolve per week of the
      // athlete's history, to draw four rows behind a disclosure inside a sheet
      // nobody has asked for, is pure cost on a page that only wants the shape.
      prefs.adaptiveLandmarks && deep
        ? testedMuscles(
            replayLandmarks(sessions, recovery, {
              profile,
              overrides: prefs.landmarkOverrides,
              includeWarmups: prefs.countWarmupsInVolume,
              fractional: prefs.fractionalVolume,
            }),
          )
        : [],
    [profile, prefs.landmarkOverrides, prefs.adaptiveLandmarks, prefs.countWarmupsInVolume, prefs.fractionalVolume, sessions, recovery, deep],
  );

  const block = useMemo(() => resolveBlock(prefs.volumeBlock), [prefs.volumeBlock]);
  const plan = useMemo(
    () => (prefs.periodizeVolume
      ? blockVolumePlan(sessions, { block, landmarks: lm, includeWarmups: prefs.countWarmupsInVolume, fractional: prefs.fractionalVolume })
      : null),
    [prefs.periodizeVolume, block, lm, sessions, prefs.countWarmupsInVolume, prefs.fractionalVolume],
  );
  const targetFor = (m: MuscleGroup): BlockMuscleTarget | null => plan?.targets.find((x) => x.muscle === m) ?? null;

  const rows = useMemo(
    () => volumeStatus(sessions, { includeWarmups: prefs.countWarmupsInVolume, fractional: prefs.fractionalVolume, landmarks: lm }),
    [sessions, prefs.countWarmupsInVolume, prefs.fractionalVolume, lm],
  );
  const summary = useMemo(() => volumeSummary(rows), [rows]);
  const ranked = useMemo(() => sortByUrgency(rows), [rows]);
  // EIGHT-WEEK HISTORY, per muscle. This is the chart Trends used to hang off a
  // second set of muscle chips — the same weeklyMuscleSets() engine, over the
  // same muscles, drawn twice on two screens. It belongs on the row that names
  // the muscle: "18 sets" and "and it has been climbing for a month" are one
  // thought, and the athlete no longer picks a muscle in two places.
  const history = useMemo(() => {
    const out = {} as Record<MuscleGroup, number[]>;
    // Seven eight-week passes for rows a closed drawer never renders.
    if (!deep) return out;
    for (const r of rows) out[r.muscle] = weeklyMuscleSets(sessions, r.muscle, 8, Date.now(), prefs.countWarmupsInVolume, prefs.fractionalVolume);
    return out;
  }, [rows, sessions, deep, prefs.countWarmupsInVolume, prefs.fractionalVolume]);

  const [open, setOpen] = useState<MuscleGroup | null>(null);
  const [picked, setPicked] = useState<MuscleGroup | null>(null);
  // Which landmark band is spotlighted across the list, and the row whose scale
  // was clicked (that row carries the definition, next to the pointer).
  const [zone, setZone] = useState<{ key: VolumeBandKey; muscle: MuscleGroup } | null>(null);
  const pickZone = (key: VolumeBandKey, muscle: MuscleGroup) =>
    setZone((z) => (z && z.key === key && z.muscle === muscle ? null : { key, muscle }));
  const customized = Object.keys(prefs.landmarkOverrides).length > 0;


  const pickedRow = picked ? rows.find((r) => r.muscle === picked) : undefined;
  const verdict = (() => {
    if (summary.verdict === "none") return t("w.analyze.vol.verdictNone");
    if (summary.verdict === "balanced") return t("w.analyze.vol.verdictBalanced");
    const parts: string[] = [];
    if (summary.over.length) parts.push(`${summary.over.length}${t("w.analyze.vol.verdictOverTail")}`);
    if (summary.under.length) parts.push(`${summary.under.length}${t("w.analyze.vol.verdictUnderTail")}`);
    return `${parts.join(t("w.analyze.vol.verdictJoin"))}.`;
  })();

  // ── THE DETAIL ────────────────────────────────────────────────────────────
  // Everything behind the week-shape, authored ONCE and rendered at two
  // weights: `flat` sections divided by hairlines inside the compact card's
  // drawer, or the screen's own stack of cards. Same components, same numbers —
  // the drawer is not a summary of the screen, it IS the screen.
  const detail = (flat: boolean) => (
    <>
      {/* ── WHERE THIS WEEK SITS IN THE BLOCK ───────────────────────────────── */}
      <BlockCard flat={flat} lead={flat} block={block} ramp={blockRamp(block, lm)} on={prefs.periodizeVolume} />

      {/* ── THE WEEK'S PRESCRIPTION — verb + magnitude, said once ───────────── */}
      <Prescription flat={flat} title={t("w.analyze.vol.easeOff")} why={t("w.analyze.vol.easeOffWhy")} items={summary.over} token="red" ml={ml} unit={t("w.analyze.vol.perWeek")} />
      <Prescription flat={flat} title={t("w.analyze.vol.addVolume")} why={t("w.analyze.vol.addVolumeWhy")} items={summary.under} token="amber" ml={ml} unit={t("w.analyze.vol.perWeek")} />

      {/* ── BY MUSCLE — one legend, then the stack of comparable rails ──────── */}
      {!summary.empty && (
        <ByMuscle
          flat={flat} rows={ranked} ml={ml} targetFor={targetFor} history={history}
          open={open} setOpen={setOpen} zone={zone} pickZone={pickZone}
        />
      )}

      {/* ── WHOSE NUMBERS THESE ARE — a door, not a seventh card ────────────── */}
      <SourceDoor flat={flat} onOpen={() => setSource(true)} />
    </>
  );

  // The provenance and the working, dispatched. They answer "where did these
  // come from", which is a different question from "what do I do this week" —
  // stacked under the prescription they were read as more of the prescription.
  // Leaving for the model editor from INSIDE the sheet has to close it on the
  // way out. The sheet is a modal over the shell, so a route change underneath
  // it just swaps the screen it is covering — the athlete taps "Training age",
  // the app navigates, and they still see the panel they tapped from.
  const openModelFromSheet = onOpenModel ? () => { setSource(false); onOpenModel(); } : undefined;
  const sourceSheet = (
    <Sheet open={source} onClose={() => setSource(false)} title={t("w.analyze.vol.whose")} detents={["medium", "large"]}>
      <SourceBody
        resolved={resolved} tested={replay} profile={profile} measuredKeys={measuredKeys}
        adaptive={prefs.adaptiveLandmarks} onOpenModel={openModelFromSheet} ml={ml}
        level={levelEstimate} experience={experience} units={prefs.units}
      />
    </Sheet>
  );

  // COMPACT — the hero shape and the drawer. The verdict NAMES NAMES here: the
  // shape above it already says that something is out of range, so the sentence
  // has to say what and by how much, which is the one thing the columns can't.
  if (compact) {
    const named = [...summary.over, ...summary.under]
      .slice(0, 2)
      .map((s) => `${ml(s.muscle)} ${deltaLabel(s)}`)
      .join(", ");
    return (
      <section style={card}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "4px 12px", marginBottom: 12 }}>
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, letterSpacing: "-.01em" }}>{t("w.home.cockpit.weekVolume")}</span>
          <span style={eyebrow}>{t("w.home.cockpit.last7")}</span>
        </div>
        {summary.empty ? (
          <p style={{ margin: 0, fontSize: fs.note, lineHeight: 1.55, color: C("ash"), maxWidth: 460 }}>{t("w.analyze.vol.empty")}</p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 46, lineHeight: 1.06, letterSpacing: "-.03em" }}>{summary.inRange}</span>
              <span style={{ ...mono(fs.subtitle), color: C("ash") }}>/{summary.total}</span>
              <span style={{ ...mono(fs.caption), color: C("ash"), marginLeft: 6 }}>{t("w.home.cockpit.inRange")}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`, gap: 6, marginTop: 18, maxWidth: 520 }}>
              {rows.map((r) => (
                <div key={r.muscle}>
                  <ShapeColumn s={r} token={ZONE_TOKEN[r.zone]} dim={false} />
                  <div style={{ marginTop: 8, ...mono(9), letterSpacing: ".08em", color: C("ash"), textAlign: "center" }}>{ml(r.muscle).slice(0, 3).toUpperCase()}</div>
                </div>
              ))}
            </div>
            <p style={{ marginTop: 16, marginBottom: 0, fontSize: fs.body, lineHeight: 1.5 }}>
              {named ? <><b style={{ fontWeight: 700 }}>{named}</b><span style={{ color: C("ash") }}>. {verdict}</span></> : <span style={{ color: C("ash") }}>{verdict}</span>}
            </p>
          </>
        )}
        {!summary.empty && (
          <>
            <button
              className="pressable"
              onClick={() => { setEverOpen(true); setDrawer((v) => !v); }}
              aria-expanded={drawer}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", marginTop: 16, paddingTop: 14, border: 0, borderTop: `1px solid ${C("line")}`, background: "none", cursor: "pointer", color: C("chalk"), textAlign: "left" }}
            >
              <span style={eyebrow}>{t("w.home.cockpit.volumeDoor")}</span>
              <span style={{ marginLeft: "auto", ...mono(fs.caption), fontWeight: 700, color: "var(--lime-text)" }}>
                {drawer ? t("w.analyze.vol.hideDetail") : t("w.analyze.vol.title")}
                {/* The chevron ROTATES rather than swapping glyph, so the
                    control reads as the same object in two states. */}
                <span aria-hidden style={{ display: "inline-block", marginLeft: 6, transform: drawer ? "rotate(-180deg)" : "none", transition: "transform var(--d-sheet) var(--e-sheet)" }}>↓</span>
              </span>
            </button>

            {/* THE DRAWER — a 0fr → 1fr grid row: a real height animation with
                nothing measured, so the block, the prescription and the rails
                slide out from under the shape that raised the question. */}
            <Drawer open={drawer}>{everOpen ? detail(true) : null}</Drawer>
          </>
        )}
        {sourceSheet}
      </section>
    );
  }

  const editToggle = onOpenModel
    ? <HeroAccessory label={t("w.analyze.model.open")} active={false} onClick={onOpenModel} onDark={false} />
    : undefined;
  // Standing alone the head is the system's — title below the rail, the edit
  // control in the rail's TRAILING slot. Embedded in the unified Performance
  // page the host owns the head, so the section keeps its own h2 row.
  const shell = (children: React.ReactNode) =>
    unified ? <>{children}</> : (
      <HeroScreen hero={{ rank: "title", title: t("w.analyze.vol.title"), meta: [t("w.analyze.vol.subtitle")] }} accessory={editToggle}>
        {children}
      </HeroScreen>
    );

  return shell(
    <div style={{ display: "flex", flexDirection: "column", gap: space.md, maxWidth: "100%", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {unified && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: space.md }}>
          <div>
            {createElement(
              "h2",
              { style: { fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: fs.display, margin: 0, letterSpacing: "-.02em" } },
              t("w.analyze.vol.title"),
            )}
            <p style={{ fontSize: fs.bodyLg, color: C("ash"), marginTop: 6, marginBottom: 0 }}>{t("w.analyze.vol.subtitle")}</p>
          </div>
          {onOpenModel && (
            <button className="pressable"
              onClick={onOpenModel}
              style={{ ...mono(fs.caption), whiteSpace: "nowrap", padding: "8px 16px", borderRadius: 999, cursor: "pointer", color: C("ash"), background: "transparent", border: `1px solid ${C("line")}` }}
            >
              {t("w.analyze.model.open")}
            </button>
          )}
        </div>
      )}

      {/* ── HERO — the whole week as one number and one shape ─────────────── */}
      <section style={{ ...card, paddingBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={eyebrow}>{t("w.analyze.vol.range7d")}</span>
          {customized && <span style={{ ...eyebrow, color: C("lime") }}>{t("w.analyze.vol.customised")}</span>}
        </div>

        {summary.empty ? (
          <p style={{ marginTop: 16, marginBottom: 0, fontSize: fs.note, lineHeight: 1.55, color: C("ash"), maxWidth: 460 }}>{t("w.analyze.vol.empty")}</p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", marginTop: 10 }}>
              <span style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 68, lineHeight: 1.06, letterSpacing: "-.03em" }}>{summary.inRange}</span>
              <span style={{ ...mono(fs.heading), color: C("ash"), marginLeft: 4 }}>/{summary.total}</span>
            </div>
            <p style={{ fontSize: fs.note, lineHeight: 1.4, color: C("ash"), margin: 0, maxWidth: 260 }}>{t("w.analyze.vol.heroCaption")}</p>

            <div style={{ display: "grid", gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`, gap: 6, marginTop: 24, maxWidth: 520 }}>
              {rows.map((r) => {
                const on = picked === r.muscle;
                const label = ml(r.muscle);
                return (
                  <button className="pressable"
                    key={r.muscle}
                    onClick={() => setPicked(on ? null : r.muscle)}
                    aria-label={`${label} – ${setsLabel(r.sets)} ${t("w.analyze.vol.sets")}, ${t(ZONE_KEY[r.zone])}`}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center" }}
                  >
                    <ShapeColumn s={r} token={ZONE_TOKEN[r.zone]} dim={picked !== null && !on} />
                    <span style={{ marginTop: 8, ...mono(9), letterSpacing: ".08em", color: on ? C("chalk") : C("ash") }}>{label.slice(0, 3).toUpperCase()}</span>
                  </button>
                );
              })}
            </div>

            <p style={{ marginTop: 16, marginBottom: 0, fontSize: fs.bodyLg, lineHeight: 1.45, color: C("chalk") }}>
              {pickedRow ? (
                <>
                  {ml(pickedRow.muscle)}
                  <span style={{ color: C("ash") }}>{" — "}</span>
                  <span style={{ ...mono(fs.bodyLg), color: C(ZONE_TOKEN[pickedRow.zone]) }}>{setsLabel(pickedRow.sets)} {t("w.analyze.vol.sets")}</span>
                  <span style={{ color: C("ash") }}>, {t(ZONE_KEY[pickedRow.zone])}</span>
                </>
              ) : (
                verdict
              )}
            </p>
          </>
        )}
      </section>

      {/* The block, the prescription, the rails and the provenance door — the
          SAME nodes the compact card's drawer carries, at card weight. */}
      {detail(false)}

      {/* THE GLOSSARY IS GONE. It defined MV/MEV/MAV/MRV in a collapsed card
          at the foot of the screen — but every band value on every muscle row
          is already a control that spotlights that band across the whole list
          and prints its definition beside the pointer. The interactive version
          shows rather than tells, and it arrives at the moment the question is
          actually asked. The card was the pre-interactive version left in
          place. (GLOSS_KEY still backs the row spotlight.) */}

      {sourceSheet}
    </div>
  );
}

/**
 * A DISCLOSURE THAT MOVES — the one way anything on this screen opens.
 *
 * Every fold on the Volume surface now runs the same 0fr → 1fr grid row
 * (globals.css `.motion-drawer`, on the sheet spring): the compact card's
 * detail, "Show the working" inside the provenance sheet, a muscle row's floor
 * and history, and the band definition under a spotlight. They were three
 * `{open && …}` conditionals that POPPED inside a card that eases, which reads
 * as three different mechanisms rather than one idea at different scales.
 *
 * The content MOUNTS on first open and stays: a collapse needs something to
 * collapse, and a fold nobody has opened should not pay to render — seven
 * muscle rows each carrying an eight-week chart is not free.
 * Mirrored on mobile by the measured-height `Drawer` in aurora/volume.tsx.
 */
function Drawer({ open, children }: { open: boolean; children: React.ReactNode }) {
  // Latched in RENDER, not in an effect. An effect commits one frame too late:
  // the drawer would start its transition with an empty child, so the first
  // frame of every open animates toward a height of nothing.
  const mounted = useRef(open);
  if (open) mounted.current = true;
  return (
    <div className="motion-drawer" data-open={open ? "" : undefined}>
      {/* Staying mounted is what buys the collapse — but a clipped panel is
          still in the accessibility tree and still focusable, so a closed
          drawer would hand a screen reader (and the Tab key) a section that
          isn't on screen. `inert` is the whole fix: it takes the subtree out of
          focus order AND out of the a11y tree, in one attribute. */}
      <div inert={!open}>{mounted.current ? children : null}</div>
    </div>
  );
}

/**
 * One section of the detail, at whichever weight its host wants.
 *
 * On the screen each section is its own CARD; inside the compact card's drawer
 * they are FLAT — divided by a hairline, because a card inside a card reads as
 * a bug. Nothing else differs, so a section can never drift between the two
 * places it appears.
 */
function Panel({ flat, lead = false, children }: { flat: boolean; lead?: boolean; children: React.ReactNode }) {
  return (
    <section style={flat
      ? { marginTop: lead ? 18 : 20, paddingTop: lead ? 0 : 20, borderTop: lead ? undefined : `1px solid ${C("line")}` }
      : card}
    >
      {children}
    </section>
  );
}

/** BY MUSCLE — the legend, then the stack of comparable rails. */
function ByMuscle({ flat, rows, ml, targetFor, history, open, setOpen, zone, pickZone }: {
  flat: boolean;
  rows: MuscleVolumeStatus[];
  ml: (m: string) => string;
  targetFor: (m: MuscleGroup) => BlockMuscleTarget | null;
  history: Record<MuscleGroup, number[]>;
  open: MuscleGroup | null;
  setOpen: (m: MuscleGroup | null) => void;
  zone: { key: VolumeBandKey; muscle: MuscleGroup } | null;
  pickZone: (k: VolumeBandKey, m: MuscleGroup) => void;
}) {
  const { t } = useLang();
  return (
    <Panel flat={flat}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
        <h2 style={sectionTitle}>{t("w.analyze.vol.byMuscle")}</h2>
        <span style={eyebrow}>{t("w.analyze.vol.range7d")}</span>
      </div>

      <div>
        {rows.map((r) => (
          <MuscleRow
            key={r.muscle} s={r} label={ml(r.muscle)} token={ZONE_TOKEN[r.zone]}
            target={targetFor(r.muscle)} history={history[r.muscle] ?? []}
            expanded={open === r.muscle}
            zone={zone?.key ?? null} showGloss={zone?.muscle === r.muscle}
            onToggle={() => setOpen(open === r.muscle ? null : r.muscle)}
            onZone={(k) => pickZone(k, r.muscle)}
          />
        ))}
      </div>
    </Panel>
  );
}

/** The way into the provenance sheet. A row, not a card: "where did these come
 *  from" is a question the reading raises, not another part of the reading. */
function SourceDoor({ flat, onOpen }: { flat: boolean; onOpen: () => void }) {
  const { t } = useLang();
  return (
    <Panel flat={flat}>
      <button
        className="pressable"
        type="button"
        onClick={onOpen}
        style={{ display: "flex", alignItems: "center", gap: space.ms, width: "100%", padding: 0, border: 0, background: "transparent", textAlign: "left", cursor: "pointer" }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ ...sectionTitle, display: "block" }}>{t("w.analyze.vol.whose")}</span>
          <span style={{ display: "block", marginTop: 4, fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{t("w.analyze.vol.showWork")}</span>
        </span>
        <span aria-hidden style={{ ...mono(fs.body), color: "var(--lime-text)" }}>→</span>
      </button>
    </Panel>
  );
}

/** One column of the hero's week-shape — the same normalised rail, stood up. */
function ShapeColumn({ s, token, dim }: { s: MuscleVolumeStatus; token: string; dim: boolean }) {
  const g = railGeometry(s);
  return (
    <div style={{ position: "relative", width: "100%", height: 66, borderRadius: 7, background: C("ink"), overflow: "hidden", opacity: dim ? 0.35 : 1, transition: "opacity .18s ease" }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: pct(g.bandStart), height: pct(g.bandEnd - g.bandStart), background: mix("lime", 13) }} />
      {/* the territory past the ceiling */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: pct(g.mrv), top: 0, background: mix("red", 16) }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: pct(g.x), background: C(token), opacity: 0.9, borderRadius: "7px 7px 0 0", transition: "height .3s cubic-bezier(.2,.7,.2,1)" }} />
      {/* the ceiling reads as a NOTCH in the column, so it survives the fill */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: pct(g.mrv), height: 2, background: C("ink2") }} />
    </div>
  );
}

/** "Ease off" / "Add volume" — the prescription as chips, with the reason said
 *  ONCE underneath instead of repeated verbatim on every muscle. */
function Prescription({ flat, title, why, items, token, ml, unit }: {
  flat: boolean; title: string; why: string; items: MuscleVolumeStatus[]; token: string; ml: (m: string) => string; unit: string;
}) {
  if (!items.length) return null;
  return (
    <Panel flat={flat}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
        <h2 style={sectionTitle}>{title}</h2>
        <span style={eyebrow}>{unit}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm, marginTop: 16 }}>
        {items.map((s) => (
          <span key={s.muscle} style={{ display: "inline-flex", alignItems: "center", gap: space.sm, padding: "8px 16px", borderRadius: 999, border: `1px solid ${mix(token, 35)}`, background: mix(token, 10) }}>
            <span style={{ fontSize: fs.bodyLg, fontWeight: 600, color: C("chalk") }}>{ml(s.muscle)}</span>
            <span style={{ ...mono(fs.bodyLg), fontWeight: 700, color: C(token) }}>{deltaLabel(s)}</span>
          </span>
        ))}
      </div>
      <p style={{ marginTop: 16, marginBottom: 0, fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{why}</p>
    </Panel>
  );
}

/** A pill switch — the same control the block and adaptive toggles both use. */
function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button className="pressable"
      onClick={onClick} role="switch" aria-checked={on}
      style={{ ...mono(fs.caption), whiteSpace: "nowrap", padding: "8px 12px", borderRadius: 999, cursor: "pointer", color: on ? C("lime") : C("ash"), background: on ? mix("lime", 12) : "transparent", border: `1px solid ${on ? C("lime") : C("line")}` }}
    >
      {label}
    </button>
  );
}

/**
 * THIS BLOCK — the week you're in, and the block drawn as a ramp.
 *
 * The strip is the argument: a low introduction week, a climb toward MAV, and
 * the step down of the deload. Switched off, the card is just the case for
 * turning it on, so the landmark view stays exactly as it was.
 */
function BlockCard({ flat, lead, block, ramp, on }: {
  flat: boolean; lead: boolean; block: VolumeBlock; ramp: RampColumn[]; on: boolean;
}) {
  const { t } = useLang();
  const current = ramp.find((c) => c.current) ?? ramp[0];
  return (
    <Panel flat={flat} lead={lead}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
        <h2 style={sectionTitle}>{t("w.analyze.vol.thisBlock")}</h2>
        <Toggle on={on} label={t("w.analyze.vol.periodize")} onClick={() => setLoggerPref("periodizeVolume", !on)} />
      </div>

      {!on ? (
        <p style={{ marginTop: 12, marginBottom: 0, fontSize: fs.body, lineHeight: 1.55, color: C("ash") }}>{t("w.analyze.vol.periodizeWhy")}</p>
      ) : (
        <>
          <p style={{ marginTop: 12, marginBottom: 0, fontSize: fs.bodyLg, lineHeight: 1.45, color: C("chalk") }}>
            {t("w.analyze.vol.weekPre")}{block.week}{t("w.analyze.vol.weekOf")}{block.weeks}
            <span style={{ color: C("ash") }}>{" — "}</span>
            <span style={{ color: current?.kind === "deload" ? C("blue") : C("lime") }}>{current ? t(blockKindKey(current.kind)) : ""}</span>
          </p>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: 16, height: 72, maxWidth: 420 }}>
            {ramp.map((c) => (
              <div key={c.week} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ width: "100%", height: 56, display: "flex", alignItems: "flex-end", background: C("ink"), borderRadius: 7, overflow: "hidden" }}>
                  <div
                    title={`${c.sets}`}
                    style={{ width: "100%", height: pct(c.height), background: c.kind === "deload" ? C("blue") : C("lime"), opacity: c.current ? 0.95 : 0.32, borderRadius: "7px 7px 0 0", transition: "height .3s cubic-bezier(.2,.7,.2,1)" }}
                  />
                </div>
                <span style={{ ...mono(9), letterSpacing: ".08em", color: c.current ? C("chalk") : C("ash") }}>{c.week}</span>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 12, marginBottom: 0, fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{t("w.analyze.vol.rampCaption")}</p>

        </>
      )}
    </Panel>
  );
}

const NUTRITION_KEY = { deficit: "w.analyze.vol.nutDeficit", maintenance: "w.analyze.vol.nutMaintenance", surplus: "w.analyze.vol.nutSurplus" } as const;
const EXP_KEY = { beginner: "w.analyze.vol.expBeginner", intermediate: "w.analyze.vol.expIntermediate", advanced: "w.analyze.vol.expAdvanced" } as const;
/** Which profile field each personalization factor reads, so a measured field
 *  can be marked wherever its factor is shown. Partial on purpose: `clearance`
 *  is measured from the log and has no field to type into. */
const FACTOR_FIELD: Partial<Record<LandmarkFactor["key"], keyof AthleteVolumeProfile>> = {
  experience: "experience", age: "ageYears", bodyweight: "bodyweightKg",
  sleep: "sleep", stress: "stress", nutrition: "nutrition", frequency: "daysPerWeek",
};

/** Height of one rung of the provenance ladder. Fixed, so the four spine
 *  segments read as one column of evidence rather than four unrelated marks. */
const RUNG_H = 38;

/**
 * WHOSE NUMBERS ARE THESE — the body of the provenance SHEET.
 *
 * It used to be the seventh card at the foot of the Volume screen, where it
 * read as more of the prescription. It is dispatched as a sheet now: the
 * question is asked ABOUT the reading, from anywhere the reading appears (the
 * screen, or the compact card's drawer on Performance), and it is answered
 * without the athlete losing their place. The sheet's own header carries the
 * title, so this body starts straight at the ladder.
 *
 * The body answers three questions, in the order an athlete actually asks them,
 * and gives each one a different weight rather than stacking six paragraphs at
 * the same size:
 *
 *   1. ARE THESE MINE OR A TEXTBOOK'S? — the provenance LADDER. `athleteLandmarks`
 *      layers population → profile → observed → manual; that is a four-rung
 *      climb, not a caption, so it is drawn as one: a column of segments lit as
 *      far as the evidence reaches, each carrying the confidence its layer can
 *      honestly claim. You see how personal the numbers are before you read a
 *      word. Clicking a rung reads what that layer did.
 *   2. WHAT WOULD MAKE THEM MORE MINE? — one meter and ONE thing to do, and the
 *      thing to do is a control: the next gap opens the form on the spot instead
 *      of naming a field and leaving the athlete to find it.
 *   3. SHOW ME THE WORKING. — the level read from the bar, the factors that
 *      moved the bands, the log's correction and the ceiling's own history, all
 *      folded behind one disclosure. Depth for whoever wants it; silence for
 *      everyone else.
 *
 * Mirrors apps/mobile/components/aurora/volume.tsx.
 */
function SourceBody({ resolved, tested, profile, measuredKeys, adaptive, onOpenModel, ml, level, experience, units }: {
  resolved: ReturnType<typeof athleteLandmarks>;
  /** The ceiling's own history, muscles the log has actually tested. */
  tested: LandmarkReplay[];
  profile: AthleteVolumeProfile;
  /** Profile fields filled in from measurement rather than typed — marked, so a
   *  derived number never reads as something the athlete claimed. */
  measuredKeys: Set<keyof AthleteVolumeProfile>;
  adaptive: boolean;
  /** The settings route that owns the form these figures come from. */
  onOpenModel?: () => void;
  ml: (m: string) => string;
  level: ReturnType<typeof estimateFitnessLevel>;
  experience: ReturnType<typeof resolveExperience>;
  /** The athlete's weight unit — lifts are shown in the unit they train in. */
  units: WeightUnit;
}) {
  const { t } = useLang();
  const done = volumeProfileCompleteness(profile, measuredKeys);
  const ladder = useMemo(() => provenanceLadder(resolved), [resolved]);
  // Which layer's sentence is on screen. Defaults to the layer that actually
  // named the numbers; clicking a rung reads that one instead.
  const [layer, setLayer] = useState<LandmarkSource | null>(null);
  const shown = layer ?? resolved.source;
  // The working, folded away. And the profile form, which the "next gap" row
  // opens on the spot — its own state, so reaching for it here doesn't expand
  // every landmark field on the muscle rows above.
  const [work, setWork] = useState(false);
  const subhead: CSSProperties = { ...sectionTitle, fontSize: fs.body, margin: 0 };
  const prose: CSSProperties = { margin: 0, fontSize: fs.body, lineHeight: 1.55, color: C("ash") };

  return (
    <div style={{ fontFamily: "var(--font-display)", color: C("chalk") }}>
      {/* ── THE LADDER ──────────────────────────────────────────────────────
          Four rungs in the order the engine applies them, lit as far as the
          evidence reaches. The lit spine is the whole answer: a column that
          stops at rung one says "textbook averages" far more plainly than the
          caption that used to sit up here fighting the title for the same row. */}
      <div role="radiogroup" aria-label={t("w.analyze.vol.whose")}>
        {ladder.map((r) => {
          const on = r.source === shown;
          const meta = rungMeta(r);
          return (
            <button
              key={r.source}
              className="pressable"
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setLayer(r.source === resolved.source ? null : r.source)}
              style={{
                display: "flex", alignItems: "center", gap: space.ms, width: "100%", height: RUNG_H,
                padding: "0 8px", margin: "0 -8px", border: 0, borderRadius: 10, textAlign: "left", cursor: "pointer",
                background: on ? "color-mix(in srgb, var(--color-chalk) 5%, transparent)" : "transparent",
              }}
            >
              {/* One segment of the spine. Lit means the layer contributed; full
                  strength means it is the layer that named the numbers. */}
              <span aria-hidden style={{ width: 3, height: RUNG_H - 12, borderRadius: 2, background: r.lit ? C("lime") : C("ink"), opacity: r.lit ? (r.active ? 1 : 0.4) : 1, flex: "0 0 auto" }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: fs.body, fontWeight: r.active ? 600 : 400, color: r.lit ? C("chalk") : C("ash"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t(r.labelKey)}
              </span>
              <span style={{ ...mono(fs.caption), color: r.lit ? C("lime") : C("ash") }}>{meta}</span>
            </button>
          );
        })}
      </div>
      <p style={{ ...prose, marginTop: 12 }}>{t(sourceWhyKey(shown))}</p>

      {/* ── THE ONE THING TO DO NEXT ────────────────────────────────────────
          How complete the profile is, weighted by how much each input actually
          moves the estimate — and the single most valuable gap as a CONTROL.
          Naming the field and leaving the athlete to hunt for the form was a
          step we were making them take for no reason. */}
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C("line")}` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ ...mono(fs.note), fontWeight: 700, color: C("chalk") }}>{Math.round(done.score * 100)}%</span>
          <span style={{ ...mono(fs.caption), color: C("ash") }}>{t("w.analyze.vol.knownAbout")}</span>
        </div>
        <div style={{ height: 3, borderRadius: 999, background: C("ink"), marginTop: 10, overflow: "hidden" }}>
          <div style={{ width: pct(done.score), height: "100%", background: C("lime"), transition: "width .3s cubic-bezier(.2,.7,.2,1)" }} />
        </div>

        {done.next ? (
          <>
            <button
              className="pressable"
              type="button"
              onClick={() => onOpenModel?.()}
              style={{ display: "flex", alignItems: "center", gap: space.ms, width: "100%", marginTop: 14, padding: 0, border: 0, background: "transparent", textAlign: "left", cursor: "pointer" }}
            >
              <span style={{ ...mono(fs.nano), textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.analyze.vol.nextUp")}</span>
              <span style={{ flex: 1, fontSize: fs.bodyLg, fontWeight: 600, color: C("chalk") }}>{t(VOLUME_PROFILE_FIELD_KEY[done.next.key])}</span>
              <span aria-hidden style={{ ...mono(fs.body), color: C("lime") }}>→</span>
            </button>
            <p style={{ ...prose, marginTop: 6 }}>{t(done.next.unlocksKey)}</p>
          </>
        ) : (
          <p style={{ ...prose, marginTop: 12 }}>{t("w.analyze.vol.profileComplete")}</p>
        )}
      </div>

      {/* ── SHOW THE WORKING ────────────────────────────────────────────────
          Everything below is evidence for the ladder above: the level read off
          the bar, the factors that moved the bands, the log's correction and
          the ceiling's own history. Four sub-sections that used to sit open,
          at one size, stacked into a wall nobody read. */}
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C("line")}` }}>
        <button
          className="pressable"
          type="button"
          aria-expanded={work}
          onClick={() => setWork((v) => !v)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm, width: "100%", padding: 0, border: 0, background: "transparent", textAlign: "left", cursor: "pointer" }}
        >
          <span style={subhead}>{t("w.analyze.vol.showWork")}</span>
          <span aria-hidden style={{ ...mono(fs.caption), color: C("ash") }}>{work ? "–" : "+"}</span>
        </button>
      </div>

      <Drawer open={work}>
        <>
          {/* YOUR LEVEL, FROM YOUR LIFTS. */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: space.sm, flexWrap: "wrap" }}>
              <h3 style={subhead}>{t("w.analyze.vol.levelTitle")}</h3>
              {level.basis !== "none" && (
                <span style={{ ...mono(fs.caption), color: C("lime") }}>{t(LEVEL_KEY[level.level])}</span>
              )}
            </div>
            {level.basis === "none" ? (
              <p style={{ ...prose, marginTop: 8 }}>{t("w.analyze.vol.levelNoData")}</p>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                  {/* Two kinds of evidence, two units. A lift is kg and a multiple
                      of body mass; a run is a distance and a pace. They share a row
                      shape but never a number — see core/engines/fitness-level.ts. */}
                  {level.evidence.slice(0, 3).map((e) => (
                    <div key={e.kind + e.lift} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: space.sm }}>
                      <span style={{ fontSize: fs.body, color: C("chalk") }}>{e.lift}</span>
                      <span style={{ ...mono(fs.caption), color: C("ash") }}>
                        {e.kind === "strength" ? fmtWeight(e.e1rm!, units) : `${paceClock(Math.round(e.equivSec! / 5))} ${t("w.analyze.vol.levelEquiv")}`}
                      </span>
                      <span style={{ ...mono(fs.body), fontWeight: 700, minWidth: 74, textAlign: "right" }}>
                        {e.kind === "strength"
                          ? `${e.ratio.toFixed(2)} ${t("w.analyze.vol.ofBodyweight")}`
                          : `${formatPace(e.ratio)} ${t("w.analyze.vol.levelPace")}`}
                      </span>
                    </div>
                  ))}
                </div>
                <p style={{ ...prose, marginTop: 10 }}>
                  {t(LEVEL_BASIS_KEY[level.basis])} {Math.round(level.confidence * 100)}% {t("w.analyze.vol.confidence")}
                </p>
                {experience.disagrees && (
                  <div style={{ display: "flex", alignItems: "center", gap: space.sm, marginTop: 12, flexWrap: "wrap" }}>
                    <p style={{ flex: 1, minWidth: 200, margin: 0, fontSize: fs.body, lineHeight: 1.5, color: C("amber") }}>{t("w.analyze.vol.levelDisagrees")}</p>
                    {onOpenModel && <Toggle on={false} label={t("w.analyze.model.open")} onClick={onOpenModel} />}
                  </div>
                )}
              </>
            )}
          </div>

          {/* WHAT MOVED YOUR BANDS. These rows used to render headless, directly
              under the level block, so "Sleep 3/5 −6%" read as evidence of how
              strong you are. They are their own subject and now say so — and
              each one names WHICH END of the band it moved, which the engine has
              always known (`affects`) and the screen used to throw away. */}
          {resolved.factors.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h3 style={subhead}>{t("w.analyze.vol.factorsTitle")}</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                {resolved.factors.map((f) => {
                  const value = f.key === "experience"
                    ? t(EXP_KEY[f.value as keyof typeof EXP_KEY] ?? "w.analyze.vol.expBeginner")
                    : f.key === "nutrition" ? t(NUTRITION_KEY[f.value as keyof typeof NUTRITION_KEY]) : f.value;
                  const measured = !!FACTOR_FIELD[f.key] && measuredKeys.has(FACTOR_FIELD[f.key]!);
                  const meta = [value, measured ? t("w.analyze.vol.measured") : null, t(factorAffectsKey(f.affects))].filter(Boolean).join(" – ");
                  return (
                    <div key={f.key}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: space.sm }}>
                        <span style={{ fontSize: fs.body, color: C("chalk") }}>{t(factorLabelKey(f.key))}</span>
                        <span style={{ ...mono(fs.body), fontWeight: 700, color: f.multiplier >= 1 ? C("lime") : C("amber"), minWidth: 44, textAlign: "right" }}>{factorPercent(f.multiplier)}</span>
                      </div>
                      <div style={{ ...mono(fs.caption), color: C("ash"), marginTop: 2 }}>{meta}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* THE LOG'S CORRECTION — what your own training proved. */}
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm, flexWrap: "wrap" }}>
              <h3 style={{ ...subhead, flex: 1, minWidth: 160 }}>{t("w.analyze.vol.adaptive")}</h3>
              <Toggle on={adaptive} label={t(adaptive ? "common.on" : "common.off")} onClick={() => setLoggerPref("adaptiveLandmarks", !adaptive)} />
            </div>
            {!adaptive ? (
              <p style={{ ...prose, marginTop: 10 }}>{t("w.analyze.vol.adaptiveWhy")}</p>
            ) : resolved.adapted.length ? (
              <p style={{ ...prose, marginTop: 10 }}>
                {`${resolved.adapted.map((m) => {
                  // The estimate never ships without its stated interval — a
                  // ceiling shown as a bare number reads as a measurement.
                  const e = resolved.estimates[m];
                  return e ? `${ml(m)} ${e.mrv} (${e.lo}–${e.hi})` : ml(m);
                }).join(", ")} — ${resolved.adapted.length} ${t("w.analyze.vol.adaptedCount")}`}
              </p>
            ) : (
              <p style={{ ...prose, marginTop: 10 }}>{t("w.analyze.vol.notEnoughEvidence")}</p>
            )}
          </div>

          {/* HAS IT SETTLED? A ceiling is a claim, and the only evidence for it
              the app can offer is the shape of its own history: the same
              estimator, run at every week, with only the data that existed then.
              A number that stopped moving is worth training against; one that is
              still jumping says so. See core/engines/landmark-replay.ts.
              Silent until a week has been tested — with nothing to plot it said
              the same "not enough yet" the line above had just said. */}
          {adaptive && tested.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h3 style={subhead}>{t("w.analyze.vol.replayTitle")}</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
                {tested.slice(0, 4).map((r) => (
                  <div key={r.muscle} style={{ display: "flex", alignItems: "baseline", gap: space.sm }}>
                    <span style={{ flex: 1, minWidth: 80, fontSize: fs.body, color: C("chalk") }}>{ml(r.muscle)}</span>
                    {/* The trajectory itself, not a summary of it. */}
                    <span style={{ ...mono(fs.caption), color: C("ash"), letterSpacing: ".08em" }}>
                      {r.points.filter((p) => p.tested).slice(-5).map((p) => p.mrv).join(" → ")}
                    </span>
                    <span style={{ ...mono(fs.caption), minWidth: 78, textAlign: "right", color: r.verdict === "settled" ? "var(--lime-text)" : r.verdict === "unsettled" ? "var(--amber-text)" : C("ash") }}>
                      {t(REPLAY_VERDICT_KEY[r.verdict])}
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ ...prose, marginTop: 10 }}>{t("w.analyze.vol.replayWhy")}</p>
            </div>
          )}
        </>
      </Drawer>

    </div>
  );
}

/** One muscle: name, count, the normalised rail — and, on tap, the landmarks
 *  behind it (read-only, or as fields while editing). */
function MuscleRow({ s, label, token, target, history, expanded, zone, showGloss, onToggle, onZone }: {
  s: MuscleVolumeStatus; label: string; token: string; expanded: boolean;
  /** This week's block target, when volume is being periodized. */
  target: BlockMuscleTarget | null;
  /** Weekly hard sets for THIS muscle over the last eight weeks, oldest first. */
  history: number[];
  /** The band spotlighted across the whole list, if any. */
  zone: VolumeBandKey | null;
  /** True on the row whose scale was clicked — it carries the definition. */
  showGloss: boolean;
  onToggle: () => void; onZone: (k: VolumeBandKey) => void;
}) {
  const { t } = useLang();
  const g = railGeometry(s);
  const sc = railScale(s.landmark);
  const region = zone ? bandRegion(zone, s.landmark) : null;
  // The last band THIS ROW explained, held so its definition survives the
  // collapse that dismissing the spotlight starts. Guarded on `showGloss` and
  // not on `zone` alone: every row sees the spotlighted band, so the looser
  // test would rewrite a closing row's paragraph to a definition it was never
  // showing the moment another row was tapped.
  const held = useRef<VolumeBandKey>("mev");
  if (zone && showGloss) held.current = zone;
  const lastZone = held.current;
  // The block target sits on the SAME normalised rail as everything else, so
  // "where I am" and "where the plan wants me" are one glance, not two.
  const targetX = target ? railX(target.target, s.landmark) : null;
  const verdict = target ? targetVerdict(s.sets, target.target) : null;
  return (
    <div style={{ padding: "12px 0" }}>
      <button className="pressable"
        onClick={onToggle} aria-expanded={expanded}
        aria-label={`${label} – ${setsLabel(s.sets)} ${t("w.analyze.vol.sets")}, ${t(ZONE_KEY[s.zone])}`}
        style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", textAlign: "left" }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: space.sm, marginBottom: 8 }}>
          <span style={{ flex: 1, fontSize: fs.note, fontWeight: 600 }}>{label}</span>
          <span style={{ ...mono(fs.note), fontWeight: 700, color: C(token) }}>{setsLabel(s.sets)} {t("w.analyze.vol.sets")}</span>
          <span style={{ ...mono(fs.caption), color: C("ash") }}>{target ? `${t("w.analyze.vol.target")} ${target.target}` : t(ZONE_KEY[s.zone])}</span>
        </div>
        <div style={{ position: "relative", height: 11, borderRadius: 6, background: C("ink"), overflow: "hidden" }}>
          {/* The track is itself the key: the productive band lit, the territory
              past the ceiling tinted, so the zones read even on an empty rail. */}
          <div style={{ position: "absolute", left: pct(g.bandStart), width: pct(g.bandEnd - g.bandStart), top: 0, bottom: 0, background: mix("lime", 13) }} />
          <div style={{ position: "absolute", left: pct(g.mrv), right: 0, top: 0, bottom: 0, background: mix("red", 16) }} />
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct(g.x), background: C(token), opacity: 0.9, borderRadius: 6, transition: "width .3s cubic-bezier(.2,.7,.2,1)" }} />
          {/* MEV + MRV as notches cut out of the rail — always legible, filled or not */}
          <div style={{ position: "absolute", left: pct(g.mev), top: 0, bottom: 0, width: 2, background: C("ink2") }} />
          <div style={{ position: "absolute", left: pct(g.mrv), top: 0, bottom: 0, width: 2, background: C("ink2") }} />
          {/* This week's block target — a bright caret ON the rail, so the gap
              between where you are and where the plan wants you is a distance. */}
          {targetX !== null && (
            <div style={{ position: "absolute", left: pct(targetX), top: -2, bottom: -2, width: 2, background: C("chalk"), transition: "left .3s cubic-bezier(.2,.7,.2,1)" }} />
          )}
          {/* SPOTLIGHT — clicking a landmark below scrims everything outside that
              band, on EVERY row at once, so the question "which part of the bar
              is my productive range" is answered by the chart itself. */}
          {region && (
            <>
              <div style={{ position: "absolute", left: 0, width: pct(region.from), top: 0, bottom: 0, background: mix("ink", 76), transition: "width .2s ease" }} />
              <div style={{ position: "absolute", left: pct(region.to), right: 0, top: 0, bottom: 0, background: mix("ink", 76), transition: "left .2s ease" }} />
              {/* Caliper edges, so the lit slice reads even when it is empty. */}
              <div style={{ position: "absolute", left: pct(region.from), width: pct(region.to - region.from), top: 0, bottom: 0, borderLeft: `1px solid ${mix("chalk", 45)}`, borderRight: `1px solid ${mix("chalk", 45)}` }} />
            </>
          )}
        </div>
      </button>

      {/* This muscle's OWN scale — a plain three-column table pinned to the left
          edge, so the values line up down the whole list instead of floating at
          three different indents. Each cell is a control: click it to spotlight
          that band and read what it means. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginTop: 8, maxWidth: 420 }}>
        {BAND_KEYS.map((k) => {
          const on = zone === k;
          return (
            <button className="pressable"
              key={k} onClick={() => onZone(k)} aria-pressed={on}
              aria-label={`${BAND_LABEL[k]} ${sc[k]} – ${t(GLOSS_KEY[k])}`}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", ...mono(9), letterSpacing: ".08em", color: on ? C("lime") : C("ash"), opacity: zone && !on ? 0.4 : 1, transition: "opacity .2s ease, color .2s ease" }}
            >
              {BAND_LABEL[k]} <span style={{ fontSize: 11, color: C("chalk") }}>{sc[k]}</span>
            </button>
          );
        })}
      </div>

      {/* The definition of the spotlighted band, beside the pointer. The band
          is REMEMBERED through the collapse — reading `zone` straight would
          empty the paragraph the instant the spotlight is dismissed, and the
          drawer would shut on nothing. */}
      <Drawer open={!!zone && showGloss}>
        <p style={{ marginTop: 8, marginBottom: 0, fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{t(GLOSS_KEY[lastZone])}</p>
      </Drawer>

      {/* Expanding adds only what the scale above does NOT already say: the
          maintenance floor and the prescription. */}
      <Drawer open={expanded}>
        <div style={{ marginTop: 12 }}>
          <div style={{ ...mono(fs.caption), color: C("ash") }}>MV {s.landmark.mv}</div>
          {target && verdict && (
            <p style={{ marginTop: 8, marginBottom: 0, fontSize: fs.body, lineHeight: 1.5, color: verdict === "on" ? C("lime") : C("ash") }}>
              {t("w.analyze.vol.weekTarget")} {target.target} {t("w.analyze.vol.sets")}
              <span style={{ color: C("ash") }}>{" — "}</span>
              {t(TARGET_VERDICT_KEY[verdict])}
            </p>
          )}
          <p style={{ marginTop: 8, marginBottom: 0, fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{rowAdvice(s, t)}</p>
          <MuscleHistory sets={history} />
        </div>
      </Drawer>
    </div>
  );
}

/** Eight weeks of this muscle's hard sets, oldest to newest — the last column
 *  lit, since "this week" is the number stated above the rail. Silent when the
 *  muscle has never been trained: an empty row of stubs would state a history
 *  that doesn't exist. */
function MuscleHistory({ sets }: { sets: number[] }) {
  const { t } = useLang();
  if (sets.length === 0 || sets.every((n) => n === 0)) return null;
  const max = Math.max(...sets, 1);
  // Bar geometry and colour are LIFTED VERBATIM from the block ramp already in
  // this file (BlockCard): ink track, radius 7, the current column at .95 and
  // the rest at .32. Volume draws every bar that way and imports no chart
  // library, so this introduces no new visual vocabulary — a moved element must
  // not become a restyled one.
  return (
    <div>
      <div style={{ ...mono(9), letterSpacing: ".08em", textTransform: "uppercase", color: C("ash"), marginTop: 16, marginBottom: 8 }}>{t("w.analyze.trends.weeklySets8w")}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 56, maxWidth: 420 }}>
        {sets.map((n, i) => (
          <div key={i} style={{ flex: 1, height: 56, display: "flex", alignItems: "flex-end", background: C("ink"), borderRadius: 7, overflow: "hidden" }}>
            <div title={`${n}`} style={{ width: "100%", height: pct(n / max), background: C("blue"), opacity: i === sets.length - 1 ? 0.95 : 0.32, borderRadius: "7px 7px 0 0" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function rowAdvice(s: MuscleVolumeStatus, t: (k: string) => string): string {
  if (s.action === "add") {
    const n = Math.round(s.deltaSets);
    return `${t("w.analyze.vol.adviceAddPre")}${n} ${n === 1 ? t("w.analyze.vol.adviceAddSet") : t("w.analyze.vol.adviceAddSets")}${t("w.analyze.vol.adviceAddTail")}${s.maintaining ? t("w.analyze.vol.adviceMaintaining") : ""}.`;
  }
  if (s.action === "reduce") {
    const n = Math.round(Math.abs(s.deltaSets));
    return `${t("w.analyze.vol.adviceReducePre")}${n} ${n === 1 ? t("w.analyze.vol.adviceAddSet") : t("w.analyze.vol.adviceAddSets")}${t("w.analyze.vol.adviceReduceTail")}`;
  }
  if (s.action === "progress") return `${t("w.analyze.vol.adviceProgressPre")}${s.deltaSets}${t("w.analyze.vol.adviceProgressTail")}`;
  return t("w.analyze.vol.adviceHold");
}
