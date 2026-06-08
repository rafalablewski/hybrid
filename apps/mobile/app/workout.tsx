import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  prescribeSession,
  toTrainingLog,
  velocityProfiles,
  sessionVolume,
  blockBestE1rm,
  newPrsInSession,
  exerciseHistory,
  pacePerKm,
  supersetLabels,
  toggleSuperset,
  isSupersettedWithPrev,
  RPE_SCALE,
  RPE_INTRO,
  RPE_CARDIO_NOTE,
  MOVEMENTS,
  type SessionBlock,
  type LoggedSession,
  type PrHit,
  type ExerciseUse,
} from "@hybrid/core";
import { fetchSessions, createSession, type NewSession } from "../lib/api";
import { saveGuestSession, listGuestSessions } from "../lib/guest";
import { loadDraft, saveDraft, clearDraft } from "../lib/draft";
import { WorkoutShareCard, shareWorkout, type ShareBest } from "../lib/share";
import { useSession } from "../lib/session";
import { useLang } from "../lib/i18n";
import { C, F, Mono, Kicker, Card } from "../lib/ui";

const uid = () => Math.random().toString(36).slice(2);
const isCond = (name: string) => {
  const m = MOVEMENTS[name];
  return !!m && (m.system != null || m.pattern === "cond");
};

type WSet = { reps: string; load: string; rpe: string; done: boolean; drop?: boolean };
type WExercise = {
  uid: string;
  name: string;
  kind: "strength" | "conditioning";
  sets: WSet[];
  minutes: string;
  rpe: string;
  distance: string;
  /** Superset group key — exercises sharing it are performed together (A1/A2…). */
  group?: string;
};

const emptySet = (from?: WSet): WSet => ({
  reps: from?.reps ?? "",
  load: from?.load ?? "",
  rpe: from?.rpe ?? "",
  done: false,
});

const newExercise = (name: string, kind: "strength" | "conditioning" = isCond(name) ? "conditioning" : "strength"): WExercise => ({
  uid: uid(),
  name,
  kind,
  sets: [emptySet()],
  minutes: "",
  rpe: "",
  distance: "",
});

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

type Summ = {
  title: string;
  blocks: SessionBlock[];
  volume: number;
  sets: number;
  minutes: number;
  guest: boolean;
  pending: boolean;
  bests: ShareBest[];
  prs: PrHit[];
};

const guestToLogged = (g: { title: string; startedAt?: string; savedAt: string; blocks: unknown[] }): LoggedSession => ({
  id: g.savedAt,
  title: g.title,
  startedAt: g.startedAt ?? g.savedAt,
  blocks: g.blocks as SessionBlock[],
});

