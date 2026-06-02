import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { sessionVolume } from "@hybrid/core";
import type { LoggedSession } from "@hybrid/core";
import {
  getCoachLinks,
  inviteClient,
  actOnLink,
  getClientSessions,
  getNotes,
  addNote,
  type CoachLink,
  type Person,
  type Note,
} from "../../lib/api";
import { Screen, Card, Kicker, Mono, Chip, Button, C, F } from "../../lib/ui";

const personName = (p?: Person) => p?.name || p?.email?.split("@")[0] || "Athlete";

export default function Coach() {
  const [asCoach, setAsCoach] = useState<CoachLink[]>([]);
  const [asClient, setAsClient] = useState<CoachLink[]>([]);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [open, setOpen] = useState<CoachLink | null>(null);

  const load = useCallback(async () => {
    const d = await getCoachLinks();
    setAsCoach(d.asCoach);
    setAsClient(d.asClient);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (open) return <ClientDetail link={open} back={() => setOpen(null)} />;

  const incoming = asClient.filter((l) => l.status === "PENDING");
  const coaches = asClient.filter((l) => l.status === "ACTIVE");
  const clients = asCoach.filter((l) => l.status === "ACTIVE");
  const sent = asCoach.filter((l) => l.status === "PENDING");

  const invite = async () => {
    setMsg(null);
    const r = await inviteClient(email);
    setMsg({ text: r.ok ? `Invite sent to ${email}.` : r.error ?? "Couldn't invite.", ok: r.ok });
    if (r.ok) {
      setEmail("");
      load();
    }
  };
  const act = async (id: string, action: "accept" | "end") => {
    await actOnLink(id, action);
    load();
  };

  return (
    <Screen>
      <Kicker>Coach</Kicker>

      {incoming.length > 0 && (
        <>
          <Kicker color={C.violet}>{"\n"}Coaching requests</Kicker>
          {incoming.map((l) => (
            <Card key={l.id} style={{ borderLeftWidth: 3, borderLeftColor: C.violet }}>
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{personName(l.coach)}</Text>
              <Mono style={{ marginBottom: 8 }}>wants to coach you</Mono>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button label="Accept" color={C.lime} onPress={() => act(l.id, "accept")} />
                <Pressable onPress={() => act(l.id, "end")} style={{ justifyContent: "center" }}>
                  <Mono>decline</Mono>
                </Pressable>
              </View>
            </Card>
          ))}
        </>
      )}

      <Kicker color={C.lime}>{"\n"}Your coach</Kicker>
      {coaches.length === 0 ? (
        <Mono style={{ marginBottom: 8 }}>No coach yet.</Mono>
      ) : (
        coaches.map((l) => (
          <Card key={l.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{personName(l.coach)}</Text>
              <Pressable onPress={() => act(l.id, "end")}>
                <Mono>end</Mono>
              </Pressable>
            </View>
          </Card>
        ))
      )}

      <Kicker color={C.violet}>{"\n"}Coaching — invite an athlete</Kicker>
      <Card>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="athlete@email.com"
          placeholderTextColor={C.ash}
          autoCapitalize="none"
          keyboardType="email-address"
          style={{ fontFamily: F.mono, fontSize: 14, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, marginBottom: 10 }}
        />
        <Button label="Invite" color={C.lime} onPress={invite} />
        {msg && (
          <Mono color={msg.ok ? C.lime : C.amber} style={{ marginTop: 8 }}>
            {msg.text}
          </Mono>
        )}
      </Card>

      {clients.map((l) => (
        <Pressable key={l.id} onPress={() => setOpen(l)}>
          <Card style={{ borderLeftWidth: 3, borderLeftColor: C.lime }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{personName(l.client)}</Text>
                <Mono>{l.client?.email}</Mono>
              </View>
              <Mono color={C.lime}>open →</Mono>
            </View>
          </Card>
        </Pressable>
      ))}

      {sent.map((l) => (
        <Card key={l.id}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{personName(l.client)}</Text>
            <Chip color={C.amber}>Pending</Chip>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

function ClientDetail({ link, back }: { link: CoachLink; back: () => void }) {
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);

  const load = useCallback(async () => {
    setSessions(await getClientSessions(link.id));
    setNotes(await getNotes(link.id));
  }, [link.id]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!body.trim()) return;
    await addNote(link.id, body, isPrivate);
    setBody("");
    setIsPrivate(false);
    load();
  };

  return (
    <Screen>
      <Pressable onPress={back} style={{ marginBottom: 6 }}>
        <Mono>← Roster</Mono>
      </Pressable>
      <Text style={{ fontFamily: F.black, fontSize: 24, color: C.chalk }}>{personName(link.client)}</Text>
      <Mono style={{ marginBottom: 12 }}>{link.client?.email}</Mono>

      <Kicker color={C.violet}>Coaching notes</Kicker>
      <Card>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder="Add a note…"
          placeholderTextColor={C.ash}
          multiline
          style={{ fontFamily: F.mono, fontSize: 14, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, minHeight: 56 }}
        />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <Pressable onPress={() => setIsPrivate((p) => !p)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ color: isPrivate ? C.amber : C.ash, fontFamily: F.mono }}>{isPrivate ? "☑" : "☐"}</Text>
            <Mono color={isPrivate ? C.amber : C.ash}>Private</Mono>
          </Pressable>
          <Button label="Add" color={C.lime} onPress={add} />
        </View>
      </Card>
      {notes.map((n) => (
        <Card key={n.id} style={{ borderLeftWidth: 3, borderLeftColor: n.private ? C.amber : C.line }}>
          {n.private && <Chip color={C.amber}>Private</Chip>}
          <Mono color={C.chalk} style={{ marginTop: n.private ? 6 : 0, lineHeight: 20 }}>{n.body}</Mono>
        </Card>
      ))}

      <Kicker color={C.lime}>{"\n"}Recent sessions</Kicker>
      {sessions.length === 0 ? (
        <Mono>No sessions logged yet.</Mono>
      ) : (
        sessions.map((s) => (
          <Card key={s.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontFamily: F.semi, fontSize: 15, color: C.chalk }}>{s.title}</Text>
              <Mono>{new Date(s.startedAt).toLocaleDateString()}</Mono>
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              <Chip color={C.ash}>{sessionVolume(s.blocks).toLocaleString()} kg</Chip>
              <Chip color={C.ash}>{s.blocks.length} blocks</Chip>
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}
