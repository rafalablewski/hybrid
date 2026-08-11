import { useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import {
  volumeStatus, weeklyMuscleSets, athleteLandmarks,
  replayLandmarks, testedMuscles, REPLAY_VERDICT_KEY, type LandmarkReplay,
  railGeometry, railScale, railX, bandRegion, BAND_KEYS, volumeSummary, sortByUrgency, setsLabel, deltaLabel,
  blockVolumePlan, blockRamp, blockKindKey, resolveBlock,
  volumeProfileCompleteness, estimateFitnessLevel, resolveExperience, LEVEL_KEY, LEVEL_BASIS_KEY,
  formatPace, paceClock,
  VOLUME_PROFILE_FIELD_KEY, fmtWeight,
  sourceWhyKey, factorLabelKey, factorPercent, targetVerdict, TARGET_VERDICT_KEY,
  provenanceLadder, rungMeta, factorAffectsKey,
  type MuscleVolumeStatus, type VolumeZone, type MuscleGroup, type VolumeBandKey,
  type AthleteVolumeProfile, type VolumeBlock, type RampColumn, type BlockMuscleTarget,
  type LandmarkFactor, type LandmarkSource, type WeightUnit,
} from "@hybrid/core";
import { useSessionsQuery } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { setLoggerPref } from "../../lib/logger-prefs";
import { useVolumeModel } from "../../lib/use-volume-model";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { leading, fs, space, F, FIXED_FONT_SCALE, PressScale as Pressable } from "../../lib/ui";
import { AuroraScreen, ACard, ADrawer, AHeading, ASection, CardFoot, RADIUS, withAlpha } from "./kit";
import { HeroAccessory } from "./hero";
import Sheet from "./sheet";
import { haptic } from "../../lib/haptics";

const MUSCLE_KEY: Record<string, string> = { quads: "w.analyze.vol.muscleQuads", glutes: "w.analyze.vol.muscleGlutes", posterior: "w.analyze.vol.musclePosteriorChain", back: "w.analyze.vol.muscleBack", chest: "w.analyze.vol.muscleChest", shoulders: "w.analyze.vol.muscleShoulders", triceps: "w.analyze.vol.muscleTriceps" };
const ZONE_KEY: Record<VolumeZone, string> = { under: "w.analyze.vol.zoneUnder", productive: "w.analyze.vol.zoneProductive", peak: "w.analyze.vol.zonePeak", overreaching: "w.analyze.vol.zoneOver" };
const BAND_LABEL: Record<VolumeBandKey, string> = { mev: "MEV", mav: "MAV", mrv: "MRV" };
const GLOSS_KEY: Record<VolumeBandKey, string> = { mev: "w.analyze.vol.glossMev", mav: "w.analyze.vol.glossMav", mrv: "w.analyze.vol.glossMrv" };
const pct = (v: number): DimensionValue => `${v * 100}%` as DimensionValue;

/**
 * AURORA Volume — weekly working sets against the athlete's own MEV/MAV/MRV.
 *
 * The redesign leads with ONE hero: how many muscles are in range, drawn as a
 * seven-column week-shape you read before you read a word. Everything below it
 * is the same fact at increasing resolution — the week's prescription, then the
 * per-muscle rails, then (only if you ask) whose numbers these are. The rail
 * geometry is normalised in @hybrid/core (`railX`) so every muscle's band lands
 * at the same x and the rows stack into one picture.
 * Mirrors apps/web/components/aurora/volume.tsx.
 *
 * TWO DEPTHS, ONE SURFACE. The compact block used to answer "5/7 in range" and
 * then PUSH A SCREEN for the block ramp, the prescription and the muscle rails
 * — a full navigation to read the detail of the card you were already looking
 * at, with the shape you had just read left behind. The detail now EASES OPEN
 * UNDERNEATH the shape instead (kit's `ADrawer` — a measured height on the sheet
 * spring, the same drawer the Activity card's figures pull out), so "ease off"
 * and "by muscle" arrive in place, under the columns that raised the question,
 * and closing puts them back.
 *
 * The landmarks come from ONE core call (`athleteLandmarks`), which layers
 * population table → profile estimate → what the log observed → the athlete's
 * own edits, and hands back the provenance so this screen never presents a
 * population average as a personal fact. That provenance — and the working
 * behind it — is a DIFFERENT KIND of question from "what should I do this
 * week", so it is dispatched as a Sheet rather than stacked as a seventh card
 * at the foot of the reading.
 */
export default function AuroraVolume({ top, unified = false, compact = false, onOpenModel }: {
  top?: ReactNode;
  /** True when these sections render INSIDE another page rather than as their
   *  own screen: no AuroraScreen wrapper (the page owns the scroller) and the
   *  page title demotes to a section head. Every section, control and number is
   *  otherwise identical. */
  unified?: boolean;
  /** COMPACT — the hero week-shape, and the rest of the screen folded into a
   *  drawer under it. This is what the Performance page carries: "5/7 in
   *  range", the seven columns, the verdict naming names, and — on request, in
   *  place — the block, the prescription and the rails. The landmarks are
   *  resolved by the SAME code either way, so the card and the screen can never
   *  disagree. Mirrors apps/web/components/aurora/volume.tsx. */
  compact?: boolean;
  /** Where the "edit the model" door goes — the settings route that owns the
   *  landmark fields, the profile form and the model switches. They used to be
   *  ~50 controls revealed inside this read surface by an edit toggle. */
  onOpenModel?: () => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const ml = (m: string) => (MUSCLE_KEY[m] ? t(MUSCLE_KEY[m]) : m);
  const { data: sessions = [], isFetching: refreshing, refetch } = useSessionsQuery();
  useRefreshOnFocus(refetch);

  // ONE resolution, shared with the settings route that edits this model
  // (lib/use-volume-model.ts) — so an edit and its effect can never be computed
  // two different ways.
  const { prefs, recovery, measuredKeys, levelEstimate, experience, profile, resolved } = useVolumeModel(sessions);
  const lm = resolved.landmarks;

  // THE DRAWER, and the sheet the provenance is dispatched to. Once opened the
  // detail STAYS MOUNTED — unmounting it on close would give the collapse
  // nothing to collapse, and the passes are already paid for.
  const [drawer, setDrawer] = useState(false);
  const [everOpen, setEverOpen] = useState(false);
  const [source, setSource] = useState(false);
  // Has the provenance sheet ever been opened? The replay below is bought on
  // that tap and kept — the sheet's content has to survive its own closing
  // animation, exactly as `everOpen` keeps the drawer's.
  const [everSource, setEverSource] = useState(false);
  const openSource = () => { setEverSource(true); setSource(true); };

  // HAS THE CEILING SETTLED? The same resolver re-run at every week of the
  // athlete's own history — a screen-level computation, deliberately memoised
  // apart from `resolved` because it costs one resolve per replayed week.
  //
  // NOT UNTIL THE SHEET IS OPENED. This used to be gated on the DETAIL being
  // open, which spared the compact card on Performance and did nothing for the
  // screen: standing alone, one landmark resolve per week of the athlete's
  // history ran at mount to draw four rows behind a collapsed disclosure inside
  // a sheet nobody had asked for. `replay` has exactly one reader — SourceBody,
  // inside that sheet — so the tap that reveals it is the honest place to buy
  // it, on the screen and in the card alike (audit/10, render cost). Mirrors web.
  const replay = useMemo(
    () =>
      prefs.adaptiveLandmarks && everSource
        ? testedMuscles(
            replayLandmarks(sessions, recovery, {
              profile,
              overrides: prefs.landmarkOverrides,
              includeWarmups: prefs.countWarmupsInVolume,
              fractional: prefs.fractionalVolume,
            }),
          )
        : [],
    [profile, prefs.landmarkOverrides, prefs.adaptiveLandmarks, prefs.countWarmupsInVolume, prefs.fractionalVolume, sessions, recovery, everSource],
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
  const [open, setOpen] = useState<MuscleGroup | null>(null);
  // WHICH MUSCLE'S EIGHT WEEKS ARE PAID FOR — the one whose row is open, held
  // through the collapse. Only one row is open at a time, and the chart lives
  // inside that row's drawer, so computing all seven was six passes nobody
  // could see plus a seventh nobody had asked for (audit/10, render cost: the
  // ×7 line). Bought on the tap that reveals it instead.
  //
  // HELD, for the same reason `lastZone` holds its band one scope down: reading
  // `open` straight would empty the chart the instant the row is dismissed, and
  // the drawer would shut on nothing. Mirrors web.
  const charted = useRef<MuscleGroup | null>(null);
  if (open) charted.current = open;
  const chartFor = charted.current;
  // EIGHT-WEEK HISTORY. This is the chart Trends used to hang off a second set
  // of muscle chips — the same weeklyMuscleSets() engine, over the same
  // muscles, drawn twice on two screens. It belongs on the row that names the
  // muscle: "18 sets" and "and it has been climbing for a month" are one
  // thought, and the athlete no longer picks a muscle in two places.
  const history = useMemo(() => {
    const out = {} as Record<MuscleGroup, number[]>;
    if (chartFor) out[chartFor] = weeklyMuscleSets(sessions, chartFor, 8, Date.now(), prefs.countWarmupsInVolume, prefs.fractionalVolume);
    return out;
  }, [chartFor, sessions, prefs.countWarmupsInVolume, prefs.fractionalVolume]);

  const [picked, setPicked] = useState<MuscleGroup | null>(null);
  // Which landmark band is spotlighted across the list, and the row whose scale
  // was tapped (that row carries the definition, next to the finger).
  const [zone, setZone] = useState<{ key: VolumeBandKey; muscle: MuscleGroup } | null>(null);
  const pickZone = (key: VolumeBandKey, muscle: MuscleGroup) => {
    haptic.selection();
    setZone((z) => (z && z.key === key && z.muscle === muscle ? null : { key, muscle }));
  };
  const customized = Object.keys(prefs.landmarkOverrides).length > 0;

  const zoneColor = (z: VolumeZone) => (z === "overreaching" ? C.red : z === "under" ? C.amber : z === "peak" ? C.blue : C.lime);

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
      <Prescription
        flat={flat} title={t("w.analyze.vol.easeOff")} why={t("w.analyze.vol.easeOffWhy")}
        items={summary.over} color={C.red} ml={ml} unit={t("w.analyze.vol.perWeek")}
      />
      <Prescription
        flat={flat} title={t("w.analyze.vol.addVolume")} why={t("w.analyze.vol.addVolumeWhy")}
        items={summary.under} color={C.amber} ml={ml} unit={t("w.analyze.vol.perWeek")}
      />

      {/* ── BY MUSCLE — one legend, then the stack of comparable rails ──────── */}
      {!summary.empty && (
        <ByMuscle
          flat={flat} rows={ranked} ml={ml} zoneColor={zoneColor} targetFor={targetFor} history={history}
          open={open} setOpen={setOpen} zone={zone} pickZone={pickZone}
        />
      )}

      {/* ── WHOSE NUMBERS THESE ARE — a door, not a seventh card ────────────── */}
      <SourceDoor flat={flat} onOpen={() => { haptic.selection(); openSource(); }} />
    </>
  );

  // The provenance and the working, dispatched. They answer "where did these
  // come from", which is a different question from "what do I do this week" —
  // stacked under the prescription they were read as more of the prescription.
  // Leaving for the model editor from INSIDE the sheet has to close it on the
  // way out. The sheet is a Modal in its own native window, so pushing a route
  // underneath leaves the panel sitting over the screen it just sent you to.
  const openModelFromSheet = onOpenModel ? () => { setSource(false); onOpenModel(); } : undefined;
  const sourceSheet = (
    <Sheet visible={source} onClose={() => setSource(false)} title={t("w.analyze.vol.whose")} detents={["medium"]}>
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
      .map((r) => `${ml(r.muscle)} ${deltaLabel(r)}`)
      .join(", ");
    return (
      <ACard solid>
        <ASection title={t("w.home.cockpit.weekVolume")} meta={t("w.home.cockpit.last7")} />
        {summary.empty ? (
          <Text style={{ fontFamily: F.reg, fontSize: fs.note, lineHeight: leading(fs.note), color: C.ash }}>{t("w.analyze.vol.empty")}</Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text style={{ fontFamily: F.black, fontSize: 46, lineHeight: 50, letterSpacing: -1.6, color: C.chalk }}>{summary.inRange}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: C.ash, marginLeft: 3 }}>/{summary.total}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginLeft: 8 }}>{t("w.home.cockpit.inRange")}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 5, marginTop: 16 }}>
              {rows.map((r) => (
                <View key={r.muscle} style={{ flex: 1 }}>
                  <ShapeColumn s={r} color={zoneColor(r.zone)} dim={false} />
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.7, color: C.ash, textAlign: "center", marginTop: 8 }}>{ml(r.muscle).slice(0, 3).toUpperCase()}</Text>
                </View>
              ))}
            </View>
            <Text style={{ fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash, marginTop: 16 }}>
              {named ? <Text style={{ fontFamily: F.bold, color: C.chalk }}>{named}</Text> : null}
              {named ? `. ${verdict}` : verdict}
            </Text>
          </>
        )}
        {!summary.empty && (
          /* THE FOOT — one link, ash, and that is all. This used to be a
             two-string label: an eyebrow on the left describing the contents,
             and a LIME "Volume" with a rotating ↓ on the right. Both were
             wrong. The eyebrow was already the noun of what unfolds, so the
             right-hand word was naming the screen the athlete is standing on;
             and lime marks a control that takes you somewhere, which this one
             never did — it opens a drawer in place, one card away from Your
             Level, where the same lime with an arrow pushed a whole screen. */
          <CardFoot
            expander={{
              label: t("w.home.cockpit.volumeDoor"),
              open: drawer,
              onToggle: () => { setEverOpen(true); setDrawer((v) => !v); },
            }}
          >
            {everOpen ? detail(true) : null}
          </CardFoot>
        )}
        {sourceSheet}
      </ACard>
    );
  }

  const body = (
    <>
      {/* Standing alone the title and the edit control are the HERO's — the
          title below the rail, the control in the rail's TRAILING slot (one
          control, in the metadata voice). Embedded — a hub tab, or inside the
          unified Performance page — the host owns the head, so the row renders
          here instead. */}
      {(top || unified) && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
          <AHeading style={{ fontSize: fs.display }}>{t("w.analyze.vol.title")}</AHeading>
          {onOpenModel && (
            <Pressable
              onPress={onOpenModel}
              accessibilityRole="button"
              style={{ marginLeft: "auto", paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.line }}
            >
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.analyze.model.open")}</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* ── HERO — the whole week as one number and one shape ─────────────── */}
      <ACard solid style={{ marginTop: 16, paddingBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{t("w.analyze.vol.range7d")}</Text>
          {customized && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: txt(C, C.lime) }}>{t("w.analyze.vol.customised")}</Text>
          )}
        </View>

        {summary.empty ? (
          <Text style={{ marginTop: 16, fontFamily: F.reg, fontSize: fs.note, lineHeight: leading(fs.note), color: C.ash }}>{t("w.analyze.vol.empty")}</Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 10 }}>
              <Text style={{ fontFamily: F.black, fontSize: 68, lineHeight: 74, letterSpacing: -2.5, color: C.chalk }}>{summary.inRange}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.heading, color: C.ash, marginLeft: 4 }}>/{summary.total}</Text>
            </View>
            <Text style={{ fontFamily: F.reg, fontSize: fs.note, lineHeight: 21, color: C.ash, marginTop: -2, maxWidth: 240 }}>{t("w.analyze.vol.heroCaption")}</Text>

            {/* The week-shape: one column per muscle, same normalised geometry
                as the rails below, so shape and list agree row for row. */}
            <View style={{ flexDirection: "row", gap: 6, marginTop: 24 }}>
              {rows.map((r) => {
                const on = picked === r.muscle;
                const label = ml(r.muscle);
                return (
                  <Pressable
                    key={r.muscle}
                    onPress={() => setPicked(on ? null : r.muscle)}
                    accessibilityRole="button"
                    accessibilityLabel={`${label} – ${setsLabel(r.sets)} ${t("w.analyze.vol.sets")}, ${t(ZONE_KEY[r.zone])}`}
                    style={{ flex: 1, alignItems: "center" }}
                  >
                    <ShapeColumn s={r} color={zoneColor(r.zone)} dim={picked !== null && !on} />
                    <Text style={{ marginTop: 8, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, color: on ? C.chalk : C.ash }}>
                      {label.slice(0, 3).toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={{ marginTop: 16, fontFamily: F.reg, fontSize: fs.bodyLg, lineHeight: leading(fs.bodyLg), color: C.chalk }}>
              {pickedRow ? (
                <>
                  {ml(pickedRow.muscle)}
                  <Text style={{ color: C.ash }}>{" — "}</Text>
                  <Text style={{ fontFamily: F.mono, color: txt(C, zoneColor(pickedRow.zone)) }}>{setsLabel(pickedRow.sets)} {t("w.analyze.vol.sets")}</Text>
                  <Text style={{ color: C.ash }}>, {t(ZONE_KEY[pickedRow.zone])}</Text>
                </>
              ) : (
                verdict
              )}
            </Text>
          </>
        )}
      </ACard>

      {/* The block, the prescription, the rails and the provenance door — the
          SAME nodes the compact card's drawer carries, at card weight. */}
      {detail(false)}

      {/* THE GLOSSARY IS GONE — every band value on every muscle row already
          spotlights that band across the list and prints its definition beside
          the pointer. Mirrors web. */}

      {sourceSheet}
    </>
  );

  // Inside the unified Performance page the host owns the scroller, the safe
  // area and the pull-to-refresh — wrapping again would nest two ScrollViews.
  if (unified) return body;
  return (
    <AuroraScreen
      refreshing={refreshing}
      onRefresh={refetch}
      top={top}
      hero={top ? undefined : { rank: "title", title: t("w.analyze.vol.title") }}
      accessory={top || !onOpenModel ? undefined : <HeroAccessory label={t("w.analyze.model.open")} active={false} onPress={onOpenModel} onDark={false} />}
    >
      {body}
    </AuroraScreen>
  );
}

/**
 * One section of the detail, at whichever weight its host wants.
 *
 * On the screen each section is its own CARD; inside the compact card's drawer
 * they are FLAT — divided by a hairline, because a card inside a card reads as
 * a bug. Nothing else differs, so a section can never drift between the two
 * places it appears. Mirrors apps/web/components/aurora/volume.tsx.
 */
function Panel({ flat, lead = false, children, style }: {
  flat: boolean; lead?: boolean; children: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const { palette: C } = useTheme();
  if (!flat) return <ACard solid style={[{ marginTop: 16 }, style]}>{children}</ACard>;
  return (
    <View style={[{ marginTop: lead ? 18 : 20, paddingTop: lead ? 0 : 20, borderTopWidth: lead ? 0 : 1, borderTopColor: C.line }, style]}>
      {children}
    </View>
  );
}

/** BY MUSCLE — the legend, then the stack of comparable rails. */
function ByMuscle({ flat, rows, ml, zoneColor, targetFor, history, open, setOpen, zone, pickZone }: {
  flat: boolean;
  rows: MuscleVolumeStatus[];
  ml: (m: string) => string;
  zoneColor: (z: VolumeZone) => string;
  targetFor: (m: MuscleGroup) => BlockMuscleTarget | null;
  history: Record<MuscleGroup, number[]>;
  open: MuscleGroup | null;
  setOpen: (m: MuscleGroup | null) => void;
  zone: { key: VolumeBandKey; muscle: MuscleGroup } | null;
  pickZone: (k: VolumeBandKey, m: MuscleGroup) => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <Panel flat={flat}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
        <Text style={{ flex: 1, fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("w.analyze.vol.byMuscle")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{t("w.analyze.vol.range7d")}</Text>
      </View>

      <View style={{ marginTop: 4 }}>
        {rows.map((r) => (
          <MuscleRow
            key={r.muscle} s={r} label={ml(r.muscle)} color={zoneColor(r.zone)}
            target={targetFor(r.muscle)} history={history[r.muscle] ?? []}
            expanded={open === r.muscle}
            zone={zone?.key ?? null} showGloss={zone?.muscle === r.muscle}
            onToggle={() => setOpen(open === r.muscle ? null : r.muscle)}
            onZone={(k) => pickZone(k, r.muscle)}
          />
        ))}
      </View>
    </Panel>
  );
}

/** The way into the provenance sheet. A row, not a card: "where did these come
 *  from" is a question the reading raises, not another part of the reading. */
function SourceDoor({ flat, onOpen }: { flat: boolean; onOpen: () => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <Panel flat={flat}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${t("w.analyze.vol.whose")} – ${t("w.analyze.vol.showWork")}`}
        style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("w.analyze.vol.whose")}</Text>
          <Text style={{ marginTop: 4, fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash }}>{t("w.analyze.vol.showWork")}</Text>
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: txt(C, C.lime) }}>→</Text>
      </Pressable>
    </Panel>
  );
}

/** One column of the hero's week-shape — the same normalised rail, stood up. */
function ShapeColumn({ s, color, dim }: { s: MuscleVolumeStatus; color: string; dim: boolean }) {
  const { palette: C } = useTheme();
  const g = railGeometry(s);
  const H = 66;
  return (
    <View style={{ width: "100%", height: H, borderRadius: 7, backgroundColor: C.ink, overflow: "hidden", opacity: dim ? 0.35 : 1 }}>
      {/* the productive band, lit through the whole column width */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: pct(g.bandStart), height: pct(g.bandEnd - g.bandStart), backgroundColor: withAlpha(C.lime, 0.13) }} />
      {/* the territory past the ceiling */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: pct(g.mrv), top: 0, backgroundColor: withAlpha(C.red, 0.16) }} />
      {/* this week */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: pct(g.x), backgroundColor: color, opacity: 0.9, borderTopLeftRadius: 7, borderTopRightRadius: 7 }} />
      {/* the ceiling reads as a NOTCH in the column, so it survives the fill */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: pct(g.mrv), height: 2, backgroundColor: C.ink2 }} />
    </View>
  );
}

/** "Ease off" / "Add volume" — the prescription as chips, with the reason said
 *  ONCE underneath instead of repeated verbatim on every muscle. */
function Prescription({ flat, title, why, items, color, ml, unit }: {
  flat: boolean; title: string; why: string; items: MuscleVolumeStatus[]; color: string; ml: (m: string) => string; unit: string;
}) {
  const { palette: C } = useTheme();
  if (!items.length) return null;
  return (
    <Panel flat={flat}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
        <Text style={{ flex: 1, fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{title}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{unit}</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: 16 }}>
        {items.map((s) => (
          <View key={s.muscle} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 8, paddingHorizontal: 12, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: withAlpha(color, 0.35), backgroundColor: withAlpha(color, 0.1) }}>
            <Text style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{ml(s.muscle)}</Text>
            <Text style={{ fontFamily: F.monoBold, fontSize: fs.bodyLg, color: txt(C, color) }}>{deltaLabel(s)}</Text>
          </View>
        ))}
      </View>
      <Text style={{ marginTop: 16, fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash }}>{why}</Text>
    </Panel>
  );
}

/** A pill switch — the same control the block and adaptive toggles both use. */
function Toggle({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  const { palette: C } = useTheme();
  return (
    <Pressable
      onPress={() => { haptic.light(); onPress(); }}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? withAlpha(C.lime, 0.12) : "transparent" }}
    >
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: on ? txt(C, C.lime) : C.ash }}>{label}</Text>
    </Pressable>
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
  const { palette: C } = useTheme();
  const { t } = useLang();
  const current = ramp.find((c) => c.current) ?? ramp[0];
  return (
    <Panel flat={flat} lead={lead}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
        <Text style={{ flex: 1, fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("w.analyze.vol.thisBlock")}</Text>
        <Toggle on={on} label={t("w.analyze.vol.periodize")} onPress={() => setLoggerPref("periodizeVolume", !on)} />
      </View>

      {!on ? (
        <Text style={{ marginTop: 12, fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash }}>{t("w.analyze.vol.periodizeWhy")}</Text>
      ) : (
        <>
          <Text style={{ marginTop: 12, fontFamily: F.reg, fontSize: fs.bodyLg, lineHeight: leading(fs.bodyLg), color: C.chalk }}>
            {t("w.analyze.vol.weekPre")}{block.week}{t("w.analyze.vol.weekOf")}{block.weeks}
            <Text style={{ color: C.ash }}>{" — "}</Text>
            <Text style={{ color: txt(C, current?.kind === "deload" ? C.blue : C.lime) }}>{current ? t(blockKindKey(current.kind)) : ""}</Text>
          </Text>

          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: 16 }}>
            {ramp.map((c) => (
              <View key={c.week} style={{ flex: 1, alignItems: "center", gap: 6 }}>
                <View style={{ width: "100%", height: 56, backgroundColor: C.ink, borderRadius: 7, overflow: "hidden" }}>
                  <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: pct(c.height), backgroundColor: c.kind === "deload" ? C.blue : C.lime, opacity: c.current ? 0.95 : 0.32, borderTopLeftRadius: 7, borderTopRightRadius: 7 }} />
                </View>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, color: c.current ? C.chalk : C.ash }}>{c.week}</Text>
              </View>
            ))}
          </View>
          <Text style={{ marginTop: 12, fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash }}>{t("w.analyze.vol.rampCaption")}</Text>

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
 *      word. Tapping a rung reads what that layer did.
 *   2. WHAT WOULD MAKE THEM MORE MINE? — one meter and ONE thing to do, and the
 *      thing to do is a control: tapping the next gap opens the form on the spot
 *      instead of naming a field and leaving the athlete to find it.
 *   3. SHOW ME THE WORKING. — the level read from the bar, the factors that
 *      moved the bands, the log's correction and the ceiling's own history, all
 *      folded behind one disclosure. Depth for whoever wants it; silence for
 *      everyone else.
 *
 * Mirrored by apps/web/components/aurora/volume.tsx.
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
  const { palette: C } = useTheme();
  const { t } = useLang();
  const done = volumeProfileCompleteness(profile, measuredKeys);
  const ladder = useMemo(() => provenanceLadder(resolved), [resolved]);
  // Which layer's sentence is on screen. Defaults to the layer that actually
  // named the numbers; tapping a rung reads that one instead.
  const [layer, setLayer] = useState<LandmarkSource | null>(null);
  const shown = layer ?? resolved.source;
  // The working, folded away. And the profile form, which the "next gap" row
  // opens on the spot — its own state, so reaching for it here doesn't expand
  // every landmark field on the muscle rows above.
  const [work, setWork] = useState(false);
  const subhead = { fontFamily: F.black, fontSize: fs.body, color: C.chalk } as const;
  const prose = { fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash } as const;

  return (
    <View>
      {/* ── THE LADDER ──────────────────────────────────────────────────────
          Four rungs in the order the engine applies them, lit as far as the
          evidence reaches. The lit spine is the whole answer: a column that
          stops at rung one says "textbook averages" far more plainly than the
          caption that used to sit up here fighting the title for the same row. */}
      <View accessibilityRole="radiogroup">
        {ladder.map((r) => {
          const on = r.source === shown;
          const meta = rungMeta(r);
          return (
            <Pressable
              key={r.source}
              onPress={() => { haptic.selection(); setLayer(r.source === resolved.source ? null : r.source); }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${t(r.labelKey)}${meta ? `, ${meta}` : ""}`}
              style={{ flexDirection: "row", alignItems: "center", gap: space.ms, height: RUNG_H, paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 10, backgroundColor: on ? withAlpha(C.chalk, 0.05) : "transparent" }}
            >
              {/* One segment of the spine. Lit means the layer contributed; full
                  strength means it is the layer that named the numbers. */}
              <View style={{ width: 3, height: RUNG_H - 12, borderRadius: 2, backgroundColor: r.lit ? C.lime : C.ink, opacity: r.lit ? (r.active ? 1 : 0.4) : 1 }} />
              <Text
                numberOfLines={1}
                style={{ flex: 1, fontFamily: r.active ? F.semi : F.reg, fontSize: fs.body, color: r.lit ? C.chalk : C.ash }}
              >
                {t(r.labelKey)}
              </Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: r.lit ? txt(C, C.lime) : C.ash }}>{meta}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={{ marginTop: 12, ...prose }}>{t(sourceWhyKey(shown))}</Text>

      {/* ── THE ONE THING TO DO NEXT ────────────────────────────────────────
          How complete the profile is, weighted by how much each input actually
          moves the estimate — and the single most valuable gap as a CONTROL.
          Naming the field and leaving the athlete to hunt for the form was a
          step we were making them take for no reason. */}
      <View style={{ marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text style={{ fontFamily: F.monoBold, fontSize: fs.note, color: C.chalk }}>{Math.round(done.score * 100)}%</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.analyze.vol.knownAbout")}</Text>
        </View>
        <View style={{ height: 3, borderRadius: 999, backgroundColor: C.ink, marginTop: 10, overflow: "hidden" }}>
          <View style={{ width: pct(done.score), height: "100%", backgroundColor: C.lime }} />
        </View>

        {done.next ? (
          <>
            {/* This row used to set an `aboutOpen` flag that NOTHING rendered —
                the single most valuable thing the athlete could do next was a
                control that did nothing when pressed, while its web twin opened
                the model editor. It goes where web goes. */}
            <Pressable
              onPress={() => { haptic.selection(); onOpenModel?.(); }}
              accessibilityRole="button"
              accessibilityLabel={`${t("w.analyze.vol.nextUp")}: ${t(VOLUME_PROFILE_FIELD_KEY[done.next.key])}`}
              style={{ flexDirection: "row", alignItems: "center", gap: space.ms, marginTop: 14 }}
            >
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{t("w.analyze.vol.nextUp")}</Text>
              <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{t(VOLUME_PROFILE_FIELD_KEY[done.next.key])}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: txt(C, C.lime) }}>→</Text>
            </Pressable>
            <Text style={{ marginTop: 6, ...prose }}>{t(done.next.unlocksKey)}</Text>
          </>
        ) : (
          <Text style={{ marginTop: 12, ...prose }}>{t("w.analyze.vol.profileComplete")}</Text>
        )}
      </View>

      {/* ── SHOW THE WORKING ────────────────────────────────────────────────
          Everything below is evidence for the ladder above: the level read off
          the bar, the factors that moved the bands, the log's correction and
          the ceiling's own history. Four sub-sections that used to sit open,
          at one size, stacked into a wall nobody read. */}
      <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line }}>
        <Pressable
          onPress={() => { haptic.selection(); setWork((v) => !v); }}
          accessibilityRole="button"
          accessibilityState={{ expanded: work }}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}
        >
          <Text style={subhead}>{t("w.analyze.vol.showWork")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{work ? "–" : "+"}</Text>
        </Pressable>
      </View>

      <ADrawer open={work}>
        <>
          {/* YOUR LEVEL, FROM YOUR LIFTS. */}
          <View style={{ marginTop: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm }}>
              <Text style={{ flex: 1, ...subhead }}>{t("w.analyze.vol.levelTitle")}</Text>
              {level.basis !== "none" ? (
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t(LEVEL_KEY[level.level])}</Text>
              ) : null}
            </View>
            {level.basis === "none" ? (
              <Text style={{ marginTop: 8, ...prose }}>{t("w.analyze.vol.levelNoData")}</Text>
            ) : (
              <>
                <View style={{ gap: 6, marginTop: 12 }}>
                  {/* Two kinds of evidence, two units. A lift is kg and a multiple
                      of body mass; a run is a distance and a pace. They share a row
                      shape but never a number — see core/engines/fitness-level.ts. */}
                  {level.evidence.slice(0, 3).map((e) => (
                    <View key={e.kind + e.lift} style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm }}>
                      <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>{e.lift}</Text>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>
                        {e.kind === "strength" ? fmtWeight(e.e1rm!, units) : `${paceClock(Math.round(e.equivSec! / 5))} ${t("w.analyze.vol.levelEquiv")}`}
                      </Text>
                      <Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: C.chalk, minWidth: 78, textAlign: "right" }}>
                        {e.kind === "strength"
                          ? `${e.ratio.toFixed(2)} ${t("w.analyze.vol.ofBodyweight")}`
                          : `${formatPace(e.ratio)} ${t("w.analyze.vol.levelPace")}`}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={{ marginTop: 10, ...prose }}>
                  {t(LEVEL_BASIS_KEY[level.basis])} {Math.round(level.confidence * 100)}% {t("w.analyze.vol.confidence")}
                </Text>
                {experience.disagrees ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 12, flexWrap: "wrap" }}>
                    <Text style={{ flex: 1, minWidth: 180, fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: txt(C, C.amber) }}>{t("w.analyze.vol.levelDisagrees")}</Text>
                    {onOpenModel && <Toggle on={false} label={t("w.analyze.model.open")} onPress={onOpenModel} />}
                  </View>
                ) : null}
              </>
            )}
          </View>

          {/* WHAT MOVED YOUR BANDS. These rows used to render headless, directly
              under the level block, so "Sleep 3/5 −6%" read as evidence of how
              strong you are. They are their own subject and now say so — and
              each one names WHICH END of the band it moved, which the engine has
              always known (`affects`) and the screen used to throw away. */}
          {resolved.factors.length > 0 && (
            <View style={{ marginTop: 20 }}>
              <Text style={subhead}>{t("w.analyze.vol.factorsTitle")}</Text>
              <View style={{ gap: 12, marginTop: 12 }}>
                {resolved.factors.map((f) => {
                  const value = f.key === "experience"
                    ? t(EXP_KEY[f.value as keyof typeof EXP_KEY] ?? "w.analyze.vol.expBeginner")
                    : f.key === "nutrition" ? t(NUTRITION_KEY[f.value as keyof typeof NUTRITION_KEY]) : f.value;
                  const measured = !!FACTOR_FIELD[f.key] && measuredKeys.has(FACTOR_FIELD[f.key]!);
                  const meta = [value, measured ? t("w.analyze.vol.measured") : null, t(factorAffectsKey(f.affects))].filter(Boolean).join(" – ");
                  return (
                    <View key={f.key}>
                      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm }}>
                        <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>{t(factorLabelKey(f.key))}</Text>
                        <Text style={{ fontFamily: F.monoBold, fontSize: fs.body, minWidth: 46, textAlign: "right", color: txt(C, f.multiplier >= 1 ? C.lime : C.amber) }}>{factorPercent(f.multiplier)}</Text>
                      </View>
                      <Text style={{ marginTop: 2, fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{meta}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* THE LOG'S CORRECTION — what your own training proved. */}
          <View style={{ marginTop: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
              <Text style={{ flex: 1, ...subhead }}>{t("w.analyze.vol.adaptive")}</Text>
              <Toggle on={adaptive} label={t(adaptive ? "common.on" : "common.off")} onPress={() => setLoggerPref("adaptiveLandmarks", !adaptive)} />
            </View>
            {!adaptive ? (
              <Text style={{ marginTop: 10, ...prose }}>{t("w.analyze.vol.adaptiveWhy")}</Text>
            ) : resolved.adapted.length ? (
              <Text style={{ marginTop: 10, ...prose }}>
                {`${resolved.adapted.map((m) => {
                  // The estimate never ships without its stated interval — a
                  // ceiling shown as a bare number reads as a measurement.
                  const e = resolved.estimates[m];
                  return e ? `${ml(m)} ${e.mrv} (${e.lo}–${e.hi})` : ml(m);
                }).join(", ")} — ${resolved.adapted.length} ${t("w.analyze.vol.adaptedCount")}`}
              </Text>
            ) : (
              <Text style={{ marginTop: 10, ...prose }}>{t("w.analyze.vol.notEnoughEvidence")}</Text>
            )}
          </View>

          {/* HAS IT SETTLED? A ceiling is a claim, and the only evidence for it
              the app can offer is the shape of its own history: the same
              estimator, run at every week, with only the data that existed then.
              A number that stopped moving is worth training against; one that is
              still jumping says so. See core/engines/landmark-replay.ts.
              Silent until a week has been tested — with nothing to plot it said
              the same "not enough yet" the line above had just said. */}
          {adaptive && tested.length > 0 && (
            <View style={{ marginTop: 20 }}>
              <Text style={subhead}>{t("w.analyze.vol.replayTitle")}</Text>
              <View style={{ gap: 8, marginTop: 12 }}>
                {tested.slice(0, 4).map((r) => (
                  <View key={r.muscle} style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
                    <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>{ml(r.muscle)}</Text>
                    {/* The trajectory itself, not a summary of it. */}
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>
                      {r.points.filter((p) => p.tested).slice(-5).map((p) => p.mrv).join(" → ")}
                    </Text>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, minWidth: 82, textAlign: "right", color: r.verdict === "settled" ? txt(C, C.lime) : r.verdict === "unsettled" ? txt(C, C.amber) : C.ash }}>
                      {t(REPLAY_VERDICT_KEY[r.verdict])}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={{ marginTop: 10, ...prose }}>{t("w.analyze.vol.replayWhy")}</Text>
            </View>
          )}
        </>
      </ADrawer>

    </View>
  );
}

/** One muscle: name, count, the normalised rail — and, on tap, the landmarks
 *  behind it (read-only, or as fields while editing). */
function MuscleRow({ s, label, color, target, history, expanded, zone, showGloss, onToggle, onZone }: {
  s: MuscleVolumeStatus; label: string; color: string; expanded: boolean;
  /** This week's block target, when volume is being periodized. */
  target: BlockMuscleTarget | null;
  /** Weekly hard sets for THIS muscle over the last eight weeks, oldest first. */
  history: number[];
  /** The band spotlighted across the whole list, if any. */
  zone: VolumeBandKey | null;
  /** True on the row whose scale was tapped — it carries the definition. */
  showGloss: boolean;
  onToggle: () => void; onZone: (k: VolumeBandKey) => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const g = railGeometry(s);
  const sc = railScale(s.landmark);
  const region = zone ? bandRegion(zone, s.landmark) : null;
  // The last band THIS ROW explained, held so its definition survives the
  // collapse that dismissing the spotlight starts. Guarded on `showGloss` and
  // not on `zone` alone: every row sees the spotlighted band, so the looser
  // test would rewrite a closing row's line to a definition it was never
  // showing the moment another row was tapped.
  const held = useRef<VolumeBandKey>("mev");
  if (zone && showGloss) held.current = zone;
  const lastZone = held.current;
  // The block target sits on the SAME normalised rail as everything else, so
  // "where I am" and "where the plan wants me" are one glance, not two.
  const targetX = target ? railX(target.target, s.landmark) : null;
  const verdict = target ? targetVerdict(s.sets, target.target) : null;
  return (
    <View style={{ paddingVertical: 12 }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${label} – ${setsLabel(s.sets)} ${t("w.analyze.vol.sets")}, ${t(ZONE_KEY[s.zone])}`}
      >
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm, marginBottom: 8 }}>
          <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.note, color: C.chalk }}>{label}</Text>
          <Text style={{ fontFamily: F.monoBold, fontSize: fs.note, color: txt(C, color) }}>{setsLabel(s.sets)} {t("w.analyze.vol.sets")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{target ? `${t("w.analyze.vol.target")} ${target.target}` : t(ZONE_KEY[s.zone])}</Text>
        </View>

        <View style={{ height: 11, borderRadius: 6, backgroundColor: C.ink, overflow: "hidden" }}>
          {/* The track is itself the key: the productive band lit, the territory
              past the ceiling tinted, so the zones read even on an empty rail. */}
          <View style={{ position: "absolute", left: pct(g.bandStart), width: pct(g.bandEnd - g.bandStart), top: 0, bottom: 0, backgroundColor: withAlpha(C.lime, 0.13) }} />
          <View style={{ position: "absolute", left: pct(g.mrv), right: 0, top: 0, bottom: 0, backgroundColor: withAlpha(C.red, 0.16) }} />
          <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct(g.x), backgroundColor: color, opacity: 0.9, borderRadius: 6 }} />
          {/* MEV + MRV as notches cut out of the rail — always legible, filled or not */}
          <View style={{ position: "absolute", left: pct(g.mev), top: 0, bottom: 0, width: 2, backgroundColor: C.ink2 }} />
          <View style={{ position: "absolute", left: pct(g.mrv), top: 0, bottom: 0, width: 2, backgroundColor: C.ink2 }} />
          {/* This week's block target — a bright caret ON the rail, so the gap
              between where you are and where the plan wants you is a distance. */}
          {targetX !== null && (
            <View style={{ position: "absolute", left: pct(targetX), top: 0, bottom: 0, width: 2, backgroundColor: C.chalk }} />
          )}
          {/* SPOTLIGHT — tapping a landmark below scrims everything outside that
              band, on EVERY row at once, so the question "which part of the bar
              is my productive range" is answered by the chart itself. */}
          {region && (
            <>
              <View style={{ position: "absolute", left: 0, width: pct(region.from), top: 0, bottom: 0, backgroundColor: withAlpha(C.ink, 0.76) }} />
              <View style={{ position: "absolute", left: pct(region.to), right: 0, top: 0, bottom: 0, backgroundColor: withAlpha(C.ink, 0.76) }} />
              {/* Caliper edges, so the lit slice reads even when it is empty. */}
              <View pointerEvents="none" style={{ position: "absolute", left: pct(region.from), width: pct(region.to - region.from), top: 0, bottom: 0, borderLeftWidth: 1, borderRightWidth: 1, borderColor: withAlpha(C.chalk, 0.45) }} />
            </>
          )}
        </View>
      </Pressable>

      {/* This muscle's OWN scale — a plain three-column table pinned to the left
          edge, so the values line up down the whole list instead of floating at
          three different indents. Each cell is a control: tap it to spotlight
          that band and read what it means. */}
      <View style={{ flexDirection: "row", marginTop: 8 }}>
        {BAND_KEYS.map((k) => {
          const on = zone === k;
          return (
            <Pressable
              key={k}
              onPress={() => onZone(k)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${BAND_LABEL[k]} ${sc[k]} – ${t(GLOSS_KEY[k])}`}
              style={{ flex: 1, opacity: zone && !on ? 0.4 : 1 }}
            >
              <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, color: on ? txt(C, C.lime) : C.ash }}>
                {BAND_LABEL[k]} <Text style={{ fontSize: 11, color: C.chalk }}>{sc[k]}</Text>
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* The definition of the spotlighted band, beside the finger. The band is
          REMEMBERED through the collapse — reading `zone` straight would empty
          the line the instant the spotlight is dismissed, and the drawer would
          shut on nothing. */}
      <ADrawer open={!!zone && showGloss}>
        <Text style={{ marginTop: 8, fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash }}>{t(GLOSS_KEY[lastZone])}</Text>
      </ADrawer>

      {/* Expanding adds only what the scale above does NOT already say: the
          maintenance floor and the prescription. */}
      <ADrawer open={expanded}>
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>MV {s.landmark.mv}</Text>
          {target && verdict && (
            <Text style={{ marginTop: 8, fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: verdict === "on" ? txt(C, C.lime) : C.ash }}>
              {t("w.analyze.vol.weekTarget")} {target.target} {t("w.analyze.vol.sets")}
              <Text style={{ color: C.ash }}>{" — "}</Text>
              {t(TARGET_VERDICT_KEY[verdict])}
            </Text>
          )}
          <Text style={{ marginTop: 8, fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash }}>{rowAdvice(s, t)}</Text>
          <MuscleHistory sets={history} />
        </View>
      </ADrawer>
    </View>
  );
}

/** Eight weeks of this muscle's hard sets, oldest to newest — the last column
 *  lit, since "this week" is the number stated above the rail. Silent when the
 *  muscle has never been trained: an empty row of stubs would state a history
 *  that doesn't exist. Mirrors web volume.tsx. */
function MuscleHistory({ sets }: { sets: number[] }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  if (sets.length === 0 || sets.every((n) => n === 0)) return null;
  const mx = Math.max(...sets, 1);
  // Geometry, radius, gap and colour are LIFTED VERBATIM from the chart this
  // replaces (the focus-muscle chart on the old Trends screen). Moving an
  // element must not restyle it.
  return (
    <View>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash, marginTop: 16 }}>{t("w.analyze.trends.weeklySets8w")}</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 56, gap: 5, marginTop: 8 }}>
        {sets.map((n, i) => (
          <View key={i} style={{ flex: 1, height: 4 + (n / mx) * 48, borderRadius: 3, backgroundColor: i === sets.length - 1 ? C.blue : `${C.blue}66` }} />
        ))}
      </View>
    </View>
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
