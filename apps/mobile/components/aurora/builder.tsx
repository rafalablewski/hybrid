import { useState } from "react";
import { View, Text, TextInput, Pressable, Modal, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import {
  MOVEMENTS,
  inferBlockKind,
  olympicSportsByCategory,
  exercisesByCategory,
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
import { useExercises } from "../../lib/queries";
import { useBodyweight } from "../../lib/use-bodyweight";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { usePersona } from "../../lib/persona";
import { track } from "../../lib/track";
import { useLang } from "../../lib/i18n";
import { fs, space, F } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { usePremiumAccent } from "../../lib/premium-accent";
import { ABack, AuroraScreen, ACard, APill, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";
import { MetaLine } from "./meta";
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
  const { catalog, aliases, categoryByName } = useExercises();
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const exact = Object.keys(MOVEMENTS).some((n) => n.toLowerCase() === q);

  const add = (name: string, kind?: BlockKind) => {
    b.addExercise(name, kind);
    setPicker(false);
    setQuery("");
  };

  return (
    <AuroraScreen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, marginBottom: 8 }}>
        <ABack />
        <AHeading style={{ fontSize: fs.display }}>{t("w.train.builder.title")}</AHeading>
      </View>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, marginBottom: 14, lineHeight: 20 }}>
        {t("w.train.builder.intro")}
      </Text>

      <TextInput
        value={b.name}
        onChangeText={b.setName}
        placeholder={t("w.train.builder.routineNamePh")}
        placeholderTextColor={C.ash}
        style={{ fontFamily: F.black, fontSize: fs.heading, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 }}
      />

      <SessionPulse items={b.items} units={prefs.units} C={C} bodyweightKg={bodyweightKg} />

      {b.items.map((x, i) => (
        <BlockCard
          key={x.uid}
          b={x}
          index={i}
          count={b.items.length}
          C={C}
          units={prefs.units}
          rirMode={prefs.rpeAsRir}
          bodyweightKg={bodyweightKg}
          builder={b}
        />
      ))}

      {/* Ghost/dashed add affordance (the one-accent rule: lime stays reserved
          for Save) — same vocabulary as the Also-Today ghost ＋ tile. */}
      <Pressable onPress={() => setPicker(true)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.ms, marginTop: 4, borderWidth: 1, borderStyle: "dashed", borderColor: `${C.ash}77`, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 13 }}>
        <AuroraIcon name="add" size={18} color={C.ash} />
        <Text style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.ash }}>{t("w.train.builder.addExercise")}</Text>
      </Pressable>

      {/* Searchable exercise picker — grouped by muscle/pattern, like the sport picker. */}
      <Modal visible={picker} transparent animationType="slide" onRequestClose={() => { setPicker(false); setQuery(""); }}>
        <Pressable onPress={() => { setPicker(false); setQuery(""); }} style={{ flex: 1, backgroundColor: "#0009", justifyContent: "flex-end" }}>
          <Pressable onPress={() => {}} style={{ flex: 1, marginTop: 64, backgroundColor: C.ink, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.line, paddingTop: 20, paddingHorizontal: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("w.train.builder.pickExercise")}</Text>
              <Pressable onPress={() => { setPicker(false); setQuery(""); }} hitSlop={10}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.train.builder.close")}</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14 }}>
              <AuroraIcon name="search" size={18} color={C.ash} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t("w.train.builder.searchCustomPh")}
                placeholderTextColor={C.ash}
                autoFocus
                onSubmitEditing={() => query.trim() && add(query)}
                style={{ flex: 1, fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, paddingVertical: 12 }}
              />
            </View>
            <ScrollView style={{ flex: 1, marginTop: 6 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: 8, paddingBottom: 28 }}>
              {exercisesByCategory(MOVEMENTS, catalog, categoryByName)
                .map((g) => ({ ...g, names: g.names.filter((n) => (!q || n.toLowerCase().includes(q)) && !aliases.has(n)) }))
                .filter((g) => g.names.length > 0)
                .map((g) => (
                  <View key={g.category}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: 1.4, marginTop: 14, marginBottom: 4 }}>{g.labelKey ? t(g.labelKey) : g.label ?? g.category}</Text>
                    {g.names.map((n) => {
                      const c = kindColor(inferBlockKind(n), C);
                      return (
                        <Pressable key={n} onPress={() => add(n, inferBlockKind(n))} style={{ flexDirection: "row", alignItems: "center", gap: space.ms, paddingVertical: 11, paddingHorizontal: 4 }}>
                          <View style={{ width: 22, alignItems: "center" }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} /></View>
                          <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{n}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              {olympicSportsByCategory()
                .map((g) => ({ category: g.category, sports: g.sports.filter((s) => !q || s.name.toLowerCase().includes(q)) }))
                .filter((g) => g.sports.length > 0)
                .map((g) => (
                  <View key={g.category}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: 1.4, marginTop: 14, marginBottom: 4 }}>{g.category}</Text>
                    {g.sports.map((s) => (
                      <Pressable key={s.name} onPress={() => add(s.name, "cardio")} style={{ flexDirection: "row", alignItems: "center", gap: space.ms, paddingVertical: 11, paddingHorizontal: 4 }}>
                        <Text style={{ fontSize: fs.subtitle, width: 22, textAlign: "center" }}>{s.icon}</Text>
                        <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{s.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                ))}
              {q.length > 0 && !exact && (
                <Pressable onPress={() => add(query)} style={{ marginTop: 16, borderRadius: RADIUS.pill, backgroundColor: C.lime, paddingVertical: 13, alignItems: "center" }}>
                  <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: C.onAccent }}>+ “{query.trim()}”</Text>
                </Pressable>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {b.msg && <Text accessibilityLiveRegion={b.msg.ok ? "polite" : "assertive"} accessibilityRole={b.msg.ok ? undefined : "alert"} style={{ fontFamily: F.mono, fontSize: fs.body, color: b.msg.ok ? txt(C, C.lime) : txt(C, C.red), marginTop: 14 }}>{b.msg.text}</Text>}

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
        <View style={{ marginTop: 16, borderWidth: 1, borderColor: `${pa.fill}55`, backgroundColor: `${pa.fill}14`, borderRadius: RADIUS.card, padding: 14 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1, color: pa.text }}>✦ {t("summary.routineFullTitle").toUpperCase()}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 6, lineHeight: 17 }}>{t("summary.routineFullBlurb")}</Text>
          <Pressable
            onPress={() => { track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "builder-save" }); router.push("/upgrade"); }}
            style={{ backgroundColor: pa.fill, borderRadius: RADIUS.pill, paddingVertical: 13, alignItems: "center", marginTop: 12 }}
          >
            <Text style={{ fontFamily: F.black, fontSize: fs.note, color: pa.ink }}>{t("summary.routineUnlock")}</Text>
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
      <Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: 52, letterSpacing: -2, lineHeight: 56, color: C.chalk, fontVariant: ["tabular-nums"] }}>
        {sig.minutes}<Text style={{ fontSize: 20, fontWeight: "500", color: C.ash, letterSpacing: 0 }}> min</Text>
      </Text>
      <View style={{ marginTop: 6 }}>
        <MetaLine
          parts={[sig.tonnageKg > 0 ? fmtTonnage(sig.tonnageKg, units) : null, `${sig.moves} ${t("w.train.signal.moves")}`]}
          textStyle={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}
        />
      </View>
      <View style={{ flexDirection: "row", height: 4, borderRadius: 99, overflow: "hidden", backgroundColor: C.ink2, marginTop: 12 }}>
        {segs.map((s, i) => s.pct > 0 && <View key={i} style={{ width: `${s.pct}%`, backgroundColor: s.color }} />)}
      </View>
      <View style={{ flexDirection: "row", gap: 14, marginTop: 6 }}>
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
    <View style={{ marginRight: 18 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 8.5, letterSpacing: 1.1, textTransform: "uppercase", color: C.ash }}>{label}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.note, fontWeight: "700", color: c ? txt(C, c) : C.chalk, marginTop: 2, fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

type Builder = ReturnType<typeof useRoutineBuilder>;

/**
 * A signal block card: header (kind tag, editable name, collapsed summary,
 * reorder, collapse chevron, remove) + an always-visible metric row derived
 * from the editable fields + the per-modality editor body when expanded.
 */
function BlockCard({ b, index, count, C, units, rirMode, bodyweightKg, builder }: {
  b: EditableBlock;
  index: number;
  count: number;
  C: Palette;
  units: WeightUnit;
  rirMode: boolean;
  bodyweightKg?: number | null;
  builder: Builder;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(true);
  const c = kindColor(b.kind, C);
  const minutes = Math.round(estimateBlockMinutes(b));

  const field = { fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 10, paddingVertical: 9, textAlign: "center" as const };
  const label = (s: string) => (
    <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{s}</Text>
  );
  const iconBtn = (onPress: () => void, glyph: string, a11y: string, disabled = false) => (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={6} style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{glyph}</Text>
    </Pressable>
  );

  return (
    <ACard style={{ marginBottom: 12 }}>
      {/* header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Text style={{ fontFamily: F.mono, fontSize: 9, color: txt(C, c) }}>{b.kind.toUpperCase()}</Text>
        <TextInput
          value={b.name}
          onChangeText={(v) => builder.setField(b.uid, "name", v)}
          style={{ flex: 1, fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, padding: 0 }}
        />
        {/* Reorder is always available (open OR collapsed) — hidden only when
            there's nothing to reorder. */}
        {count > 1 && (
          <>
            {iconBtn(() => builder.moveBlock(b.uid, -1), "↑", t("common.moveUp"), index === 0)}
            {iconBtn(() => builder.moveBlock(b.uid, 1), "↓", t("common.moveDown"), index === count - 1)}
          </>
        )}
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
        <StrengthEditor b={b} C={C} units={units} rirMode={rirMode} builder={builder} field={field} label={label} />
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
 *  set, add/remove sets, and the planned-rest stepper. */
function StrengthEditor({ b, C, units, rirMode, builder, field, label }: {
  b: EditableBlock & { kind: "strength" };
  C: Palette;
  units: WeightUnit;
  rirMode: boolean;
  builder: Builder;
  field: FieldStyle;
  label: LabelFn;
}) {
  const { t } = useLang();
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
      <View style={{ flexDirection: "row", gap: space.sm, marginBottom: 4 }}>
        <View style={{ width: 34 }}>{label(t("w.train.blocks.setCol"))}</View>
        {showLoad && <View style={{ flex: 1 }}>{label(`${t("w.train.blocks.load")} (${units})`)}</View>}
        <View style={{ flex: 1 }}>{label(repsLabel)}</View>
        {/* The column header is the RPE ⇄ RIR mode switch — persists as the
            device-wide logger pref (parity with the web workout-blocks). */}
        <Pressable style={{ flex: 1 }} onPress={() => setLoggerPref("rpeAsRir", !rirMode)} accessibilityRole="button" accessibilityLabel={`${rirMode ? "RIR" : "RPE"} — ${t("rpe.rir")}`}>
          {label(`${rirMode ? "RIR" : "RPE"} ⇄`)}
        </Pressable>
        <View style={{ width: 28 }} />
      </View>
      {b.sets.map((s, i) => {
        const st = setType(s);
        const accent = st === "warmup" ? C.amber : st === "cooldown" ? C.blue : st === "drop" ? C.lime : null;
        return (
          <View key={i} style={{ flexDirection: "row", gap: space.sm, alignItems: "center", marginBottom: 6 }}>
            <Pressable
              onPress={() => builder.cycleType(b.uid, i)}
              accessibilityRole="button"
              accessibilityLabel={`${setTypeBadge(s, i)} ${t("w.train.blocks.setTypeTitle")}`}
              style={{ width: 34, height: 38, borderRadius: 8, borderWidth: 1, borderColor: accent ?? C.line, backgroundColor: accent ? `${accent}1f` : "transparent", alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, fontWeight: "700", color: accent ? txt(C, accent) : C.ash }}>{setTypeBadge(s, i)}</Text>
            </Pressable>
            {showLoad && (
              <TextInput value={displayLoad(s.load, units)} onChangeText={(v) => builder.updateSet(b.uid, i, "load", storeLoad(v, units))} keyboardType="numeric" placeholder={loadPh} placeholderTextColor={`${C.ash}88`} style={[field, { flex: 1 }]} />
            )}
            <TextInput value={s.reps} onChangeText={(v) => builder.updateSet(b.uid, i, "reps", v)} keyboardType="numeric" placeholder={repsPh} placeholderTextColor={`${C.ash}88`} style={[field, { flex: 1 }]} />
            <TextInput value={rpeRirSwap(s.rpe ?? "", rirMode)} onChangeText={(v) => builder.updateSet(b.uid, i, "rpe", rpeRirSwap(v, rirMode))} keyboardType="numeric" placeholder={rirMode ? "2" : "8"} placeholderTextColor={`${C.ash}88`} style={[field, { flex: 1 }]} />
            <Pressable onPress={() => builder.removeSet(b.uid, i)} hitSlop={6} accessibilityRole="button" accessibilityLabel={t("common.delete")} style={{ width: 28, height: 38, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>−</Text>
            </Pressable>
          </View>
        );
      })}
      {/* Ghost/dashed add affordance — the screen's single lime fill belongs
          to the primary Save action, not a repeated per-card control. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, marginTop: 6 }}>
        <Pressable onPress={() => builder.addSet(b.uid)} style={{ borderWidth: 1, borderStyle: "dashed", borderColor: `${C.ash}77`, borderRadius: RADIUS.pill, paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: C.ash }}>{t("w.train.blocks.addSet")}</Text>
        </Pressable>
      </View>
      {/* planned rest between working sets — prescription, 15 s steps */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, marginTop: 12 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, textTransform: "uppercase", flex: 1 }}>{t("w.train.blocks.restBetween")}</Text>
        <Pressable onPress={() => builder.bumpRest(b.uid, -15)} accessibilityRole="button" accessibilityLabel={t("common.decrease")} hitSlop={6} style={{ width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: C.ash, fontSize: fs.note }}>−</Text>
        </Pressable>
        <Text style={{ fontFamily: F.mono, fontSize: fs.note, fontWeight: "700", color: C.chalk, minWidth: 48, textAlign: "center" }}>{b.restSec ?? DEFAULT_REST_SEC} s</Text>
        <Pressable onPress={() => builder.bumpRest(b.uid, 15)} accessibilityRole="button" accessibilityLabel={t("common.increase")} hitSlop={6} style={{ width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
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
