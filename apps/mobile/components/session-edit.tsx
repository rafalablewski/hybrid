import { useEffect, useState } from "react";
import { APill } from "./aurora/kit";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";
import {
  cardioDiscipline,
  distanceBounds,
  editableBlockFields,
  inspectEffort,
  inspectSet,
  kgToUnit,
  loadBounds,
  repsBounds,
  sessionEditDirty,
  sessionEditDraft,
  sessionEditPatch,
  parseSportDistance,
  sportDistanceUnit,
  unitToKg,
  ELEVATION_BOUNDS,
  MINUTES_BOUNDS,
  ROUNDS_BOUNDS,
  RPE_BOUNDS,
  type Bounds,
  type LoggedSession,
  type SessionEditDraft,
} from "@hybrid/core";
import { patchSessionEdit } from "../lib/api";
import { allowFieldValue } from "../lib/field-guard";
import { ConcernLine } from "./aurora/concern-line";
import { useLang } from "../lib/i18n";
import { useLoggerPrefs } from "../lib/logger-prefs";
import { F, PressScale as Pressable, fs, leading, space, tracking, ty} from "../lib/ui";
import { useTheme, txt, type Palette } from "../lib/theme";
import Sheet from "./aurora/sheet";

const labelStyle = (C: Palette) =>
  ({ ...ty(C, "kicker"), marginBottom: 5  }) as const;
const fieldStyle = (C: Palette) =>
  ({
    fontFamily: F.mono,
    fontSize: fs.body,
    color: C.chalk,
    backgroundColor: C.ink,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  }) as const;

/**
 * One numeric field. Declared at MODULE level on purpose: a component defined
 * inside the sheet's render is a new type on every keystroke, which unmounts the
 * TextInput and drops the keyboard mid-edit.
 */
function Num({ C, cap, value, onChange }: { C: Palette; cap?: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1 }}>
      {/* A set table captions its COLUMNS once and then omits `cap` — three
          identical LOAD/REPS/RPE rows down a bench-press block is noise. */}
      {cap ? <Text style={labelStyle(C)}>{cap}</Text> : null}
      <TextInput value={value} onChangeText={onChange} keyboardType="numeric" placeholder="—" placeholderTextColor={C.ash} style={fieldStyle(C)} />
    </View>
  );
}

/**
 * EDIT WORKOUT — the sheet behind the summary's "Edit session": correct the
 * figures you typed into a workout you already saved (a distance that got
 * skipped, a fat-fingered time, the wrong load on a set) without deleting the
 * session and throwing away its PRs, your feel report and any device match.
 *
 * The model is shared — core/session-edit.ts builds the draft and folds it back
 * onto the ORIGINAL blocks, so nothing this sheet doesn't show (stroke, incline,
 * zone, superset group, a set's role or measured rest) can be lost by an edit.
 * (The web twin this once had parity with went with the user-facing web client.)
 *
 * BOTH PLAUSIBILITY TIERS RUN HERE, and this was the last logging surface
 * without them: an impossible figure cannot be typed at all, and an improbable
 * one gets the quiet amber line rather than an argument. A correction is where a
 * slipped finger is MOST likely — the athlete is retyping a number they already
 * got wrong once — and it lands on a session that already carries PRs, a feel
 * report and possibly a device match.
 */