export default function Workout() {
  const router = useRouter();
  const { t } = useLang();
  const { session } = useSession();
  const guest = !session;
  const { source } = useLocalSearchParams<{ source?: string }>();

  const [title, setTitle] = useState("Workout");
  const [exercises, setExercises] = useState<WExercise[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [phase, setPhase] = useState<"active" | "done">("active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [restSince, setRestSince] = useState<number | null>(null);
  const [restNow, setRestNow] = useState(0);
  const [restTarget, setRestTarget] = useState<number | null>(null);
  const restFired = useRef(false);
  const [readiness, setReadiness] = useState<number | undefined>(undefined);
  const [summary, setSummary] = useState<Summ | null>(null);
  const [restored, setRestored] = useState(false);
  const [recent, setRecent] = useState<ExerciseUse[]>([]);
  const [rpeHelp, setRpeHelp] = useState(false);

  const startedAt = useRef(new Date());
  const prior = useRef<LoggedSession[]>([]);

  useEffect(() => {
    if (phase !== "active") return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current.getTime()) / 1000));
      if (restSince) {
        const rn = Math.floor((Date.now() - restSince) / 1000);
        setRestNow(rn);
        // Buzz once when the chosen rest target is reached — eyes-off cue.
        if (restTarget && rn >= restTarget && !restFired.current) {
          restFired.current = true;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, restSince, restTarget]);

  // Load prior sessions once — to detect PRs at the finish, and to prefill an
  // AI / repeat-last start. Guests read their own on-device history. An empty
  // start resumes an in-progress draft if one exists (never lose a workout).
  useEffect(() => {
    (async () => {
      const sessions = guest
        ? (await listGuestSessions()).map(guestToLogged)
        : await fetchSessions();
      prior.current = sessions;
      setRecent(exerciseHistory(sessions));

      if (source === "last") {
        await clearDraft();
        const last = sessions[0];
        if (last) {
          setTitle(last.title || "Workout");
          setExercises(blocksToExercises(last.blocks));
        }
      } else if (source === "ai") {
        await clearDraft();
        const log = toTrainingLog(sessions);
        const rx = prescribeSession(log, undefined, { profiles: velocityProfiles(sessions) });
        setReadiness(rx.readiness);
        setTitle("AI session");
        setExercises(blocksToExercises(rx.blocks as SessionBlock[]));
      } else if (source === "new") {
        // Deliberate fresh start — drop any interrupted draft.
        await clearDraft();
      } else {
        const draft = await loadDraft();
        if (draft) {
          startedAt.current = new Date(draft.startedAt);
          setTitle(draft.title);
          setExercises(draft.exercises as WExercise[]);
        }
      }
      setRestored(true);
    })();
  }, [source, guest]);

  // Persist the in-progress draft as it changes (debounced) so it survives a
  // crash / kill. Only after the initial restore, so we never clobber a draft.
  useEffect(() => {
    if (!restored) return;
    const id = setTimeout(() => {
      if (exercises.length) saveDraft({ title, startedAt: startedAt.current.toISOString(), exercises });
      else clearDraft();
    }, 500);
    return () => clearTimeout(id);
  }, [exercises, title, restored]);

  const addExercise = (name: string, kind?: "strength" | "conditioning") => {
    const clean = name.trim();
    if (!clean) return;
    setExercises((xs) => [...xs, newExercise(clean, kind)]);
    setPickerOpen(false);
    setCustom("");
  };
  const removeExercise = (u: string) => setExercises((xs) => xs.filter((x) => x.uid !== u));
  const rename = (u: string, name: string) =>
    setExercises((xs) => xs.map((x) => (x.uid === u ? { ...x, name } : x)));
  const setSetField = (u: string, i: number, k: keyof WSet, v: string | boolean) =>
    setExercises((xs) =>
      xs.map((x) => (x.uid === u ? { ...x, sets: x.sets.map((s, j) => (j === i ? { ...s, [k]: v } : s)) } : x)),
    );
  const condField = (u: string, k: "minutes" | "rpe" | "distance", v: string) =>
    setExercises((xs) => xs.map((x) => (x.uid === u ? { ...x, [k]: v } : x)));
  const addSet = (u: string) =>
    setExercises((xs) =>
      xs.map((x) => (x.uid === u ? { ...x, sets: [...x.sets, emptySet(x.sets[x.sets.length - 1])] } : x)),
    );
  // A drop set is a lighter continuation of the previous set (no rest), added pre-flagged.
  const addDropSet = (u: string) =>
    setExercises((xs) =>
      xs.map((x) => (x.uid === u ? { ...x, sets: [...x.sets, { ...emptySet(), drop: true }] } : x)),
    );
  const toggleDrop = (u: string, i: number) =>
    setExercises((xs) =>
      xs.map((x) => (x.uid === u ? { ...x, sets: x.sets.map((s, j) => (j === i ? { ...s, drop: !s.drop } : s)) } : x)),
    );
  // Superset: group this exercise with the one directly above it (A1/A2/A3…).
  const supersetWithPrev = (u: string) =>
    setExercises((xs) => toggleSuperset(xs, xs.findIndex((x) => x.uid === u), uid));
  const removeSet = (u: string, i: number) =>
    setExercises((xs) => xs.map((x) => (x.uid === u ? { ...x, sets: x.sets.filter((_, j) => j !== i) } : x)));
  const toggleDone = (u: string, i: number, val: boolean) => {
    setSetField(u, i, "done", val);
    if (val) {
      setRestSince(Date.now());
      setRestNow(0);
      restFired.current = false;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  };
  const pickRest = (sec: number) => {
    setRestTarget((cur) => (cur === sec ? null : sec));
    restFired.current = false;
  };

  const buildBlocks = (): SessionBlock[] => {
    const blocks: SessionBlock[] = [];
    for (const x of exercises) {
      if (x.kind === "conditioning") {
        const minutes = parseFloat(x.minutes);
        const rpe = parseFloat(x.rpe);
        const distance = parseFloat(x.distance);
        if (!Number.isFinite(minutes) && !Number.isFinite(rpe) && !Number.isFinite(distance)) continue;
        blocks.push({
          kind: "conditioning",
          name: x.name,
          ...(Number.isFinite(distance) ? { distance } : {}),
          ...(Number.isFinite(minutes) ? { minutes } : {}),
          ...(Number.isFinite(rpe) ? { rpe } : {}),
        });
      } else {
        const sets = x.sets
          .filter((s) => s.reps.trim() || s.load.trim())
          .map((s) => ({
            load: s.load.trim(),
            reps: s.reps.trim(),
            ...(s.rpe.trim() ? { rpe: s.rpe.trim() } : {}),
            ...(s.drop ? { drop: true } : {}),
          }));
        if (sets.length) blocks.push({ kind: "strength", name: x.name, sets, ...(x.group ? { group: x.group } : {}) });
      }
    }
    return blocks;
  };

  const finish = async () => {
    const blocks = buildBlocks();
    if (!blocks.length) {
      setError(t("workout.minSet"));
      return;
    }
    setSaving(true);
    setError("");
    const now = new Date();
    const payload: NewSession = {
      title: title.trim() || "Workout",
      readiness,
      startedAt: startedAt.current.toISOString(),
      completedAt: now.toISOString(),
      blocks,
    };

    let pending = false;
    if (guest) {
      // No account yet — keep it on the device until they sign up.
      await saveGuestSession(payload);
    } else {
      const ok = await createSession(payload);
      if (!ok) {
        // Offline / server hiccup — never lose the workout. Stash it locally;
        // it syncs on the next foreground / sign-in (see lib/guest + session).
        await saveGuestSession(payload);
        pending = true;
      }
    }
    await clearDraft();
    setSaving(false);
    const sets = blocks.reduce((n, b) => n + (b.kind === "strength" ? b.sets.length : 1), 0);

    // PRs: compare this session against everything done before it.
    const finished: LoggedSession = {
      id: "new",
      title: payload.title,
      startedAt: payload.startedAt!,
      completedAt: payload.completedAt,
      blocks,
    };
    const prs = newPrsInSession(finished, prior.current);
    const prSet = new Set(prs.map((p) => p.lift));
    const bestMap = new Map<string, number>();
    for (const b of blocks)
      if (b.kind === "strength") {
        const e = Math.round(blockBestE1rm(b));
        if (e > 0) bestMap.set(b.name, Math.max(bestMap.get(b.name) ?? 0, e));
      }
    const bests: ShareBest[] = [...bestMap.entries()]
      .map(([name, e1rm]) => ({ name, e1rm, pr: prSet.has(name) }))
      .sort((a, b) => b.e1rm - a.e1rm);

    setSummary({
      title: payload.title,
      blocks,
      volume: sessionVolume(blocks),
      sets,
      minutes: Math.max(1, Math.round((now.getTime() - startedAt.current.getTime()) / 60000)),
      guest,
      pending,
      bests,
      prs,
    });
    setPhase("done");
  };

  if (phase === "done" && summary) return <Summary summary={summary} router={router} t={t} />;

  const ssLabels = supersetLabels(exercises);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.ink }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 64 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>{t("workout.cancel")}</Text>
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk, letterSpacing: 1 }}>{mmss(elapsed)}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1 }}>{t("workout.elapsed")}</Text>
        </View>
        <Pressable onPress={finish} disabled={saving} style={{ width: 64, alignItems: "flex-end" }} hitSlop={10}>
          <Text style={{ fontFamily: F.black, fontSize: 14, color: saving ? C.ash : C.lime }}>
            {saving ? "…" : t("workout.finish")}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={t("workout.nameWorkout")}
          placeholderTextColor={C.ash}
          style={{ fontFamily: F.black, fontSize: 24, color: C.chalk, marginBottom: 4 }}
        />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <Mono style={{ flex: 1 }}>
            {exercises.length
              ? `${exercises.length} ${t("workout.exercises")} · ${t("workout.tapAsYouGo")}`
              : t("workout.firstExercise")}
          </Mono>
          <Pressable onPress={() => setRpeHelp(true)} hitSlop={8}>
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.blue }}>{t("workout.rpeWhat")}</Text>
          </Pressable>
        </View>

        {restSince != null && (() => {
          const done = restTarget != null && restNow >= restTarget;
          const accent = done ? C.lime : C.blue;
          return (
            <View style={{ backgroundColor: `${accent}14`, borderWidth: 1, borderColor: `${accent}44`, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: F.bold, fontSize: 13, color: accent }}>
                  {done ? t("workout.restDone") : t("workout.resting")} · {mmss(restNow)}{restTarget ? ` / ${mmss(restTarget)}` : ""}
                </Text>
                <Pressable onPress={() => setRestSince(null)} hitSlop={8}>
                  <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.ash }}>{t("workout.dismiss")}</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 10 }}>
                {[60, 90, 120, 180].map((sec) => {
                  const on = restTarget === sec;
                  return (
                    <Pressable
                      key={sec}
                      onPress={() => pickRest(sec)}
                      style={{ flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: on ? C.blue : C.line, backgroundColor: on ? `${C.blue}22` : "transparent" }}
                    >
                      <Text style={{ fontFamily: F.mono, fontSize: 12, color: on ? C.blue : C.ash }}>{sec < 120 ? `${sec}s` : `${sec / 60}m`}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })()}

        {exercises.map((x, xi) => (
          <Card key={x.uid}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 9, color: x.kind === "strength" ? C.lime : C.blue }}>
                {x.kind.toUpperCase()}
              </Text>
              {ssLabels[xi] && (
                <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.lime, backgroundColor: `${C.lime}1f`, borderWidth: 1, borderColor: `${C.lime}55`, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>⛓ {ssLabels[xi]}</Text>
              )}
              <TextInput value={x.name} onChangeText={(v) => rename(x.uid, v)} style={{ flex: 1, fontFamily: F.bold, fontSize: 16, color: C.chalk }} />
              {x.kind === "strength" && xi > 0 && exercises[xi - 1]?.kind === "strength" && (
                <Pressable
                  onPress={() => supersetWithPrev(x.uid)}
                  hitSlop={6}
                  style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: isSupersettedWithPrev(exercises, xi) ? C.lime : C.line, backgroundColor: isSupersettedWithPrev(exercises, xi) ? `${C.lime}1f` : "transparent" }}
                >
                  <Text style={{ fontFamily: F.mono, fontSize: 11, color: isSupersettedWithPrev(exercises, xi) ? C.lime : C.ash }}>⛓ {isSupersettedWithPrev(exercises, xi) ? t("workout.supersetJoined") : t("workout.supersetUp")}</Text>
                </Pressable>
              )}
              <Pressable onPress={() => removeExercise(x.uid)} hitSlop={8}>
                <Text style={{ color: C.ash, fontSize: 15 }}>✕</Text>
              </Pressable>
            </View>

            {x.kind === "strength" ? (
              <>
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 4 }}>
                  <ColHead w={28}>#</ColHead>
                  <ColHead>KG</ColHead>
                  <ColHead>REPS</ColHead>
                  <ColHead>RPE</ColHead>
                  <View style={{ width: 40 }} />
                </View>
                {x.sets.map((s, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: 6, alignItems: "center", marginBottom: 6 }}>
                    <Pressable
                      onPress={() => toggleDrop(x.uid, i)}
                      onLongPress={() => removeSet(x.uid, i)}
                      style={{ width: 28, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: s.drop ? 1 : 0, borderColor: C.lime, backgroundColor: s.drop ? `${C.lime}1f` : "transparent" }}
                    >
                      <Text style={{ fontFamily: F.mono, fontSize: 13, color: s.drop ? C.lime : C.ash }}>{s.drop ? "↓" : i + 1}</Text>
                    </Pressable>
                    <Cell value={s.load} onChange={(v) => setSetField(x.uid, i, "load", v)} done={s.done} />
                    <Cell value={s.reps} onChange={(v) => setSetField(x.uid, i, "reps", v)} done={s.done} />
                    <Cell value={s.rpe} onChange={(v) => setSetField(x.uid, i, "rpe", v)} done={s.done} />
                    <Pressable
                      onPress={() => toggleDone(x.uid, i, !s.done)}
                      style={{ width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: s.done ? C.lime : C.ink2, borderWidth: 1, borderColor: s.done ? C.lime : C.line }}
                    >
                      <Text style={{ fontSize: 16, color: s.done ? C.ink : C.ash, fontFamily: F.black }}>✓</Text>
                    </Pressable>
                  </View>
                ))}
                <View style={{ flexDirection: "row", gap: 16 }}>
                  <Pressable onPress={() => addSet(x.uid)} style={{ paddingVertical: 8 }}>
                    <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.lime }}>{t("workout.set")}</Text>
                  </Pressable>
                  <Pressable onPress={() => addDropSet(x.uid)} style={{ paddingVertical: 8 }}>
                    <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.ash }}>{t("workout.dropSet")}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <ColHead>{t("workout.dist")}</ColHead>
                    <Cell value={x.distance ?? ""} onChange={(v) => condField(x.uid, "distance", v)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ColHead>MIN</ColHead>
                    <Cell value={x.minutes} onChange={(v) => condField(x.uid, "minutes", v)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ColHead>RPE</ColHead>
                    <Cell value={x.rpe} onChange={(v) => condField(x.uid, "rpe", v)} />
                  </View>
                </View>
                {(() => {
                  const pace = pacePerKm({ kind: "conditioning", name: x.name, distance: parseFloat(x.distance), minutes: parseFloat(x.minutes) });
                  return pace ? (
                    <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.blue, marginTop: 8 }}>{t("workout.pace")} {pace}</Text>
                  ) : null;
                })()}
              </>
            )}
          </Card>
        ))}

        {pickerOpen ? (() => {
          const q = custom.trim().toLowerCase();
          const match = (n: string) => !q || n.toLowerCase().includes(q);
          const recentNames = new Set(recent.map((r) => r.name));
          const recentShown = recent.filter((r) => match(r.name)).slice(0, 10);
          const libShown = Object.keys(MOVEMENTS).filter((n) => !recentNames.has(n) && match(n));
          const exact = [...recentNames, ...Object.keys(MOVEMENTS)].some((n) => n.toLowerCase() === q);
          const chip = (name: string, kind: "strength" | "conditioning", key: string) => (
            <Pressable
              key={key}
              onPress={() => addExercise(name, kind)}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: kind === "conditioning" ? `${C.blue}55` : `${C.lime}55`, backgroundColor: kind === "conditioning" ? `${C.blue}1f` : `${C.lime}1f` }}
            >
              <Text style={{ fontFamily: F.semi, fontSize: 13, color: kind === "conditioning" ? C.blue : C.lime }}>{name}</Text>
            </Pressable>
          );
          return (
            <Card>
              <Kicker color={C.lime}>{t("workout.pickExercise")}</Kicker>
              <TextInput
                value={custom}
                onChangeText={setCustom}
                placeholder={t("workout.search")}
                placeholderTextColor={C.ash}
                autoFocus
                onSubmitEditing={() => addExercise(custom)}
                style={{ fontFamily: F.reg, fontSize: 15, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, marginTop: 10 }}
              />

              {recentShown.length > 0 && (
                <>
                  <Kicker color={C.ash}>{t("workout.yourLifts")}</Kicker>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, marginBottom: 4 }}>
                    {recentShown.map((r) => chip(r.name, r.kind, `r-${r.name}`))}
                  </View>
                </>
              )}

              {libShown.length > 0 && (
                <>
                  {recentShown.length > 0 && <Kicker color={C.ash}>{t("workout.library")}</Kicker>}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {libShown.map((name) => chip(name, isCond(name) ? "conditioning" : "strength", `l-${name}`))}
                  </View>
                </>
              )}

              {q.length > 0 && !exact && (
                <Pressable onPress={() => addExercise(custom)} style={{ marginTop: 14, borderRadius: 10, backgroundColor: C.lime, paddingVertical: 12, alignItems: "center" }}>
                  <Text style={{ fontFamily: F.black, fontSize: 14, color: C.ink }}>+ “{custom.trim()}”</Text>
                </Pressable>
              )}

              <Pressable onPress={() => { setPickerOpen(false); setCustom(""); }} style={{ paddingTop: 12 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash, textAlign: "center" }}>{t("workout.close")}</Text>
              </Pressable>
            </Card>
          );
        })() : (
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={{ borderWidth: 1, borderColor: C.lime, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 4 }}
          >
            <Text style={{ fontFamily: F.black, fontSize: 15, color: C.lime }}>{t("workout.addExercise")}</Text>
          </Pressable>
        )}

        {!!error && <Mono color={C.red} style={{ marginTop: 14, textAlign: "center" }}>{error}</Mono>}

        {exercises.length > 0 && (
          <Pressable
            onPress={finish}
            disabled={saving}
            style={{ backgroundColor: C.lime, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 18, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? <ActivityIndicator color={C.ink} /> : <Text style={{ fontFamily: F.black, fontSize: 16, color: C.ink }}>{t("workout.finishWorkout")}</Text>}
          </Pressable>
        )}
      </ScrollView>

      <RpeHelpModal visible={rpeHelp} onClose={() => setRpeHelp(false)} t={t} />
    </SafeAreaView>
  );
}

