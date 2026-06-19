"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode, SelectHTMLAttributes } from "react";
import {
  sessionVolume,
  weeklyRecap,
  buildMacrocycle,
  buildTrainingWeek,
  trainingDaysPerWeek,
  toTrainingLog,
  type LoggedSession,
} from "@hybrid/core";
import CoachInvite from "../coach-invite";

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 24, padding: 20, marginBottom: 12 } as const;
const fieldStyle = (extra: CSSProperties = {}): CSSProperties => ({
  fontFamily: "var(--font-mono)",
  fontSize: 14,
  padding: "11px 14px",
  borderRadius: 14,
  background: C("ink"),
  color: C("chalk"),
  border: `1px solid ${C("line")}`,
  outline: "none",
  ...extra,
});

// goals whose periodization model is meaningful (MODEL_FOR-mapped), for the
// coach's one-click week generator.
const GEN_GOALS = ["Hybrid", "Powerlifting", "Bodybuilding", "Running", "Cycling", "Hyrox", "Triathlon"];

type Person = { id: string; name: string | null; email: string };
type Status = "PENDING" | "ACTIVE" | "ENDED";
type CoachLink = { id: string; status: Status; client?: Person; coach?: Person };
type Links = { asCoach: CoachLink[]; asClient: CoachLink[] };

const personName = (p?: Person) => p?.name || p?.email?.split("@")[0] || "Athlete";

/** AURORA Coach (web) — same /api/coach/* flows as the classic CoachScreen, in
 *  the rounded Aurora style. */