export function SessionEditSheet({
  session,
  visible,
  onClose,
  onSaved,
}: {
  session: LoggedSession;
  visible: boolean;
  onClose: () => void;
  /** fired after the server accepted the correction */
  onSaved: () => void;
}) {
  const C = useTheme().palette;
  const { t } = useLang();
  const units = useLoggerPrefs().units;
  const [draft, setDraft] = useState<SessionEditDraft>(() => sessionEditDraft(session, { units }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  // Re-seed each time the sheet opens: a cancelled edit must not linger, and a
  // refetch may have landed while it was closed.
  useEffect(() => {
    if (visible) {
      setDraft(sessionEditDraft(session, { units }));
      setError(false);
    }
  }, [visible, session, units]);

  const dirty = sessionEditDirty(session, draft, { units });

  /**
   * THE SAME TWO TIERS AS THE LOGGERS, on the one screen that was still without
   * them. A correction is where a slipped finger is MOST likely — the athlete is
   * retyping a figure they already got wrong once — and it lands on a session
   * that already has PRs, a feel report and possibly a device match hanging off
   * it. The server refuses the impossible either way; being told after the save
   * is just later and worse.
   *
   * THE DRAFT IS IN DISPLAY UNITS, unlike the logger's state: `sessionEditDraft`
   * builds it with the athlete's own weight unit and the sport's own distance
   * unit, so a bound written in kg or km has to be converted before it is either
   * compared or announced. A lb user told "max 1500 kg" about a field showing
   * pounds has been given a true and useless sentence.
   */
  const fieldBounds = (name: string, key: string): { bounds: Bounds; max?: number; unit?: string } | null => {
    if (key === "load") {
      const b = loadBounds(name);
      return units === "lb" ? { bounds: b, max: Math.floor(kgToUnit(b.max, "lb")), unit: "lb" } : { bounds: b };
    }
    if (key === "reps") return { bounds: repsBounds(name) };
    if (key === "rpe") return { bounds: RPE_BOUNDS };
    if (key === "minutes") return { bounds: MINUTES_BOUNDS };
    if (key === "rounds") return { bounds: ROUNDS_BOUNDS };
    if (key === "elevation") return { bounds: ELEVATION_BOUNDS };
    if (key === "distance") {
      const b = distanceBounds(cardioDiscipline(name));
      return sportDistanceUnit(name) === "m"
        ? { bounds: b, max: Math.round(b.max * 1000), unit: "m" }
        : { bounds: b };
    }
    return null;
  };

  /** True when every field this patch sets may hold what it is being given;
   *  shows the bound for the first one that may not. */
  const patchAllowed = (name: string, patch: Record<string, unknown>): boolean =>
    Object.entries(patch).every(([key, value]) => {
      if (typeof value !== "string") return true;
      const f = fieldBounds(name, key);
      return !f || allowFieldValue(t, value, f.bounds, { max: f.max, unit: f.unit });
    });

  const setBlock = (i: number, patch: Partial<SessionEditDraft["blocks"][number]>) =>
    setDraft((d) => {
      const b = d.blocks[i];
      // EVERY string entry, not just the first: today each call site sets one
      // field, and a guard that silently only checked one of two would be an
      // invisible hole the moment that stopped being true.
      if (b && !patchAllowed(b.name, patch)) return d;
      return { ...d, blocks: d.blocks.map((x, j) => (j === i ? { ...x, ...patch } : x)) };
    });
  const setSet = (i: number, j: number, patch: Partial<SessionEditDraft["blocks"][number]["sets"][number]>) =>
    setDraft((d) => {
      const b = d.blocks[i];
      if (b && !patchAllowed(b.name, patch)) return d;
      return {
        ...d,
        blocks: d.blocks.map((x, bi) => (bi === i ? { ...x, sets: x.sets.map((s, si) => (si === j ? { ...s, ...patch } : s)) } : x)),
      };
    });
  const addSet = (i: number) =>
    setDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b, bi) => (bi === i ? { ...b, sets: [...b.sets, { load: "", reps: "", rpe: "" }] } : b)),
    }));

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(false);
    const ok = await patchSessionEdit(session.id, sessionEditPatch(session, draft, { units }));
    setSaving(false);
    if (!ok) {
      setError(true);
      return;
    }
    onSaved();
    onClose();
  };

  const label = labelStyle(C);

  return (
    <Sheet visible={visible} onClose={onClose} scroll={false}>
            <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: "center", marginBottom: 16 }} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, flex: 1, paddingRight: 10 }}>{t("session.edit.title")}</Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("common.cancel")}</Text>
              </Pressable>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, lineHeight: leading(fs.caption), color: C.ash, marginTop: 8 }}>{t("session.edit.lead")}</Text>

            <ScrollView style={{ marginTop: 16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={label}>{t("session.edit.name")}</Text>
              <TextInput
                value={draft.title}
                onChangeText={(v) => setDraft((d) => ({ ...d, title: v }))}
                placeholder={session.title}
                placeholderTextColor={C.ash}
                style={fieldStyle(C)}
              />

              {draft.blocks.map((b, i) => {
                const orig = session.blocks[i];
                const fields = editableBlockFields({
                  kind: b.kind,
                  name: b.name,
                  elevation: orig && orig.kind === "cardio" ? orig.elevation : undefined,
                });
                return (
                  <View key={`${b.name}-${i}`} style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 16 }}>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{b.name}</Text>

                    {fields.sets ? (
                      <View style={{ marginTop: 10 }}>
                        {/* Column captions once, above the rows — the set number
                            column keeps its width so the grid stays square. */}
                        <View style={{ flexDirection: "row", gap: space.sm }}>
                          <View style={{ width: 20 }} />
                          <Text style={[label, { flex: 1 }]}>{t("session.edit.load")} ({units})</Text>
                          <Text style={[label, { flex: 1 }]}>{t("session.edit.reps")}</Text>
                          <Text style={[label, { flex: 1 }]}>{t("session.edit.rpe")}</Text>
                        </View>
                        {b.sets.map((s, j) => {
                          // Judged in KILOGRAMS, whatever the field shows: the
                          // bounds and the implied-max rule are written in the
                          // stored unit, and a pounds figure compared against
                          // them would call every heavy set unusual.
                          const c = inspectSet(b.name, units === "lb" ? String(unitToKg(parseFloat(s.load) || 0, "lb")) : s.load, s.reps);
                          return (
                            <View key={j} style={{ marginTop: j ? 8 : 0 }}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, width: 20 }}>{j + 1}</Text>
                                <Num C={C} value={s.load} onChange={(v) => setSet(i, j, { load: v })} />
                                <Num C={C} value={s.reps} onChange={(v) => setSet(i, j, { reps: v })} />
                                <Num C={C} value={s.rpe} onChange={(v) => setSet(i, j, { rpe: v })} />
                              </View>
                              <ConcernLine concern={c} />
                            </View>
                          );
                        })}
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, flex: 1, paddingRight: 10 }}>{t("session.edit.emptySet")}</Text>
                          <Pressable onPress={() => addSet(i)} hitSlop={8}>
                            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>+ {t("session.edit.addSet")}</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View style={{ flexDirection: "row", gap: space.sm, marginTop: 10 }}>
                        {fields.distance && (
                          <Num
                            C={C}
                            cap={`${t("session.edit.distance")} (${fields.distanceUnit})`}
                            value={b.distance}
                            onChange={(v) => setBlock(i, { distance: v })}
                          />
                        )}
                        {fields.minutes && <Num C={C} cap={t("session.edit.minutes")} value={b.minutes} onChange={(v) => setBlock(i, { minutes: v })} />}
                        {fields.rounds && <Num C={C} cap={t("session.edit.rounds")} value={b.rounds} onChange={(v) => setBlock(i, { rounds: v })} />}
                        {fields.elevation && <Num C={C} cap={t("session.edit.elevation")} value={b.elevation} onChange={(v) => setBlock(i, { elevation: v })} />}
                        {fields.rpe && <Num C={C} cap={t("session.edit.rpe")} value={b.rpe} onChange={(v) => setBlock(i, { rpe: v })} />}
                      </View>
                    )}
                    {/* The distance and the time are judged TOGETHER: each can
                        be ordinary while the pace they imply is not, and a
                        correction is exactly where that pair gets broken. The
                        draft holds the sport's own unit, so the distance is
                        converted back to stored kilometres first. */}
                    {!fields.sets && (() => {
                      const c = inspectEffort({
                        discipline: cardioDiscipline(b.name),
                        distanceKm: parseSportDistance(b.distance, b.name),
                        minutes: parseFloat(b.minutes) || null,
                      });
                      return <ConcernLine concern={c} />;
                    })()}
                  </View>
                );
              })}

              {/* A matched session's numbers still come off the wrist everywhere
                  else — say so here rather than let a corrected figure look like
                  it changed nothing. */}
              {session.device && (
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, lineHeight: leading(fs.micro), color: C.ash, marginTop: 16 }}>{t("session.edit.matched")}</Text>
              )}
              {error && (
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.amber), marginTop: 16 }}>{t("session.edit.error")}</Text>
              )}
            </ScrollView>

            {/* The shared pill's commit state replaces the spinner swap — the idle
                label holds the width, so the button cannot resize mid-save. */}
            <APill
              label={t("common.save")}
              onPress={() => void save()}
              disabled={!dirty}
              state={saving ? "saving" : "idle"}
              style={{ marginTop: 16 }}
            />
    </Sheet>
  );
}
