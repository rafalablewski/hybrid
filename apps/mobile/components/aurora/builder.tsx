import { useState } from "react";
import { Animated, View, Text, TextInput } from "react-native";
import { useRouter } from "expo-router";
import {
  sportDistanceUnit,
  displaySportDistance,
  parseSportDistance,
  timedSportOnly,
  cardioPace,
  canSaveRoutine,
  isFullAccess,
  FREE_TEMPLATE_LIMIT,
  FUNNEL,
  sessionSignal,
  strengthBlockStats,
  estimateBlockMinutes,
  exerciseProfile,
  loadUnitCount,
  setType,
  setTypeBadge,
  rpeRirSwap,
  displayLoad,
  storeLoad,
  fmtTonnage,
  DEFAULT_REST_SEC,
  type BlockKind,
  type StrengthSet,
  type WeightUnit,
} from "@hybrid/core";
import { useRoutineBuilder, type EditableBlock } from "../../lib/use-routine-builder";
import { useBodyweight } from "../../lib/use-bodyweight";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { usePersona } from "../../lib/persona";
import { track } from "../../lib/track";
import { useLang } from "../../lib/i18n";
import { fs, space, F, PressScale as Pressable } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { usePremiumAccent } from "../../lib/premium-accent";
import { AuroraScreen, ACard, APill, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";
import { MetaLine } from "./meta";
import ExercisePickerSheet from "./exercise-picker";
import SwipeRow from "../swipe-row";
import { animateListChange } from "../../lib/list-motion";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import DragHandle from "../drag-handle";
import { useDragReorder } from "../../lib/use-drag-reorder";
import { setLoggerPref } from "../../lib/logger-prefs";

type Palette = ReturnType<typeof useTheme>["palette"];

const kindColor = (k: BlockKind, C: Palette) =>
  k === "strength" ? C.lime : k === "cardio" ? C.blue : C.violet;

/** AURORA Builder (mobile) — the SIGNAL BOARD routine editor. Each exercise is
 *  a collapsible card with a LIVE metric row (scheme, top load, tonnage /
 *  distance, pace — all derived from the editable data via core's
 *  session-signal), full per-set control for strength (load × reps × RPE/RIR
 *  per set, role badges, planned rest), and modality-specific fields for
 *  cardio (incline / stroke / HR zone) and conditioning. A session pulse
 *  (est. time, tonnage, strength ⇄ endurance balance) recomputes on every
 *  keystroke. Twin of the web Builder (workout-blocks signal mode). */
export default function AuroraBuilder() {
  const { palette: C } = useTheme();
  const pa = usePremiumAccent();
  const { t } = useLang();
  const router = useRouter();
  const prefs = useLoggerPrefs();
  // Bodyweight-aware tonnage: 10 BW pull-ups at 70 kg = 700 kg of work.
  const bodyweightKg = useBodyweight();
  // Building is free; a free user can SAVE up to FREE_TEMPLATE_LIMIT routines
  // (canSaveRoutine) — beyond that the save slot becomes the Full upsell.
  const persona = usePersona();
  const isFree = !isFullAccess(persona);
  const b = useRoutineBuilder();
  const allowedSave = canSaveRoutine(persona, b.routines.length);
  const [picker, setPicker] = useState(false);
  // Hold-and-drag reorder of the block cards (grip in each card header).
  const blockDrag = useDragReorder((_g, from, to) => b.moveBlockTo(from, to));

  const add = (name: string, kind?: BlockKind) => {
    b.addExercise(name, kind);
    setPicker(false);
  };

  return (
    <AuroraScreen hero={{ rank: "title", title: t("w.train.builder.title") }}>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, marginBottom: 16, lineHeight: 20 }}>
        {t("w.train.builder.intro")}
      </Text>

      <TextInput
        value={b.name}
        onChangeText={b.setName}
        placeholder={t("w.train.logger.routineNamePh")}
        placeholderTextColor={C.ash}
        style={{ fontFamily: F.black, fontSize: fs.heading, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12 }}
      />

      <SessionPulse items={b.items} units={prefs.units} C={C} bodyweightKg={bodyweightKg} />

      {b.items.map((x, i) => {
        const lifted = blockDrag.dragKey === blockDrag.key("", i);
        return (
          <Animated.View
            key={x.uid}
            onLayout={blockDrag.onRowLayout("", i)}
            style={lifted ? { transform: [{ translateY: blockDrag.dragY }], zIndex: 20, elevation: 8, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } } : undefined}
          >
            <BlockCard
              b={x}
              C={C}
              units={prefs.units}
              rirMode={prefs.rpeAsRir}
              velocity={prefs.velocity}
              haptics={prefs.haptics}
              bodyweightKg={bodyweightKg}
              builder={b}
              grip={
                b.items.length > 1 ? (
                  <DragHandle
                    onStart={() => blockDrag.begin("", i, b.items.length)}
                    onMove={blockDrag.move}
                    onEnd={blockDrag.end}
                    color={lifted ? txt(C, C.lime) : C.ash}
                  />
                ) : null
              }
            />
          </Animated.View>
        );
      })}

      {/* Ghost/dashed add affordance (the one-accent rule: lime stays reserved
          for Save) — same vocabulary as the Also-Today ghost ＋ tile. */}
      <Pressable onPress={() => setPicker(true)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.ms, marginTop: 4, borderWidth: 1, borderStyle: "dashed", borderColor: `${C.ash}77`, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 12 }}>
        <AuroraIcon name="add" size={18} color={C.ash} />
        <Text style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.ash }}>{t("w.train.builder.addExercise")}</Text>
      </Pressable>

      {/* Searchable exercise picker — the shared Rooms/A–Z sheet. */}
      <ExercisePickerSheet
        visible={picker}
        onClose={() => setPicker(false)}
        onPick={(name, kind) => add(name, kind)}
        title={t("w.train.builder.pickExercise")}
      />

      {b.msg && <Text accessibilityLiveRegion={b.msg.ok ? "polite" : "assertive"} accessibilityRole={b.msg.ok ? undefined : "alert"} style={{ fontFamily: F.mono, fontSize: fs.body, color: b.msg.ok ? txt(C, C.lime) : txt(C, C.red), marginTop: 16 }}>{b.msg.text}</Text>}

      {allowedSave ? (
        <>
          <APill
            label={b.saving ? t("w.train.builder.saving") : t("w.train.builder.saveRoutine")}
            onPress={b.save}
            disabled={b.saving || b.items.length === 0}
            style={{ marginTop: 16 }}
          />
          {isFree && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 10, textAlign: "center" }}>
              {t("w.train.builder.freeSlots").replace("{used}", String(b.routines.length)).replace("{limit}", String(FREE_TEMPLATE_LIMIT))}
            </Text>
          )}
        </>
      ) : (
        // Free user at the template limit — more saved routines is Full.
        // Building/previewing (and the first FREE_TEMPLATE_LIMIT saves) stays free.
        <View style={{ marginTop: 16, borderWidth: 1, borderColor: `${pa.fill}55`, backgroundColor: `${pa.fill}14`, borderRadius: RADIUS.card, padding: 16 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.9, color: pa.text }}>✦ {t("w.train.logger.routineFullTitle").toUpperCase()}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 6, lineHeight: 17 }}>{t("w.train.logger.routineFullBlurb")}</Text>
          <Pressable
            onPress={() => { track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "builder-save" }); router.push("/upgrade"); }}
            style={{ backgroundColor: pa.fill, borderRadius: RADIUS.pill, paddingVertical: 12, alignItems: "center", marginTop: 12 }}
          >
            <Text style={{ fontFamily: F.black, fontSize: fs.note, color: pa.ink }}>{t("w.train.logger.routineUnlock")}</Text>
          </Pressable>
        </View>
      )}

      {b.routines.length > 0 && (
        <ACard style={{ marginTop: 20 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.train.logger.yourRoutines")}</Text>
          {b.routines.map((r, i) => (
            <View key={r.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: i ? 12 : 10, paddingTop: i ? 12 : 0, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <Pressable style={{ flex: 1 }} onPress={() => b.loadRoutine(r)}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{r.name}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{r.blocks.length} {t("w.train.builder.blocks")} – {t("w.train.builder.tapToEdit")}</Text>
              </Pressable>
              <Pressable onPress={() => b.remove(r.id)} hitSlop={8} style={{ paddingHorizontal: 6 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>✕</Text>
              </Pressable>
            </View>
          ))}
        </ACard>
      )}
      {/* Clearance for the floating tab bar — without it the free-slots note
          scrolls under the centre FAB (the occlusion the redesign fixes). */}
      <View style={{ height: 110 }} />
    </AuroraScreen>
  );
}

/**
 * The session pulse — "One Number": the routine's estimated duration IS the
 * interface, a single display-weight live readout that visibly grows with
 * every exercise added (composing feels like loading a bar, not filling a
 * form). Tonnage + moves ride along as one hairline meta; the strength ⇄
 * conditioning ⇄ endurance balance is a thin bar whose segment colours encode
 * modality (lime / violet / teal — information, not decoration), labelled
 * only for the modalities actually present. Replaces the old three stat
 * tiles + balance card (four boxes saying what one number can). Twin of the
 * web Builder hero.
 */
function SessionPulse({ items, units, C, bodyweightKg }: { items: EditableBlock[]; units: WeightUnit; C: Palette; bodyweightKg?: number | null }) {
  const { t } = useLang();
  const sig = sessionSignal(items, { bodyweightKg });
  const segs = [
    { pct: sig.split.strength, color: C.lime, label: t("w.train.signal.str") },
    { pct: sig.split.conditioning, color: C.violet, label: t("w.train.signal.cond") },
    { pct: sig.split.endurance, color: C.blue, label: t("w.train.signal.end") },
  ];
  return (
    <View style={{ marginTop: 4, marginBottom: 16, marginHorizontal: 2 }} accessible accessibilityLabel={`${sig.minutes} min`}>
      <Text style={{ fontFamily: F.monoBold, fontSize: 52, letterSpacing: -2, lineHeight: 56, color: C.chalk, fontVariant: ["tabular-nums"] }}>
        {sig.minutes}<Text style={{ fontFamily: F.mono, fontSize: 20, color: C.ash, letterSpacing: 0 }}> min</Text>
      </Text>
      <View style={{ marginTop: 6 }}>
        <MetaLine
          parts={[sig.tonnageKg > 0 ? fmtTonnage(sig.tonnageKg, units) : null, `${sig.moves} ${t("w.train.signal.moves")}`]}
          textStyle={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}
        />
      </View>
      <View style={{ flexDirection: "row", height: 4, borderRadius: RADIUS.pill, overflow: "hidden", backgroundColor: C.ink2, marginTop: 12 }}>
        {segs.map((s, i) => s.pct > 0 && <View key={i} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />)}
      </View>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
        {segs.filter((s) => s.pct > 0).map((s, i) => (
          <Text key={i} style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, s.color) }}>{s.pct}% {s.label}</Text>
        ))}
      </View>
    </View>
  );
}

