"use client";

import { useCallback, useEffect, useState } from "react";
import { EMAIL_AUDIENCES, EMAIL_TRIGGERS } from "@hybrid/core";
import { fs, space, INK2, CARD, LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED, ON_ACCENT, disp, mono, Mono, Card, Chip, Select, txt } from "@/lib/ui";

// Admin Email & Marketing console. Three panes: an overview (provider status +
// ledger), one-off Campaigns (broadcasts to an audience segment), and automated
// lifecycle Sequences (welcome / win-back / upgrade drips). Everything degrades
// gracefully when Resend / the email tables aren't set up yet.

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

type Step = { delayHours: number; subject: string; body: string; _key?: string };

// Stable client-side key so add/remove/reorder of steps doesn't reuse an index
// key (which would mis-associate input state/focus with the wrong row).
const newKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
const keyed = (steps: Step[]): Step[] => steps.map((s) => ({ ...s, _key: s._key ?? newKey() }));
type Sequence = {
  id: string;
  name: string;
  trigger: string;
  audience: string;
  active: boolean;
  steps: Step[];
  _count?: { enrollments: number };
};

const statusColor: Record<string, string> = { draft: ASH, scheduled: BLUE, sending: AMBER, sent: LIME, failed: RED };
const field = { ...mono, fontSize: fs.bodyLg, width: "100%", padding: "10px 14px", borderRadius: "var(--r-field)", background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none" } as const;
const labelCss = { fontSize: fs.caption, display: "block", marginBottom: 5 } as const;

export default function AdminEmail() {
  const [tab, setTab] = useState<"overview" | "campaigns" | "sequences">("overview");
  const [ov, setOv] = useState<Overview | null>(null);

  const loadOverview = useCallback(() => {
    fetch("/api/admin/email")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setOv)
      .catch(() => setOv(null));
  }, []);
  useEffect(loadOverview, [loadOverview]);

  return (
    <div>
      {ov && !ov.configured && (
        <Card glass={false} style={{ marginBottom: 16, borderLeft: `3px solid ${AMBER}` }}>
          <Mono s={{ fontSize: fs.body, lineHeight: 1.6 }} c={AMBER}>
            Email isn&apos;t configured yet. Set <b>RESEND_API_KEY</b> + <b>EMAIL_FROM</b> in the server env to start
            sending. You can still author campaigns &amp; sequences — they&apos;ll send the moment it&apos;s live.
          </Mono>
        </Card>
      )}

      <div style={{ display: "flex", gap: space.xs, marginBottom: 18, flexWrap: "wrap" }}>
        {(["overview", "campaigns", "sequences"] as const).map((t) => (
          <button className="pressable"
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...disp,
              fontWeight: 700,
              fontSize: fs.bodyLg,
              textTransform: "capitalize",
              color: txt(tab === t ? AMBER : ASH),
              background: tab === t ? `${AMBER}1c` : "transparent",
              border: `1px solid ${tab === t ? AMBER : LINE}`,
              borderRadius: 999,
              padding: "8px 18px",
              cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewPane ov={ov} />}
      {tab === "campaigns" && <CampaignsPane onChange={loadOverview} />}
      {tab === "sequences" && <SequencesPane onChange={loadOverview} />}
    </div>
  );
}

function OverviewPane({ ov }: { ov: Overview | null }) {
  if (!ov) return <Mono c={ASH}>Loading…</Mono>;
  const tiles: { label: string; value: number | string; c: string }[] = [
    { label: "Provider", value: ov.configured ? "Resend ✓" : "not set", c: ov.configured ? LIME : RED },
    { label: "Emails sent", value: ov.totals.sent, c: LIME },
    { label: "Failed", value: ov.totals.failed, c: ov.totals.failed ? RED : ASH },
    { label: "Unsubscribed", value: ov.totals.suppressed, c: ASH },
    { label: "Campaigns", value: ov.totals.campaigns, c: BLUE },
    { label: "Sequences", value: ov.totals.sequences, c: VIOLET },
  ];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: space.sm, marginBottom: 20 }}>
        {tiles.map((t) => (
          <Card key={t.label} glass={false}>
            <div style={{ ...disp, fontWeight: 800, fontSize: fs.title, color: txt(t.c) }}>{t.value}</div>
            <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".08em" }} c={ASH}>{t.label}</Mono>
          </Card>
        ))}
      </div>
      <Mono s={{ fontSize: fs.caption, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 10 }} c={ASH}>Audience sizes</Mono>
      <Card glass={false} style={{ padding: 0 }}>
        {ov.audiences.map((a, i) => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderTop: i ? `1px solid ${LINE}` : "none" }}>
            <Mono s={{ fontSize: fs.bodyLg }} c={CHALK}>{a.label}</Mono>
            <Mono s={{ fontSize: fs.bodyLg }} c={LIME}>{a.size.toLocaleString()}</Mono>
          </div>
        ))}
      </Card>
      {ov.from && <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 12 }} c={ASH}>Sending as {ov.from}</Mono>}
    </div>
  );
}

