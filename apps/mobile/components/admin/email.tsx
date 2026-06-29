import { useCallback, useEffect, useState } from "react";
import { View, Text, Alert } from "react-native";
import { EMAIL_AUDIENCES, EMAIL_TRIGGERS } from "@hybrid/core";
import { fs, space, Card, Mono, Chip, Loading, F } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { Intro, Banner, ErrorNote, Stat, Input, PillBtn, Segmented } from "./_kit";
import { adminGet, adminSend } from "../../lib/admin-api";

// Mobile parity for apps/web/components/admin/email.tsx. Talks to the same
// /api/admin/email backend: an overview (provider status + ledger + audience
// sizes), one-off Campaigns (broadcast to a segment), and automated lifecycle
// Sequences (welcome / win-back / upgrade drips). Everything soft-degrades when
// Resend / the email tables aren't set up. Datetime entry is simplified to an
// ISO string (no native picker), matching the other mobile admin CMS sections.

type Tab = "overview" | "campaigns" | "sequences";

type Overview = {
  configured: boolean;
  from: string | null;
  audiences: { id: string; label: string; size: number }[];
  totals: { sent: number; failed: number; suppressed: number; campaigns: number; sequences: number };
  unavailable: boolean;
};

type Campaign = {
  id: string;
  subject: string;
  body: string;
  audience: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  sentCount: number;
  failedCount: number;
  audienceSize: number;
};

type Step = { delayHours: number; subject: string; body: string };
type Sequence = {
  id: string;
  name: string;
  trigger: string;
  audience: string;
  active: boolean;
  steps: Step[];
  _count?: { enrollments: number };
};

const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "campaigns", label: "Campaigns" },
  { value: "sequences", label: "Sequences" },
];
const AUDIENCE_OPTS = EMAIL_AUDIENCES.map((a) => ({ value: a.id, label: a.label }));
const TRIGGER_OPTS = EMAIL_TRIGGERS.map((t) => ({ value: t.id, label: t.label }));

export default function AdminEmail() {
  const [tab, setTab] = useState<Tab>("overview");
  const [ov, setOv] = useState<Overview | null>(null);

  const loadOverview = useCallback(async () => {
    const r = await adminGet<Overview>("/api/admin/email");
    setOv(r.ok ? r.data : null);
  }, []);
  useEffect(() => { loadOverview(); }, [loadOverview]);

  return (
    <View>
      {ov && !ov.configured && (
        <Banner tone="amber" title="Email isn't configured yet">
          Set RESEND_API_KEY + EMAIL_FROM in the server env to start sending. You can still author campaigns &amp;
          sequences — they&apos;ll send the moment it&apos;s live.
        </Banner>
      )}

      <Segmented options={TABS} value={tab} onChange={setTab} />

      {tab === "overview" && <OverviewPane ov={ov} />}
      {tab === "campaigns" && <CampaignsPane onChange={loadOverview} />}
      {tab === "sequences" && <SequencesPane onChange={loadOverview} />}
    </View>
  );
}

function OverviewPane({ ov }: { ov: Overview | null }) {
  const { palette } = useTheme();
  if (!ov) return <Loading />;
  const tiles: { label: string; value: number | string; color: string }[] = [
    { label: "Provider", value: ov.configured ? "Resend ✓" : "not set", color: ov.configured ? palette.lime : palette.red },
    { label: "Emails sent", value: ov.totals.sent, color: palette.lime },
    { label: "Failed", value: ov.totals.failed, color: ov.totals.failed ? palette.red : palette.ash },
    { label: "Unsubscribed", value: ov.totals.suppressed, color: palette.ash },
    { label: "Campaigns", value: ov.totals.campaigns, color: palette.blue },
    { label: "Sequences", value: ov.totals.sequences, color: palette.violet },
  ];
  return (
    <View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: 16 }}>
        {tiles.map((t) => (
          <View key={t.label} style={{ flexBasis: "47%", flexGrow: 1 }}>
            <Stat label={t.label} value={t.value} color={t.color} />
          </View>
        ))}
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: palette.ash, marginBottom: 8 }}>Audience sizes</Text>
      <Card style={{ padding: 0 }}>
        {ov.audiences.map((a, i) => (
          <View key={a.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: palette.line }}>
            <Mono color={palette.chalk}>{a.label}</Mono>
            <Mono color={txt(palette, palette.lime)}>{a.size.toLocaleString()}</Mono>
          </View>
        ))}
      </Card>
      {ov.from ? <Mono color={palette.ash} style={{ marginTop: 12 }}>Sending as {ov.from}</Mono> : null}
    </View>
  );
}

