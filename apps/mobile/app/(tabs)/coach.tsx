import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { sessionVolume, weeklyRecap } from "@hybrid/core";
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
import { useLang } from "../../lib/i18n";
import { Screen, Card, Kicker, Mono, Chip, Button, Loading, F } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { useTemplate } from "../../lib/template";
import AuroraCoach from "../../components/aurora/coach";

const personName = (p?: Person) => p?.name || p?.email?.split("@")[0] || "Athlete";

export default function Coach() {
  if (useTemplate().template === "aurora") return <AuroraCoach />;
  return <ClassicCoach />;
}

function ClassicCoach() {
  const C = useTheme().palette;
  const { t } = useLang();
  const [asCoach, setAsCoach] = useState<CoachLink[]>([]);
  const [asClient, setAsClient] = useState<CoachLink[]>([]);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [open, setOpen] = useState<CoachLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    const d = await getCoachLinks();
    setAsCoach(d.asCoach);
    setAsClient(d.asClient);
    setLoading(false);
    setRefreshing(false);
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
    setMsg({ text: r.ok ? `${email} ✓` : r.error ?? "Couldn't invite.", ok: r.ok });
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
    <Screen refreshing={refreshing} onRefresh={() => load(true)}>
      <Kicker>{t("nav.coach")}</Kicker>

      {loading ? (
        <Loading />
      ) : (
        <>
          {incoming.length > 0 && (
            <>
              <Kicker color={C.violet}>{"\n"}{t("coach.requests")}</Kicker>
              {incoming.map((l) => (
                <Card key={l.id} style={{ borderLeftWidth: 3, borderLeftColor: C.violet }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{personName(l.coach)}</Text>
                  <Mono style={{ marginBottom: 8 }}>{t("coach.wantsToCoach")}</Mono>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Button label={t("common.accept")} color={C.lime} onPress={() => act(l.id, "accept")} />
                    <Pressable onPress={() => act(l.id, "end")} style={{ justifyContent: "center" }}>
                      <Mono>{t("common.decline")}</Mono>
                    </Pressable>
                  </View>
                </Card>
              ))}
            </>
          )}

          <Kicker color={C.lime}>{"\n"}{t("coach.yourCoach")}</Kicker>
          {coaches.length === 0 ? (
            <Mono style={{ marginBottom: 8 }}>{t("coach.noCoach")}</Mono>
          ) : (
            coaches.map((l) => (
              <Card key={l.id}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{personName(l.coach)}</Text>
                  <Pressable onPress={() => act(l.id, "end")}>
                    <Mono>{t("common.end")}</Mono>
                  </Pressable>
                </View>
              </Card>
            ))
          )}

          <Kicker color={C.violet}>{"\n"}{t("coach.inviteAthlete")}</Kicker>
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
            <Button label={t("common.invite")} color={C.lime} onPress={invite} />
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
                  <Mono color={C.lime}>{t("common.open")} →</Mono>
                </View>
              </Card>
            </Pressable>
          ))}

          {sent.map((l) => (
            <Card key={l.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{personName(l.client)}</Text>
                <Chip color={C.amber}>{t("coach.pending")}</Chip>
              </View>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

function ClientDetail({ link, back }: { link: CoachLink; back: () => void }) {
  const C = useTheme().palette;
  const { t } = useLang();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setSessions(await getClientSessions(link.id));
    setNotes(await getNotes(link.id));
    setLoading(false);
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
        <Mono>← {t("coach.roster")}</Mono>
      </Pressable>
      <Text style={{ fontFamily: F.black, fontSize: 24, color: C.chalk }}>{personName(link.client)}</Text>
      <Mono style={{ marginBottom: 12 }}>{link.client?.email}</Mono>

      <Kicker color={C.violet}>{t("coach.notes")}</Kicker>
      <Card>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder={t("coach.notePlaceholder")}
          placeholderTextColor={C.ash}
          multiline
          style={{ fontFamily: F.mono, fontSize: 14, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, minHeight: 56 }}
        />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <Pressable onPress={() => setIsPrivate((p) => !p)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ color: isPrivate ? C.amber : C.ash, fontFamily: F.mono }}>{isPrivate ? "☑" : "☐"}</Text>
            <Mono color={isPrivate ? C.amber : C.ash}>{t("coach.private")}</Mono>
          </Pressable>
          <Button label={t("common.add")} color={C.lime} onPress={add} />
        </View>
      </Card>

      {loading ? (
        <Loading />
      ) : (
        <>
          {notes.map((n) => (
            <Card key={n.id} style={{ borderLeftWidth: 3, borderLeftColor: n.private ? C.amber : C.line }}>
              {n.private && <Chip color={C.amber}>{t("coach.private")}</Chip>}
              <Mono color={C.chalk} style={{ marginTop: n.private ? 6 : 0, lineHeight: 20 }}>{n.body}</Mono>
            </Card>
          ))}

          {sessions.length > 0 && <ClientWeek sessions={sessions} t={t} />}

          <Kicker color={C.lime}>{"\n"}{t("coach.recentSessions")}</Kicker>
          {sessions.length === 0 ? (
            <Mono>{t("coach.noSessions")}</Mono>
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
        </>
      )}
    </Screen>
  );
}

const MUSCLE_LABEL: Record<string, string> = {
  quads: "Quads", glutes: "Glutes", posterior: "Posterior chain", back: "Back",
  chest: "Chest", shoulders: "Shoulders", triceps: "Triceps",
};

// The athlete's current week, as the coach sees it — same engine as the
// client's own Today, so both read one source of truth.
function ClientWeek({ sessions, t }: { sessions: LoggedSession[]; t: (k: string) => string }) {
  const C = useTheme().palette;
  const r = weeklyRecap(sessions);
  const hasPrev = r.prevSessions > 0 || r.prevVolume > 0;
  return (
    <>
      <Kicker color={C.lime}>{"\n"}{t("recap.title")}</Kicker>
      <Card>
        {r.sessions === 0 ? (
          <Mono>{t("recap.noneThisWeek")}</Mono>
        ) : (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
              <Metric label={t("recap.sessions")} value={`${r.sessions}`} color={C.chalk} />
              <Metric label={t("summary.kgMoved")} value={r.volume.toLocaleString()} color={C.lime} />
              <Metric label={t("recap.activeDays")} value={`${r.activeDays}`} color={C.chalk} />
              <Metric label={t("recap.prs")} value={`${r.prs.length}`} color={r.prs.length ? C.lime : C.ash} />
              {r.topMuscle && <Metric label={t("recap.top")} value={MUSCLE_LABEL[r.topMuscle.muscle] ?? r.topMuscle.muscle} color={C.blue} />}
            </View>
            {hasPrev && (
              <Mono color={r.volumeDelta >= 0 ? C.lime : C.amber} style={{ marginTop: 12 }}>
                {r.sessionsDelta >= 0 ? "+" : ""}{r.sessionsDelta} {t("recap.sessions")} · {r.volumeDelta >= 0 ? "+" : ""}
                {r.volumeDelta.toLocaleString()} kg {t("recap.vsLastWeek")}
              </Mono>
            )}
            {r.prs.length > 0 && (
              <Mono color={C.chalk} style={{ marginTop: 8 }}>
                🏆 {r.prs.slice(0, 4).map((p) => `${p.lift} ${p.e1rm}kg${p.previous == null ? "" : ` (+${p.e1rm - p.previous})`}`).join(" · ")}
              </Mono>
            )}
          </>
        )}
      </Card>
    </>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  const C = useTheme().palette;
  return (
    <View>
      <Text style={{ fontFamily: F.black, fontSize: 20, color }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>{label}</Text>
    </View>
  );
}
