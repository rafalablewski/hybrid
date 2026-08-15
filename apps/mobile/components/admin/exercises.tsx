import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text } from "react-native";
import { ALL_MUSCLES, searchMissSummary, topSearchMisses } from "@hybrid/core";
import { leading, fs, space, Mono, Chip, LoadSwap, F } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { Intro, Banner, ErrorNote, Input, PillBtn, FilterGroup } from "./_kit";
import { ACard, cardStack } from "../aurora/kit";
import { adminGet, adminSend } from "../../lib/admin-api";
import { useConfirm } from "../aurora/confirm";
import { useSearchMisses, clearSearchMisses } from "../../lib/search-misses";

// Mobile parity for apps/web/components/admin/exercises.tsx. Same
// /api/admin/exercises (+/[id]) backend + the ./shared parse enums: CRUD over
// custom exercises (name/pattern/muscles/kind/status + content fields) with a
// search filter. Muscles are a multi-select of toggle pills from core's
// ALL_MUSCLES so the engine-critical enum can't drift.

type Status = "draft" | "published" | "archived";

type Exercise = {
  id: string;
  slug: string;
  name: string;
  pattern: string;
  muscles: string[];
  baseLoad: number | null;
  system: string | null;
  kind: string;
  category: string | null;
  equipment: string[];
  aliases: string[];
  description: string | null;
  cues: string[];
  videoUrl: string | null;
  status: Status;
  source: string;
  authorEmail: string | null;
};

type ListResp = { exercises?: Exercise[]; unavailable?: boolean };

const PATTERNS = ["squat", "hinge", "push", "pull", "lunge", "carry", "core", "cond"] as const;
type Pattern = (typeof PATTERNS)[number];
type Kind = "strength" | "conditioning";
type System = "" | "anaerobic" | "threshold" | "aerobic";

type Draft = {
  name: string;
  pattern: Pattern;
  muscles: string[];
  baseLoad: string;
  system: System;
  kind: Kind;
  category: string;
  equipment: string;
  aliases: string;
  description: string;
  cues: string;
  videoUrl: string;
};

const EMPTY: Draft = {
  name: "",
  pattern: "squat",
  muscles: [],
  baseLoad: "",
  system: "",
  kind: "strength",
  category: "",
  equipment: "",
  aliases: "",
  description: "",
  cues: "",
  videoUrl: "",
};

const toList = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

const PATTERN_OPTS = PATTERNS.map((p) => ({ value: p, label: p }));
const KIND_OPTS: { value: Kind; label: string }[] = [
  { value: "strength", label: "Strength" },
  { value: "conditioning", label: "Conditioning" },
];
const SYSTEM_OPTS: { value: System; label: string }[] = [
  { value: "", label: "None" },
  { value: "anaerobic", label: "Anaerobic" },
  { value: "threshold", label: "Threshold" },
  { value: "aerobic", label: "Aerobic" },
];

