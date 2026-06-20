import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { plansForGoal } from "@hybrid/core";
import { fs, space, Card, Kicker, Mono, Button, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import {
  getCoachGroups,
  createCoachGroup,
  patchCoachGroup,
  deleteCoachGroup,
  assignPlanToGroup,
  type CoachGroup,
} from "../lib/api";

// Goals whose periodization model is meaningful (mirrors the web coach's
// GEN_GOALS) — a group plan is built from one of these by goal.
const GROUP_GOALS = ["Hybrid", "Powerlifting", "Bodybuilding", "Running", "Cycling", "Hyrox", "Triathlon"];

/** Solo-coach client groups (mobile, both templates — built on the template-aware
 *  Card). Create a group, toggle which active clients belong, then assign a whole
 *  periodized plan to everyone at once. Soft-degrades until the SQL is run. */
export default function CoachGroups({ clients }: { clients: { clientId: string; name: string }[] }) {
  const C = useTheme().palette;
  const [groups, setGroups] = useState<CoachGroup[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [newName, setNewName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [goalFor, setGoalFor] = useState<Record<string, string>>({});
  const [planFor, setPlanFor] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    getCoachGroups()
      .then((d) => { setUnavailable(d.unavailable); setGroups(d.groups); })
      .catch(() => setGroups([]));
  }, []);
  useEffect(() => load(), [load]);

  const create = async () => {
    if (!newName.trim()) return;
    if (await createCoachGroup(newName.trim())) { setNewName(""); load(); }
  };
  const toggle = async (g: CoachGroup, clientId: string) => {
    const has = g.clientIds.includes(clientId);
    await patchCoachGroup(g.id, { clientIds: has ? g.clientIds.filter((x) => x !== clientId) : [...g.clientIds, clientId] });
    load();
  };
  const del = async (id: string) => { await deleteCoachGroup(id); load(); };
  const assign = async (g: CoachGroup) => {
    const goal = goalFor[g.id] || GROUP_GOALS[0]!;
    const planId = planFor[g.id] || undefined;
    const r = await assignPlanToGroup(g.id, goal, planId);
    const planName = planId ? plansForGoal(goal).find((p) => p.id === planId)?.name ?? goal : goal;
    setMsg(r.ok ? `Assigned ${planName} to ${r.assigned} client${r.assigned === 1 ? "" : "s"}.` : (r.error ?? "Couldn't assign."));
    if (r.ok) load();
  };

  if (groups === null) return <Mono>Loading…</Mono>;

  return (
    <View>
      {unavailable && (
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.amber, marginTop: 12 }}>
          <Mono color={C.chalk} style={{ fontSize: fs.caption, lineHeight: 18 }}>
            Groups aren&apos;t enabled yet — run reference/sql-coach-groups.sql in Supabase.
          </Mono>
        </Card>
      )}

      <Card style={{ marginTop: 12 }}>
        <Kicker>New group</Kicker>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: 8 }}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="e.g. Tuesday 6am squad"
            placeholderTextColor={C.ash}
            style={{ flex: 1, fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }}
          />
          <Button label="Create" onPress={create} />
        </View>
      </Card>

      {msg && <Mono color={C.lime} style={{ marginTop: 6, fontSize: fs.caption }}>{msg}</Mono>}

      {groups.map((g) => (
        <Card key={g.id} style={{ marginTop: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{g.name}</Text>
            <Pressable onPress={() => del(g.id)}><Mono color={C.ash} style={{ fontSize: fs.caption }}>Delete</Mono></Pressable>
          </View>
          <Mono style={{ marginTop: 2, fontSize: fs.micro }}>{g.clientIds.length} member{g.clientIds.length === 1 ? "" : "s"}</Mono>

          {clients.length === 0 ? (
            <Mono style={{ marginTop: 8, fontSize: fs.caption }}>Invite athletes first — your active clients show up here to add.</Mono>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 8 }}>
              {clients.map((c) => {
                const on = g.clientIds.includes(c.clientId);
                return (
                  <Pressable
                    key={c.clientId}
                    onPress={() => toggle(g, c.clientId)}
                    style={{ borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? `${C.lime}1c` : "transparent", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}
                  >
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: on ? txt(C, C.lime) : C.ash }}>{on ? "✓ " : ""}{c.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 10 }}>
            {GROUP_GOALS.map((gg) => {
              const sel = (goalFor[g.id] || GROUP_GOALS[0]) === gg;
              return (
                <Pressable
                  key={gg}
                  onPress={() => { setGoalFor((m) => ({ ...m, [g.id]: gg })); setPlanFor((m) => ({ ...m, [g.id]: "" })); }}
                  style={{ borderWidth: 1, borderColor: sel ? C.violet : C.line, backgroundColor: sel ? `${C.violet}1c` : "transparent", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}
                >
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: sel ? txt(C, C.violet) : C.ash }}>{gg}</Text>
                </Pressable>
              );
            })}
          </View>
          {(() => {
            const named = plansForGoal(goalFor[g.id] || GROUP_GOALS[0]!);
            if (named.length === 0) return null;
            const chosen = planFor[g.id] || "";
            return (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 8 }}>
                {[{ id: "", name: "By goal" }, ...named].map((p) => {
                  const sel = chosen === p.id;
                  return (
                    <Pressable
                      key={p.id || "_goal"}
                      onPress={() => setPlanFor((m) => ({ ...m, [g.id]: p.id }))}
                      style={{ borderWidth: 1, borderColor: sel ? C.lime : C.line, backgroundColor: sel ? `${C.lime}1c` : "transparent", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}
                    >
                      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: sel ? txt(C, C.lime) : C.ash }}>{p.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            );
          })()}
          <View style={{ marginTop: 10 }}>
            <Button label="Assign plan to group" color={C.violet} onPress={() => assign(g)} />
          </View>
        </Card>
      ))}
    </View>
  );
}
