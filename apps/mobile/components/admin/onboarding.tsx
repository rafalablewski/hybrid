import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import type { OnboardingQuestion, OnboardingChoice } from "@hybrid/core";
import { fs, space, Card, Mono, Chip, Loading, F } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { Intro, Banner, ErrorNote, Input, PillBtn, Segmented } from "./_kit";
import { adminGet, adminSend } from "../../lib/admin-api";

// Mobile parity for apps/web/components/admin/onboarding.tsx. Talks to the same
// /api/admin/onboarding-questions backend: full CRUD over the sign-up survey —
// add/edit custom questions (single/multi/number/text), edit the built-ins'
// wording, reorder, enable/disable, delete custom ones. Changes take effect on
// the next sign-up on BOTH clients (no deploy). Soft-degrades when the
// OnboardingQuestion table doesn't exist yet.

type Kind = OnboardingQuestion["kind"];
const CUSTOM_KINDS: { value: Kind; label: string }[] = [
  { value: "single", label: "single" },
  { value: "multi", label: "multi" },
  { value: "number", label: "number" },
  { value: "text", label: "text" },
];

type Draft = {
  id: string;
  key: string;
  kind: Kind;
  title: string;
  subtitle: string;
  engineKey?: string | null;
  choices: OnboardingChoice[];
  min?: number; max?: number; step?: number;
  defaultValue?: string;
  required: boolean;
  enabled: boolean;
  order: number;
  system: boolean;
};

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

function toDraft(q: OnboardingQuestion): Draft {
  return {
    id: q.id, key: q.key, kind: q.kind, title: q.title, subtitle: q.subtitle ?? "", engineKey: q.engineKey ?? null,
    choices: q.choices ? q.choices.map((c) => ({ ...c })) : [], min: q.min, max: q.max, step: q.step,
    defaultValue: q.defaultValue != null ? String(q.defaultValue) : undefined,
    required: !!q.required, enabled: q.enabled, order: q.order, system: !!q.system,
  };
}

function draftToBody(d: Draft): Record<string, unknown> {
  return {
    key: d.key || undefined, kind: d.kind, title: d.title, subtitle: d.subtitle,
    choices: d.kind === "single" || d.kind === "multi" ? d.choices.filter((c) => c.value && c.label) : undefined,
    min: d.kind === "number" ? d.min : undefined, max: d.kind === "number" ? d.max : undefined,
    step: d.kind === "number" ? d.step : undefined, defaultValue: d.defaultValue,
    required: d.required, enabled: d.enabled, order: d.order,
  };
}