export default function AdminExercises() {
  const { confirm } = useConfirm();
  const { palette } = useTheme();
  const [list, setList] = useState<Exercise[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const r = await adminGet<ListResp>("/api/admin/exercises");
    if (!r.ok || !r.data) {
      setFailed(true);
      setList([]);
      return;
    }
    setFailed(false);
    setUnavailable(Boolean(r.data.unavailable));
    setList(r.data.exercises ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setDraft(EMPTY);
    setEditing("new");
    setErr(null);
  }
  function openEdit(x: Exercise) {
    setDraft({
      name: x.name,
      pattern: (PATTERNS.includes(x.pattern as Pattern) ? x.pattern : "squat") as Pattern,
      muscles: x.muscles,
      baseLoad: x.baseLoad == null ? "" : String(x.baseLoad),
      system: (x.system ?? "") as System,
      kind: (x.kind === "conditioning" ? "conditioning" : "strength") as Kind,
      category: x.category ?? "",
      equipment: x.equipment.join(", "),
      aliases: x.aliases.join(", "),
      description: x.description ?? "",
      cues: x.cues.join("\n"),
      videoUrl: x.videoUrl ?? "",
    });
    setEditing(x.id);
    setErr(null);
  }

  function toggleMuscle(m: string) {
    setDraft((d) => ({
      ...d,
      muscles: d.muscles.includes(m) ? d.muscles.filter((x) => x !== m) : [...d.muscles, m],
    }));
  }

  async function save(status?: Status) {
    if (!draft.name.trim()) {
      setErr("Name is required.");
      return;
    }
    if (draft.muscles.length === 0) {
      setErr("Pick at least one muscle.");
      return;
    }
    setBusy(true);
    setErr(null);
    const payload: Record<string, unknown> = {
      name: draft.name,
      pattern: draft.pattern,
      muscles: draft.muscles,
      baseLoad: draft.baseLoad.trim() === "" ? null : Number(draft.baseLoad),
      system: draft.system || null,
      kind: draft.kind,
      category: draft.category || null,
      equipment: toList(draft.equipment),
      aliases: toList(draft.aliases),
      description: draft.description || null,
      cues: toList(draft.cues),
      videoUrl: draft.videoUrl || null,
    };
    if (status) payload.status = status;

    const isNew = editing === "new";
    const r = await adminSend<{ error?: string }>(
      isNew ? "POST" : "PATCH",
      isNew ? "/api/admin/exercises" : `/api/admin/exercises/${editing}`,
      payload,
    );
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Save failed.");
      return;
    }
    setEditing(null);
    load();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    const r = await adminSend("PATCH", `/api/admin/exercises/${id}`, body);
    setBusy(false);
    if (!r.ok) setErr("That change didn't save — re-syncing.");
    load();
  }

  async function remove(x: Exercise) {
    if (!(await confirm({ title: "Delete exercise", message: `Delete “${x.name}” permanently?`, confirmLabel: "Delete", destructive: true }))) return;
    setBusy(true);
    setErr(null);
    const r = await adminSend("DELETE", `/api/admin/exercises/${x.id}`);
    setBusy(false);
    if (!r.ok) setErr("Delete failed — re-syncing.");
    load();
  }

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return (list ?? []).filter(
      (x) => !ql || x.name.toLowerCase().includes(ql) || x.aliases.some((a) => a.toLowerCase().includes(ql)),
    );
  }, [list, q]);

  return (
    <LoadSwap loading={list === null && !failed}>
      {() => {
        if (list === null && !failed) return null;
        if (failed) return <ErrorNote error="Couldn't load the exercise library. Pull to retry." />;
        if (unavailable)
          return (
            <Banner tone="amber" title="Exercise library not initialized">
              The Exercise table doesn&apos;t exist yet. Run reference/sql-exercise.sql in the Supabase SQL Editor to create
              it, then reload.
            </Banner>
          );

        const statusColor = (s: Status) => (s === "published" ? palette.lime : s === "archived" ? palette.amber : palette.ash);

        return (
          <View>
            <Intro>
              {list ? `${list.length} custom` : "…"} – merge over the 9 built-ins by name. Search + edit additions here.
            </Intro>

            <Input value={q} onChangeText={setQ} placeholder="Search the library…" />

            <SearchMisses />

            {editing === null && (
              <View style={{ marginBottom: 16 }}>
                <PillBtn label="+ New exercise" onPress={openNew} />
              </View>
            )}

            {editing !== null && (
              <ACard accent={palette.lime} style={cardStack}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: palette.chalk, marginBottom: 12 }}>
                  {editing === "new" ? "New exercise" : "Edit exercise"}
                </Text>

                <Input label="Name (the engine key)" value={draft.name} onChangeText={(t) => setDraft({ ...draft, name: t })} placeholder="e.g. Zercher Squat" />
                <Input label="Category (optional)" value={draft.category} onChangeText={(t) => setDraft({ ...draft, category: t })} placeholder="e.g. Lower / Olympic" />

                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: palette.ash, marginBottom: 4 }}>Pattern</Text>
                <FilterGroup options={PATTERN_OPTS} value={draft.pattern} onChange={(v) => setDraft({ ...draft, pattern: v })} />

                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: palette.ash, marginBottom: 4 }}>Kind</Text>
                <FilterGroup options={KIND_OPTS} value={draft.kind} onChange={(v) => setDraft({ ...draft, kind: v })} />

                <Input label="Base load (kg, blank for conditioning)" value={draft.baseLoad} onChangeText={(t) => setDraft({ ...draft, baseLoad: t })} placeholder="100" keyboardType="numeric" />

                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: palette.ash, marginBottom: 4 }}>Energy system (conditioning)</Text>
                <FilterGroup options={SYSTEM_OPTS} value={draft.system} onChange={(v) => setDraft({ ...draft, system: v })} />

                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: palette.ash, marginBottom: 6 }}>
                  Muscles worked (drives fatigue + volume)
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginBottom: 12 }}>
                  {ALL_MUSCLES.map((m) => {
                    const on = draft.muscles.includes(m);
                    return (
                      <PillBtn
                        key={m}
                        label={m}
                        color={palette.lime}
                        outline={!on}
                        onPress={() => toggleMuscle(m)}
                      />
                    );
                  })}
                </View>

                <Input label="Equipment (comma-separated)" value={draft.equipment} onChangeText={(t) => setDraft({ ...draft, equipment: t })} placeholder="barbell, rack" />
                <Input label="Aliases (comma-separated)" value={draft.aliases} onChangeText={(t) => setDraft({ ...draft, aliases: t })} placeholder="Zerchers" />
                <Input label="Description (optional)" value={draft.description} onChangeText={(t) => setDraft({ ...draft, description: t })} multiline />
                <Input label="Coaching cues (one per line)" value={draft.cues} onChangeText={(t) => setDraft({ ...draft, cues: t })} placeholder={"Brace before the descent\nElbows inside the knees"} multiline />
                <Input label="Demo video URL (optional)" value={draft.videoUrl} onChangeText={(t) => setDraft({ ...draft, videoUrl: t })} placeholder="https://…" />

                {err ? <ErrorNote error={err} /> : null}

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                  <PillBtn label="Save draft" outline disabled={busy} onPress={() => save("draft")} />
                  <PillBtn label={editing === "new" ? "Publish" : "Save & publish"} disabled={busy} onPress={() => save("published")} />
                  <PillBtn label="Cancel" outline color={palette.ash} disabled={busy} onPress={() => setEditing(null)} />
                </View>
              </ACard>
            )}

            {err && editing === null ? <ErrorNote error={err} onDismiss={() => setErr(null)} /> : null}

            {filtered.map((x) => (
              <ACard key={x.id} accent={statusColor(x.status)} style={cardStack}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginBottom: 6 }}>
                  <Chip color={statusColor(x.status)}>{x.status}</Chip>
                  <Chip color={palette.ash}>{x.pattern}</Chip>
                  <Chip color={palette.ash}>{x.kind}</Chip>
                  {x.baseLoad != null ? <Chip color={palette.ash}>{`${x.baseLoad}kg base`}</Chip> : null}
                  {x.system ? <Chip color={palette.ash}>{x.system}</Chip> : null}
                </View>
                <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: palette.chalk }}>{x.name}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 6 }}>
                  {x.muscles.map((m) => <Chip key={m} color={palette.lime}>{m}</Chip>)}
                </View>
                {x.aliases.length > 0 ? <Mono color={palette.ash} style={{ marginTop: 6, fontSize: fs.micro }}>{`aka ${x.aliases.join(", ")}`}</Mono> : null}
                {x.cues.length > 0 ? (
                  <Mono color={palette.ash} style={{ marginTop: 6, lineHeight: 18 }}>{x.cues.map((c) => `• ${c}`).join("\n")}</Mono>
                ) : null}

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 12 }}>
                  <PillBtn label="Edit" outline color={palette.ash} disabled={busy} onPress={() => openEdit(x)} />
                  {x.status !== "published" ? (
                    <PillBtn label="Publish" outline disabled={busy} onPress={() => patch(x.id, { status: "published" })} />
                  ) : (
                    <PillBtn label="Unpublish" outline color={palette.ash} disabled={busy} onPress={() => patch(x.id, { status: "draft" })} />
                  )}
                  {x.status !== "archived" ? (
                    <PillBtn label="Archive" outline color={palette.amber} disabled={busy} onPress={() => patch(x.id, { status: "archived" })} />
                  ) : null}
                  <PillBtn label="Delete" outline color={palette.red} disabled={busy} onPress={() => remove(x)} />
                </View>
              </ACard>
            ))}

            {list && filtered.length === 0 ? (
              <Mono color={palette.ash} style={{ textAlign: "center", paddingVertical: 24 }}>
                {list.length === 0 ? "No custom exercises yet. Add one to extend the catalog." : "No matches."}
              </Mono>
            ) : null}
          </View>
        );
      }}
    </LoadSwap>
  );
}