// --------------------------------------------------------------------------
// Campaigns
// --------------------------------------------------------------------------

const EMPTY_CAMPAIGN = { subject: "", body: "", audience: "all", scheduledAt: "" };

function CampaignsPane({ onChange }: { onChange: () => void }) {
  const [list, setList] = useState<Campaign[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [editing, setEditing] = useState<Campaign | "new" | null>(null);
  const [draft, setDraft] = useState(EMPTY_CAMPAIGN);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/email/campaigns")
      .then((r) => r.json())
      .then((d) => {
        setUnavailable(Boolean(d.unavailable));
        setList(d.campaigns ?? []);
      })
      .catch(() => setList([]));
  }, []);
  useEffect(load, [load]);

  const openNew = () => {
    setDraft(EMPTY_CAMPAIGN);
    setErr(null);
    setEditing("new");
  };
  const openEdit = (c: Campaign) => {
    setDraft({ subject: c.subject, body: c.body, audience: c.audience, scheduledAt: c.scheduledAt ? c.scheduledAt.slice(0, 16) : "" });
    setErr(null);
    setEditing(c);
  };

  const save = async () => {
    setBusy(true);
    setErr(null);
    const isNew = editing === "new";
    const url = isNew ? "/api/admin/email/campaigns" : `/api/admin/email/campaigns/${(editing as Campaign).id}`;
    try {
      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, scheduledAt: draft.scheduledAt || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setEditing(null);
        load();
        onChange();
      } else setErr(body.error ?? "Save failed.");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const send = async (c: Campaign) => {
    if (!window.confirm(`Send "${c.subject}" to ${c.audienceSize} ${c.audience} recipient(s) now? This can't be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/email/campaigns/${c.id}/send`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) window.alert(body.error ?? "Send failed.");
      load();
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: Campaign) => {
    if (!window.confirm(`Delete campaign "${c.subject}"?`)) return;
    await fetch(`/api/admin/email/campaigns/${c.id}`, { method: "DELETE" });
    load();
    onChange();
  };

  if (editing) {
    return (
      <Card glass={false}>
        <Mono s={{ fontSize: fs.micro, letterSpacing: ".12em", textTransform: "uppercase", display: "block", marginBottom: 14 }} c={AMBER}>
          {editing === "new" ? "New campaign" : "Edit campaign"}
        </Mono>
        <label style={{ display: "block", marginBottom: 12 }}>
          <Mono s={labelCss} c={ASH}>Subject — supports {"{{name}}"}</Mono>
          <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} style={field} />
        </label>
        <div style={{ display: "flex", gap: space.ms, marginBottom: 12 }}>
          <label style={{ flex: 1 }}>
            <Mono s={labelCss} c={ASH}>Audience</Mono>
            <Select value={draft.audience} onChange={(e) => setDraft({ ...draft, audience: e.target.value })} style={{ width: "100%" }}>
              {EMAIL_AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </Select>
          </label>
          <label style={{ flex: 1 }}>
            <Mono s={labelCss} c={ASH}>Schedule (optional)</Mono>
            <input type="datetime-local" value={draft.scheduledAt} onChange={(e) => setDraft({ ...draft, scheduledAt: e.target.value })} style={field} />
          </label>
        </div>
        <label style={{ display: "block", marginBottom: 14 }}>
          <Mono s={labelCss} c={ASH}>Body — {"{{name}}"} / {"{{email}}"} merge tags, blank line = paragraph</Mono>
          <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={10} style={{ ...field, resize: "vertical", lineHeight: 1.5 }} />
        </label>
        {err && <div role="alert"><Mono s={{ fontSize: fs.body, display: "block", marginBottom: 10 }} c={RED}>{err}</Mono></div>}
        <div style={{ display: "flex", gap: space.sm }}>
          <button className="pressable" onClick={save} disabled={busy} style={primaryBtn(!busy)}>{busy ? "Saving…" : "Save"}</button>
          <button className="pressable" onClick={() => setEditing(null)} style={ghostBtn()}>Cancel</button>
        </div>
      </Card>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <Mono s={{ fontSize: fs.body }} c={ASH}>One-off broadcasts to an audience segment.</Mono>
        <button className="pressable" onClick={openNew} style={primaryBtn(true)}>+ New campaign</button>
      </div>
      {unavailable && <Card glass={false} style={{ marginBottom: 12, borderLeft: `3px solid ${AMBER}` }}><Mono c={AMBER}>Run reference/sql-email.sql to create the email tables.</Mono></Card>}
      {list?.length === 0 && !unavailable && <Mono c={ASH}>No campaigns yet.</Mono>}
      {list?.map((c) => (
        <Card key={c.id} glass={false} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: space.md }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...disp, fontWeight: 700, fontSize: fs.subtitle }}>{c.subject}</div>
              <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap", marginTop: 6 }}>
                <Chip c={statusColor[c.status] ?? CHALK}>{c.status}</Chip>
                <Chip c={VIOLET}>{c.audience} – {c.audienceSize}</Chip>
                {c.status === "sent" && <Chip c={LIME}>{c.sentCount} sent{c.failedCount ? ` – ${c.failedCount} failed` : ""}</Chip>}
                {c.scheduledAt && c.status === "scheduled" && <Chip c={ASH}>{new Date(c.scheduledAt).toLocaleString()}</Chip>}
              </div>
            </div>
            <div style={{ display: "flex", gap: space.xs, flexShrink: 0 }}>
              {c.status !== "sent" && c.status !== "sending" && (
                <>
                  <button className="pressable" onClick={() => send(c)} disabled={busy} style={smallBtn(LIME)}>Send</button>
                  <button className="pressable" onClick={() => openEdit(c)} style={smallBtn(CHALK)}>Edit</button>
                  <button className="pressable" onClick={() => remove(c)} style={smallBtn(RED)}>Delete</button>
                </>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------
// Sequences (automation)
// --------------------------------------------------------------------------

const EMPTY_SEQUENCE: Sequence = { id: "", name: "", trigger: "signup", audience: "all", active: false, steps: [{ delayHours: 0, subject: "", body: "" }] };

function SequencesPane({ onChange }: { onChange: () => void }) {
  const [list, setList] = useState<Sequence[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [editing, setEditing] = useState<Sequence | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/email/sequences")
      .then((r) => r.json())
      .then((d) => {
        setUnavailable(Boolean(d.unavailable));
        setList(d.sequences ?? []);
      })
      .catch(() => setList([]));
  }, []);
  useEffect(load, [load]);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setErr(null);
    const isNew = !editing.id;
    const url = isNew ? "/api/admin/email/sequences" : `/api/admin/email/sequences/${editing.id}`;
    try {
      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editing.name, trigger: editing.trigger, audience: editing.audience, active: editing.active, steps: editing.steps }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setEditing(null);
        load();
        onChange();
      } else setErr(body.error ?? "Save failed.");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (s: Sequence) => {
    await fetch(`/api/admin/email/sequences/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    });
    load();
  };

  const remove = async (s: Sequence) => {
    if (!window.confirm(`Delete sequence "${s.name}" and all its enrollments?`)) return;
    await fetch(`/api/admin/email/sequences/${s.id}`, { method: "DELETE" });
    load();
    onChange();
  };

  if (editing) {
    const setStep = (i: number, patch: Partial<Step>) =>
      setEditing({ ...editing, steps: editing.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
    return (
      <Card glass={false}>
        <Mono s={{ fontSize: fs.micro, letterSpacing: ".12em", textTransform: "uppercase", display: "block", marginBottom: 14 }} c={AMBER}>
          {editing.id ? "Edit sequence" : "New sequence"}
        </Mono>
        <label style={{ display: "block", marginBottom: 12 }}>
          <Mono s={labelCss} c={ASH}>Name</Mono>
          <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} style={field} />
        </label>
        <div style={{ display: "flex", gap: space.ms, marginBottom: 12 }}>
          <label style={{ flex: 1 }}>
            <Mono s={labelCss} c={ASH}>Trigger</Mono>
            <Select value={editing.trigger} onChange={(e) => setEditing({ ...editing, trigger: e.target.value })} style={{ width: "100%" }}>
              {EMAIL_TRIGGERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </label>
          <label style={{ flex: 1 }}>
            <Mono s={labelCss} c={ASH}>Audience</Mono>
            <Select value={editing.audience} onChange={(e) => setEditing({ ...editing, audience: e.target.value })} style={{ width: "100%" }}>
              {EMAIL_AUDIENCES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </Select>
          </label>
        </div>
        <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 8 }} c={ASH}>
          {EMAIL_TRIGGERS.find((t) => t.id === editing.trigger)?.help}
        </Mono>

        <Mono s={{ fontSize: fs.caption, textTransform: "uppercase", letterSpacing: ".12em", display: "block", margin: "14px 0 8px" }} c={CHALK}>Steps</Mono>
        {editing.steps.map((s, i) => (
          <div key={s._key ?? i} style={{ border: `1px solid ${LINE}`, borderRadius: "var(--r-field)", padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Mono s={{ fontSize: fs.caption }} c={AMBER}>Step {i + 1}</Mono>
              {editing.steps.length > 1 && (
                <button className="pressable" onClick={() => setEditing({ ...editing, steps: editing.steps.filter((_, j) => j !== i) })} style={smallBtn(RED)}>Remove</button>
              )}
            </div>
            <label style={{ display: "block", marginBottom: 8 }}>
              <Mono s={labelCss} c={ASH}>Send {i === 0 ? "after enrollment" : "after previous step"} (hours)</Mono>
              <input type="number" min={0} value={s.delayHours} onChange={(e) => setStep(i, { delayHours: Number(e.target.value) })} style={field} />
            </label>
            <label style={{ display: "block", marginBottom: 8 }}>
              <Mono s={labelCss} c={ASH}>Subject</Mono>
              <input value={s.subject} onChange={(e) => setStep(i, { subject: e.target.value })} style={field} />
            </label>
            <label style={{ display: "block" }}>
              <Mono s={labelCss} c={ASH}>Body</Mono>
              <textarea value={s.body} onChange={(e) => setStep(i, { body: e.target.value })} rows={5} style={{ ...field, resize: "vertical", lineHeight: 1.5 }} />
            </label>
          </div>
        ))}
        <button className="pressable" onClick={() => setEditing({ ...editing, steps: [...editing.steps, { delayHours: 24, subject: "", body: "", _key: newKey() }] })} style={ghostBtn()}>+ Add step</button>

        <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0", cursor: "pointer" }}>
          <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
          <Mono s={{ fontSize: fs.body }} c={CHALK}>Active — start enrolling people when the trigger fires</Mono>
        </label>

        {err && <div role="alert"><Mono s={{ fontSize: fs.body, display: "block", marginBottom: 10 }} c={RED}>{err}</Mono></div>}
        <div style={{ display: "flex", gap: space.sm }}>
          <button className="pressable" onClick={save} disabled={busy} style={primaryBtn(!busy)}>{busy ? "Saving…" : "Save sequence"}</button>
          <button className="pressable" onClick={() => setEditing(null)} style={ghostBtn()}>Cancel</button>
        </div>
      </Card>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <Mono s={{ fontSize: fs.body }} c={ASH}>Automated lifecycle drips — welcome, win-back, upgrade nudges.</Mono>
        <button className="pressable" onClick={() => { setErr(null); setEditing({ ...EMPTY_SEQUENCE, steps: keyed([{ delayHours: 0, subject: "", body: "" }]) }); }} style={primaryBtn(true)}>+ New sequence</button>
      </div>
      {unavailable && <Card glass={false} style={{ marginBottom: 12, borderLeft: `3px solid ${AMBER}` }}><Mono c={AMBER}>Run reference/sql-email.sql to create the email tables.</Mono></Card>}
      {list?.length === 0 && !unavailable && <Mono c={ASH}>No sequences yet.</Mono>}
      {list?.map((s) => (
        <Card key={s.id} glass={false} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: space.md }}>
            <div>
              <div style={{ ...disp, fontWeight: 700, fontSize: fs.subtitle }}>{s.name}</div>
              <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap", marginTop: 6 }}>
                <Chip c={s.active ? LIME : ASH}>{s.active ? "active" : "paused"}</Chip>
                <Chip c={ASH}>{EMAIL_TRIGGERS.find((t) => t.id === s.trigger)?.label ?? s.trigger}</Chip>
                <Chip c={VIOLET}>{s.steps.length} step{s.steps.length === 1 ? "" : "s"}</Chip>
                <Chip c={CHALK}>{s._count?.enrollments ?? 0} enrolled</Chip>
              </div>
            </div>
            <div style={{ display: "flex", gap: space.xs, flexShrink: 0 }}>
              <button className="pressable" onClick={() => toggleActive(s)} style={smallBtn(s.active ? AMBER : LIME)}>{s.active ? "Pause" : "Activate"}</button>
              <button className="pressable" onClick={() => { setErr(null); setEditing({ ...s, steps: keyed(s.steps) }); }} style={smallBtn(CHALK)}>Edit</button>
              <button className="pressable" onClick={() => remove(s)} style={smallBtn(RED)}>Delete</button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------
// shared button styles
// --------------------------------------------------------------------------

function primaryBtn(enabled: boolean) {
  return { ...disp, fontWeight: 800, fontSize: fs.bodyLg, color: ON_ACCENT, background: enabled ? AMBER : LINE, border: "none", borderRadius: "var(--r-field)", padding: "10px 18px", cursor: enabled ? "pointer" : "default", whiteSpace: "nowrap" as const };
}
function ghostBtn() {
  return { ...disp, fontWeight: 700, fontSize: fs.bodyLg, color: txt(CHALK), background: "transparent", border: `1px solid ${LINE}`, borderRadius: "var(--r-field)", padding: "10px 18px", cursor: "pointer" as const };
}
function smallBtn(c: string) {
  return { ...mono, fontSize: fs.caption, fontWeight: 700, color: txt(c), background: `${c}14`, border: `1px solid ${c}55`, borderRadius: "var(--r-field)", padding: "6px 12px", cursor: "pointer" as const };
}