const EMPTY_CAMPAIGN = { subject: "", body: "", audience: "all", scheduledAt: "" };

function CampaignsPane({ onChange }: { onChange: () => void }) {
  const { palette } = useTheme();
  const [list, setList] = useState<Campaign[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [editing, setEditing] = useState<Campaign | "new" | null>(null);
  const [draft, setDraft] = useState(EMPTY_CAMPAIGN);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await adminGet<{ campaigns?: Campaign[]; unavailable?: boolean }>("/api/admin/email/campaigns");
    setUnavailable(Boolean(r.data?.unavailable));
    setList(r.data?.campaigns ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const toIso = (v: string): string | null => {
    const s = v.trim();
    if (!s) return null;
    const ms = Date.parse(s);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  };

  const openNew = () => { setDraft(EMPTY_CAMPAIGN); setErr(null); setEditing("new"); };
  const openEdit = (c: Campaign) => {
    setDraft({ subject: c.subject, body: c.body, audience: c.audience, scheduledAt: c.scheduledAt ?? "" });
    setErr(null); setEditing(c);
  };

  const save = async () => {
    if (!draft.subject.trim() || !draft.body.trim()) { setErr("Subject and body are required."); return; }
    if (draft.scheduledAt.trim() && toIso(draft.scheduledAt) === null) { setErr("Schedule must be a valid ISO date (or blank)."); return; }
    setBusy(true); setErr(null);
    const isNew = editing === "new";
    const r = await adminSend<{ error?: string }>(
      isNew ? "POST" : "PATCH",
      isNew ? "/api/admin/email/campaigns" : `/api/admin/email/campaigns/${(editing as Campaign).id}`,
      { ...draft, scheduledAt: toIso(draft.scheduledAt) },
    );
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Save failed."); return; }
    setEditing(null); load(); onChange();
  };

  const send = (c: Campaign) => {
    Alert.alert("Send campaign", `Send “${c.subject}” to ${c.audienceSize} ${c.audience} recipient(s) now? This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Send", style: "destructive",
        onPress: async () => {
          setBusy(true);
          const r = await adminSend<{ error?: string }>("POST", `/api/admin/email/campaigns/${c.id}/send`);
          setBusy(false);
          if (!r.ok) setErr(r.error ?? "Send failed.");
          load(); onChange();
        },
      },
    ]);
  };

  const remove = (c: Campaign) => {
    Alert.alert("Delete campaign", `Delete “${c.subject}”?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => { await adminSend("DELETE", `/api/admin/email/campaigns/${c.id}`); load(); onChange(); },
      },
    ]);
  };

  if (list === null) return <Loading />;

  const statusColor = (s: string) => (s === "sent" ? palette.lime : s === "scheduled" ? palette.blue : s === "sending" ? palette.amber : s === "failed" ? palette.red : palette.ash);

  if (editing) {
    return (
      <Card accent={palette.amber}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: palette.chalk, marginBottom: 12 }}>
          {editing === "new" ? "New campaign" : "Edit campaign"}
        </Text>
        <Input label="Subject — supports {{name}}" value={draft.subject} onChangeText={(v) => setDraft({ ...draft, subject: v })} placeholder="Editable plan templates are live" />
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: palette.ash, marginBottom: 4 }}>Audience</Text>
        <Segmented options={AUDIENCE_OPTS} value={draft.audience} onChange={(v) => setDraft({ ...draft, audience: v })} />
        <Input label="Schedule — ISO, optional" value={draft.scheduledAt} onChangeText={(v) => setDraft({ ...draft, scheduledAt: v })} placeholder="2026-07-01T09:00:00Z" />
        <Input label="Body — {{name}} / {{email}} merge tags" value={draft.body} onChangeText={(v) => setDraft({ ...draft, body: v })} placeholder="What every athlete should see…" multiline />
        {err ? <ErrorNote error={err} /> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: 4 }}>
          <PillBtn label={busy ? "Saving…" : "Save"} color={palette.amber} disabled={busy} onPress={save} />
          <PillBtn label="Cancel" outline color={palette.ash} disabled={busy} onPress={() => setEditing(null)} />
        </View>
      </Card>
    );
  }

  return (
    <View>
      <Intro>One-off broadcasts to an audience segment.</Intro>
      <View style={{ marginBottom: 14 }}><PillBtn label="+ New campaign" color={palette.amber} onPress={openNew} /></View>
      {unavailable && <Banner tone="amber" title="Email tables not initialized">Run reference/sql-email.sql in the Supabase SQL Editor to create the email tables.</Banner>}
      {err ? <ErrorNote error={err} onDismiss={() => setErr(null)} /> : null}
      {list.length === 0 && !unavailable ? <Mono color={palette.ash}>No campaigns yet.</Mono> : null}
      {list.map((c) => (
        <Card key={c.id} accent={statusColor(c.status)}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginBottom: 6 }}>
            <Chip color={statusColor(c.status)}>{c.status}</Chip>
            <Chip color={palette.violet}>{c.audience} · {c.audienceSize}</Chip>
            {c.status === "sent" ? <Chip color={palette.lime}>{c.sentCount} sent{c.failedCount ? ` · ${c.failedCount} failed` : ""}</Chip> : null}
            {c.scheduledAt && c.status === "scheduled" ? <Chip color={palette.ash}>{new Date(c.scheduledAt).toLocaleString()}</Chip> : null}
          </View>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: palette.chalk }}>{c.subject}</Text>
          {c.status !== "sent" && c.status !== "sending" ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 12 }}>
              <PillBtn label="Send" disabled={busy} onPress={() => send(c)} />
              <PillBtn label="Edit" outline color={palette.ash} disabled={busy} onPress={() => openEdit(c)} />
              <PillBtn label="Delete" outline color={palette.red} disabled={busy} onPress={() => remove(c)} />
            </View>
          ) : null}
        </Card>
      ))}
    </View>
  );
}