/** A metric cell in a block's signal row. */
function Metric({ label, value, c, C }: { label: string; value: string; c?: string; C: Palette }) {
  return (
    <View style={{ marginRight: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{label}</Text>
      <Text style={{ fontFamily: F.monoBold, fontSize: fs.note, color: c ? txt(C, c) : C.chalk, marginTop: 2, fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

type Builder = ReturnType<typeof useRoutineBuilder>;

/**
 * A signal block card: header (kind tag, editable name, collapsed summary,
 * reorder, collapse chevron, remove) + an always-visible metric row derived
 * from the editable fields + the per-modality editor body when expanded.
 */
function BlockCard({ b, C, units, rirMode, velocity, haptics, bodyweightKg, builder, grip }: {
  b: EditableBlock;
  C: Palette;
  units: WeightUnit;
  rirMode: boolean;
  velocity: boolean;
  haptics: boolean;
  bodyweightKg?: number | null;
  builder: Builder;
  /** The hold-and-drag reorder handle (owned by the parent's drag state). */
  grip?: React.ReactNode;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(true);
  const c = kindColor(b.kind, C);
  const minutes = Math.round(estimateBlockMinutes(b));

  const field = { fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 10, paddingVertical: 8, textAlign: "center" as const };
  const label = (s: string) => (
    <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 0.9, textTransform: "uppercase", marginBottom: 4 }}>{s}</Text>
  );
  return (
    <ACard style={{ marginBottom: 12 }}>
      {/* header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        {grip}
        <Text style={{ fontFamily: F.mono, fontSize: 9, color: txt(C, c) }}>{b.kind.toUpperCase()}</Text>
        <TextInput
          value={b.name}
          onChangeText={(v) => builder.setField(b.uid, "name", v)}
          style={{ flex: 1, fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, padding: 0 }}
        />
        <Pressable onPress={() => setOpen((v) => !v)} hitSlop={8} accessibilityRole="button" accessibilityLabel={open ? t("w.train.blocks.collapse") : t("w.train.blocks.expand")}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.note, color: C.ash, transform: [{ rotate: open ? "180deg" : "0deg" }] }}>▾</Text>
        </Pressable>
        <Pressable onPress={() => builder.removeItem(b.uid)} hitSlop={8}><Text style={{ fontFamily: F.mono, fontSize: fs.note, color: C.ash }}>✕</Text></Pressable>
      </View>

      {/* signal metric row — the COLLAPSED summary only: expanded, the editor
          fields are the data and the One-Number hero above live-updates, so a
          summary strip on top of both would say the same numbers a third time
          (mirrors the web workout-blocks signal mode). */}
      {!open && (
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
        {b.kind === "strength" ? (
          (() => {
            const s = strengthBlockStats(b, bodyweightKg);
            // A plain-bodyweight lift shows no load cell (nothing was entered)
            // — but with a known bodyweight its TONNAGE is real (BW × reps).
            const bw = exerciseProfile(b.name).strength?.loadMode === "bodyweight";
            return (
              <>
                <Metric C={C} label={`${t("w.train.blocks.setCol")} × ${t("w.train.blocks.reps")}`} value={s.scheme} />
                {!bw && (
                  <Metric C={C} label={`${t("w.train.blocks.load")} (${units})`} value={s.topKg > 0 ? displayLoad(String(s.topKg), units) : "—"} />
                )}
                {(!bw || s.volumeKg > 0) && (
                  <Metric C={C} label={t("w.train.signal.tonnage")} value={s.volumeKg > 0 ? fmtTonnage(s.volumeKg, units) : "—"} c={C.lime} />
                )}
                <Metric C={C} label={t("w.train.signal.estTime")} value={`${minutes} min`} />
              </>
            );
          })()
        ) : b.kind === "cardio" ? (
          <>
            {!timedSportOnly(b.name) && (
              <Metric C={C} label={sportDistanceUnit(b.name) === "m" ? t("w.train.blocks.distM") : t("w.train.blocks.distKm")} value={displaySportDistance(b.distance, b.name) || "—"} />
            )}
            <Metric C={C} label={t("w.train.blocks.pace")} value={cardioPace(b) ?? "—"} c={C.blue} />
            <Metric C={C} label={t("w.train.blocks.minutes")} value={b.minutes ? String(b.minutes) : "—"} />
          </>
        ) : (
          <>
            <Metric C={C} label={t("w.train.blocks.format")} value={b.format || "—"} />
            <Metric C={C} label={t("w.train.blocks.roundsCol")} value={b.rounds ? String(b.rounds) : "—"} />
            <Metric C={C} label={t("w.train.signal.estTime")} value={`${minutes} min`} c={C.violet} />
          </>
        )}
      </View>
      )}

      {/* editor body */}
      {open && b.kind === "strength" && (
        <StrengthEditor b={b} C={C} units={units} rirMode={rirMode} velocity={velocity} haptics={haptics} builder={builder} field={field} label={label} />
      )}
      {open && b.kind === "cardio" && (
        <CardioEditor b={b} C={C} builder={builder} field={field} label={label} />
      )}
      {open && b.kind === "conditioning" && (
        <ConditioningEditor b={b} C={C} builder={builder} field={field} label={label} />
      )}
    </ACard>
  );
}

type FieldStyle = object;
type LabelFn = (s: string) => React.ReactNode;

/** Per-set strength editor: role badge (tap to cycle), load, reps, RPE/RIR per
 *  set (+ M/S when the velocity pref is on), drag-to-reorder rows, add sets
 *  (with the warm-up / ramp / cool-down / drop Special menu), and the
 *  planned-rest stepper. */
function StrengthEditor({ b, C, units, rirMode, velocity, haptics, builder, field, label }: {
  b: EditableBlock & { kind: "strength" };
  C: Palette;
  units: WeightUnit;
  rirMode: boolean;
  velocity: boolean;
  haptics: boolean;
  builder: Builder;
  field: FieldStyle;
  label: LabelFn;
}) {
  const reducedMotion = useReducedMotion();
  const { t } = useLang();
  // Warm-up / ramp / cool-down / drop tucked into a "Special ▾" menu — the
  // common path stays one "+ Add set" tap (same layout as the live logger).
  const [special, setSpecial] = useState(false);
  // Hold-and-drag reorder of the set rows (grip on each row).
  const setDrag = useDragReorder((_g, from, to) => builder.moveSet(b.uid, from, to));
  // The exercise DB drives how THIS lift's sets read: a plank counts seconds,
  // a carry counts metres, a pull-up's load is BW + added weight.
  const sp = exerciseProfile(b.name).strength;
  // A plain-bodyweight lift (Pull-Up, Dip…) has NO load column — the set is
  // just BW × reps. "Weighted X" variants keep it (BW + added).
  const showLoad = sp?.loadMode !== "bodyweight";
  const repsLabel = t(sp?.measure === "time" ? "w.train.blocks.secs" : sp?.measure === "distance" ? "w.train.blocks.distM" : "w.train.blocks.reps");
  const loadPh =
    sp?.loadMode === "bodyweight-plus" ? `+${units}`
    : sp?.loadMode === "assisted" ? `−${units}`
    : units === "lb" ? "225" : "100";
  const repsPh = sp?.measure === "time" ? "30" : sp?.measure === "distance" ? "20" : "5";
  return (
    <View style={{ marginTop: 12 }}>
      {/* A bilateral dumbbell lift takes ONE dumbbell's weight; tonnage counts
          both bells. Guide the athlete so the doubled volume reads. */}
      {loadUnitCount(b.name) === 2 && (
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.blue), marginBottom: 8 }}>
          {t("w.train.blocks.dbPerHint")}
        </Text>
      )}
      <View style={{ flexDirection: "row", gap: space.sm, marginBottom: 4 }}>
        <View style={{ width: 34 }}>{label(t("w.train.blocks.setCol"))}</View>
        {showLoad && <View style={{ flex: 1 }}>{label(`${t("w.train.blocks.load")} (${units})`)}</View>}
        <View style={{ flex: 1 }}>{label(repsLabel)}</View>
        {/* The column header is the RPE ⇄ RIR mode switch — persists as the
            device-wide logger pref (parity with the web workout-blocks). */}
        <Pressable style={{ flex: 1 }} onPress={() => setLoggerPref("rpeAsRir", !rirMode)} accessibilityRole="button" accessibilityLabel={`${rirMode ? "RIR" : "RPE"} — ${t("rpe.rir")}`}>
          {label(`${rirMode ? "RIR" : "RPE"} ⇄`)}
        </Pressable>
        {velocity && <View style={{ flex: 1 }}>{label("M/S")}</View>}
        <View style={{ width: 22 }} />
      </View>
      {/* Swipe a row left to delete it, hold the ⠿ grip to drag-reorder — the
          same gestures as the live logger; no per-row buttons cluttering the
          ledger. */}
      {b.sets.map((s, i) => {
        const st = setType(s);
        const accent = st === "warmup" ? C.amber : st === "cooldown" ? C.blue : st === "drop" ? C.lime : null;
        const lifted = setDrag.dragKey === setDrag.key("", i);
        return (
          <Animated.View
            key={i}
            onLayout={setDrag.onRowLayout("", i)}
            style={lifted ? { transform: [{ translateY: setDrag.dragY }], zIndex: 20, elevation: 6 } : undefined}
          >
          <SwipeRow label={t("w.analyze.hist.delete")} onDelete={() => { animateListChange(reducedMotion); builder.removeSet(b.uid, i); }} background={C.ink2}>
            <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
              <Pressable
                onPress={() => builder.cycleType(b.uid, i)}
                accessibilityRole="button"
                accessibilityLabel={`${setTypeBadge(s, i)} ${t("w.train.blocks.setTypeTitle")}`}
                style={{ width: 34, height: 38, borderRadius: 12, borderWidth: 1, borderColor: accent ?? C.line, backgroundColor: accent ? `${accent}1f` : "transparent", alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: accent ? txt(C, accent) : C.ash }}>{setTypeBadge(s, i)}</Text>
              </Pressable>
              {showLoad && (
                <TextInput value={displayLoad(s.load, units)} onChangeText={(v) => builder.updateSet(b.uid, i, "load", storeLoad(v, units))} keyboardType="numeric" placeholder={loadPh} placeholderTextColor={`${C.ash}88`} style={[field, { flex: 1 }]} />
              )}
              <TextInput value={s.reps} onChangeText={(v) => builder.updateSet(b.uid, i, "reps", v)} keyboardType="numeric" placeholder={repsPh} placeholderTextColor={`${C.ash}88`} style={[field, { flex: 1 }]} />
              <TextInput value={rpeRirSwap(s.rpe ?? "", rirMode)} onChangeText={(v) => builder.updateSet(b.uid, i, "rpe", rpeRirSwap(v, rirMode))} keyboardType="numeric" placeholder={rirMode ? "2" : "8"} placeholderTextColor={`${C.ash}88`} style={[field, { flex: 1 }]} />
              {velocity && (
                <TextInput value={s.vel ?? ""} onChangeText={(v) => builder.updateSet(b.uid, i, "vel", v)} keyboardType="numeric" placeholder="0.50" placeholderTextColor={`${C.ash}88`} style={[field, { flex: 1 }]} />
              )}
              <View style={{ width: 22, alignItems: "center", justifyContent: "center" }}>
                <DragHandle
                  onStart={() => setDrag.begin("", i, b.sets.length)}
                  onMove={setDrag.move}
                  onEnd={setDrag.end}
                  color={lifted ? txt(C, C.lime) : C.ash}
                  size={fs.note}
                />
              </View>
            </View>
          </SwipeRow>
          </Animated.View>
        );
      })}
      {/* Ghost/dashed add affordance — the screen's single lime fill belongs
          to the primary Save action, not a repeated per-card control. The rarer
          set types tuck into "Special ▾" (parity with the live logger). */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, marginTop: 6 }}>
        <Pressable onPress={() => builder.addSet(b.uid)} style={{ borderWidth: 1, borderStyle: "dashed", borderColor: `${C.ash}77`, borderRadius: RADIUS.pill, paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: C.ash }}>{t("w.train.blocks.addSet")}</Text>
        </Pressable>
        <Pressable onPress={() => setSpecial((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.train.blocks.special")} {special ? "▴" : "▾"}</Text>
        </Pressable>
      </View>
      {special && (
        <View style={{ marginTop: 8, borderWidth: 1, borderColor: C.line, borderRadius: 16, backgroundColor: C.ink, overflow: "hidden" }}>
          {[
            { run: builder.addWarmupSet, c: C.amber, badge: "W", label: t("workout.warmupSetTitle"), desc: t("workout.warmupSetDesc") },
            { run: builder.addWarmupRamp, c: C.amber, badge: "↗", label: t("workout.warmupRampTitle"), desc: t("workout.warmupRampDesc") },
            { run: builder.addCooldownSet, c: C.blue, badge: "C", label: t("workout.cooldownSetTitle"), desc: t("workout.cooldownSetDesc") },
            { run: builder.addDropSet, c: C.ash, badge: "↓", label: t("workout.dropSetTitle"), desc: t("workout.dropSetDesc") },
          ].map((it, ii) => (
            <Pressable
              key={it.badge}
              onPress={() => { it.run(b.uid); setSpecial(false); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: ii === 0 ? 0 : 1, borderTopColor: C.line }}
            >
              <View style={{ width: 30, height: 30, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: `${it.c}29` }}>
                <Text style={{ fontFamily: F.monoBold, fontSize: fs.caption, color: txt(C, it.c) }}>{it.badge}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: C.chalk }}>{it.label}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{it.desc}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
      {/* planned rest between working sets — prescription, 15 s steps */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, marginTop: 12 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 0.9, textTransform: "uppercase", flex: 1 }}>{t("w.train.blocks.restBetween")}</Text>
        <Pressable onPress={() => builder.bumpRest(b.uid, -15)} accessibilityRole="button" accessibilityLabel={t("common.decrease")} hitSlop={6} style={{ width: 32, height: 32, borderRadius: 12, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: C.ash, fontSize: fs.note }}>−</Text>
        </Pressable>
        <Text style={{ fontFamily: F.monoBold, fontSize: fs.note, color: C.chalk, minWidth: 48, textAlign: "center" }}>{b.restSec ?? DEFAULT_REST_SEC} s</Text>
        <Pressable onPress={() => builder.bumpRest(b.uid, 15)} accessibilityRole="button" accessibilityLabel={t("common.increase")} hitSlop={6} style={{ width: 32, height: 32, borderRadius: 12, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: txt(C, C.lime), fontSize: fs.note }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Cardio editor — distance (sport unit) + minutes, then the modality extras:
 *  incline for treadmill work, stroke for swims, HR zone for any cardio. */
function CardioEditor({ b, C, builder, field, label }: {
  b: EditableBlock & { kind: "cardio" };
  C: Palette;
  builder: Builder;
  field: FieldStyle;
  label: LabelFn;
}) {
  const { t } = useLang();
  // Raw text buffers so a mid-typed decimal ("8." → "8.5") survives; storage is
  // numeric (km for distance). Buffers die with the card (uid-keyed remount).
  const [distDraft, setDistDraft] = useState<string | null>(null);
  const [minDraft, setMinDraft] = useState<string | null>(null);
  const [inclineDraft, setInclineDraft] = useState<string | null>(null);
  const [elevDraft, setElevDraft] = useState<string | null>(null);
  const [zoneDraft, setZoneDraft] = useState<string | null>(null);
  const num = (v: string) => {
    const n = parseFloat(v);
    return v.trim() === "" || !Number.isFinite(n) ? undefined : n;
  };
  // The exercise-profile model decides this activity's fields — incline for
  // treadmill work, stroke for swims, elevation for outdoor climb sports.
  const prof = exerciseProfile(b.name);
  const has = (f: string) => prof.fields.includes(f as never);
  const timed = timedSportOnly(b.name);
  const pace = cardioPace(b);
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", gap: space.ms }}>
        {!timed && (
          <View style={{ flex: 1 }}>
            {label(sportDistanceUnit(b.name) === "m" ? t("w.train.blocks.distM") : t("w.train.blocks.distKm"))}
            <TextInput
              value={distDraft ?? displaySportDistance(b.distance, b.name)}
              onChangeText={(v) => { setDistDraft(v); builder.setField(b.uid, "distance", parseSportDistance(v, b.name)); }}
              keyboardType="numeric" placeholder={sportDistanceUnit(b.name) === "m" ? "400" : "8"} placeholderTextColor={`${C.ash}88`} style={field}
            />
          </View>
        )}
        <View style={{ flex: 1 }}>
          {label(t("w.train.blocks.minutes"))}
          <TextInput
            value={minDraft ?? (b.minutes == null ? "" : String(b.minutes))}
            onChangeText={(v) => { setMinDraft(v); builder.setField(b.uid, "minutes", num(v)); }}
            keyboardType="numeric" placeholder="45" placeholderTextColor={`${C.ash}88`} style={field}
          />
        </View>
      </View>
      {/* Modality extras — a swim never sees incline; a treadmill never sees stroke. */}
      <View style={{ flexDirection: "row", gap: space.ms, marginTop: 10 }}>
        {has("incline") && (
          <View style={{ flex: 1 }}>
            {label(t("w.train.blocks.inclinePct"))}
            <TextInput
              value={inclineDraft ?? (b.incline == null ? "" : String(b.incline))}
              onChangeText={(v) => { setInclineDraft(v); builder.setField(b.uid, "incline", num(v)); }}
              keyboardType="numeric" placeholder="1.5" placeholderTextColor={`${C.ash}88`} style={field}
            />
          </View>
        )}
        {has("stroke") && (
          <View style={{ flex: 1 }}>
            {label(t("w.train.blocks.stroke"))}
            <TextInput
              value={b.stroke ?? ""}
              onChangeText={(v) => builder.setField(b.uid, "stroke", v || undefined)}
              placeholder="Free" placeholderTextColor={`${C.ash}88`} style={field}
            />
          </View>
        )}
        {has("elevation") && (
          <View style={{ flex: 1 }}>
            {label(t("w.train.blocks.elevation"))}
            <TextInput
              value={elevDraft ?? (b.elevation == null ? "" : String(b.elevation))}
              onChangeText={(v) => { setElevDraft(v); builder.setField(b.uid, "elevation", num(v)); }}
              keyboardType="numeric" placeholder="120" placeholderTextColor={`${C.ash}88`} style={field}
            />
          </View>
        )}
        <View style={{ flex: 1 }}>
          {label(t("w.train.blocks.zone"))}
          <TextInput
            value={zoneDraft ?? (b.zone == null ? "" : String(b.zone))}
            onChangeText={(v) => { setZoneDraft(v); builder.setField(b.uid, "zone", num(v)); }}
            keyboardType="numeric" placeholder="2" placeholderTextColor={`${C.ash}88`} style={field}
          />
        </View>
      </View>
      {pace && (
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.blue), marginTop: 10 }}>
          {t("w.train.blocks.pace")} {pace}
        </Text>
      )}
    </View>
  );
}

/** Conditioning editor — format, work/rest seconds, rounds, minutes. */
function ConditioningEditor({ b, C, builder, field, label }: {
  b: EditableBlock & { kind: "conditioning" };
  C: Palette;
  builder: Builder;
  field: FieldStyle;
  label: LabelFn;
}) {
  const { t } = useLang();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const numField = (key: "work" | "rest" | "rounds" | "minutes", lab: string, ph: string) => (
    <View style={{ flex: 1 }} key={key}>
      {label(lab)}
      <TextInput
        value={drafts[key] ?? (b[key] == null ? "" : String(b[key]))}
        onChangeText={(v) => {
          setDrafts((d) => ({ ...d, [key]: v }));
          const n = parseFloat(v);
          builder.setField(b.uid, key, v.trim() === "" || !Number.isFinite(n) ? undefined : n);
        }}
        keyboardType="numeric" placeholder={ph} placeholderTextColor={`${C.ash}88`} style={field}
      />
    </View>
  );
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", gap: space.ms }}>
        <View style={{ flex: 1 }}>
          {label(t("w.train.blocks.format"))}
          <TextInput value={b.format ?? ""} onChangeText={(v) => builder.setField(b.uid, "format", v || undefined)} placeholder="AMRAP" placeholderTextColor={`${C.ash}88`} style={field} />
        </View>
        {numField("rounds", t("w.train.blocks.roundsCol"), "8")}
      </View>
      <View style={{ flexDirection: "row", gap: space.ms, marginTop: 10 }}>
        {numField("work", t("w.train.blocks.workS"), "40")}
        {numField("rest", t("w.train.blocks.restS"), "20")}
        {numField("minutes", t("w.train.blocks.minutes"), "12")}
      </View>
    </View>
  );
}
