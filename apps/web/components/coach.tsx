"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  sessionVolume,
  weeklyRecap,
  buildMacrocycle,
  buildTrainingWeek,
  trainingDaysPerWeek,
  toTrainingLog,
  plansForGoal,
  type LoggedSession,
} from "@hybrid/core";
import { fs, space, INK2, LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED, ON_ACCENT, disp, cond, mono, txt, Mono, Card, Chip, Select } from "@/lib/ui";
import CoachPrograms from "./coach-programs";
import CoachInvite from "./coach-invite";
import CoachDiet from "./coach-diet";
import { useFlags } from "@/lib/use-flags";

// goals whose periodization model is meaningful (MODEL_FOR-mapped), for the
// coach's one-click week generator.
const GEN_GOALS = ["Hybrid", "Powerlifting", "Bodybuilding", "Running", "Cycling", "Hyrox", "Triathlon"];

type Person = { id: string; name: string | null; email: string; coachVerified?: boolean };
type Status = "PENDING" | "ACTIVE" | "ENDED";
type CoachLink = { id: string; status: Status; client?: Person; coach?: Person };
type Links = { asCoach: CoachLink[]; asClient: CoachLink[] };

const personName = (p?: Person) => p?.name || p?.email?.split("@")[0] || "Athlete";

// The verified-coach tick — shown next to a coach's name wherever a client sees
// them, once an admin has vetted their credentials.
const VerifiedTick = ({ p }: { p?: Person }) =>
  p?.coachVerified ? (
    <span title="Verified coach" style={{ color: txt(BLUE), marginLeft: 5 }}>✓</span>
  ) : null;