/**
 * THE VOCABULARY BACKLOG — what athletes searched for that the app didn't know.
 *
 * The exercise search ships ~50 curated nicknames, every one of them a guess
 * about gym slang. This is the list of guesses that were wrong, written by the
 * people who use it: queries that matched nothing, and — weighted higher —
 * queries a custom movement was created from, which is the athlete having given
 * up and named it themselves. Each row is either a nickname to add to
 * EXERCISE_NICKNAMES or a movement genuinely missing from the catalog.
 *
 * It sits on THIS screen because this is where an operator already is when they
 * would act on it. Device-local (AsyncStorage), so it is this device's misses,
 * not the fleet's — aggregating across athletes needs a server table and is
 * tracked as `search-vocabulary-sync`. That is also why there is no web twin:
 * the web console cannot read a phone's storage, so a panel there would be
 * permanently empty rather than merely sparse.
 */
function SearchMisses() {
  const { palette } = useTheme();
  const misses = useSearchMisses();
  const top = topSearchMisses(misses, 12);
  const { confirm } = useConfirm();
  if (top.length === 0) return null;
  return (
    <ACard style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: palette.chalk }}>Searched, not found</Text>
        <Mono color={palette.ash} style={{ fontSize: fs.micro }}>{`${misses.length} on this device`}</Mono>
      </View>
      <Mono color={palette.ash} style={{ fontSize: fs.micro, marginTop: 6, lineHeight: leading(fs.micro) }}>
        Each one is a nickname to add, or a movement the catalog is missing.
      </Mono>
      <View style={{ marginTop: 12, gap: 8 }}>
        {top.map((m) => (
          <View key={m.query} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.body, color: palette.chalk }}>{m.query}</Text>
            <Chip color={m.custom ? palette.amber : palette.ash}>{searchMissSummary(m)}</Chip>
            <Mono color={palette.ash} style={{ fontSize: fs.micro }}>{m.last.slice(5)}</Mono>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", marginTop: 14 }}>
        <PillBtn
          label="Clear backlog"
          outline
          color={palette.ash}
          onPress={async () => {
            if (await confirm({ title: "Clear the backlog?", message: "The misses recorded on this device are forgotten. Anything not yet added to the catalog is lost.", confirmLabel: "Clear", destructive: true })) clearSearchMisses();
          }}
        />
      </View>
    </ACard>
  );
}
