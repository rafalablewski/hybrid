"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { fs, space, INK2, LINE, LIME, CHALK, ASH, VIOLET, AMBER, ON_ACCENT, disp, cond, mono, txt, Mono, Card, Select } from "@/lib/ui";

// Local mirror of the stored program shape (see apps/web/lib/coach-program.ts).
type Item = { name: string; sr: string; rpe?: string };
type Day = { day: string; items: Item[] };
type Week = { days: Day[] };
type Program = { id: string; name: string; goal: string | null; weeks: Week[] };
type Group = { id: string; name: string; clientIds: string[] };

const sessionsOf = (w: Week[]) => w.reduce((n, x) => n + x.days.length, 0);

/**
 * Coach-authored multi-week program builder (type 3 of the plan model): compose
 * weeks → days → exercises once, then assign to a client or a whole group, which
 * materializes it into dated Assignments. Soft-degrades until the SQL is run.
 */
export default function CoachPrograms({ clients }: { clients: { linkId: string; name: string }[] }) {
  const [programs, setPrograms] = useState<Program[] | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [draft, setDraft] = useState<Program | null>(null);
  const [newName, setNewName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/coach/programs")
      .then((r) => r.json())
      .then((d) => { setUnavailable(Boolean(d.unavailable)); setPrograms((d.programs as Program[]) ?? []); })
      .catch(() => setPrograms([]));
    fetch("/api/coach/groups").then((r) => r.json()).then((d) => setGroups((d.groups as Group[]) ?? [])).catch(() => {});
  }, []);
  useEffect(load, [load]);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch("/api/coach/programs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, weeks: [{ days: [] }] }) });
    if (res.ok) { const j = await res.json(); setNewName(""); setPrograms((p) => [j.program, ...(p ?? [])]); setDraft(j.program); }
    else { const j = await res.json().catch(() => ({})); setMsg(j.error ?? "Couldn't create the program."); }
  };
  const save = async () => {
    if (!draft) return;
    const res = await fetch(`/api/coach/programs/${draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: draft.name, weeks: draft.weeks }) });
    if (res.ok) { setMsg("Saved."); setDraft(null); load(); }
    else setMsg("Couldn't save — try again.");
  };
  const del = async (id: string) => { await fetch(`/api/coach/programs/${id}`, { method: "DELETE" }).catch(() => {}); if (draft?.id === id) setDraft(null); load(); };

  if (programs === null) return <Mono>Loading…</Mono>;

  // ---- editor (one program) ----
  if (draft) {
    const setWeeks = (weeks: Week[]) => setDraft({ ...draft, weeks });
    const addWeek = () => setWeeks([...draft.weeks, { days: [] }]);
    const addDay = (wi: number) => setWeeks(draft.weeks.map((w, i) => (i === wi ? { days: [...w.days, { day: `Day ${w.days.length + 1}`, items: [] }] } : w)));
    const addItem = (wi: number, di: number) => setWeeks(draft.weeks.map((w, i) => i !== wi ? w : { days: w.days.map((d, j) => j !== di ? d : { ...d, items: [...d.items, { name: "", sr: "" }] }) }));
    const editDay = (wi: number, di: number, day: string) => setWeeks(draft.weeks.map((w, i) => i !== wi ? w : { days: w.days.map((d, j) => j !== di ? d : { ...d, day }) }));
    const editItem = (wi: number, di: number, ii: number, patch: Partial<Item>) => setWeeks(draft.weeks.map((w, i) => i !== wi ? w : { days: w.days.map((d, j) => j !== di ? d : { ...d, items: d.items.map((it, k) => k !== ii ? it : { ...it, ...patch }) }) }));
    const rmItem = (wi: number, di: number, ii: number) => setWeeks(draft.weeks.map((w, i) => i !== wi ? w : { days: w.days.map((d, j) => j !== di ? d : { ...d, items: d.items.filter((_, k) => k !== ii) }) }));
    const rmDay = (wi: number, di: number) => setWeeks(draft.weeks.map((w, i) => i !== wi ? w : { days: w.days.filter((_, j) => j !== di) }));
    const rmWeek = (wi: number) => setWeeks(draft.weeks.filter((_, i) => i !== wi));

    return (
      <Card>
        <div style={{ display: "flex", gap: space.sm, alignItems: "center", marginBottom: 12 }}>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={{ ...inp, flex: 1, fontSize: fs.note }} />
          <button onClick={save} style={btn(LIME)}>Save</button>
          <button onClick={() => setDraft(null)} style={btn(ASH)}>Close</button>
        </div>
        <Mono s={{ fontSize: fs.micro, display: "block", marginBottom: 10 }} c={ASH}>
          {draft.weeks.length} week{draft.weeks.length === 1 ? "" : "s"} · {sessionsOf(draft.weeks)} session{sessionsOf(draft.weeks) === 1 ? "" : "s"}
        </Mono>
        {draft.weeks.map((w, wi) => (
          <div key={wi} style={{ border: `1px solid ${LINE}`, borderRadius: "var(--r-card)", padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>Week {wi + 1}</Mono>
              <button onClick={() => rmWeek(wi)} style={linkBtn}>remove week</button>
            </div>
            {w.days.map((d, di) => (
              <div key={di} style={{ borderTop: di ? `1px solid ${LINE}` : "none", paddingTop: di ? 8 : 0, marginTop: di ? 8 : 0 }}>
                <div style={{ display: "flex", gap: space.sm, alignItems: "center" }}>
                  <input value={d.day} onChange={(e) => editDay(wi, di, e.target.value)} placeholder="Day name" style={{ ...inp, flex: 1 }} />
                  <button onClick={() => rmDay(wi, di)} style={linkBtn}>remove</button>
                </div>
                {d.items.map((it, ii) => (
                  <div key={ii} style={{ display: "flex", gap: space.xs, marginTop: 6, alignItems: "center" }}>
                    <input value={it.name} onChange={(e) => editItem(wi, di, ii, { name: e.target.value })} placeholder="Exercise" style={{ ...inp, flex: 1 }} />
                    <input value={it.sr} onChange={(e) => editItem(wi, di, ii, { sr: e.target.value })} placeholder="5 × 5" style={{ ...inp, width: 90 }} />
                    <input value={it.rpe ?? ""} onChange={(e) => editItem(wi, di, ii, { rpe: e.target.value })} placeholder="RPE" style={{ ...inp, width: 64 }} />
                    <button onClick={() => rmItem(wi, di, ii)} style={linkBtn}>×</button>
                  </div>
                ))}
                <button onClick={() => addItem(wi, di)} style={{ ...linkBtn, color: txt(LIME), marginTop: 6 }}>+ exercise</button>
              </div>
            ))}
            <button onClick={() => addDay(wi)} style={{ ...btn(ASH), marginTop: 10 }}>+ day</button>
          </div>
        ))}
        <button onClick={addWeek} style={btn(VIOLET)}>+ week</button>
        {msg && <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 8 }} c={LIME}>{msg}</Mono>}
      </Card>
    );
  }

  // ---- list + create ----
  return (
    <>
      {unavailable && (
        <Card style={{ borderLeft: `3px solid ${AMBER}` }}>
          <Mono s={{ fontSize: fs.caption, lineHeight: 1.6, display: "block" }} c={CHALK}>
            Programs aren&apos;t persisted yet — run <span style={{ color: txt(AMBER) }}>reference/sql-coach-programs.sql</span> in Supabase to enable them.
          </Mono>
        </Card>
      )}
      <Card>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }}>New program</Mono>
        <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 6, lineHeight: 1.5 }}>
          Build a multi-week program once, then assign it to a client or a whole group — it lands as scheduled sessions in their account.
        </Mono>
        <div style={{ display: "flex", gap: space.sm, marginTop: 10 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. 8-Week Strength Base" style={{ ...inp, flex: 1, fontSize: fs.bodyLg }} />
          <button onClick={create} style={btn(newName.trim() ? LIME : ASH)}>Create</button>
        </div>
      </Card>
      {msg && <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 4 }} c={LIME}>{msg}</Mono>}
      {programs.map((p) => (
        <ProgramRow key={p.id} program={p} clients={clients} groups={groups} onEdit={() => setDraft(p)} onDelete={() => del(p.id)} onAssigned={(t) => setMsg(t)} />
      ))}
    </>
  );
}

function ProgramRow({ program, clients, groups, onEdit, onDelete, onAssigned }: {
  program: Program;
  clients: { linkId: string; name: string }[];
  groups: Group[];
  onEdit: () => void;
  onDelete: () => void;
  onAssigned: (msg: string) => void;
}) {
  const [target, setTarget] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const sessions = sessionsOf(program.weeks);

  const assign = async () => {
    if (!target) return;
    const [kind, id] = target.split(":");
    const body = kind === "group" ? { groupId: id, startDate: date } : { linkId: id, startDate: date };
    const res = await fetch(`/api/coach/programs/${program.id}/assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as { assigned?: number; sessions?: number; error?: string };
    onAssigned(res.ok ? `Assigned “${program.name}” — ${j.sessions} session${j.sessions === 1 ? "" : "s"} to ${j.assigned} client${j.assigned === 1 ? "" : "s"}.` : (j.error ?? "Couldn't assign."));
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ ...disp, fontWeight: 700, fontSize: fs.note }}>{program.name}</div>
          <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 2 }} c={ASH}>{program.weeks.length} wk · {sessions} session{sessions === 1 ? "" : "s"}</Mono>
        </div>
        <div style={{ display: "flex", gap: space.sm }}>
          <button onClick={onEdit} style={btn(VIOLET)}>Edit</button>
          <button onClick={onDelete} style={btn(ASH)}>Delete</button>
        </div>
      </div>
      {sessions > 0 && (
        <div style={{ display: "flex", gap: space.sm, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Select value={target} onChange={(e) => setTarget(e.target.value)} style={{ fontSize: fs.bodyLg, flex: 1, minWidth: 160 }}>
            <option value="">Assign to…</option>
            {clients.length > 0 && <optgroup label="Clients">{clients.map((c) => <option key={c.linkId} value={`link:${c.linkId}`}>{c.name}</option>)}</optgroup>}
            {groups.length > 0 && <optgroup label="Groups">{groups.map((g) => <option key={g.id} value={`group:${g.id}`}>{g.name} ({g.clientIds.length})</option>)}</optgroup>}
          </Select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inp, width: 150 }} />
          <button onClick={assign} style={btn(target ? LIME : ASH)}>Assign</button>
        </div>
      )}
    </Card>
  );
}

const inp: CSSProperties = { ...mono, fontSize: fs.body, padding: "8px 10px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none" };
const linkBtn: CSSProperties = { ...mono, fontSize: fs.micro, color: txt(ASH), background: "none", border: "none", padding: 0, cursor: "pointer" };
function btn(color: string): CSSProperties {
  return { ...cond, fontSize: fs.caption, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", color: ON_ACCENT, background: color, border: "none", borderRadius: 10, padding: "8px 13px", cursor: "pointer" };
}
