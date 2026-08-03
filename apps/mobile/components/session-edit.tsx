import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  editableBlockFields,
  sessionEditDirty,
  sessionEditDraft,
  sessionEditPatch,
  type LoggedSession,
  type SessionEditDraft,
} from "@hybrid/core";
import { patchSessionEdit } from "../lib/api";
import { useLang } from "../lib/i18n";
import { useLoggerPrefs } from "../lib/logger-prefs";
import { F, fs, space, PressScale as Pressable } from "../lib/ui";
import { useTheme, txt, type Palette } from "../lib/theme";

const labelStyle = (C: Palette) =>
  ({ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, color: C.ash, textTransform: "uppercase", marginBottom: 5 }) as const;
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
 * EDIT WORKOUT — the sheet behind the summary's "Edit workout": correct the
 * figures you typed into a workout you already saved (a distance that got
 * skipped, a fat-fingered time, the wrong load on a set) without deleting the
 * session and throwing away its PRs, your feel report and any device match.
 *
 * The model is shared — core/session-edit.ts builds the draft and folds it back
 * onto the ORIGINAL blocks, so nothing this sheet doesn't show (stroke, incline,
 * zone, superset group, a set's role or measured rest) can be lost by an edit.
 * Web parity: apps/web/components/session-edit.tsx.
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
  const insets = useSafeAreaInsets();
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

  const setBlock = (i: number, patch: Partial<SessionEditDraft["blocks"][number]>) =>
    setDraft((d) => ({ ...d, blocks: d.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));
  const setSet = (i: number, j: number, patch: Partial<SessionEditDraft["blocks"][number]["sets"][number]>) =>
    setDraft((d) => ({
      ...d,
      blocks: d.blocks.map((b, bi) => (bi === i ? { ...b, sets: b.sets.map((s, si) => (si === j ? { ...s, ...patch } : s)) } : b)),
    }));
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(4,4,4,0.72)", justifyContent: "flex-end" }} onPress={onClose}>
          <Pressable
            onPress={() => {}}
            style={{ backgroundColor: C.ink2, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: C.line, padding: 20, paddingBottom: insets.bottom + 20, maxHeight: "88%" }}
          >
            <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: "center", marginBottom: 16 }} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.chalk, flex: 1, paddingRight: 10 }}>{t("session.edit.title")}</Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("common.cancel")}</Text>
              </Pressable>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, lineHeight: 17, color: C.ash, marginTop: 8 }}>{t("session.edit.lead")}</Text>

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
                        {b.sets.map((s, j) => (
                          <View key={j} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: j ? 8 : 0 }}>
                            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, width: 20 }}>{j + 1}</Text>
                            <Num C={C} value={s.load} onChange={(v) => setSet(i, j, { load: v })} />
                            <Num C={C} value={s.reps} onChange={(v) => setSet(i, j, { reps: v })} />
                            <Num C={C} value={s.rpe} onChange={(v) => setSet(i, j, { rpe: v })} />
                          </View>
                        ))}
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
                  </View>
                );
              })}

              {/* A matched session's numbers still come off the wrist everywhere
                  else — say so here rather than let a corrected figure look like
                  it changed nothing. */}
              {session.device && (
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, lineHeight: 16, color: C.ash, marginTop: 16 }}>{t("session.edit.matched")}</Text>
              )}
              {error && (
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.amber, marginTop: 16 }}>{t("session.edit.error")}</Text>
              )}
            </ScrollView>

            <Pressable
              onPress={() => void save()}
              disabled={saving || !dirty}
              style={{ marginTop: 16, backgroundColor: C.lime, borderRadius: 14, paddingVertical: 15, alignItems: "center", opacity: saving || !dirty ? 0.45 : 1 }}
            >
              {saving ? <ActivityIndicator color={C.onAccent} /> : <Text style={{ fontFamily: F.black, fontSize: 15, color: C.onAccent }}>{t("common.save")}</Text>}
            </Pressable>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