// The RPE cheatsheet — same scale (from @hybrid/core) the web logger shows.
function RpeHelpModal({ visible, onClose, t }: { visible: boolean; onClose: () => void; t: (k: string) => string }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "#0009", justifyContent: "flex-end" }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: C.ink, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.line, padding: 20, paddingBottom: 36 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>{t("rpe.title")}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>{t("rpe.close")}</Text>
            </Pressable>
          </View>
          <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.ash, lineHeight: 19, marginBottom: 16 }}>{RPE_INTRO}</Text>
          <View style={{ flexDirection: "row", marginBottom: 6 }}>
            <Text style={{ width: 40, fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1 }}>RPE</Text>
            <Text style={{ width: 56, fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1 }}>{t("rpe.rir")}</Text>
            <Text style={{ flex: 1, fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1 }}>{t("rpe.feels")}</Text>
          </View>
          {RPE_SCALE.map((step) => (
            <View key={step.rpe} style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 5, borderTopWidth: 1, borderTopColor: C.line }}>
              <Text style={{ width: 40, fontFamily: F.bold, fontSize: 14, color: C.lime }}>{step.rpe}</Text>
              <Text style={{ width: 56, fontFamily: F.mono, fontSize: 13, color: C.chalk }}>{step.rir}</Text>
              <Text style={{ flex: 1, fontFamily: F.reg, fontSize: 13, color: C.chalk }}>{step.meaning}</Text>
            </View>
          ))}
          <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.ash, lineHeight: 18, marginTop: 14 }}>{RPE_CARDIO_NOTE}</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Summary({
  summary,
  router,
  t,
}: {
  summary: Summ;
  router: ReturnType<typeof useRouter>;
  t: (k: string) => string;
}) {
  const cardRef = useRef<View>(null);
  const { title, prs, bests } = summary;

  const prLine = (p: PrHit) =>
    p.previous == null
      ? `${p.lift} ${p.e1rm}kg (${t("summary.firstTime")})`
      : `${p.lift} ${p.e1rm}kg (+${p.e1rm - p.previous})`;

  const shareText = [
    `\u{1F4AA} ${title || "Workout"} — ${t("share.done")}`,
    `${summary.minutes} min · ${summary.sets} ${t("summary.sets").toLowerCase()} · ${summary.volume.toLocaleString()} kg`,
    prs[0]
      ? `\u{1F3C6} ${prLine(prs[0])}`
      : bests[0]
        ? `${t("share.topLift")}: ${bests[0].name} ${bests[0].e1rm}kg`
        : null,
    t("share.tracked"),
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.ink }} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, flexGrow: 1 }}>
        <View style={{ alignItems: "center", marginTop: 20, marginBottom: 8 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: `${C.lime}1f`, borderWidth: 2, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 34, color: C.lime, fontFamily: F.black }}>✓</Text>
          </View>
          <Text style={{ fontFamily: F.black, fontSize: 28, color: C.chalk, marginTop: 16, textAlign: "center" }}>{t("summary.complete")}</Text>
        </View>

        {/* PR celebration — the reason to keep coming back */}
        {prs.length > 0 && (
          <View style={{ backgroundColor: `${C.lime}14`, borderWidth: 1, borderColor: C.lime, borderRadius: 16, padding: 16, marginTop: 12 }}>
            <Text style={{ fontFamily: F.black, fontSize: 16, color: C.lime }}>
              🏆 {prs.length} {t("summary.newPrs")}
            </Text>
            {prs.slice(0, 4).map((p) => (
              <Text key={p.lift} style={{ fontFamily: F.mono, fontSize: 12, color: C.chalk, marginTop: 6 }}>
                {prLine(p)}
              </Text>
            ))}
          </View>
        )}

        <View style={{ marginTop: 14 }}>
          <WorkoutShareCard
            ref={cardRef}
            t={t}
            stats={{ title, minutes: summary.minutes, sets: summary.sets, volume: summary.volume, bests }}
          />
        </View>

        <Pressable
          onPress={() => shareWorkout(cardRef, shareText, t("summary.share"))}
          style={{ backgroundColor: C.lime, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 14 }}
        >
          <Text style={{ fontFamily: F.black, fontSize: 16, color: C.ink }}>{t("summary.share")}</Text>
        </Pressable>

        <View style={{ flex: 1, minHeight: 24 }} />

        {summary.pending && (
          <View style={{ backgroundColor: `${C.amber}14`, borderWidth: 1, borderColor: `${C.amber}55`, borderRadius: 14, padding: 14, marginTop: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.amber }}>⟲ {t("summary.pendingSync")}</Text>
          </View>
        )}

        {summary.guest ? (
          <>
            <View style={{ backgroundColor: `${C.violet}14`, borderWidth: 1, borderColor: `${C.violet}55`, borderRadius: 14, padding: 14, marginTop: 16 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.violet }}>✓ {t("summary.guestSaved")}</Text>
            </View>
            <Pressable
              onPress={() => router.replace("/login?mode=signup")}
              style={{ backgroundColor: C.violet, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 12 }}
            >
              <Text style={{ fontFamily: F.black, fontSize: 16, color: C.chalk }}>{t("summary.guestSave")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.chalk, opacity: 0.8, marginTop: 3 }}>{t("summary.guestSaveSub")}</Text>
            </Pressable>
            <Pressable onPress={() => router.replace("/welcome")} style={{ paddingVertical: 16, alignItems: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>{t("summary.notNow")}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Mono style={{ textAlign: "center", marginTop: 24, marginBottom: 8 }}>{t("summary.digDetail")}</Mono>
            <Pressable
              onPress={() => router.replace("/(tabs)/history")}
              style={{ borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 15, alignItems: "center" }}
            >
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{t("summary.seeAnalysis")}</Text>
            </Pressable>
            <Pressable onPress={() => router.replace("/(tabs)")} style={{ paddingVertical: 16, alignItems: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>{t("summary.doneToday")}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function blocksToExercises(blocks: SessionBlock[]): WExercise[] {
  return blocks.map((b) =>
    b.kind === "strength"
      ? {
          uid: uid(),
          name: b.name,
          kind: "strength" as const,
          sets: (b.sets.length ? b.sets : [{ load: "", reps: "", rpe: "" }]).map((s) => ({
            load: s.load ?? "",
            reps: s.reps ?? "",
            rpe: s.rpe ?? "",
            done: false,
            ...(s.drop ? { drop: true } : {}),
          })),
          minutes: "",
          rpe: "",
          distance: "",
          ...(b.group ? { group: b.group } : {}),
        }
      : {
          uid: uid(),
          name: b.name,
          kind: "conditioning" as const,
          sets: [emptySet()],
          minutes: b.minutes != null ? String(b.minutes) : "",
          rpe: b.rpe != null ? String(b.rpe) : "",
          distance: b.distance != null ? String(b.distance) : "",
        },
  );
}

function Cell({ value, onChange, done }: { value: string; onChange: (v: string) => void; done?: boolean }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      keyboardType="numeric"
      style={{ flex: 1, fontFamily: F.mono, fontSize: 16, color: done ? C.ash : C.chalk, textAlign: "center", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 10 }}
    />
  );
}

function ColHead({ children, w }: { children: React.ReactNode; w?: number }) {
  return (
    <Text style={{ flex: w ? undefined : 1, width: w, textAlign: "center", fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1 }}>
      {children}
    </Text>
  );
}
