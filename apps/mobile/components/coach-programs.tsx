import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { Card, Kicker, Mono, Button, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import {
  getCoachPrograms,
  createCoachProgram,
  updateCoachProgram,
  deleteCoachProgram,
  assignProgram,
  getCoachGroups,
  type CoachProgram,
  type ProgramWeek,
  type ProgramItem,
  type CoachGroup,
} from "../lib/api";

const sessionsOf = (w: ProgramWeek[]) => w.reduce((n, x) => n + x.days.length, 0);
const today = () => new Date().toISOString().slice(0, 10);

/** Coach-authored multi-week program builder (mobile, both templates — built on
 *  the template-aware Card). Compose weeks → days → exercises, then assign to a
 *  client or group as scheduled sessions. Soft-degrades until the SQL is run. */
export default function CoachPrograms({ clients }: { clients: { linkId: string; name: string }[] }) {
  const C = useTheme().palette;
  const [programs, setPrograms] = useState<CoachProgram[] | null>(null);
  const [groups, setGroups] = useState<CoachGroup[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [draft, setDraft] = useState<CoachProgram | null>(null);
  const [newName, setNewName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    getCoachPrograms().then((d) => { setUnavailable(d.unavailable); setPrograms(d.programs); }).catch(() => setPrograms([]));
    getCoachGroups().then((d) => setGroups(d.groups)).catch(() => {});
  }, []);
  useEffect(() => load(), [load]);

  const create = async () => {
    if (!newName.trim()) return;
    const p = await createCoachProgram(newName.trim());
    if (p) { setNewName(""); setDraft(p); load(); }
    else setMsg("Couldn't create — run the SQL to enable programs.");
  };
  const save = async () => {
    if (!draft) return;
    const ok = await updateCoachProgram(draft.id, { name: draft.name, weeks: draft.weeks });
    setMsg(ok ? "Saved." : "Couldn't save.");
    if (ok) { setDraft(null); load(); }
  };
  const del = async (id: string) => { await deleteCoachProgram(id); if (draft?.id === id) setDraft(null); load(); };

  if (programs === null) return <Mono>Loading…</Mono>;

  if (draft) {
    const inp = { fontFamily: F.mono, fontSize: 13, color: C.chalk, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 } as const;
    const setWeeks = (weeks: ProgramWeek[]) => setDraft({ ...draft, weeks });
    const mapWeek = (wi: number, fn: (w: ProgramWeek) => ProgramWeek) => setWeeks(draft.weeks.map((w, i) => (i === wi ? fn(w) : w)));
    const mapDay = (wi: number, di: number, fn: (d: ProgramWeek["days"][number]) => ProgramWeek["days"][number]) =>
      mapWeek(wi, (w) => ({ days: w.days.map((d, j) => (j === di ? fn(d) : d)) }));

    return (
      <Card style={{ marginTop: 12 }}>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TextInput value={draft.name} onChangeText={(t) => setDraft({ ...draft, name: t })} placeholderTextColor={C.ash} style={[inp, { flex: 1, fontSize: 15 }]} />
          <Button label="Save" onPress={save} />
        </View>
        <Mono style={{ marginTop: 6, fontSize: 11 }}>{draft.weeks.length} wk · {sessionsOf(draft.weeks)} session{sessionsOf(draft.weeks) === 1 ? "" : "s"}</Mono>

        {draft.weeks.map((w, wi) => (
          <View key={wi} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, marginTop: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Kicker color={C.violet}>Week {wi + 1}</Kicker>
              <Pressable onPress={() => setWeeks(draft.weeks.filter((_, i) => i !== wi))}><Mono color={C.ash} style={{ fontSize: 11 }}>remove</Mono></Pressable>
            </View>
            {w.days.map((d, di) => (
              <View key={di} style={{ borderTopWidth: di ? 1 : 0, borderTopColor: C.line, paddingTop: di ? 8 : 0, marginTop: di ? 8 : 0 }}>
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                  <TextInput value={d.day} onChangeText={(t) => mapDay(wi, di, (x) => ({ ...x, day: t }))} placeholder="Day name" placeholderTextColor={C.ash} style={[inp, { flex: 1 }]} />
                  <Pressable onPress={() => mapWeek(wi, (x) => ({ days: x.days.filter((_, j) => j !== di) }))}><Mono color={C.ash} style={{ fontSize: 11 }}>remove</Mono></Pressable>
                </View>
                {d.items.map((it, ii) => (
                  <View key={ii} style={{ flexDirection: "row", gap: 6, marginTop: 6, alignItems: "center" }}>
                    <TextInput value={it.name} onChangeText={(t) => mapDay(wi, di, (x) => ({ ...x, items: x.items.map((y, k) => (k === ii ? { ...y, name: t } : y)) }))} placeholder="Exercise" placeholderTextColor={C.ash} style={[inp, { flex: 1 }]} />
                    <TextInput value={it.sr} onChangeText={(t) => mapDay(wi, di, (x) => ({ ...x, items: x.items.map((y, k) => (k === ii ? { ...y, sr: t } : y)) }))} placeholder="5 × 5" placeholderTextColor={C.ash} style={[inp, { width: 72 }]} />
                    <Pressable onPress={() => mapDay(wi, di, (x) => ({ ...x, items: x.items.filter((_, k) => k !== ii) }))}><Text style={{ fontFamily: F.bold, color: C.ash, fontSize: 16 }}>×</Text></Pressable>
                  </View>
                ))}
                <Pressable onPress={() => mapDay(wi, di, (x) => ({ ...x, items: [...x.items, { name: "", sr: "" } as ProgramItem] }))} style={{ marginTop: 6 }}>
                  <Mono color={C.lime} style={{ fontSize: 12 }}>+ exercise</Mono>
                </Pressable>
              </View>
            ))}
            <View style={{ marginTop: 10 }}>
              <Button label="+ day" color={C.ash} onPress={() => mapWeek(wi, (x) => ({ days: [...x.days, { day: `Day ${x.days.length + 1}`, items: [] }] }))} />
            </View>
          </View>
        ))}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <Button label="+ week" color={C.violet} onPress={() => setWeeks([...draft.weeks, { days: [] }])} />
          <Button label="Close" color={C.ash} onPress={() => setDraft(null)} />
        </View>
        {msg && <Mono color={C.lime} style={{ marginTop: 8, fontSize: 12 }}>{msg}</Mono>}
      </Card>
    );
  }

  return (
    <View>
      {unavailable && (
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.amber, marginTop: 12 }}>
          <Mono color={C.chalk} style={{ fontSize: 12, lineHeight: 18 }}>Programs aren&apos;t enabled yet — run reference/sql-coach-programs.sql in Supabase.</Mono>
        </Card>
      )}
      <Card style={{ marginTop: 12 }}>
        <Kicker>New program</Kicker>
        <Mono style={{ marginTop: 6, fontSize: 12, lineHeight: 18 }}>Build a multi-week program once, then assign it to a client or group as scheduled sessions.</Mono>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <TextInput value={newName} onChangeText={setNewName} placeholder="e.g. 8-Week Strength Base" placeholderTextColor={C.ash}
            style={{ flex: 1, fontFamily: F.mono, fontSize: 14, color: C.chalk, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }} />
          <Button label="Create" onPress={create} />
        </View>
      </Card>
      {msg && <Mono color={C.lime} style={{ marginTop: 6, fontSize: 12 }}>{msg}</Mono>}
      {programs.map((p) => (
        <ProgramRow key={p.id} program={p} clients={clients} groups={groups} onEdit={() => setDraft(p)} onDelete={() => del(p.id)} onAssigned={setMsg} />
      ))}
    </View>
  );
}

