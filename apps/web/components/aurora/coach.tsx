"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode, SelectHTMLAttributes } from "react";
import { fs, space,
  sessionVolume,
  weeklyRecap,
  buildMacrocycle,
  buildTrainingWeek,
  trainingDaysPerWeek,
  toTrainingLog,
  type LoggedSession,
} from "@hybrid/core";
import CoachInvite from "../coach-invite";
import CoachDiet from "../coach-diet";
import { useLang } from "@/lib/i18n";

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20, marginBottom: 12 } as const;
const fieldStyle = (extra: CSSProperties = {}): CSSProperties => ({
  fontFamily: "var(--font-mono)",
  fontSize: fs.bodyLg,
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

const personName = (p: Person | undefined, t: (k: string) => string) => p?.name || p?.email?.split("@")[0] || t("w.teams.coach.athleteFallback");

/** AURORA Coach (web) — same /api/coach/* flows as the classic CoachScreen, in
 *  the rounded Aurora style. */
export default function AuroraCoach() {
  const { t } = useLang();
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
      setMsg({ text: `${t("w.teams.coach.inviteSent")} ${email}.`, ok: true });
      setEmail("");
      load();
    } else {
      setMsg({ text: j.error ?? t("w.teams.coach.inviteFailed"), ok: false });
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

  if (!data) return <Mono>{t("w.teams.coach.loading")}</Mono>;

  const incoming = data.asClient.filter((l) => l.status === "PENDING");
  const coaches = data.asClient.filter((l) => l.status === "ACTIVE");
  const clients = data.asCoach.filter((l) => l.status === "ACTIVE");
  const sent = data.asCoach.filter((l) => l.status === "PENDING");

  return (
    <div style={{ maxWidth: 820, fontFamily: "var(--font-display)", color: C("chalk") }}>
      {/* incoming requests */}
      {incoming.length > 0 && (
        <Section title={t("w.teams.coach.requestsTitle")} color={C("violet")}>
          {incoming.map((l) => (
            <div key={l.id} style={{ ...card, }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: fs.note }}>{personName(l.coach, t)}</div>
                  <Mono s={{ fontSize: fs.caption }}>{t("w.teams.coach.wantsToCoach")}</Mono>
                </div>
                <div style={{ display: "flex", gap: space.sm }}>
                  <Btn label={t("w.teams.coach.accept")} color={C("lime")} onClick={() => act(l.id, "accept")} />
                  <Btn label={t("w.teams.coach.decline")} color={C("ash")} onClick={() => act(l.id, "end")} />
                </div>
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* your coaches */}
      <Section title={t("w.teams.coach.yourCoach")} color={C("lime")}>
        {coaches.length === 0 ? (
          <Mono s={{ display: "block", marginBottom: 12 }}>{t("w.teams.coach.noCoach")}</Mono>
        ) : (
          coaches.map((l) => (
            <div key={l.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 700, fontSize: fs.note }}>{personName(l.coach, t)}</div>
                <Btn label={t("w.teams.coach.end")} color={C("ash")} onClick={() => act(l.id, "end")} />
              </div>
            </div>
          ))
        )}
      </Section>

      {/* coaching: invite + roster */}
      <Section title={t("w.teams.coach.coaching")} color={C("violet")}>
        <div style={card}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }}>{t("w.teams.coach.inviteAnAthlete")}</Mono>
          <div style={{ display: "flex", gap: space.sm, marginTop: 10 }}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="athlete@email.com"
              aria-label={t("w.teams.coach.athleteEmailLabel")}
              style={fieldStyle({ flex: 1 })}
            />
            <Btn label={t("w.teams.coach.invite")} color={C("lime")} onClick={invite} />
          </div>
          {msg && (
            <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 8 }} c={msg.ok ? C("lime") : C("amber")}>
              {msg.text}
            </Mono>
          )}
        </div>

        {/* Onboard a brand-new client (not on HYBRID yet) via link / QR / email. */}
        <CoachInvite />

        {clients.map((l) => (
          <div key={l.id} onClick={() => setOpenLink(l)} style={{ ...card, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: fs.note }}>{personName(l.client, t)}</div>
                <Mono s={{ fontSize: fs.caption }}>{l.client?.email}</Mono>
              </div>
              <Mono s={{ fontSize: fs.caption }} c={C("lime")}>{t("w.teams.coach.open")} →</Mono>
            </div>
          </div>
        ))}

        {sent.map((l) => (
          <div key={l.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: fs.note }}>{personName(l.client, t)}</div>
                <Chip c={C("amber")}>{t("w.teams.coach.pending")}</Chip>
              </div>
              <Btn label={t("w.teams.coach.cancel")} color={C("ash")} onClick={() => act(l.id, "end")} />
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
  const { t } = useLang();
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
      if (!enrolled.ok) { setGenMsg(t("w.teams.coach.enrollFailed")); return; }
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
      setGenMsg(ok ? `${t("w.teams.coach.enrolled")} ${genGoal} + ${t("w.teams.coach.assignedSessions").replace("{n}", String(ok))} (${t("w.teams.coach.wkAbbr")} ${wk}, ${days}/${t("w.teams.coach.weekAbbr")}).` : t("w.teams.coach.generateFailed"));
      load();
    } catch {
      setGenMsg(t("w.teams.coach.generateFailed"));
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
        <Mono s={{ fontSize: fs.caption, textTransform: "uppercase", letterSpacing: ".06em" }} c={C("ash")}>← {t("w.teams.coach.roster")}</Mono>
      </button>
      <h2 style={{ fontWeight: 900, fontSize: fs.display, marginBottom: 4 }}>{personName(link.client, t)}</h2>
      <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 10 }}>{link.client?.email}</Mono>

      <div style={{ display: "flex", gap: space.xs, alignItems: "center", flexWrap: "wrap", marginBottom: 18 }}>
        {tags.map((tg) => (
          <span key={tg} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("blue"), background: `color-mix(in srgb, ${C("blue")} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${C("blue")} 33%, transparent)`, borderRadius: 999, padding: "3px 8px 3px 10px", display: "inline-flex", alignItems: "center", gap: space.xs }}>
            {tg}
            <button aria-label={`${t("w.teams.coach.removeTag")} ${tg}`} onClick={() => saveTags(tags.filter((x) => x !== tg))} style={{ background: "none", border: "none", color: C("blue"), cursor: "pointer", padding: 0, fontSize: fs.body, lineHeight: 1 }}>×</button>
          </span>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addTag(); }}
          placeholder={t("w.teams.coach.tagPlaceholder")}
          aria-label={t("w.teams.coach.addTagLabel")}
          style={fieldStyle({ fontSize: fs.caption, width: 90, padding: "6px 10px", borderRadius: 999, background: C("ink2") })}
        />
      </div>

      <Section title={t("w.teams.coach.diet")} color={C("lime")}>
        <CoachDiet linkId={link.id} />
      </Section>

      <Section title={t("w.teams.coach.coachingNotes")} color={C("violet")}>
        <div style={card}>
          <textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder={t("w.teams.coach.addNotePlaceholder")}
            aria-label={t("w.teams.coach.addNoteLabel")}
            rows={2}
            style={fieldStyle({ width: "100%", resize: "vertical", background: C("ink2"), boxSizing: "border-box" })}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: space.xs, cursor: "pointer" }}>
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
              <Mono s={{ fontSize: fs.caption }} c={isPrivate ? C("amber") : C("ash")}>{t("w.teams.coach.privateNote")}</Mono>
            </label>
            <Btn label={t("w.teams.coach.addNote")} color={C("lime")} onClick={addNote} />
          </div>
        </div>
        {notes.map((n) => (
          <div key={n.id} style={{ ...card, }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {n.private ? <Chip c={C("amber")}>{t("w.teams.coach.private")}</Chip> : <span />}
              <Mono s={{ fontSize: fs.micro }}>{new Date(n.createdAt).toLocaleDateString()}</Mono>
            </div>
            <Mono s={{ fontSize: fs.bodyLg, lineHeight: 1.5, display: "block", marginTop: 6 }} c={C("chalk")}>{n.body}</Mono>
          </div>
        ))}
      </Section>

      <Section title={t("w.teams.coach.programming")} color={C("lime")}>
        <div style={card}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }}>{t("w.teams.coach.assignWorkout")}</Mono>
          {templates.length === 0 ? (
            <Mono s={{ fontSize: fs.body, display: "block", marginTop: 8 }}>
              {t("w.teams.coach.noTemplates")}
            </Mono>
          ) : (
            <div style={{ display: "flex", gap: space.sm, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
              <Select value={assignId} onChange={(e) => setAssignId(e.target.value)} aria-label={t("w.teams.coach.chooseTemplateLabel")}
                style={{ fontSize: fs.bodyLg, flex: 1, minWidth: 180 }}>
                <option value="">{t("w.teams.coach.chooseTemplate")}</option>
                {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
              </Select>
              <input type="date" value={assignDate} onChange={(e) => setAssignDate(e.target.value)} aria-label={t("w.teams.coach.assignDateLabel")}
                style={fieldStyle({ padding: "10px 12px" })} />
              <Btn label={t("w.teams.coach.assign")} color={assignId ? C("lime") : C("ash")} onClick={assign} />
            </div>
          )}
        </div>
        <div style={card}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={C("violet")}>{t("w.teams.coach.generatePeriodizedWeek")}</Mono>
          <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 6, lineHeight: 1.5 }}>
            {sessions.length === 0
              ? t("w.teams.coach.genEmptyHint")
              : `${t("w.teams.coach.genHintPre")} (~${trainingDaysPerWeek(sessions)}/${t("w.teams.coach.wkAbbr")}), ${t("w.teams.coach.genHintPost")}`}
          </Mono>
          <div style={{ display: "flex", gap: space.sm, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Select value={genGoal} onChange={(e) => { setGenGoal(e.target.value); setGenWeek(1); }} aria-label={t("w.teams.coach.goalLabel")} style={{ fontSize: fs.bodyLg, flex: 1, minWidth: 150 }}>
              {GEN_GOALS.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
            <Select value={String(Math.min(genWeek, genMacro.totalWeeks))} onChange={(e) => setGenWeek(Number(e.target.value))} aria-label={t("w.teams.coach.weekLabel")} style={{ fontSize: fs.bodyLg, minWidth: 150 }}>
              {genMacro.blocks.flatMap((b) =>
                b.micros.map((m) => (
                  <option key={m.week} value={m.week}>{`${t("w.teams.coach.wkAbbr")} ${m.week} · ${b.label}${m.kind === "recovery" ? ` (${t("w.teams.coach.deload")})` : ""}`}</option>
                )),
              )}
            </Select>
            <Btn label={generating ? t("w.teams.coach.generating") : t("w.teams.coach.generateAssign")} color={sessions.length > 0 && !generating ? C("violet") : C("ash")} onClick={generateWeek} />
          </div>
          {genMsg && <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 8 }} c={C("lime")}>{genMsg}</Mono>}
        </div>
        {assignments.map((a) => (
          <div key={a.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: fs.note }}>{a.name}</div>
                <Mono s={{ fontSize: fs.caption }}>{new Date(a.date).toLocaleDateString()}</Mono>
              </div>
              <Chip c={a.status === "completed" ? C("lime") : a.status === "skipped" ? C("red") : C("amber")}>{a.status}</Chip>
            </div>
          </div>
        ))}
      </Section>

      <Section title={t("w.teams.coach.weeklyCheckins")} color={C("blue")}>
        {checkins.length === 0 ? (
          <Mono>{t("w.teams.coach.noCheckins")}</Mono>
        ) : (
          checkins.map((c) => (
            <div key={c.id} style={{ ...card, }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 600, fontSize: fs.note }}>{new Date(c.weekOf).toLocaleDateString()}</div>
                {c.adherencePct != null && <Mono s={{ fontSize: fs.caption }}>{c.adherencePct}% {t("w.teams.coach.adherence")}</Mono>}
              </div>
              <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 6 }}>
                {t("w.teams.coach.energy")} {c.energy ?? "—"} · {t("w.teams.coach.sleep")} {c.sleep ?? "—"} · {t("w.teams.coach.soreness")} {c.soreness ?? "—"} · {t("w.teams.coach.mood")} {c.mood ?? "—"}
                {c.bodyMassKg != null ? ` · ${c.bodyMassKg}kg` : ""}
              </Mono>
              {c.note && <Mono s={{ fontSize: fs.bodyLg, lineHeight: 1.5, display: "block", marginTop: 6 }} c={C("chalk")}>{c.note}</Mono>}
              {c.coachReply ? (
                <div style={{ marginTop: 10, paddingLeft: 10 }}>
                  <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={C("violet")}>{t("w.teams.coach.yourReply")}</Mono>
                  <Mono s={{ fontSize: fs.bodyLg, lineHeight: 1.5, display: "block", marginTop: 4 }} c={C("chalk")}>{c.coachReply}</Mono>
                </div>
              ) : replyFor === c.id ? (
                <div style={{ marginTop: 10 }}>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={t("w.teams.coach.replyPlaceholder")}
                    aria-label={t("w.teams.coach.replyLabel")}
                    rows={2}
                    style={fieldStyle({ width: "100%", resize: "vertical", background: C("ink2"), boxSizing: "border-box" })}
                  />
                  <div style={{ display: "flex", gap: space.sm, marginTop: 8 }}>
                    <Btn label={t("w.teams.coach.sendReply")} color={C("lime")} onClick={() => sendReply(c.id)} />
                    <Btn label={t("w.teams.coach.cancel")} color={C("ash")} onClick={() => { setReplyFor(null); setReplyText(""); }} />
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 10 }}>
                  <Btn label={t("w.teams.coach.reply")} color={C("violet")} onClick={() => { setReplyFor(c.id); setReplyText(""); }} />
                </div>
              )}
            </div>
          ))
        )}
      </Section>

      {sessions.length > 0 && <ClientWeek sessions={sessions} />}

      <Section title={t("w.teams.coach.recentSessions")} color={C("lime")}>
        {sessions.length === 0 ? (
          <Mono>{t("w.teams.coach.noSessions")}</Mono>
        ) : (
          sessions.map((s) => (
            <div key={s.id} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 600, fontSize: fs.note }}>{s.title}</div>
                <Mono s={{ fontSize: fs.caption }}>{new Date(s.startedAt).toLocaleDateString()}</Mono>
              </div>
              <div style={{ display: "flex", gap: space.sm, marginTop: 6 }}>
                <Chip c={C("ash")}>{sessionVolume(s.blocks).toLocaleString()} kg</Chip>
                <Chip c={C("ash")}>{s.blocks.length} {t("w.teams.coach.blocks")}</Chip>
                {typeof s.readiness === "number" && <Chip c={C("lime")}>{t("w.teams.coach.readiness")} {s.readiness}</Chip>}
              </div>
            </div>
          ))
        )}
      </Section>
    </div>
  );
}