export default function AdminOnboarding() {
  const { palette } = useTheme();
  const [questions, setQuestions] = useState<OnboardingQuestion[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // key being edited
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const r = await adminGet<{ questions?: OnboardingQuestion[]; unavailable?: boolean }>("/api/admin/onboarding-questions");
    setUnavailable(Boolean(r.data?.unavailable));
    setQuestions(r.data?.questions ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(body: Record<string, unknown>, closeEditor = true) {
    setBusy(true); setErr(null);
    const r = await adminSend<{ error?: string }>("POST", "/api/admin/onboarding-questions", body);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Couldn't save."); return; }
    if (closeEditor) { setEditing(null); setAdding(false); }
    load();
  }

  function remove(q: OnboardingQuestion) {
    Alert.alert("Delete question", `Delete “${q.title}”? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          setBusy(true); setErr(null);
          const r = await adminSend<{ error?: string }>("DELETE", `/api/admin/onboarding-questions/${encodeURIComponent(q.id)}`);
          setBusy(false);
          if (!r.ok) setErr(r.error ?? "Couldn't delete.");
          load();
        },
      },
    ]);
  }

  // Reorder by swapping `order` with the neighbour and saving both.
  async function move(i: number, dir: -1 | 1) {
    if (!questions) return;
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const a = questions[i]!, b = questions[j]!;
    const fields = (q: OnboardingQuestion, order: number) => ({
      key: q.key, title: q.title, subtitle: q.subtitle, kind: q.kind, choices: q.choices,
      min: q.min, max: q.max, step: q.step, defaultValue: q.defaultValue, required: q.required, enabled: q.enabled, order,
    });
    setBusy(true); setErr(null);
    const r1 = await adminSend("POST", "/api/admin/onboarding-questions", fields(a, b.order));
    const r2 = await adminSend("POST", "/api/admin/onboarding-questions", fields(b, a.order));
    setBusy(false);
    if (!r1.ok || !r2.ok) setErr("Couldn't reorder — re-syncing.");
    load();
  }

  function toggleEnabled(q: OnboardingQuestion) {
    save({ key: q.key, title: q.title, subtitle: q.subtitle, kind: q.kind, choices: q.choices, min: q.min, max: q.max, step: q.step, defaultValue: q.defaultValue, required: q.required, enabled: !q.enabled, order: q.order }, false);
  }

  if (questions === null) return <Loading />;

  return (
    <View>
      {unavailable && (
        <Banner tone="amber" title="Edits aren't persisted yet">
          The OnboardingQuestion table doesn&apos;t exist yet — run reference/sql-onboarding.sql in the Supabase SQL
          Editor to make changes stick. Until then both clients run on the built-in questions below.
        </Banner>
      )}

      {err ? <ErrorNote error={err} onDismiss={() => setErr(null)} /> : null}

      <Intro>{questions.length} questions · changes take effect on the next sign-up — no deploy. Both web &amp; mobile.</Intro>

      {!adding && editing === null && (
        <View style={{ marginBottom: 14 }}>
          <PillBtn label="+ Add question" onPress={() => { setAdding(true); setEditing(null); }} />
        </View>
      )}

      {adding && (
        <QuestionEditor
          initial={{ id: "", key: "", kind: "single", title: "", subtitle: "", choices: [{ value: "", label: "" }], required: false, enabled: true, order: (questions.length + 1) * 10, system: false }}
          busy={busy}
          onCancel={() => setAdding(false)}
          onSave={(d) => save(draftToBody(d))}
        />
      )}

      <View style={{ gap: space.sm }}>
        {questions.map((q, i) => (
          editing === q.key ? (
            <QuestionEditor key={q.key} initial={toDraft(q)} busy={busy} onCancel={() => setEditing(null)} onSave={(d) => save(draftToBody(d))} />
          ) : (
            <Card key={q.key} accent={q.enabled ? (q.system ? palette.violet : palette.lime) : palette.ash}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginBottom: 6 }}>
                <Chip color={q.enabled ? palette.lime : palette.ash}>{q.enabled ? "on" : "off"}</Chip>
                <Chip color={palette.ash}>{q.kind}</Chip>
                {q.system ? <Chip color={palette.violet}>built-in</Chip> : <Chip color={palette.amber}>custom</Chip>}
                {q.engineKey ? <Chip color={palette.ash}>→ {q.engineKey}</Chip> : null}
                {q.required ? <Chip color={palette.ash}>required</Chip> : null}
              </View>
              <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: palette.chalk }}>{q.title}</Text>
              {q.subtitle ? <Mono color={palette.ash} style={{ marginTop: 2, lineHeight: 18 }}>{q.subtitle}</Mono> : null}
              {q.choices && q.choices.length > 0 && q.kind !== "goal" ? <Mono color={palette.ash} style={{ marginTop: 6, fontSize: fs.micro }}>{q.choices.map((c) => c.label).join(" · ")}</Mono> : null}
              {q.kind === "number" ? <Mono color={palette.ash} style={{ marginTop: 6, fontSize: fs.micro }}>{q.min ?? 1}–{q.max ?? 7}, step {q.step ?? 1}, default {String(q.defaultValue ?? q.min ?? 1)}</Mono> : null}
              {q.kind === "goal" ? <Mono color={palette.ash} style={{ marginTop: 6, fontSize: fs.micro }}>options come from the plan library (goal tree)</Mono> : null}
              <Mono color={palette.ash} style={{ marginTop: 6, fontSize: fs.nano }}>key: {q.key}</Mono>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 12, alignItems: "center" }}>
                <PillBtn label="↑" outline color={palette.ash} disabled={busy || i === 0} onPress={() => move(i, -1)} />
                <PillBtn label="↓" outline color={palette.ash} disabled={busy || i === questions.length - 1} onPress={() => move(i, 1)} />
                <PillBtn label={q.enabled ? "Disable" : "Enable"} outline color={q.enabled ? palette.amber : palette.lime} disabled={busy} onPress={() => toggleEnabled(q)} />
                <PillBtn label="Edit" outline color={palette.ash} disabled={busy} onPress={() => { setEditing(q.key); setAdding(false); }} />
                {!q.system ? <PillBtn label="Delete" outline color={palette.red} disabled={busy} onPress={() => remove(q)} /> : null}
              </View>
            </Card>
          )
        ))}

        {questions.length === 0 ? (
          <Card><Mono color={palette.ash} style={{ textAlign: "center", paddingVertical: 24 }}>No questions.</Mono></Card>
        ) : null}
      </View>
    </View>
  );
}

function QuestionEditor({ initial, busy, onSave, onCancel }: { initial: Draft; busy: boolean; onSave: (d: Draft) => void; onCancel: () => void }) {
  const { palette } = useTheme();
  const [d, setD] = useState<Draft>(initial);
  const set = (patch: Partial<Draft>) => setD((p) => ({ ...p, ...patch }));
  const lockedKind = d.system;

  return (
    <Card accent={palette.amber}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: palette.amber, marginBottom: 10 }}>
        {d.system ? "Edit built-in question" : d.id ? "Edit question" : "New question"}
      </Text>

      <Input label="Question" value={d.title} onChangeText={(v) => set({ title: v })} placeholder="What's your main goal?" />
      <Input label="Helper text (optional)" value={d.subtitle} onChangeText={(v) => set({ subtitle: v })} placeholder="We'll shape your plan around it." />

      {!lockedKind ? (
        <>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: palette.ash, marginBottom: 4 }}>Type</Text>
          <Segmented options={CUSTOM_KINDS} value={d.kind} onChange={(v) => set({ kind: v })} />
        </>
      ) : (
        <Mono color={palette.ash} style={{ marginBottom: 10 }}>type: {d.kind}{d.engineKey ? ` · feeds → ${d.engineKey}` : ""} (locked — built-in)</Mono>
      )}

      {(d.kind === "goal" || d.kind === "persona") ? (
        <Mono color={palette.ash} style={{ marginBottom: 8 }}>
          {d.kind === "goal" ? "Options come from the plan library (goal tree) — edit the wording above." : "The two persona cards are built in — edit the wording/options below."}
        </Mono>
      ) : null}

      {(d.kind === "single" || d.kind === "multi" || d.kind === "persona") && (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1, color: palette.ash, marginBottom: 6 }}>Options</Text>
          {d.choices.map((c, i) => (
            <View key={i} style={{ flexDirection: "row", gap: space.xs, alignItems: "flex-start", marginBottom: 6 }}>
              <View style={{ flex: 1 }}>
                <Input
                  value={c.label}
                  onChangeText={(v) => { const n = [...d.choices]; n[i] = { ...n[i]!, label: v, value: n[i]!.value || slugify(v) }; set({ choices: n }); }}
                  placeholder="Label"
                  style={{ marginBottom: 0 }}
                />
              </View>
              <Pressable onPress={() => set({ choices: d.choices.filter((_, j) => j !== i) })} hitSlop={8} style={{ paddingTop: 8 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: palette.ash }}>×</Text>
              </Pressable>
            </View>
          ))}
          <PillBtn label="+ option" outline color={palette.ash} onPress={() => set({ choices: [...d.choices, { value: "", label: "" }] })} />
        </View>
      )}

      {d.kind === "number" && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          <View style={{ flexBasis: "47%", flexGrow: 1 }}><Input label="Min" value={String(d.min ?? 1)} onChangeText={(v) => set({ min: Number(v) || 0 })} keyboardType="numeric" /></View>
          <View style={{ flexBasis: "47%", flexGrow: 1 }}><Input label="Max" value={String(d.max ?? 7)} onChangeText={(v) => set({ max: Number(v) || 0 })} keyboardType="numeric" /></View>
          <View style={{ flexBasis: "47%", flexGrow: 1 }}><Input label="Step" value={String(d.step ?? 1)} onChangeText={(v) => set({ step: Number(v) || 1 })} keyboardType="numeric" /></View>
          <View style={{ flexBasis: "47%", flexGrow: 1 }}><Input label="Default" value={d.defaultValue ?? ""} onChangeText={(v) => set({ defaultValue: v })} keyboardType="numeric" /></View>
        </View>
      )}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: 4, marginBottom: 12 }}>
        <PillBtn label={d.required ? "Required ✓" : "Required"} outline={!d.required} color={palette.ash} onPress={() => set({ required: !d.required })} />
        <PillBtn label={d.enabled ? "Enabled ✓" : "Enabled"} outline={!d.enabled} color={palette.lime} onPress={() => set({ enabled: !d.enabled })} />
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <PillBtn label={busy ? "Saving…" : "Save"} disabled={busy || !d.title.trim()} onPress={() => onSave(d)} />
        <PillBtn label="Cancel" outline color={palette.ash} disabled={busy} onPress={onCancel} />
      </View>
    </Card>
  );
}
