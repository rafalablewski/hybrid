"use client";

import { useCallback, useEffect, useState } from "react";
import { sessionVolume, type LoggedSession } from "@hybrid/core";
import { INK2, LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED, disp, mono, Mono, Card, Chip } from "@/lib/ui";

type Person = { id: string; name: string | null; email: string };
type Status = "PENDING" | "ACTIVE" | "ENDED";
type CoachLink = { id: string; status: Status; client?: Person; coach?: Person };
type Links = { asCoach: CoachLink[]; asClient: CoachLink[] };

const personName = (p?: Person) => p?.name || p?.email?.split("@")[0] || "Athlete";

export default function CoachScreen() {
  const [data, setData] = useState<Links | null>(null);
  const [openLink, setOpenLink] = useState<CoachLink | null>(null);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/coach/links");
      if (res.ok) setData((await res.json()) as Links);
      else setData({ asCoach: [], asClient: [] });
    } catch {
      setData({ asCoach: [], asClient: [] });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const invite = async () => {
    setMsg(null);
    const res = await fetch("/api/coach/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      setMsg({ text: `Invite sent to ${email}.`, ok: true });
      setEmail("");
      load();
    } else {
      setMsg({ text: j.error ?? "Couldn't send invite.", ok: false });
    }
  };

  const act = async (id: string, action: "accept" | "end") => {
    await fetch(`/api/coach/links/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    load();
  };

  if (openLink) return <ClientDetail link={openLink} back={() => setOpenLink(null)} />;

  if (!data) return <Mono>Loading…</Mono>;

  const incoming = data.asClient.filter((l) => l.status === "PENDING");
  const coaches = data.asClient.filter((l) => l.status === "ACTIVE");
  const clients = data.asCoach.filter((l) => l.status === "ACTIVE");
  const sent = data.asCoach.filter((l) => l.status === "PENDING");

  return (
    <div style={{ maxWidth: 820 }}>
      {/* incoming requests */}
      {incoming.length > 0 && (
        <Section title="Coaching requests" color={VIOLET}>
          {incoming.map((l) => (
            <Card key={l.id} style={{ borderLeft: `3px solid ${VIOLET}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{personName(l.coach)}</div>
                  <Mono s={{ fontSize: 12 }}>wants to coach you</Mono>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn label="Accept" color={LIME} onClick={() => act(l.id, "accept")} />
                  <Btn label="Decline" color={ASH} onClick={() => act(l.id, "end")} />
                </div>
              </div>
            </Card>
          ))}
        </Section>
      )}

      {/* your coaches */}
      <Section title="Your coach" color={LIME}>
        {coaches.length === 0 ? (
          <Mono s={{ display: "block", marginBottom: 12 }}>No coach yet.</Mono>
        ) : (
          coaches.map((l) => (
            <Card key={l.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{personName(l.coach)}</div>
                <Btn label="End" color={ASH} onClick={() => act(l.id, "end")} />
              </div>
            </Card>
          ))
        )}
      </Section>

      {/* coaching: invite + roster */}
      <Section title="Coaching" color={VIOLET}>
        <Card>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>Invite an athlete</Mono>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="athlete@email.com"
              style={{ ...mono, fontSize: 14, flex: 1, padding: "10px 12px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none" }}
            />
            <Btn label="Invite" color={LIME} onClick={invite} />
          </div>
          {msg && (
            <Mono s={{ fontSize: 12, display: "block", marginTop: 8 }} c={msg.ok ? LIME : AMBER}>
              {msg.text}
            </Mono>
          )}
        </Card>

        {clients.map((l) => (
          <Card key={l.id} onClick={() => setOpenLink(l)} style={{ borderLeft: `3px solid ${LIME}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{personName(l.client)}</div>
                <Mono s={{ fontSize: 12 }}>{l.client?.email}</Mono>
              </div>
              <Mono s={{ fontSize: 12 }} c={LIME}>open →</Mono>
            </div>
          </Card>
        ))}

        {sent.map((l) => (
          <Card key={l.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{personName(l.client)}</div>
                <Chip c={AMBER}>Pending</Chip>
              </div>
              <Btn label="Cancel" color={ASH} onClick={() => act(l.id, "end")} />
            </div>
          </Card>
        ))}
      </Section>
    </div>
  );
}

type TemplateRow = { id: string; name: string; description: string | null; blocks: unknown[] };
type AssignmentRow = { id: string; name: string; date: string; status: string };

type ClientCheckin = {
  id: string; weekOf: string; bodyMassKg: number | null; energy: number | null; sleep: number | null;
  soreness: number | null; mood: number | null; adherencePct: number | null; note: string | null;
  coachReply: string | null; repliedAt: string | null;
};

function ClientDetail({ link, back }: { link: CoachLink; back: () => void }) {
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [notes, setNotes] = useState<{ id: string; body: string; private: boolean; createdAt: string }[]>([]);
  const [checkins, setCheckins] = useState<ClientCheckin[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [assignId, setAssignId] = useState("");
  const [assignDate, setAssignDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  const load = useCallback(async () => {
    const [s, n, c, t, a] = await Promise.all([
      fetch(`/api/coach/links/${link.id}/sessions`).then((r) => (r.ok ? r.json() : { sessions: [] })),
      fetch(`/api/coach/links/${link.id}/notes`).then((r) => (r.ok ? r.json() : { notes: [] })),
      fetch(`/api/coach/links/${link.id}/checkins`).then((r) => (r.ok ? r.json() : { checkins: [] })),
      fetch(`/api/templates`).then((r) => (r.ok ? r.json() : { templates: [] })),
      fetch(`/api/coach/links/${link.id}/assignments`).then((r) => (r.ok ? r.json() : { assignments: [] })),
    ]);
    setSessions(s.sessions ?? []);
    setNotes(n.notes ?? []);
    setCheckins(c.checkins ?? []);
    setTemplates(t.templates ?? []);
    setAssignments(a.assignments ?? []);
  }, [link.id]);

  const assign = async () => {
    const t = templates.find((x) => x.id === assignId);
    if (!t) return;
    await fetch(`/api/coach/links/${link.id}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: t.id, name: t.name, blocks: t.blocks, date: new Date(assignDate).toISOString() }),
    });
    setAssignId("");
    load();
  };

  const sendReply = async (id: string) => {
    if (!replyText.trim()) return;
    await fetch(`/api/checkins/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coachReply: replyText }),
    });
    setReplyFor(null);
    setReplyText("");
    load();
  };

  useEffect(() => {
    load();
  }, [load]);

  const addNote = async () => {
    if (!noteBody.trim()) return;
    await fetch(`/api/coach/links/${link.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: noteBody, private: isPrivate }),
    });
    setNoteBody("");
    setIsPrivate(false);
    load();
  };

  return (
    <div style={{ maxWidth: 820 }}>
      <button onClick={back} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 8 }}>
        <Mono s={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em" }} c={ASH}>← Roster</Mono>
      </button>
      <h2 style={{ ...disp, fontWeight: 900, fontSize: 26, marginBottom: 4 }}>{personName(link.client)}</h2>
      <Mono s={{ fontSize: 13, display: "block", marginBottom: 16 }}>{link.client?.email}</Mono>

      <Section title="Coaching notes" color={VIOLET}>
        <Card>
          <textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder="Add a note…"
            rows={2}
            style={{ ...mono, fontSize: 14, width: "100%", padding: "10px 12px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none", resize: "vertical" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
              <Mono s={{ fontSize: 12 }} c={isPrivate ? AMBER : ASH}>Private (client never sees)</Mono>
            </label>
            <Btn label="Add note" color={LIME} onClick={addNote} />
          </div>
        </Card>
        {notes.map((n) => (
          <Card key={n.id} style={{ borderLeft: `3px solid ${n.private ? AMBER : LINE}` }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {n.private ? <Chip c={AMBER}>Private</Chip> : <span />}
              <Mono s={{ fontSize: 11 }}>{new Date(n.createdAt).toLocaleDateString()}</Mono>
            </div>
            <Mono s={{ fontSize: 14, lineHeight: 1.5, display: "block", marginTop: 6 }} c={CHALK}>{n.body}</Mono>
          </Card>
        ))}
      </Section>

      <Section title="Programming" color={LIME}>
        <Card>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>Assign a workout</Mono>
          {templates.length === 0 ? (
            <Mono s={{ fontSize: 13, display: "block", marginTop: 8 }}>
              No templates yet — build one on the Builder screen, then assign it here.
            </Mono>
          ) : (
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
              <select value={assignId} onChange={(e) => setAssignId(e.target.value)}
                style={{ ...mono, fontSize: 14, flex: 1, minWidth: 180, padding: "9px 12px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}` }}>
                <option value="">Choose a template…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input type="date" value={assignDate} onChange={(e) => setAssignDate(e.target.value)}
                style={{ ...mono, fontSize: 14, padding: "9px 12px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}` }} />
              <Btn label="Assign" color={assignId ? LIME : ASH} onClick={assign} />
            </div>
          )}
        </Card>
        {assignments.map((a) => (
          <Card key={a.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{a.name}</div>
                <Mono s={{ fontSize: 12 }}>{new Date(a.date).toLocaleDateString()}</Mono>
              </div>
              <Chip c={a.status === "completed" ? LIME : a.status === "skipped" ? RED : AMBER}>{a.status}</Chip>
            </div>
          </Card>
        ))}
      </Section>

      <Section title="Weekly check-ins" color={BLUE}>
        {checkins.length === 0 ? (
          <Mono>No check-ins submitted yet.</Mono>
        ) : (
          checkins.map((c) => (
            <Card key={c.id} style={{ borderLeft: `3px solid ${c.coachReply ? LINE : BLUE}` }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ ...disp, fontWeight: 600, fontSize: 15 }}>{new Date(c.weekOf).toLocaleDateString()}</div>
                {c.adherencePct != null && <Mono s={{ fontSize: 12 }}>{c.adherencePct}% adherence</Mono>}
              </div>
              <Mono s={{ fontSize: 12, display: "block", marginTop: 6 }}>
                energy {c.energy ?? "—"} · sleep {c.sleep ?? "—"} · soreness {c.soreness ?? "—"} · mood {c.mood ?? "—"}
                {c.bodyMassKg != null ? ` · ${c.bodyMassKg}kg` : ""}
              </Mono>
              {c.note && <Mono s={{ fontSize: 14, lineHeight: 1.5, display: "block", marginTop: 6 }} c={CHALK}>{c.note}</Mono>}
              {c.coachReply ? (
                <div style={{ marginTop: 10, borderLeft: `2px solid ${VIOLET}`, paddingLeft: 10 }}>
                  <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>Your reply</Mono>
                  <Mono s={{ fontSize: 14, lineHeight: 1.5, display: "block", marginTop: 4 }} c={CHALK}>{c.coachReply}</Mono>
                </div>
              ) : replyFor === c.id ? (
                <div style={{ marginTop: 10 }}>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Reply to your athlete…"
                    rows={2}
                    style={{ ...mono, fontSize: 14, width: "100%", padding: "10px 12px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none", resize: "vertical", boxSizing: "border-box" }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <Btn label="Send reply" color={LIME} onClick={() => sendReply(c.id)} />
                    <Btn label="Cancel" color={ASH} onClick={() => { setReplyFor(null); setReplyText(""); }} />
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 10 }}>
                  <Btn label="Reply" color={VIOLET} onClick={() => { setReplyFor(c.id); setReplyText(""); }} />
                </div>
              )}
            </Card>
          ))
        )}
      </Section>

      <Section title="Recent sessions" color={LIME}>
        {sessions.length === 0 ? (
          <Mono>No sessions logged yet.</Mono>
        ) : (
          sessions.map((s) => (
            <Card key={s.id}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ ...disp, fontWeight: 600, fontSize: 15 }}>{s.title}</div>
                <Mono s={{ fontSize: 12 }}>{new Date(s.startedAt).toLocaleDateString()}</Mono>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <Chip c={ASH}>{sessionVolume(s.blocks).toLocaleString()} kg</Chip>
                <Chip c={ASH}>{s.blocks.length} blocks</Chip>
                {typeof s.readiness === "number" && <Chip c={LIME}>readiness {s.readiness}</Chip>}
              </div>
            </Card>
          ))
        )}
      </Section>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", display: "block", margin: "12px 0 8px" }} c={color}>
        {title}
      </Mono>
      {children}
    </div>
  );
}

function Btn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        fontFamily: "'Archivo Narrow', sans-serif",
        fontSize: 12,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: ".04em",
        color: color === ASH ? ASH : "#0c0d0c",
        background: color === ASH ? "transparent" : color,
        border: `1px solid ${color === ASH ? LINE : color}`,
        borderRadius: 8,
        padding: "7px 12px",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
