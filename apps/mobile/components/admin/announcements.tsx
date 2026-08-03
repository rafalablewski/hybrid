import { useCallback, useEffect, useState } from "react";
import { View, Text } from "react-native";
import { fs, space, Mono, Chip, Loading, F } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { Intro, Banner, ErrorNote, Input, PillBtn, Segmented } from "./_kit";
import { ACard, cardStack } from "../aurora/kit";
import { adminGet, adminSend } from "../../lib/admin-api";
import { useConfirm } from "../aurora/confirm";

// Mobile parity for apps/web/components/admin/announcements.tsx. Talks to the
// same /api/admin/announcements (+/[id]) backend: full CRUD over the broadcast
// CMS — title/body, level, audience, the draft→published→archived lifecycle, a
// pin flag, and optional publish/expiry timestamps (plain ISO text on mobile —
// no native datetime picker in v1).

type Level = "info" | "success" | "warning";
type Audience = "all" | "coaches" | "clients";
type Status = "draft" | "published" | "archived";

type Announcement = {
  id: string;
  title: string;
  body: string;
  level: Level;
  audience: Audience;
  status: Status;
  pinned: boolean;
  publishAt: string | null;
  expiresAt: string | null;
  authorEmail: string;
  createdAt: string;
  updatedAt: string;
};

type ListResp = { announcements?: Announcement[]; unavailable?: boolean };

type Draft = {
  title: string;
  body: string;
  level: Level;
  audience: Audience;
  pinned: boolean;
  publishAt: string;
  expiresAt: string;
};

const EMPTY: Draft = { title: "", body: "", level: "info", audience: "all", pinned: false, publishAt: "", expiresAt: "" };

const LEVEL_OPTS: { value: Level; label: string }[] = [
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
];
const AUDIENCE_OPTS: { value: Audience; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "coaches", label: "Coaches" },
  { value: "clients", label: "Clients" },
];