export default function AuroraCoach() {
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
    <div style={{ maxWidth: 820, fontFamily: "var(--font-display)", color: C("chalk") }}>
      {/* incoming requests */}
      {incoming.length > 0 && (
        <Section title="Coaching requests" color={C("violet")}>
          {incoming.map((l) => (
            <div key={l.id} style={{ ...card, borderLeft: `3px solid ${C("violet")}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{personName(l.coach)}</div>
                  <Mono s={{ fontSize: 12 }}>wants to coach you</Mono>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn label="Accept" color={C("lime")} onClick={() => act(l.id, "accept")} />
                  <Btn label="Decline" color={C("ash")} onClick={() => act(l.id, "end")} />
                </div>
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* your coaches */}
      <Section title="Your coach" color={C("lime")}>
        {coaches.length === 0 ? (
          <Mono s={{ display: "block", marginBottom: 12 }}>No coach yet.</Mono>
        ) : (
          coaches.map((l) => (
            <div key={l.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{personName(l.coach)}</div>
                <Btn label="End" color={C("ash")} onClick={() => act(l.id, "end")} />
              </div>
            </div>
          ))
        )}
      </Section>

      {/* coaching: invite + roster */}
      <Section title="Coaching" color={C("violet")}>
        <div style={card}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>Invite an athlete</Mono>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="athlete@email.com"
              aria-label="Athlete email"
              style={fieldStyle({ flex: 1 })}
            />
            <Btn label="Invite" color={C("lime")} onClick={invite} />
          </div>
          {msg && (
            <Mono s={{ fontSize: 12, display: "block", marginTop: 8 }} c={msg.ok ? C("lime") : C("amber")}>
              {msg.text}
            </Mono>
          )}
        </div>

        {/* Onboard a brand-new client (not on HYBRID yet) via link / QR / email. */}
        <CoachInvite />

        {clients.map((l) => (
          <div key={l.id} onClick={() => setOpenLink(l)} style={{ ...card, borderLeft: `3px solid ${C("lime")}`, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{personName(l.client)}</div>
                <Mono s={{ fontSize: 12 }}>{l.client?.email}</Mono>
              </div>
              <Mono s={{ fontSize: 12 }} c={C("lime")}>open →</Mono>
            </div>
          </div>
        ))}

        {sent.map((l) => (
          <div key={l.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{personName(l.client)}</div>
                <Chip c={C("amber")}>Pending</Chip>
              </div>
              <Btn label="Cancel" color={C("ash")} onClick={() => act(l.id, "end")} />
            </div>
          </div>
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
  const [genGoal, setGenGoal] = useState(GEN_GOALS[0]!);
  const [genWeek, setGenWeek] = useState(1);
  const genMacro = useMemo(() => buildMacrocycle(genGoal), [genGoal]);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const load = useCallback(async () => {
    const [s, n, c, t, a, lk] = await Promise.all([
      fetch(`/api/coach/links/${link.id}/sessions`).then((r) => (r.ok ? r.json() : { sessions: [] })),
      fetch(`/api/coach/links/${link.id}/notes`).then((r) => (r.ok ? r.json() : { notes: [] })),
      fetch(`/api/coach/links/${link.id}/checkins`).then((r) => (r.ok ? r.json() : { checkins: [] })),
      fetch(`/api/templates`).then((r) => (r.ok ? r.json() : { templates: [] })),
      fetch(`/api/coach/links/${link.id}/assignments`).then((r) => (r.ok ? r.json() : { assignments: [] })),
      fetch(`/api/coach/links/${link.id}`).then((r) => (r.ok ? r.json() : { link: { tags: [] } })),
    ]);
    setSessions(s.sessions ?? []);
    setNotes(n.notes ?? []);
    setCheckins(c.checkins ?? []);
    setTemplates(t.templates ?? []);
    setAssignments(a.assignments ?? []);
    setTags(lk.link?.tags ?? []);
  }, [link.id]);

  const saveTags = async (next: string[]) => {
    setTags(next);
    await fetch(`/api/coach/links/${link.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "tags", tags: next }),
    });
  };
  const addTag = () => {
    const v = tagInput.trim();
    if (!v || tags.includes(v)) return setTagInput("");
    saveTags([...tags, v]);
    setTagInput("");
  };

  const assign = async () => {
    const t = templates.find((x) => x.id === assignId);
    if (!t) return;
    const parsed = assignDate ? new Date(assignDate) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return; // ignore a cleared/invalid date
    await fetch(`/api/coach/links/${link.id}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: t.id, name: t.name, blocks: t.blocks, date: parsed.toISOString() }),
    });
    setAssignId("");
    load();
  };

  // Generate a varied, periodized week for this client and assign it — the same
  // reconciler the athlete's own Today uses, run on the client's real sessions.
  // Days/week is inferred from their actual cadence; loads dose off their logs.
  // The macrocycle is PERSISTED to the client first, so their Periodize/Today
  // show the same season the coach is programming against (one shared source).
  const generateWeek = async () => {
    if (generating) return;
    setGenerating(true);
    setGenMsg(null);
    try {
      const enrolled = await fetch(`/api/coach/links/${link.id}/macrocycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: genGoal }),
      });
      if (!enrolled.ok) { setGenMsg("Couldn't enroll the season — try again."); return; }
      const days = trainingDaysPerWeek(sessions);
      const wk = Math.max(1, Math.min(genMacro.totalWeeks, genWeek));
      const week = buildTrainingWeek({
        macro: genMacro,
        currentWeek: wk,
        log: toTrainingLog(sessions),
        daysPerWeek: days,
      });
      const results = await Promise.all(
        week.map((it) =>
          fetch(`/api/coach/links/${link.id}/assignments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: it.name, blocks: it.blocks, date: it.date }),
          }),
        ),
      );
      const ok = results.filter((r) => r.ok).length;
      setGenMsg(ok ? `Enrolled ${genGoal} + assigned ${ok} sessions (wk ${wk}, ${days}/week).` : "Couldn't generate — try again.");
      load();
    } catch {
      setGenMsg("Couldn't generate — try again.");
    } finally {
      setGenerating(false);
    }
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
    <div style={{ maxWidth: 820, fontFamily: "var(--font-display)", color: C("chalk") }}>
      <button onClick={back} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 8 }}>
        <Mono s={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em" }} c={C("ash")}>← Roster</Mono>
      </button>
      <h2 style={{ fontWeight: 900, fontSize: 26, marginBottom: 4 }}>{personName(link.client)}</h2>
      <Mono s={{ fontSize: 13, display: "block", marginBottom: 10 }}>{link.client?.email}</Mono>

      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 18 }}>
        {tags.map((t) => (
          <span key={t} style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("blue"), background: `color-mix(in srgb, ${C("blue")} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${C("blue")} 33%, transparent)`, borderRadius: 999, padding: "3px 8px 3px 10px", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {t}
            <button aria-label={`Remove tag ${t}`} onClick={() => saveTags(tags.filter((x) => x !== t))} style={{ background: "none", border: "none", color: C("blue"), cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
          </span>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addTag(); }}
          placeholder="+ tag"
          aria-label="Add tag"
          style={fieldStyle({ fontSize: 12, width: 90, padding: "6px 10px", borderRadius: 999, background: C("ink2") })}
        />
      </div>

      <Section title="Coaching notes" color={C("violet")}>
        <div style={card}>
          <textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder="Add a note…"
            aria-label="Add a note"
            rows={2}
            style={fieldStyle({ width: "100%", resize: "vertical", background: C("ink2"), boxSizing: "border-box" })}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
              <Mono s={{ fontSize: 12 }} c={isPrivate ? C("amber") : C("ash")}>Private (client never sees)</Mono>
            </label>
            <Btn label="Add note" color={C("lime")} onClick={addNote} />
          </div>
        </div>
        {notes.map((n) => (
          <div key={n.id} style={{ ...card, borderLeft: `3px solid ${n.private ? C("amber") : C("line")}` }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {n.private ? <Chip c={C("amber")}>Private</Chip> : <span />}
              <Mono s={{ fontSize: 11 }}>{new Date(n.createdAt).toLocaleDateString()}</Mono>
            </div>
            <Mono s={{ fontSize: 14, lineHeight: 1.5, display: "block", marginTop: 6 }} c={C("chalk")}>{n.body}</Mono>
          </div>
        ))}
      </Section>

      <Section title="Programming" color={C("lime")}>
        <div style={card}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>Assign a workout</Mono>
          {templates.length === 0 ? (
            <Mono s={{ fontSize: 13, display: "block", marginTop: 8 }}>
              No templates yet — build one on the Builder screen, then assign it here.
            </Mono>
          ) : (
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
              <Select value={assignId} onChange={(e) => setAssignId(e.target.value)} aria-label="Choose a template"
                style={{ fontSize: 14, flex: 1, minWidth: 180 }}>
                <option value="">Choose a template…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
              <input type="date" value={assignDate} onChange={(e) => setAssignDate(e.target.value)} aria-label="Assign date"
                style={fieldStyle({ padding: "10px 12px" })} />
              <Btn label="Assign" color={assignId ? C("lime") : C("ash")} onClick={assign} />
            </div>
          )}
        </div>
        <div style={card}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={C("violet")}>Generate a periodized week</Mono>
          <Mono s={{ fontSize: 12, display: "block", marginTop: 6, lineHeight: 1.5 }}>
            {sessions.length === 0
              ? "Once this athlete logs sessions, generate a varied week dosed from their own numbers."
              : `A phase-arbitrated week, days/week from their cadence (~${trainingDaysPerWeek(sessions)}/wk), loads from their logs.`}
          </Mono>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Select value={genGoal} onChange={(e) => { setGenGoal(e.target.value); setGenWeek(1); }} aria-label="Goal" style={{ fontSize: 14, flex: 1, minWidth: 150 }}>
              {GEN_GOALS.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
            <Select value={String(Math.min(genWeek, genMacro.totalWeeks))} onChange={(e) => setGenWeek(Number(e.target.value))} aria-label="Week" style={{ fontSize: 14, minWidth: 150 }}>
              {genMacro.blocks.flatMap((b) =>
                b.micros.map((m) => (
                  <option key={m.week} value={m.week}>{`Wk ${m.week} · ${b.label}${m.kind === "recovery" ? " (deload)" : ""}`}</option>
                )),
              )}
            </Select>
            <Btn label={generating ? "Generating…" : "Generate & assign"} color={sessions.length > 0 && !generating ? C("violet") : C("ash")} onClick={generateWeek} />
          </div>
          {genMsg && <Mono s={{ fontSize: 11, display: "block", marginTop: 8 }} c={C("lime")}>{genMsg}</Mono>}
        </div>
        {assignments.map((a) => (
          <div key={a.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{a.name}</div>
                <Mono s={{ fontSize: 12 }}>{new Date(a.date).toLocaleDateString()}</Mono>
              </div>
              <Chip c={a.status === "completed" ? C("lime") : a.status === "skipped" ? C("red") : C("amber")}>{a.status}</Chip>
            </div>
          </div>
        ))}
      </Section>

      <Section title="Weekly check-ins" color={C("blue")}>
        {checkins.length === 0 ? (
          <Mono>No check-ins submitted yet.</Mono>
        ) : (
          checkins.map((c) => (
            <div key={c.id} style={{ ...card, borderLeft: `3px solid ${c.coachReply ? C("line") : C("blue")}` }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{new Date(c.weekOf).toLocaleDateString()}</div>
                {c.adherencePct != null && <Mono s={{ fontSize: 12 }}>{c.adherencePct}% adherence</Mono>}
              </div>
              <Mono s={{ fontSize: 12, display: "block", marginTop: 6 }}>
                energy {c.energy ?? "—"} · sleep {c.sleep ?? "—"} · soreness {c.soreness ?? "—"} · mood {c.mood ?? "—"}
                {c.bodyMassKg != null ? ` · ${c.bodyMassKg}kg` : ""}
              </Mono>
              {c.note && <Mono s={{ fontSize: 14, lineHeight: 1.5, display: "block", marginTop: 6 }} c={C("chalk")}>{c.note}</Mono>}
              {c.coachReply ? (
                <div style={{ marginTop: 10, borderLeft: `2px solid ${C("violet")}`, paddingLeft: 10 }}>
                  <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={C("violet")}>Your reply</Mono>
                  <Mono s={{ fontSize: 14, lineHeight: 1.5, display: "block", marginTop: 4 }} c={C("chalk")}>{c.coachReply}</Mono>
                </div>
              ) : replyFor === c.id ? (
                <div style={{ marginTop: 10 }}>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Reply to your athlete…"
                    aria-label="Reply to your athlete"
                    rows={2}
                    style={fieldStyle({ width: "100%", resize: "vertical", background: C("ink2"), boxSizing: "border-box" })}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <Btn label="Send reply" color={C("lime")} onClick={() => sendReply(c.id)} />
                    <Btn label="Cancel" color={C("ash")} onClick={() => { setReplyFor(null); setReplyText(""); }} />
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 10 }}>
                  <Btn label="Reply" color={C("violet")} onClick={() => { setReplyFor(c.id); setReplyText(""); }} />
                </div>
              )}
            </div>
          ))
        )}
      </Section>

      {sessions.length > 0 && <ClientWeek sessions={sessions} />}

      <Section title="Recent sessions" color={C("lime")}>
        {sessions.length === 0 ? (
          <Mono>No sessions logged yet.</Mono>
        ) : (
          sessions.map((s) => (
            <div key={s.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{s.title}</div>
                <Mono s={{ fontSize: 12 }}>{new Date(s.startedAt).toLocaleDateString()}</Mono>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <Chip c={C("ash")}>{sessionVolume(s.blocks).toLocaleString()} kg</Chip>
                <Chip c={C("ash")}>{s.blocks.length} blocks</Chip>
                {typeof s.readiness === "number" && <Chip c={C("lime")}>readiness {s.readiness}</Chip>}
              </div>
            </div>
          ))
        )}
      </Section>
    </div>
  );
}

const MUSCLE_LABEL: Record<string, string> = {
  quads: "Quads", glutes: "Glutes", posterior: "Posterior chain", back: "Back",
  chest: "Chest", shoulders: "Shoulders", triceps: "Triceps",
};

// Coach's at-a-glance read on the athlete's current week — same engine the
// athlete sees on their own Today, so coach and client share one source of truth.
function ClientWeek({ sessions }: { sessions: LoggedSession[] }) {
  const r = weeklyRecap(sessions);
  const hasPrev = r.prevSessions > 0 || r.prevVolume > 0;
  return (
    <Section title="This week" color={C("lime")}>
      <div style={card}>
        {r.sessions === 0 ? (
          <Mono>No sessions logged in the last 7 days.</Mono>
        ) : (
          <>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
              <Metric label="Sessions" value={`${r.sessions}`} c={C("chalk")} />
              <Metric label="Volume" value={`${r.volume.toLocaleString()} kg`} c={C("lime")} />
              <Metric label="Sets" value={`${r.sets}`} c={C("chalk")} />
              <Metric label="Active days" value={`${r.activeDays}`} c={C("chalk")} />
              {r.topMuscle && <Metric label="Top muscle" value={MUSCLE_LABEL[r.topMuscle.muscle] ?? r.topMuscle.muscle} c={C("blue")} />}
              <Metric label="PRs" value={`${r.prs.length}`} c={r.prs.length ? C("lime") : C("ash")} />
            </div>
            {hasPrev && (
              <Mono s={{ fontSize: 12, display: "block", marginTop: 12 }} c={r.volumeDelta >= 0 ? C("lime") : C("amber")}>
                {r.sessionsDelta >= 0 ? "+" : ""}{r.sessionsDelta} sessions · {r.volumeDelta >= 0 ? "+" : ""}
                {r.volumeDelta.toLocaleString()} kg vs last week
              </Mono>
            )}
            {r.prs.length > 0 && (
              <Mono s={{ fontSize: 12, display: "block", marginTop: 8 }} c={C("chalk")}>
                🏆 {r.prs.slice(0, 4).map((p) => `${p.lift} ${p.e1rm}kg${p.previous == null ? " (first!)" : ` (+${p.e1rm - p.previous})`}`).join(" · ")}
              </Mono>
            )}
          </>
        )}
      </div>
    </Section>
  );
}

function Metric({ label, value, c }: { label: string; value: string; c: string }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, color: c }}>{value}</div>
      <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</Mono>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", display: "block", margin: "12px 0 8px" }} c={color}>
        {title}
      </Mono>
      {children}
    </div>
  );
}

function Mono({ children, s = {}, c = C("ash") }: { children: ReactNode; s?: CSSProperties; c?: string }) {
  return <span style={{ fontFamily: "var(--font-mono)", color: c, ...s }}>{children}</span>;
}

function Chip({ children, c = C("lime") }: { children: ReactNode; c?: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        background: `color-mix(in srgb, ${c} 14%, transparent)`,
        color: c,
        borderRadius: 999,
        padding: "3px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        whiteSpace: "nowrap",
        marginRight: 6,
        marginBottom: 4,
      }}
    >
      {children}
    </span>
  );
}

function Select({
  children,
  style = {},
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "style"> & { style?: CSSProperties }) {
  return (
    <select
      {...rest}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 13,
        padding: "10px 14px",
        borderRadius: 14,
        background: C("ink"),
        color: C("chalk"),
        border: `1px solid ${C("line")}`,
        outline: "none",
        cursor: "pointer",
        ...style,
      }}
    >
      {children}
    </select>
  );
}

function Btn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  const ghost = color === C("ash");
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 13,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: ".04em",
        color: ghost ? C("ash") : C("ink"),
        background: ghost ? "transparent" : color,
        border: `1px solid ${ghost ? C("line") : color}`,
        borderRadius: 999,
        padding: "9px 16px",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
