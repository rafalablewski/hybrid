import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  prescribeSession,
  toTrainingLog,
  velocityProfiles,
  sessionVolume,
  blockBestE1rm,
  newPrsInSession,
  MOVEMENTS,
  SAMPLE_TRAINING_LOG,
  SAMPLE_BIOMETRICS,
  type SessionBlock,
  type LoggedSession,
  type PrHit,
} from "@hybrid/core";
import { fetchSessions, createSession, type NewSession } from "../lib/api";
import { saveGuestSession, listGuestSessions } from "../lib/guest";
import { WorkoutShareCard, shareWorkout, type ShareBest } from "../lib/share";
import { useSession } from "../lib/session";
import { useLang } from "../lib/i18n";
import { C, F, Mono, Kicker, Card } from "../lib/ui";

const uid = () => Math.random().toString(36).slice(2);
const isCond = (name: string) => {
  const m = MOVEMENTS[name];
  return !!m && (m.system != null || m.pattern === "cond");
};

type WSet = { reps: string; load: string; rpe: string; done: boolean };
type WExercise = {
  uid: string;
  name: string;
  kind: "strength" | "conditioning";
  sets: WSet[];
  minutes: string;
  rpe: string;
};

const emptySet = (from?: WSet): WSet => ({
  reps: from?.reps ?? "",
  load: from?.load ?? "",
  rpe: from?.rpe ?? "",
  done: false,
});

const newExercise = (name: string): WExercise => ({
  uid: uid(),
  name,
  kind: isCond(name) ? "conditioning" : "strength",
  sets: [emptySet()],
  minutes: "",
  rpe: "",
});

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