export default function AdminAnnouncements() {
  const { confirm } = useConfirm();
  const { palette } = useTheme();
  const [list, setList] = useState<Announcement[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await adminGet<ListResp>("/api/admin/announcements");
    if (!r.ok || !r.data) {
      setFailed(true);
      setList([]);
      return;
    }
    setFailed(false);
    setUnavailable(Boolean(r.data.unavailable));
    setList(r.data.announcements ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setDraft(EMPTY);
    setEditing("new");
    setErr(null);
  }
  function openEdit(a: Announcement) {
    setDraft({
      title: a.title,
      body: a.body,
      level: a.level,
      audience: a.audience,
      pinned: a.pinned,
      publishAt: a.publishAt ?? "",
      expiresAt: a.expiresAt ?? "",
    });
    setEditing(a.id);
    setErr(null);
  }

  const toIso = (v: string): string | null => {
    const t = v.trim();
    if (!t) return null;
    const ms = Date.parse(t);
    if (Number.isNaN(ms)) return null;
    return new Date(ms).toISOString();
  };

  async function save(status?: Status) {
    if (!draft.title.trim() || !draft.body.trim()) {
      setErr("Title and body are required.");
      return;
    }
    if (draft.publishAt.trim() && toIso(draft.publishAt) === null) {
      setErr("Publish at must be a valid ISO date (or blank).");
      return;
    }
    if (draft.expiresAt.trim() && toIso(draft.expiresAt) === null) {
      setErr("Expires at must be a valid ISO date (or blank).");
      return;
    }
    setBusy(true);
    setErr(null);
    const payload: Record<string, unknown> = {
      title: draft.title,
      body: draft.body,
      level: draft.level,
      audience: draft.audience,
      pinned: draft.pinned,
      publishAt: toIso(draft.publishAt),
      expiresAt: toIso(draft.expiresAt),
    };
    if (status) payload.status = status;

    const isNew = editing === "new";
    const r = await adminSend<{ error?: string }>(
      isNew ? "POST" : "PATCH",
      isNew ? "/api/admin/announcements" : `/api/admin/announcements/${editing}`,
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
    const r = await adminSend("PATCH", `/api/admin/announcements/${id}`, body);
    setBusy(false);
    if (!r.ok) setErr("That change didn't save — re-syncing.");
    load();
  }

  async function remove(a: Announcement) {
    if (!(await confirm({ title: "Delete announcement", message: `Delete “${a.title}” permanently?`, confirmLabel: "Delete", destructive: true }))) return;
    setBusy(true);
    setErr(null);
    const r = await adminSend("DELETE", `/api/admin/announcements/${a.id}`);
    setBusy(false);
    if (!r.ok) setErr("Delete failed — re-syncing.");
    load();
  }

  if (list === null && !failed) return <Loading />;
  if (failed)
    return <ErrorNote error="Couldn't load announcements. Pull to retry." />;
  if (unavailable)
    return (
      <Banner tone="amber" title="Announcements not initialized">
        The Announcement table doesn&apos;t exist yet. Run reference/sql-announcement.sql in the Supabase SQL Editor to
        create it, then reload.
      </Banner>
    );

  const statusColor = (s: Status) => (s === "published" ? palette.lime : s === "archived" ? palette.amber : palette.ash);
  const levelColor = (l: Level) => (l === "warning" ? palette.amber : palette.lime);

  return (
    <View>
      <Intro>
        {list ? `${list.length} announcement${list.length === 1 ? "" : "s"}` : "…"} – broadcast to the app
      </Intro>

      {editing === null && (
        <View style={{ marginBottom: 16 }}>
          <PillBtn label="+ New announcement" onPress={openNew} />
        </View>
      )}

      {editing !== null && (
        <ACard accent={palette.lime} style={cardStack}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: palette.chalk, marginBottom: 12 }}>
            {editing === "new" ? "New announcement" : "Edit announcement"}
          </Text>

          <Input label="Title" value={draft.title} onChangeText={(t) => setDraft({ ...draft, title: t })} placeholder="e.g. Editable plan templates are live" />
          <Input label="Body" value={draft.body} onChangeText={(t) => setDraft({ ...draft, body: t })} placeholder="What every athlete should see…" multiline />

          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: palette.ash, marginBottom: 4 }}>Level</Text>
          <Segmented options={LEVEL_OPTS} value={draft.level} onChange={(v) => setDraft({ ...draft, level: v })} />

          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: palette.ash, marginBottom: 4 }}>Audience</Text>
          <Segmented options={AUDIENCE_OPTS} value={draft.audience} onChange={(v) => setDraft({ ...draft, audience: v })} />

          <Input label="Publish at — ISO, optional" value={draft.publishAt} onChangeText={(t) => setDraft({ ...draft, publishAt: t })} placeholder="2026-07-01T09:00:00Z" />
          <Input label="Expires at — ISO, optional" value={draft.expiresAt} onChangeText={(t) => setDraft({ ...draft, expiresAt: t })} placeholder="2026-08-01T09:00:00Z" />
          <Mono color={palette.ash} style={{ marginBottom: 10 }}>
            Datetime entry is simplified on mobile — type an ISO timestamp or leave blank.
          </Mono>

          <View style={{ marginBottom: 16 }}>
            <PillBtn
              label={draft.pinned ? "📌 Pinned banner — on" : "Pin as a banner — off"}
              outline={!draft.pinned}
              color={palette.amber}
              onPress={() => setDraft({ ...draft, pinned: !draft.pinned })}
            />
          </View>

          {err ? <ErrorNote error={err} /> : null}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            <PillBtn label="Save draft" outline disabled={busy} onPress={() => save("draft")} />
            <PillBtn label={editing === "new" ? "Publish" : "Save & publish"} disabled={busy} onPress={() => save("published")} />
            <PillBtn label="Cancel" outline color={palette.ash} disabled={busy} onPress={() => setEditing(null)} />
          </View>
        </ACard>
      )}

      {err && editing === null ? <ErrorNote error={err} onDismiss={() => setErr(null)} /> : null}

      {list?.map((a) => (
        <ACard key={a.id} accent={statusColor(a.status)} style={cardStack}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginBottom: 6 }}>
            <Chip color={statusColor(a.status)}>{a.status}</Chip>
            <Chip color={levelColor(a.level)}>{a.level}</Chip>
            <Chip color={palette.ash}>{a.audience}</Chip>
            {a.pinned ? <Chip color={palette.amber}>pinned</Chip> : null}
          </View>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: palette.chalk }}>{a.title}</Text>
          <Mono color={palette.ash} style={{ marginTop: 4, lineHeight: 18 }}>{a.body}</Mono>
          <Mono color={palette.ash} style={{ marginTop: 8, fontSize: fs.micro }}>
            {a.authorEmail}
            {a.publishAt ? ` – live ${new Date(a.publishAt).toLocaleString()}` : ""}
            {a.expiresAt ? ` – ends ${new Date(a.expiresAt).toLocaleString()}` : ""}
          </Mono>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 12 }}>
            <PillBtn label="Edit" outline color={palette.ash} disabled={busy} onPress={() => openEdit(a)} />
            {a.status !== "published" ? (
              <PillBtn label="Publish" outline disabled={busy} onPress={() => patch(a.id, { status: "published" })} />
            ) : (
              <PillBtn label="Unpublish" outline color={palette.ash} disabled={busy} onPress={() => patch(a.id, { status: "draft" })} />
            )}
            {a.status !== "archived" ? (
              <PillBtn label="Archive" outline color={palette.amber} disabled={busy} onPress={() => patch(a.id, { status: "archived" })} />
            ) : null}
            <PillBtn label={a.pinned ? "Unpin" : "Pin"} outline color={palette.ash} disabled={busy} onPress={() => patch(a.id, { pinned: !a.pinned })} />
            <PillBtn label="Delete" outline color={palette.red} disabled={busy} onPress={() => remove(a)} />
          </View>
        </ACard>
      ))}

      {list && list.length === 0 ? (
        <Mono color={palette.ash} style={{ textAlign: "center", paddingVertical: 24 }}>
          No announcements yet. Create one to broadcast to the app.
        </Mono>
      ) : null}
    </View>
  );
}