const EMPTY_SEQUENCE: Sequence = { id: "", name: "", trigger: "signup", audience: "all", active: false, steps: [{ delayHours: 0, subject: "", body: "" }] };

function SequencesPane({ onChange }: { onChange: () => void }) {
  const { palette } = useTheme();
  const [list, setList] = useState<Sequence[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [editing, setEditing] = useState<Sequence | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await adminGet<{ sequences?: Sequence[]; unavailable?: boolean }>("/api/admin/email/sequences");
    setUnavailable(Boolean(r.data?.unavailable));
    setList(r.data?.sequences ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { setErr("Name is required."); return; }
    setBusy(true); setErr(null);
    const isNew = !editing.id;
    const r = await adminSend<{ error?: string }>(
      isNew ? "POST" : "PATCH",
      isNew ? "/api/admin/email/sequences" : `/api/admin/email/sequences/${editing.id}`,
      { name: editing.name, trigger: editing.trigger, audience: editing.audience, active: editing.active, steps: editing.steps },
    );
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? "Save failed."); return; }
    setEditing(null); load(); onChange();
  };

  const toggleActive = async (s: Sequence) => {
    await adminSend("PATCH", `/api/admin/email/sequences/${s.id}`, { active: !s.active });
    load();
  };

  const remove = (s: Sequence) => {
    Alert.alert("Delete sequence", `Delete “${s.name}” and all its enrollments?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await adminSend("DELETE", `/api/admin/email/sequences/${s.id}`); load(); onChange(); } },
    ]);
  };

  if (list === null) return <Loading />;

  if (editing) {
    const setStep = (i: number, patch: Partial<Step>) => setEditing({ ...editing, steps: editing.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
    const triggerHelp = EMAIL_TRIGGERS.find((t) => t.id === editing.trigger)?.help;
    return (
      <Card accent={palette.amber}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: palette.chalk, marginBottom: 12 }}>{editing.id ? "Edit sequence" : "New sequence"}</Text>
        <Input label="Name" value={editing.name} onChangeText={(v) => setEditing({ ...editing, name: v })} placeholder="Welcome drip" />
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: palette.ash, marginBottom: 4 }}>Trigger</Text>
        <Segmented options={TRIGGER_OPTS} value={editing.trigger} onChange={(v) => setEditing({ ...editing, trigger: v })} />
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: palette.ash, marginBottom: 4 }}>Audience</Text>
        <Segmented options={AUDIENCE_OPTS} value={editing.audience} onChange={(v) => setEditing({ ...editing, audience: v })} />
        {triggerHelp ? <Mono color={palette.ash} style={{ marginBottom: 10 }}>{triggerHelp}</Mono> : null}

        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: palette.chalk, marginBottom: 8 }}>Steps</Text>
        {editing.steps.map((s, i) => (
          <View key={i} style={{ borderWidth: 1, borderColor: palette.line, borderRadius: 12, padding: 12, marginBottom: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Mono color={palette.amber}>Step {i + 1}</Mono>
              {editing.steps.length > 1 ? <PillBtn label="Remove" outline color={palette.red} onPress={() => setEditing({ ...editing, steps: editing.steps.filter((_, j) => j !== i) })} /> : null}
            </View>
            <Input label={`Send ${i === 0 ? "after enrollment" : "after previous step"} (hours)`} value={String(s.delayHours)} onChangeText={(v) => setStep(i, { delayHours: Number(v) || 0 })} keyboardType="numeric" />
            <Input label="Subject" value={s.subject} onChangeText={(v) => setStep(i, { subject: v })} />
            <Input label="Body" value={s.body} onChangeText={(v) => setStep(i, { body: v })} multiline />
          </View>
        ))}
        <View style={{ marginBottom: 12 }}>
          <PillBtn label="+ Add step" outline color={palette.ash} onPress={() => setEditing({ ...editing, steps: [...editing.steps, { delayHours: 24, subject: "", body: "" }] })} />
        </View>

        <View style={{ marginBottom: 14 }}>
          <PillBtn
            label={editing.active ? "Active — enrolling on trigger" : "Paused — not enrolling"}
            outline={!editing.active}
            onPress={() => setEditing({ ...editing, active: !editing.active })}
          />
        </View>

        {err ? <ErrorNote error={err} /> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          <PillBtn label={busy ? "Saving…" : "Save sequence"} color={palette.amber} disabled={busy} onPress={save} />
          <PillBtn label="Cancel" outline color={palette.ash} disabled={busy} onPress={() => setEditing(null)} />
        </View>
      </Card>
    );
  }

  return (
    <View>
      <Intro>Automated lifecycle drips — welcome, win-back, upgrade nudges.</Intro>
      <View style={{ marginBottom: 14 }}>
        <PillBtn label="+ New sequence" color={palette.amber} onPress={() => { setErr(null); setEditing({ ...EMPTY_SEQUENCE, steps: [{ delayHours: 0, subject: "", body: "" }] }); }} />
      </View>
      {unavailable && <Banner tone="amber" title="Email tables not initialized">Run reference/sql-email.sql in the Supabase SQL Editor to create the email tables.</Banner>}
      {err ? <ErrorNote error={err} onDismiss={() => setErr(null)} /> : null}
      {list.length === 0 && !unavailable ? <Mono color={palette.ash}>No sequences yet.</Mono> : null}
      {list.map((s) => (
        <Card key={s.id} accent={s.active ? palette.lime : palette.ash}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginBottom: 6 }}>
            <Chip color={s.active ? palette.lime : palette.ash}>{s.active ? "active" : "paused"}</Chip>
            <Chip color={palette.ash}>{EMAIL_TRIGGERS.find((t) => t.id === s.trigger)?.label ?? s.trigger}</Chip>
            <Chip color={palette.violet}>{s.steps.length} step{s.steps.length === 1 ? "" : "s"}</Chip>
            <Chip color={palette.chalk}>{s._count?.enrollments ?? 0} enrolled</Chip>
          </View>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: palette.chalk }}>{s.name}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 12 }}>
            <PillBtn label={s.active ? "Pause" : "Activate"} outline color={s.active ? palette.amber : palette.lime} disabled={busy} onPress={() => toggleActive(s)} />
            <PillBtn label="Edit" outline color={palette.ash} disabled={busy} onPress={() => { setErr(null); setEditing({ ...s, steps: s.steps.length ? s.steps : [{ delayHours: 0, subject: "", body: "" }] }); }} />
            <PillBtn label="Delete" outline color={palette.red} disabled={busy} onPress={() => remove(s)} />
          </View>
        </Card>
      ))}
    </View>
  );
}
