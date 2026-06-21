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
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, APill, AHeading, RADIUS } from "./kit";
import CoachGroups from "../coach-groups";
import CoachPrograms from "../coach-programs";
import CoachInvite from "../coach-invite";
import CoachDiet from "../coach-diet";
import { useFeatureFlag } from "../../lib/flags";

const personName = (p?: Person) => p?.name || p?.email?.split("@")[0] || "Athlete";

/** AURORA Coach — the same roster / invite / consent flow and per-athlete
 *  detail (notes + recap + sessions) as the classic, in the rounded look. */
export default function AuroraCoach() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const groupsOn = useFeatureFlag("coach.groups");
  const programsOn = useFeatureFlag("coach.programs");
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

  const sectionLabel = (text: string, color: string) => (
    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color, marginTop: 20, marginBottom: 10 }}>
      {text}
    </Text>
  );

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={() => load(true)}>
      <AHeading style={{ fontSize: fs.display }}>{t("nav.coach")}</AHeading>

      {loading ? (
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 18 }}>…</Text>
      ) : (
        <>
          {incoming.length > 0 && (
            <>
              {sectionLabel(t("coach.requests"), txt(C, C.violet))}
              {incoming.map((l) => (
                <ACard key={l.id} style={{ marginBottom: 12 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{personName(l.coach)}{l.coach?.coachVerified ? <Text style={{ color: txt(C, C.blue) }}>{"  ✓"}</Text> : null}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 4, marginBottom: 12 }}>{t("coach.wantsToCoach")}</Text>
                  <View style={{ flexDirection: "row", gap: space.ms, alignItems: "center" }}>
                    <APill label={t("common.accept")} variant="primary" onPress={() => act(l.id, "accept")} style={{ flex: 1, paddingVertical: 14 }} />
                    <Pressable onPress={() => act(l.id, "end")} style={{ paddingHorizontal: 14, justifyContent: "center" }}>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("common.decline")}</Text>
                    </Pressable>
                  </View>
                </ACard>
              ))}
            </>
          )}

          {sectionLabel(t("coach.yourCoach"), txt(C, C.lime))}
          {coaches.length === 0 ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("coach.noCoach")}</Text>
          ) : (
            coaches.map((l) => (
              <ACard key={l.id} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{personName(l.coach)}{l.coach?.coachVerified ? <Text style={{ color: txt(C, C.blue) }}>{"  ✓"}</Text> : null}</Text>
                  <Pressable onPress={() => act(l.id, "end")}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("common.end")}</Text>
                  </Pressable>
                </View>
              </ACard>
            ))
          )}

          {sectionLabel(t("coach.inviteAthlete"), txt(C, C.violet))}
          <ACard>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="athlete@email.com"
              placeholderTextColor={C.ash}
              autoCapitalize="none"
              keyboardType="email-address"
              style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 14, marginBottom: 12 }}
            />
            <APill label={t("common.invite")} variant="primary" onPress={invite} style={{ paddingVertical: 14 }} />
            {msg && (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, msg.ok ? C.lime : C.amber), marginTop: 10 }}>
                {msg.text}
              </Text>
            )}
          </ACard>

          {/* Onboard a brand-new client (not on HYBRID yet) via link / QR / email. */}
          <View style={{ marginTop: 12 }}><CoachInvite /></View>

          {clients.map((l) => (
            <Pressable key={l.id} onPress={() => setOpen(l)} style={{ marginTop: 12 }}>
              <ACard>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{personName(l.client)}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 2 }}>{l.client?.email}</Text>
                  </View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("common.open")} →</Text>
                </View>
              </ACard>
            </Pressable>
          ))}

          {sent.map((l) => (
            <ACard key={l.id} style={{ marginTop: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{personName(l.client)}</Text>
                <View style={{ backgroundColor: `${C.amber}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.amber) }}>{t("coach.pending")}</Text>
                </View>
              </View>
            </ACard>
          ))}

          {groupsOn && (
            <>
              <AHeading style={{ fontSize: fs.title, marginTop: 22 }}>Client groups</AHeading>
              <CoachGroups clients={clients.map((l) => ({ clientId: l.client?.id ?? "", name: personName(l.client) })).filter((c) => c.clientId)} />
            </>
          )}

          {programsOn && (
            <>
              <AHeading style={{ fontSize: fs.title, marginTop: 22 }}>Programs</AHeading>
              <CoachPrograms clients={clients.map((l) => ({ linkId: l.id, name: personName(l.client) }))} />
            </>
          )}
        </>
      )}
    </AuroraScreen>
  );
}

function ClientDetail({ link, back }: { link: CoachLink; back: () => void }) {
  const { palette: C } = useTheme();
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
    <AuroraScreen>
      <Pressable onPress={back} style={{ marginBottom: 10 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>← {t("coach.roster")}</Text>
      </Pressable>
      <AHeading style={{ fontSize: fs.display }}>{personName(link.client)}</AHeading>
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 4, marginBottom: 14 }}>{link.client?.email}</Text>

      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime), marginBottom: 10 }}>Diet</Text>
      <CoachDiet linkId={link.id} />

      <View style={{ marginTop: 14 }} />
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.violet), marginBottom: 10 }}>{t("coach.notes")}</Text>
      <ACard>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder={t("coach.notePlaceholder")}
          placeholderTextColor={C.ash}
          multiline
          style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 14, minHeight: 56 }}
        />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          <Pressable onPress={() => setIsPrivate((p) => !p)} style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <Text style={{ color: txt(C, isPrivate ? C.amber : C.ash), fontFamily: F.mono }}>{isPrivate ? "☑" : "☐"}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, isPrivate ? C.amber : C.ash) }}>{t("coach.private")}</Text>
          </Pressable>
          <APill label={t("common.add")} variant="primary" onPress={add} style={{ paddingHorizontal: 24, paddingVertical: 12 }} />
        </View>
      </ACard>

      {loading ? (
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 16 }}>…</Text>
      ) : (
        <>
          {notes.map((n) => (
            <ACard key={n.id} style={{ marginTop: 12 }}>
              {n.private && (
                <View style={{ alignSelf: "flex-start", backgroundColor: `${C.amber}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.amber) }}>{t("coach.private")}</Text>
                </View>
              )}
              <Text style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, marginTop: n.private ? 8 : 0, lineHeight: 20 }}>{n.body}</Text>
            </ACard>
          ))}

          {sessions.length > 0 && <ClientWeek sessions={sessions} t={t} />}

          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime), marginTop: 20, marginBottom: 10 }}>{t("coach.recentSessions")}</Text>
          {sessions.length === 0 ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("coach.noSessions")}</Text>
          ) : (
            sessions.map((s) => (
              <ACard key={s.id} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontFamily: F.semi, fontSize: fs.note, color: C.chalk }}>{s.title}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{new Date(s.startedAt).toLocaleDateString()}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: space.sm, marginTop: 8 }}>
                  <View style={{ backgroundColor: C.ink, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4, borderWidth: 1, borderColor: C.line }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{sessionVolume(s.blocks).toLocaleString()} kg</Text>
                  </View>
                  <View style={{ backgroundColor: C.ink, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4, borderWidth: 1, borderColor: C.line }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{s.blocks.length} blocks</Text>
                  </View>
                </View>
              </ACard>
            ))
          )}
        </>
      )}
    </AuroraScreen>
  );
}