type Summ = {
  title: string;
  blocks: SessionBlock[];
  volume: number;
  sets: number;
  minutes: number;
  guest: boolean;
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
  const [readiness, setReadiness] = useState<number | undefined>(undefined);
  const [summary, setSummary] = useState<Summ | null>(null);

  const startedAt = useRef(new Date());
  const prior = useRef<LoggedSession[]>([]);

  useEffect(() => {
    if (phase !== "active") return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current.getTime()) / 1000));
      if (restSince) setRestNow(Math.floor((Date.now() - restSince) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [phase, restSince]);

  // Load prior sessions once — to detect PRs at the finish, and to prefill an
  // AI / repeat-last start. Guests read their own on-device history.
  useEffect(() => {
    (async () => {
      const sessions = guest
        ? (await listGuestSessions()).map(guestToLogged)
        : await fetchSessions();
      prior.current = sessions;
      if (source === "last") {
        const last = sessions[0];
        if (last) {
          setTitle(last.title || "Workout");
          setExercises(blocksToExercises(last.blocks));
        }
      } else if (source === "ai") {
        const log = sessions.length ? toTrainingLog(sessions) : SAMPLE_TRAINING_LOG;
        const rx = prescribeSession(log, SAMPLE_BIOMETRICS, { profiles: velocityProfiles(sessions) });
        setReadiness(rx.readiness);
        setTitle("AI session");
        setExercises(blocksToExercises(rx.blocks as SessionBlock[]));
      }
    })();
  }, [source, guest]);

  const addExercise = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setExercises((xs) => [...xs, newExercise(clean)]);
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
  const condField = (u: string, k: "minutes" | "rpe", v: string) =>
    setExercises((xs) => xs.map((x) => (x.uid === u ? { ...x, [k]: v } : x)));
  const addSet = (u: string) =>
    setExercises((xs) =>
      xs.map((x) => (x.uid === u ? { ...x, sets: [...x.sets, emptySet(x.sets[x.sets.length - 1])] } : x)),
    );
  const removeSet = (u: string, i: number) =>
    setExercises((xs) => xs.map((x) => (x.uid === u ? { ...x, sets: x.sets.filter((_, j) => j !== i) } : x)));
  const toggleDone = (u: string, i: number, val: boolean) => {
    setSetField(u, i, "done", val);
    if (val) {
      setRestSince(Date.now());
      setRestNow(0);
    }
  };

  const buildBlocks = (): SessionBlock[] => {
    const blocks: SessionBlock[] = [];
    for (const x of exercises) {
      if (x.kind === "conditioning") {
        const minutes = parseFloat(x.minutes);
        const rpe = parseFloat(x.rpe);
        if (!Number.isFinite(minutes) && !Number.isFinite(rpe)) continue;
        blocks.push({
          kind: "conditioning",
          name: x.name,
          ...(Number.isFinite(minutes) ? { minutes } : {}),
          ...(Number.isFinite(rpe) ? { rpe } : {}),
        });
      } else {
        const sets = x.sets
          .filter((s) => s.reps.trim() || s.load.trim())
          .map((s) => ({ load: s.load.trim(), reps: s.reps.trim(), ...(s.rpe.trim() ? { rpe: s.rpe.trim() } : {}) }));
        if (sets.length) blocks.push({ kind: "strength", name: x.name, sets });
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

    if (guest) {
      // No account yet — keep it on the device until they sign up.
      await saveGuestSession(payload);
    } else {
      const ok = await createSession(payload);
      if (!ok) {
        setSaving(false);
        setError(t("workout.saveError"));
        return;
      }
    }
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
      bests,
      prs,
    });
    setPhase("done");
  };

  if (phase === "done" && summary) return <Summary summary={summary} router={router} t={t} />;

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
        <Mono style={{ marginBottom: 14 }}>
          {exercises.length
            ? `${exercises.length} ${t("workout.exercises")} · ${t("workout.tapAsYouGo")}`
            : t("workout.firstExercise")}
        </Mono>

        {restSince != null && (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: `${C.blue}14`, borderWidth: 1, borderColor: `${C.blue}44`, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.blue }}>{t("workout.resting")} · {mmss(restNow)}</Text>
            <Pressable onPress={() => setRestSince(null)} hitSlop={8}>
              <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.ash }}>{t("workout.dismiss")}</Text>
            </Pressable>
          </View>
        )}

        {exercises.map((x) => (
          <Card key={x.uid}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 9, color: x.kind === "strength" ? C.lime : C.blue }}>
                {x.kind.toUpperCase()}
              </Text>
              <TextInput value={x.name} onChangeText={(v) => rename(x.uid, v)} style={{ flex: 1, fontFamily: F.bold, fontSize: 16, color: C.chalk }} />
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
                    <Pressable onLongPress={() => removeSet(x.uid, i)} style={{ width: 28, alignItems: "center" }}>
                      <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>{i + 1}</Text>
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
                <Pressable onPress={() => addSet(x.uid)} style={{ paddingVertical: 8 }}>
                  <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.lime }}>{t("workout.set")}</Text>
                </Pressable>
              </>
            ) : (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <ColHead>MIN</ColHead>
                  <Cell value={x.minutes} onChange={(v) => condField(x.uid, "minutes", v)} />
                </View>
                <View style={{ flex: 1 }}>
                  <ColHead>RPE</ColHead>
                  <Cell value={x.rpe} onChange={(v) => condField(x.uid, "rpe", v)} />
                </View>
              </View>
            )}
          </Card>
        ))}

        {pickerOpen ? (
          <Card>
            <Kicker color={C.lime}>{t("workout.pickExercise")}</Kicker>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              {Object.keys(MOVEMENTS).map((name) => (
                <Pressable
                  key={name}
                  onPress={() => addExercise(name)}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: isCond(name) ? `${C.blue}55` : `${C.lime}55`, backgroundColor: isCond(name) ? `${C.blue}1f` : `${C.lime}1f` }}
                >
                  <Text style={{ fontFamily: F.semi, fontSize: 13, color: isCond(name) ? C.blue : C.lime }}>{name}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
              <TextInput
                value={custom}
                onChangeText={setCustom}
                placeholder={t("workout.typeOwn")}
                placeholderTextColor={C.ash}
                onSubmitEditing={() => addExercise(custom)}
                style={{ flex: 1, fontFamily: F.reg, fontSize: 14, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
              />
              <Pressable onPress={() => addExercise(custom)} style={{ paddingHorizontal: 16, justifyContent: "center", borderRadius: 10, backgroundColor: C.lime }}>
                <Text style={{ fontFamily: F.black, fontSize: 14, color: C.ink }}>{t("common.add")}</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => setPickerOpen(false)} style={{ paddingTop: 12 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash, textAlign: "center" }}>{t("workout.close")}</Text>
            </Pressable>
          </Card>
        ) : (
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
    </SafeAreaView>
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
          })),
          minutes: "",
          rpe: "",
        }
      : {
          uid: uid(),
          name: b.name,
          kind: "conditioning" as const,
          sets: [emptySet()],
          minutes: b.minutes != null ? String(b.minutes) : "",
          rpe: b.rpe != null ? String(b.rpe) : "",
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