export default function CoachScreen() {
  const [data, setData] = useState<Links | null>(null);
  const [openLink, setOpenLink] = useState<CoachLink | null>(null);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const { isEnabled } = useFlags();

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
                  <div style={{ ...disp, fontWeight: 700, fontSize: fs.note }}>{personName(l.coach)}<VerifiedTick p={l.coach} /></div>
                  <Mono s={{ fontSize: fs.caption }}>wants to coach you</Mono>
                </div>
                <div style={{ display: "flex", gap: space.sm }}>
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
                <div style={{ ...disp, fontWeight: 700, fontSize: fs.note }}>{personName(l.coach)}<VerifiedTick p={l.coach} /></div>
                <Btn label="End" color={ASH} onClick={() => act(l.id, "end")} />
              </div>
            </Card>
          ))
        )}
      </Section>

      {/* coaching: invite + roster */}
      <Section title="Coaching" color={VIOLET}>
        <Card>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }}>Invite an athlete</Mono>
          <div style={{ display: "flex", gap: space.sm, marginTop: 10 }}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="athlete@email.com"
              style={{ ...mono, fontSize: fs.bodyLg, flex: 1, padding: "10px 12px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none" }}
            />
            <Btn label="Invite" color={LIME} onClick={invite} />
          </div>
          {msg && (
            <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 8 }} c={msg.ok ? LIME : AMBER}>
              {msg.text}
            </Mono>
          )}
        </Card>

        {/* Onboard a brand-new client (not on HYBRID yet) via link / QR / email. */}
        <CoachInvite />

        {clients.map((l) => (
          <Card key={l.id} onClick={() => setOpenLink(l)} style={{ borderLeft: `3px solid ${LIME}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ ...disp, fontWeight: 700, fontSize: fs.note }}>{personName(l.client)}</div>
                <Mono s={{ fontSize: fs.caption }}>{l.client?.email}</Mono>
              </div>
              <Mono s={{ fontSize: fs.caption }} c={LIME}>open →</Mono>
            </div>
          </Card>
        ))}

        {sent.map((l) => (
          <Card key={l.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ ...disp, fontWeight: 700, fontSize: fs.note }}>{personName(l.client)}</div>
                <Chip c={AMBER}>Pending</Chip>
              </div>
              <Btn label="Cancel" color={ASH} onClick={() => act(l.id, "end")} />
            </div>
          </Card>
        ))}
      </Section>

      {/* CLIENT GROUPS — bundle clients and push a whole plan to all of them at
          once (the solo-coach version of segmentation; Pro seat). Admin-gated by
          the coach.groups feature flag. */}
      {isEnabled("coach.groups") && (
        <Section title="Client groups" color={VIOLET}>
          <GroupsManager clients={clients.map((l) => ({ clientId: l.client?.id ?? "", name: personName(l.client) })).filter((c) => c.clientId)} />
        </Section>
      )}

      {/* PROGRAMS — coach-authored multi-week programs (type 3): build once,
          assign to a client or a whole group as scheduled sessions. Admin-gated
          by the coach.programs feature flag. */}
      {isEnabled("coach.programs") && (
        <Section title="Programs" color={LIME}>
          <CoachPrograms clients={clients.map((l) => ({ linkId: l.id, name: personName(l.client) }))} />
        </Section>
      )}
    </div>
  );
}

type Group = { id: string; name: string; clientIds: string[] };

// Solo-coach client groups: create a group, toggle which active clients belong,
// then assign a whole periodized plan (by goal) to everyone at once. Soft-
// degrades to an "enable it" note until reference/sql-coach-groups.sql is run.
function GroupsManager({ clients }: { clients: { clientId: string; name: string }[] }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [newName, setNewName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [goalFor, setGoalFor] = useState<Record<string, string>>({});
  const [planFor, setPlanFor] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    fetch("/api/coach/groups")
      .then((r) => r.json())
      .then((d) => {
        setUnavailable(Boolean(d.unavailable));
        setGroups((d.groups as Group[]) ?? []);
      })
      .catch(() => setGroups([]));
  }, []);
  useEffect(load, [load]);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch("/api/coach/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    if (res.ok) { setNewName(""); load(); }
    else { const j = await res.json().catch(() => ({})); setMsg(j.error ?? "Couldn't create the group."); }
  };
  const toggle = (g: Group, clientId: string) => {
    const has = g.clientIds.includes(clientId);
    // Send an atomic delta (not the whole array) so concurrent toggles don't
    // clobber each other server-side. Update this group optimistically.
    setGroups((prev) =>
      (prev ?? []).map((x) =>
        x.id === g.id
          ? { ...x, clientIds: has ? x.clientIds.filter((c) => c !== clientId) : [...x.clientIds, clientId] }
          : x,
      ),
    );
    fetch(`/api/coach/groups/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(has ? { removeClientId: clientId } : { addClientId: clientId }),
    }).catch(() => {});
  };
  const del = async (id: string) => { await fetch(`/api/coach/groups/${id}`, { method: "DELETE" }).catch(() => {}); load(); };
  const assign = async (g: Group) => {
    const goal = goalFor[g.id] || GEN_GOALS[0] || "Hybrid";
    const planId = planFor[g.id] || undefined; // "" = engine-prescribed by goal
    setMsg(null);
    const res = await fetch(`/api/coach/groups/${g.id}/assign-plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal, ...(planId ? { planId } : {}) }) });
    const j = (await res.json().catch(() => ({}))) as { assigned?: number; error?: string };
    const planName = planId ? plansForGoal(goal).find((p) => p.id === planId)?.name ?? goal : goal;
    setMsg(res.ok ? `Assigned “${planName}” to ${j.assigned} client${j.assigned === 1 ? "" : "s"}.` : (j.error ?? "Couldn't assign."));
    if (res.ok) load();
  };

  if (groups === null) return <Mono>Loading…</Mono>;

  return (
    <>
      {unavailable && (
        <Card style={{ borderLeft: `3px solid ${AMBER}` }}>
          <Mono s={{ fontSize: fs.caption, lineHeight: 1.6, display: "block" }} c={CHALK}>
            Groups aren&apos;t persisted yet — run <span style={{ color: txt(AMBER) }}>reference/sql-coach-groups.sql</span> in Supabase to enable them.
          </Mono>
        </Card>
      )}
      <Card>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }}>New group</Mono>
        <div style={{ display: "flex", gap: space.sm, marginTop: 10 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Tuesday 6am squad"
            style={{ ...mono, fontSize: fs.bodyLg, flex: 1, padding: "10px 12px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none" }} />
          <Btn label="Create" color={newName.trim() ? LIME : ASH} onClick={create} />
        </div>
      </Card>
      {msg && <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 4 }} c={LIME}>{msg}</Mono>}
      {groups.map((g) => (
        <Card key={g.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ ...disp, fontWeight: 700, fontSize: fs.note }}>{g.name}</div>
            <Btn label="Delete" color={ASH} onClick={() => del(g.id)} />
          </div>
          <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 4 }}>{g.clientIds.length} member{g.clientIds.length === 1 ? "" : "s"}</Mono>
          {clients.length === 0 ? (
            <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 8 }}>Invite athletes first — your active clients show up here to add.</Mono>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs, marginTop: 8 }}>
              {clients.map((c) => {
                const on = g.clientIds.includes(c.clientId);
                return (
                  <button key={c.clientId} onClick={() => toggle(g, c.clientId)}
                    style={{ ...mono, fontSize: fs.caption, padding: "6px 10px", borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? LIME : LINE}`, background: on ? `${LIME}1c` : "transparent", color: txt(on ? LIME : ASH) }}>
                    {on ? "✓ " : ""}{c.name}
                  </button>
                );
              })}
            </div>
          )}
          {(() => {
            const goal = goalFor[g.id] || GEN_GOALS[0] || "Hybrid";
            const named = plansForGoal(goal);
            return (
              <div style={{ display: "flex", gap: space.sm, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                <Select value={goal} onChange={(e) => { setGoalFor((m) => ({ ...m, [g.id]: e.target.value })); setPlanFor((m) => ({ ...m, [g.id]: "" })); }} style={{ fontSize: fs.bodyLg, flex: 1, minWidth: 130 }}>
                  {GEN_GOALS.map((gg) => <option key={gg} value={gg}>{gg}</option>)}
                </Select>
                <Select value={planFor[g.id] ?? ""} onChange={(e) => setPlanFor((m) => ({ ...m, [g.id]: e.target.value }))} style={{ fontSize: fs.bodyLg, flex: 1, minWidth: 150 }} disabled={named.length === 0}>
                  <option value="">{named.length ? "Engine-prescribed (by goal)" : "By goal (no named plans yet)"}</option>
                  {named.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                <Btn label="Assign plan to group" color={g.clientIds.length ? VIOLET : ASH} onClick={() => assign(g)} />
              </div>
            );
          })()}
        </Card>
      ))}
    </>
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
  const [genPlanId, setGenPlanId] = useState("");
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
  const assignFullPlan = async () => {
    if (generating) return;
    setGenerating(true);
    setGenMsg(null);
    try {
      const res = await fetch(`/api/coach/links/${link.id}/macrocycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: genGoal, ...(genPlanId ? { planId: genPlanId } : {}) }),
      });
      if (res.ok) {
        const planName = genPlanId ? plansForGoal(genGoal).find((p) => p.id === genPlanId)?.name ?? genGoal : genGoal;
        setGenMsg(`Assigned “${planName}” to ${personName(link.client)}'s account — it's now their plan on Today.`);
        load();
      } else {
        setGenMsg("Couldn't assign the plan — try again.");
      }
    } catch {
      setGenMsg("Couldn't assign the plan — try again.");
    } finally {
      setGenerating(false);
    }
  };

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
    <div style={{ maxWidth: 820 }}>
      <button onClick={back} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 8 }}>
        <Mono s={{ fontSize: fs.caption, textTransform: "uppercase", letterSpacing: ".06em" }} c={ASH}>← Roster</Mono>
      </button>
      <h2 style={{ ...disp, fontWeight: 900, fontSize: fs.display, marginBottom: 4 }}>{personName(link.client)}</h2>
      <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 10 }}>{link.client?.email}</Mono>

      <div style={{ display: "flex", gap: space.xs, alignItems: "center", flexWrap: "wrap", marginBottom: 18 }}>
        {tags.map((t) => (
          <span key={t} style={{ ...cond, fontSize: fs.caption, color: txt(BLUE), background: `${BLUE}1f`, border: `1px solid ${BLUE}55`, borderRadius: 999, padding: "3px 8px 3px 10px", display: "inline-flex", alignItems: "center", gap: space.xs }}>
            {t}
            <button onClick={() => saveTags(tags.filter((x) => x !== t))} style={{ background: "none", border: "none", color: txt(BLUE), cursor: "pointer", padding: 0, fontSize: fs.body, lineHeight: 1 }}>×</button>
          </span>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addTag(); }}
          placeholder="+ tag"
          style={{ ...mono, fontSize: fs.caption, width: 90, padding: "5px 8px", borderRadius: 999, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none" }}
        />
      </div>

      <Section title="Diet" color={LIME}>
        <CoachDiet linkId={link.id} />
      </Section>

      <Section title="Coaching notes" color={VIOLET}>
        <Card>
          <textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder="Add a note…"
            rows={2}
            style={{ ...mono, fontSize: fs.bodyLg, width: "100%", padding: "10px 12px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none", resize: "vertical" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: space.xs, cursor: "pointer" }}>
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
              <Mono s={{ fontSize: fs.caption }} c={isPrivate ? AMBER : ASH}>Private (client never sees)</Mono>
            </label>
            <Btn label="Add note" color={LIME} onClick={addNote} />
          </div>
        </Card>
        {notes.map((n) => (
          <Card key={n.id} style={{ borderLeft: `3px solid ${n.private ? AMBER : LINE}` }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {n.private ? <Chip c={AMBER}>Private</Chip> : <span />}
              <Mono s={{ fontSize: fs.micro }}>{new Date(n.createdAt).toLocaleDateString()}</Mono>
            </div>
            <Mono s={{ fontSize: fs.bodyLg, lineHeight: 1.5, display: "block", marginTop: 6 }} c={CHALK}>{n.body}</Mono>
          </Card>
        ))}
      </Section>

      <Section title="Programming" color={LIME}>
        <Card>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }}>Assign a workout</Mono>
          {templates.length === 0 ? (
            <Mono s={{ fontSize: fs.body, display: "block", marginTop: 8 }}>
              No templates yet — build one on the Builder screen, then assign it here.
            </Mono>
          ) : (
            <div style={{ display: "flex", gap: space.sm, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
              <Select value={assignId} onChange={(e) => setAssignId(e.target.value)}
                style={{ fontSize: fs.bodyLg, flex: 1, minWidth: 180 }}>
                <option value="">Choose a template…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
              <input type="date" value={assignDate} onChange={(e) => setAssignDate(e.target.value)}
                style={{ ...mono, fontSize: fs.bodyLg, padding: "9px 12px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}` }} />
              <Btn label="Assign" color={assignId ? LIME : ASH} onClick={assign} />
            </div>
          )}
        </Card>
        <Card>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }}>Assign a full plan</Mono>
          <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 6, lineHeight: 1.5 }}>
            Push a whole periodized plan into {personName(link.client)}&apos;s account — it becomes their plan on Today (adaptive, on your seat).
          </Mono>
          {(() => {
            const named = plansForGoal(genGoal);
            return (
              <div style={{ display: "flex", gap: space.sm, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                <Select value={genGoal} onChange={(e) => { setGenGoal(e.target.value); setGenWeek(1); setGenPlanId(""); }} style={{ fontSize: fs.bodyLg, flex: 1, minWidth: 130 }}>
                  {GEN_GOALS.map((g) => <option key={g} value={g}>{g}</option>)}
                </Select>
                <Select value={genPlanId} onChange={(e) => setGenPlanId(e.target.value)} style={{ fontSize: fs.bodyLg, flex: 1, minWidth: 150 }} disabled={named.length === 0}>
                  <option value="">{named.length ? "Engine-prescribed (by goal)" : "By goal (no named plans yet)"}</option>
                  {named.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                <Btn label={generating ? "Assigning…" : "Assign plan"} color={generating ? ASH : LIME} onClick={assignFullPlan} />
              </div>
            );
          })()}
        </Card>
        <Card>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>Generate a periodized week</Mono>
          <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 6, lineHeight: 1.5 }}>
            {sessions.length === 0
              ? "Once this athlete logs sessions, generate a varied week dosed from their own numbers."
              : `A phase-arbitrated week, days/week from their cadence (~${trainingDaysPerWeek(sessions)}/wk), loads from their logs.`}
          </Mono>
          <div style={{ display: "flex", gap: space.sm, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Select value={genGoal} onChange={(e) => { setGenGoal(e.target.value); setGenWeek(1); }} style={{ fontSize: fs.bodyLg, flex: 1, minWidth: 150 }}>
              {GEN_GOALS.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
            <Select value={String(Math.min(genWeek, genMacro.totalWeeks))} onChange={(e) => setGenWeek(Number(e.target.value))} style={{ fontSize: fs.bodyLg, minWidth: 150 }}>
              {genMacro.blocks.flatMap((b) =>
                b.micros.map((m) => (
                  <option key={m.week} value={m.week}>{`Wk ${m.week} · ${b.label}${m.kind === "recovery" ? " (deload)" : ""}`}</option>
                )),
              )}
            </Select>
            <Btn label={generating ? "Generating…" : "Generate & assign"} color={sessions.length > 0 && !generating ? VIOLET : ASH} onClick={generateWeek} />
          </div>
          {genMsg && <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 8 }} c={LIME}>{genMsg}</Mono>}
        </Card>
        {assignments.map((a) => (
          <Card key={a.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ ...disp, fontWeight: 700, fontSize: fs.note }}>{a.name}</div>
                <Mono s={{ fontSize: fs.caption }}>{new Date(a.date).toLocaleDateString()}</Mono>
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
                <div style={{ ...disp, fontWeight: 600, fontSize: fs.note }}>{new Date(c.weekOf).toLocaleDateString()}</div>
                {c.adherencePct != null && <Mono s={{ fontSize: fs.caption }}>{c.adherencePct}% adherence</Mono>}
              </div>
              <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 6 }}>
                energy {c.energy ?? "—"} · sleep {c.sleep ?? "—"} · soreness {c.soreness ?? "—"} · mood {c.mood ?? "—"}
                {c.bodyMassKg != null ? ` · ${c.bodyMassKg}kg` : ""}
              </Mono>
              {c.note && <Mono s={{ fontSize: fs.bodyLg, lineHeight: 1.5, display: "block", marginTop: 6 }} c={CHALK}>{c.note}</Mono>}
              {c.coachReply ? (
                <div style={{ marginTop: 10, borderLeft: `2px solid ${VIOLET}`, paddingLeft: 10 }}>
                  <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>Your reply</Mono>
                  <Mono s={{ fontSize: fs.bodyLg, lineHeight: 1.5, display: "block", marginTop: 4 }} c={CHALK}>{c.coachReply}</Mono>
                </div>
              ) : replyFor === c.id ? (
                <div style={{ marginTop: 10 }}>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Reply to your athlete…"
                    rows={2}
                    style={{ ...mono, fontSize: fs.bodyLg, width: "100%", padding: "10px 12px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none", resize: "vertical", boxSizing: "border-box" }}
                  />
                  <div style={{ display: "flex", gap: space.sm, marginTop: 8 }}>
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

      {sessions.length > 0 && <ClientWeek sessions={sessions} />}

      <Section title="Recent sessions" color={LIME}>
        {sessions.length === 0 ? (
          <Mono>No sessions logged yet.</Mono>
        ) : (
          sessions.map((s) => (
            <Card key={s.id}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ ...disp, fontWeight: 600, fontSize: fs.note }}>{s.title}</div>
                <Mono s={{ fontSize: fs.caption }}>{new Date(s.startedAt).toLocaleDateString()}</Mono>
              </div>
              <div style={{ display: "flex", gap: space.sm, marginTop: 6 }}>
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
    <Section title="This week" color={LIME}>
      <Card>
        {r.sessions === 0 ? (
          <Mono>No sessions logged in the last 7 days.</Mono>
        ) : (
          <>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
              <Metric label="Sessions" value={`${r.sessions}`} c={CHALK} />
              <Metric label="Volume" value={`${r.volume.toLocaleString()} kg`} c={LIME} />
              <Metric label="Sets" value={`${r.sets}`} c={CHALK} />
              <Metric label="Active days" value={`${r.activeDays}`} c={CHALK} />
              {r.topMuscle && <Metric label="Top muscle" value={MUSCLE_LABEL[r.topMuscle.muscle] ?? r.topMuscle.muscle} c={BLUE} />}
              <Metric label="PRs" value={`${r.prs.length}`} c={r.prs.length ? LIME : ASH} />
            </div>
            {hasPrev && (
              <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 12 }} c={r.volumeDelta >= 0 ? LIME : AMBER}>
                {r.sessionsDelta >= 0 ? "+" : ""}{r.sessionsDelta} sessions · {r.volumeDelta >= 0 ? "+" : ""}
                {r.volumeDelta.toLocaleString()} kg vs last week
              </Mono>
            )}
            {r.prs.length > 0 && (
              <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 8 }} c={CHALK}>
                🏆 {r.prs.slice(0, 4).map((p) => `${p.lift} ${p.e1rm}kg${p.previous == null ? " (first!)" : ` (+${p.e1rm - p.previous})`}`).join(" · ")}
              </Mono>
            )}
          </>
        )}
      </Card>
    </Section>
  );
}

function Metric({ label, value, c }: { label: string; value: string; c: string }) {
  return (
    <div>
      <div style={{ ...disp, fontWeight: 800, fontSize: 22, color: txt(c) }}>{value}</div>
      <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</Mono>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", display: "block", margin: "12px 0 8px" }} c={color}>
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
        fontSize: fs.caption,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: ".04em",
        color: txt(color === ASH ? ASH : ON_ACCENT),
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