const MUSCLE_LABEL: Record<string, string> = {
  quads: "Quads", glutes: "Glutes", posterior: "Posterior chain", back: "Back",
  chest: "Chest", shoulders: "Shoulders", triceps: "Triceps",
};

// The athlete's current week, as the coach sees it — same engine as the
// client's own Today, so both read one source of truth.
function ClientWeek({ sessions, t }: { sessions: LoggedSession[]; t: (k: string) => string }) {
  const { palette: C } = useTheme();
  const r = weeklyRecap(sessions);
  const hasPrev = r.prevSessions > 0 || r.prevVolume > 0;
  return (
    <>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime), marginTop: 20, marginBottom: 10 }}>{t("recap.title")}</Text>
      <ACard>
        {r.sessions === 0 ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("recap.noneThisWeek")}</Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
              <Metric label={t("recap.sessions")} value={`${r.sessions}`} color={C.chalk} />
              <Metric label={t("summary.kgMoved")} value={r.volume.toLocaleString()} color={txt(C, C.lime)} />
              <Metric label={t("recap.activeDays")} value={`${r.activeDays}`} color={C.chalk} />
              <Metric label={t("recap.prs")} value={`${r.prs.length}`} color={r.prs.length ? txt(C, C.lime) : C.ash} />
              {r.topMuscle && <Metric label={t("recap.top")} value={MUSCLE_LABEL[r.topMuscle.muscle] ?? r.topMuscle.muscle} color={txt(C, C.blue)} />}
            </View>
            {hasPrev && (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, r.volumeDelta >= 0 ? C.lime : C.amber), marginTop: 14 }}>
                {r.sessionsDelta >= 0 ? "+" : ""}{r.sessionsDelta} {t("recap.sessions")} · {r.volumeDelta >= 0 ? "+" : ""}
                {r.volumeDelta.toLocaleString()} kg {t("recap.vsLastWeek")}
              </Text>
            )}
            {r.prs.length > 0 && (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk, marginTop: 10, lineHeight: 18 }}>
                🏆 {r.prs.slice(0, 4).map((p) => `${p.lift} ${p.e1rm}kg${p.previous == null ? "" : ` (+${p.e1rm - p.previous})`}`).join(" · ")}
              </Text>
            )}
          </>
        )}
      </ACard>
    </>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  const { palette: C } = useTheme();
  return (
    <View>
      <Text style={{ fontFamily: F.black, fontSize: fs.heading, color }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>{label}</Text>
    </View>
  );
}