const MUSCLE_LABEL: Record<string, string> = {
  quads: "w.teams.coach.muscle.quads", glutes: "w.teams.coach.muscle.glutes", posterior: "w.teams.coach.muscle.posterior", back: "w.teams.coach.muscle.back",
  chest: "w.teams.coach.muscle.chest", shoulders: "w.teams.coach.muscle.shoulders", triceps: "w.teams.coach.muscle.triceps",
};

// Coach's at-a-glance read on the athlete's current week — same engine the
// athlete sees on their own Today, so coach and client share one source of truth.
function ClientWeek({ sessions }: { sessions: LoggedSession[] }) {
  const { t } = useLang();
  const r = weeklyRecap(sessions);
  const hasPrev = r.prevSessions > 0 || r.prevVolume > 0;
  return (
    <Section title={t("w.teams.coach.thisWeek")} color={C("lime")}>
      <div style={card}>
        {r.sessions === 0 ? (
          <Mono>{t("w.teams.coach.noSessions7d")}</Mono>
        ) : (
          <>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
              <Metric label={t("w.teams.coach.metricSessions")} value={`${r.sessions}`} c={C("chalk")} />
              <Metric label={t("w.teams.coach.metricVolume")} value={`${r.volume.toLocaleString()} kg`} c={C("lime")} />
              <Metric label={t("w.teams.coach.metricSets")} value={`${r.sets}`} c={C("chalk")} />
              <Metric label={t("w.teams.coach.metricActiveDays")} value={`${r.activeDays}`} c={C("chalk")} />
              {r.topMuscle && <Metric label={t("w.teams.coach.metricTopMuscle")} value={MUSCLE_LABEL[r.topMuscle.muscle] ? t(MUSCLE_LABEL[r.topMuscle.muscle]!) : r.topMuscle.muscle} c={C("blue")} />}
              <Metric label={t("w.teams.coach.metricPRs")} value={`${r.prs.length}`} c={r.prs.length ? C("lime") : C("ash")} />
            </div>
            {hasPrev && (
              <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 12 }} c={r.volumeDelta >= 0 ? C("lime") : C("amber")}>
                {r.sessionsDelta >= 0 ? "+" : ""}{r.sessionsDelta} {t("w.teams.coach.sessionsWord")} · {r.volumeDelta >= 0 ? "+" : ""}
                {r.volumeDelta.toLocaleString()} {t("w.teams.coach.kgVsLastWeek")}
              </Mono>
            )}
            {r.prs.length > 0 && (
              <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 8 }} c={C("chalk")}>
                🏆 {r.prs.slice(0, 4).map((p) => `${p.lift} ${p.e1rm}kg${p.previous == null ? ` (${t("w.teams.coach.first")})` : ` (+${p.e1rm - p.previous})`}`).join(" · ")}
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
      <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</Mono>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", display: "block", margin: "12px 0 8px" }} c={color}>
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
        fontSize: fs.micro,
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
        fontSize: fs.body,
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
        fontSize: fs.body,
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
