import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Share, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  prescribeSession,
  toTrainingLog,
  velocityProfiles,
  sessionVolume,
  blockBestE1rm,
  MOVEMENTS,
  SAMPLE_TRAINING_LOG,
  SAMPLE_BIOMETRICS,
  type SessionBlock,
  type StrengthBlock,
  type LoggedSession,
} from "@hybrid/core";
import { fetchSessions, createSession } from "../lib/api";
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

export default function Workout() {
  const router = useRouter();
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
  const [summary, setSummary] = useState<{ blocks: SessionBlock[]; volume: number; sets: number; minutes: number } | null>(null);

  const startedAt = useRef(new Date());

  // Live elapsed clock while training.
  useEffect(() => {
    if (phase !== "active") return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current.getTime()) / 1000));
      if (restSince) setRestNow(Math.floor((Date.now() - restSince) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [phase, restSince]);

  // Prefill: AI-prescribed or repeat-last. Empty start needs no fetch.
  useEffect(() => {
    if (source !== "ai" && source !== "last") return;
    fetchSessions().then((sessions) => {
      if (source === "last") {
        const last = sessions[0];
        if (last) {
          setTitle(last.title || "Workout");
          setExercises(blocksToExercises(last.blocks));
        }
      } else {
        const log = sessions.length ? toTrainingLog(sessions) : SAMPLE_TRAINING_LOG;
        const rx = prescribeSession(log, SAMPLE_BIOMETRICS, { profiles: velocityProfiles(sessions) });
        setReadiness(rx.readiness);
        setTitle("AI session");
        setExercises(blocksToExercises(rx.blocks as SessionBlock[]));
      }
    });
  }, [source]);

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
  const setField = (u: string, i: number, k: keyof WSet, v: string | boolean) =>
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
    setExercises((xs) =>
      xs.map((x) => (x.uid === u ? { ...x, sets: x.sets.filter((_, j) => j !== i) } : x)),
    );
  const toggleDone = (u: string, i: number, val: boolean) => {
    setField(u, i, "done", val);
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
      setError("Log at least one set to finish.");
      return;
    }
    setSaving(true);
    setError("");
    const now = new Date();
    const ok = await createSession({
      title: title.trim() || "Workout",
      readiness,
      startedAt: startedAt.current.toISOString(),
      completedAt: now.toISOString(),
      blocks,
    });
    setSaving(false);
    if (!ok) {
      setError("Couldn't save — check your connection and try again.");
      return;
    }
    const sets = blocks.reduce((n, b) => n + (b.kind === "strength" ? b.sets.length : 1), 0);
    setSummary({
      blocks,
      volume: sessionVolume(blocks),
      sets,
      minutes: Math.max(1, Math.round((now.getTime() - startedAt.current.getTime()) / 60000)),
    });
    setPhase("done");
  };

  const discard = () => {
    if (!exercises.length) return router.back();
    // Soft discard — go back to the launcher; nothing was saved.
    router.back();
  };

  if (phase === "done" && summary) return <Summary title={title} summary={summary} router={router} />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.ink }} edges={["top"]}>
      {/* Live header: timer + finish — the only chrome during training */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <Pressable onPress={discard} hitSlop={10} style={{ width: 64 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>Cancel</Text>
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk, letterSpacing: 1 }}>{mmss(elapsed)}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1 }}>ELAPSED</Text>
        </View>
        <Pressable
          onPress={finish}
          disabled={saving}
          style={{ width: 64, alignItems: "flex-end" }}
          hitSlop={10}
        >
          <Text style={{ fontFamily: F.black, fontSize: 14, color: saving ? C.ash : C.lime }}>
            {saving ? "…" : "Finish"}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Name this workout"
          placeholderTextColor={C.ash}
          style={{ fontFamily: F.black, fontSize: 24, color: C.chalk, marginBottom: 4 }}
        />
        <Mono style={{ marginBottom: 14 }}>
          {exercises.length ? `${exercises.length} exercise${exercises.length > 1 ? "s" : ""} · tap ✓ as you go` : "Add your first exercise to begin"}
        </Mono>

        {/* Rest timer — appears after you complete a set */}
        {restSince != null && (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: `${C.blue}14`, borderWidth: 1, borderColor: `${C.blue}44`, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 14 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.blue }}>Resting · {mmss(restNow)}</Text>
            <Pressable onPress={() => setRestSince(null)} hitSlop={8}>
              <Text style={{ fontFamily: F.semi, fontSize: 12, color: C.ash }}>dismiss</Text>
            </Pressable>
          </View>
        )}

        {exercises.map((x) => (
          <Card key={x.uid}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 9, color: x.kind === "strength" ? C.lime : C.blue }}>
                {x.kind.toUpperCase()}
              </Text>
              <TextInput
                value={x.name}
                onChangeText={(v) => rename(x.uid, v)}
                style={{ flex: 1, fontFamily: F.bold, fontSize: 16, color: C.chalk }}
              />
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
                    <Cell value={s.load} onChange={(v) => setField(x.uid, i, "load", v)} done={s.done} />
                    <Cell value={s.reps} onChange={(v) => setField(x.uid, i, "reps", v)} done={s.done} />
                    <Cell value={s.rpe} onChange={(v) => setField(x.uid, i, "rpe", v)} done={s.done} />
                    <Pressable
                      onPress={() => toggleDone(x.uid, i, !s.done)}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: s.done ? C.lime : C.ink2,
                        borderWidth: 1,
                        borderColor: s.done ? C.lime : C.line,
                      }}
                    >
                      <Text style={{ fontSize: 16, color: s.done ? C.ink : C.ash, fontFamily: F.black }}>✓</Text>
                    </Pressable>
                  </View>
                ))}
                <Pressable onPress={() => addSet(x.uid)} style={{ paddingVertical: 8 }}>
                  <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.lime }}>+ Set</Text>
                </Pressable>
              </>
            ) : (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <ColHead>MINUTES</ColHead>
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

        {/* Exercise picker */}
        {pickerOpen ? (
          <Card>
            <Kicker color={C.lime}>Pick an exercise</Kicker>
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
                placeholder="Or type your own…"
                placeholderTextColor={C.ash}
                onSubmitEditing={() => addExercise(custom)}
                style={{ flex: 1, fontFamily: F.reg, fontSize: 14, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
              />
              <Pressable onPress={() => addExercise(custom)} style={{ paddingHorizontal: 16, justifyContent: "center", borderRadius: 10, backgroundColor: C.lime }}>
                <Text style={{ fontFamily: F.black, fontSize: 14, color: C.ink }}>Add</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => setPickerOpen(false)} style={{ paddingTop: 12 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash, textAlign: "center" }}>close</Text>
            </Pressable>
          </Card>
        ) : (
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={{ borderWidth: 1, borderColor: C.lime, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 4 }}
          >
            <Text style={{ fontFamily: F.black, fontSize: 15, color: C.lime }}>+ Add exercise</Text>
          </Pressable>
        )}

        {!!error && <Mono color={C.red} style={{ marginTop: 14, textAlign: "center" }}>{error}</Mono>}

        {exercises.length > 0 && (
          <Pressable
            onPress={finish}
            disabled={saving}
            style={{ backgroundColor: C.lime, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 18, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? (
              <ActivityIndicator color={C.ink} />
            ) : (
              <Text style={{ fontFamily: F.black, fontSize: 16, color: C.ink }}>Finish workout</Text>
            )}
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Summary({
  title,
  summary,
  router,
}: {
  title: string;
  summary: { blocks: SessionBlock[]; volume: number; sets: number; minutes: number };
  router: ReturnType<typeof useRouter>;
}) {
  const prs = useMemo(
    () =>
      summary.blocks
        .filter((b): b is StrengthBlock => b.kind === "strength")
        .map((b) => ({ name: b.name, e1rm: Math.round(blockBestE1rm(b)) }))
        .filter((p) => p.e1rm > 0)
        .sort((a, b) => b.e1rm - a.e1rm),
    [summary],
  );

  const share = async () => {
    const lines = [
      `\u{1F4AA} ${title || "Workout"} — done.`,
      `${summary.minutes} min · ${summary.sets} sets · ${summary.volume.toLocaleString()} kg moved`,
      prs[0] ? `Top lift: ${prs[0].name} e1RM ${prs[0].e1rm}kg` : null,
      `Tracked with HYBRID.`,
    ].filter(Boolean);
    try {
      await Share.share({ message: lines.join("\n") });
    } catch {
      /* user dismissed the share sheet */
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.ink }} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, flexGrow: 1 }}>
        <View style={{ alignItems: "center", marginTop: 24, marginBottom: 8 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: `${C.lime}1f`, borderWidth: 2, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 34, color: C.lime, fontFamily: F.black }}>✓</Text>
          </View>
          <Text style={{ fontFamily: F.black, fontSize: 28, color: C.chalk, marginTop: 16, textAlign: "center" }}>Workout complete</Text>
          <Mono style={{ marginTop: 4 }}>{title || "Workout"}</Mono>
        </View>

        {/* Shareable stat card */}
        <Card style={{ marginTop: 16, borderColor: `${C.lime}55` }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Stat label="MINUTES" value={String(summary.minutes)} />
            <Stat label="SETS" value={String(summary.sets)} />
            <Stat label="KG MOVED" value={summary.volume.toLocaleString()} />
          </View>
          {prs.length > 0 && (
            <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }}>
              <Kicker>Today&apos;s bests (est. 1RM)</Kicker>
              {prs.slice(0, 4).map((p) => (
                <View key={p.name} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
                  <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.chalk }}>{p.name}</Text>
                  <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.lime }}>{p.e1rm} kg</Text>
                </View>
              ))}
            </View>
          )}
        </Card>

        <Pressable
          onPress={share}
          style={{ backgroundColor: C.lime, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 8 }}
        >
          <Text style={{ fontFamily: F.black, fontSize: 16, color: C.ink }}>Share your win</Text>
        </Pressable>

        <View style={{ flex: 1 }} />

        <Mono style={{ textAlign: "center", marginTop: 24, marginBottom: 8 }}>Back home? Dig into the detail.</Mono>
        <Pressable
          onPress={() => router.replace("/(tabs)/history")}
          style={{ borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 15, alignItems: "center" }}
        >
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>See your analysis →</Text>
        </Pressable>
        <Pressable onPress={() => router.replace("/(tabs)")} style={{ paddingVertical: 16, alignItems: "center" }}>
          <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>Done — back to Today</Text>
        </Pressable>
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
      style={{
        flex: 1,
        fontFamily: F.mono,
        fontSize: 16,
        color: done ? C.ash : C.chalk,
        textAlign: "center",
        backgroundColor: C.ink2,
        borderWidth: 1,
        borderColor: C.line,
        borderRadius: 10,
        paddingVertical: 10,
      }}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ fontFamily: F.black, fontSize: 26, color: C.chalk }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, marginTop: 2 }}>{label}</Text>
    </View>
  );
}