function ProgramRow({ program, clients, groups, onEdit, onDelete, onAssigned }: {
  program: CoachProgram;
  clients: { linkId: string; name: string }[];
  groups: CoachGroup[];
  onEdit: () => void;
  onDelete: () => void;
  onAssigned: (msg: string) => void;
}) {
  const C = useTheme().palette;
  const [target, setTarget] = useState("");
  const [date, setDate] = useState(today());
  const sessions = sessionsOf(program.weeks);

  const assign = async () => {
    if (!target) return;
    const [kind, id] = target.split(":");
    const r = await assignProgram(program.id, kind === "group" ? { groupId: id } : { linkId: id }, date);
    onAssigned(r.ok ? `Assigned “${program.name}” — ${r.sessions} session${r.sessions === 1 ? "" : "s"} to ${r.assigned} client${r.assigned === 1 ? "" : "s"}.` : (r.error ?? "Couldn't assign."));
  };

  const chip = (key: string, label: string) => {
    const sel = target === key;
    return (
      <Pressable key={key} onPress={() => setTarget(sel ? "" : key)}
        style={{ borderWidth: 1, borderColor: sel ? C.lime : C.line, backgroundColor: sel ? `${C.lime}1c` : "transparent", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 12, color: sel ? txt(C, C.lime) : C.ash }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <Card style={{ marginTop: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{program.name}</Text>
          <Mono style={{ fontSize: 11, marginTop: 2 }}>{program.weeks.length} wk · {sessions} session{sessions === 1 ? "" : "s"}</Mono>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable onPress={onEdit}><Mono color={C.violet} style={{ fontSize: 12 }}>Edit</Mono></Pressable>
          <Pressable onPress={onDelete}><Mono color={C.ash} style={{ fontSize: 12 }}>Delete</Mono></Pressable>
        </View>
      </View>
      {sessions > 0 && (clients.length > 0 || groups.length > 0) && (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {clients.map((c) => chip(`link:${c.linkId}`, c.name))}
            {groups.map((g) => chip(`group:${g.id}`, `${g.name} (${g.clientIds.length})`))}
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" }}>
            <TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={C.ash}
              style={{ width: 130, fontFamily: F.mono, fontSize: 13, color: C.chalk, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }} />
            <Button label="Assign" color={target ? C.lime : C.ash} onPress={assign} />
          </View>
        </>
      )}
    </Card>
  );
}
