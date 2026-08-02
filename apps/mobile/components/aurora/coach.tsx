import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import {
  sessionVolume,
  weeklyRecap,
  buildMacrocycle,
  buildTrainingWeek,
  trainingDaysPerWeek,
  personalTrainingLog,
  localTodayKey,
  formatStrengthPr,
} from "@hybrid/core";
import type { LoggedSession } from "@hybrid/core";
import {
  getCoachLinks,
  inviteClient,
  actOnLink,
  getClientSessions,
  getNotes,
  addNote,
  fetchRoutines,
  getCoachLinkTags,
  saveCoachLinkTags,
  getCoachAssignments,
  assignToClient,
  enrollClientMacrocycle,
  getCoachCheckins,
  replyToCheckin,
  type CoachLink,
  type Person,
  type Note,
  type Routine,
  type Checkin,
  type CoachAssignment,
} from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, APill, AHeading, ABack, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

// Goals whose periodization model is meaningful (MODEL_FOR-mapped), for the
// coach's one-click week generator — same list as web.
const GEN_GOALS = ["Hybrid", "Powerlifting", "Bodybuilding", "Running", "Cycling", "Hyrox", "Triathlon"];
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

  const sectionLabel = (text: string) => (
    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginTop: 20, marginBottom: 10 }}>
      {text}
    </Text>
  );

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={() => load(true)}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <ABack />
        <AHeading style={{ fontSize: fs.display }}>{t("nav.coach")}</AHeading>
      </View>

      {loading ? (
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 18 }}>…</Text>
      ) : (
        <>
          {incoming.length > 0 && (
            <>
              {sectionLabel(t("w.teams.coach.requestsTitle"))}
              {incoming.map((l) => (
                <ACard key={l.id} style={{ marginBottom: 12 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{personName(l.coach)}{l.coach?.coachVerified ? <Text style={{ color: txt(C, C.lime) }}>{"  ✓"}</Text> : null}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 4, marginBottom: 12 }}>{t("w.teams.coach.wantsToCoach")}</Text>
                  <View style={{ flexDirection: "row", gap: space.ms, alignItems: "center" }}>
                    <APill label={t("w.teams.coach.accept")} variant="primary" onPress={() => act(l.id, "accept")} style={{ flex: 1, paddingVertical: 14 }} />
                    <Pressable onPress={() => act(l.id, "end")} style={{ paddingHorizontal: 14, justifyContent: "center" }}>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.teams.coach.decline")}</Text>
                    </Pressable>
                  </View>
                </ACard>
              ))}
            </>
          )}

          {sectionLabel(t("w.teams.coach.yourCoach"))}
          {coaches.length === 0 ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.teams.coach.noCoach")}</Text>
          ) : (
            coaches.map((l) => (
              <ACard key={l.id} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{personName(l.coach)}{l.coach?.coachVerified ? <Text style={{ color: txt(C, C.lime) }}>{"  ✓"}</Text> : null}</Text>
                  <Pressable onPress={() => act(l.id, "end")}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.teams.coach.end")}</Text>
                  </Pressable>
                </View>
              </ACard>
            ))
          )}

          {sectionLabel(t("coach.inviteAthlete"))}
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
            <APill label={t("w.teams.coach.invite")} variant="primary" onPress={invite} style={{ paddingVertical: 14 }} />
            {msg && (
              <Text accessibilityLiveRegion={msg.ok ? "polite" : "assertive"} accessibilityRole={msg.ok ? undefined : "alert"} style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, msg.ok ? C.lime : C.red), marginTop: 10 }}>
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
                <View style={{ backgroundColor: `${C.ash}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{t("w.teams.coach.pending")}</Text>
                </View>
              </View>
            </ACard>
          ))}

          {groupsOn && (
            <>
              <AHeading style={{ fontSize: fs.title, marginTop: 22 }}>{t("w.teams.coach.clientGroups")}</AHeading>
              <CoachGroups clients={clients.map((l) => ({ clientId: l.client?.id ?? "", name: personName(l.client) })).filter((c) => c.clientId)} />
            </>
          )}

          {programsOn && (
            <>
              <AHeading style={{ fontSize: fs.title, marginTop: 22 }}>{t("w.teams.coach.programs")}</AHeading>
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
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [templates, setTemplates] = useState<Routine[]>([]);
  const [assignments, setAssignments] = useState<CoachAssignment[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [assignId, setAssignId] = useState("");
  const [assignDate, setAssignDate] = useState(() => localTodayKey());
  const [genGoal, setGenGoal] = useState(GEN_GOALS[0]!);
  const [genWeek, setGenWeek] = useState(1);
  const genMacro = useMemo(() => buildMacrocycle(genGoal), [genGoal]);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [body, setBody] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [s, n, c, tpls, a, tg] = await Promise.all([
      getClientSessions(link.id),
      getNotes(link.id),
      getCoachCheckins(link.id),
      fetchRoutines(),
      getCoachAssignments(link.id),
      getCoachLinkTags(link.id),
    ]);
    setSessions(s);
    setNotes(n);
    setCheckins(c);
    setTemplates(tpls);
    setAssignments(a);
    setTags(tg);
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

  const saveTags = async (next: string[]) => {
    setTags(next);
    await saveCoachLinkTags(link.id, next);
  };
  const addTag = () => {
    const v = tagInput.trim();
    if (!v || tags.includes(v)) { setTagInput(""); return; }
    saveTags([...tags, v]);
    setTagInput("");
  };

  // Assign a saved template as a dated workout for this client.
  const assign = async () => {
    const tpl = templates.find((x) => x.id === assignId);
    if (!tpl) return;
    const parsed = assignDate ? new Date(assignDate) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return; // ignore a cleared/invalid date
    await assignToClient(link.id, { templateId: tpl.id, name: tpl.name, blocks: tpl.blocks, date: parsed.toISOString() });
    setAssignId("");
    load();
  };

  // Generate a varied, periodized week for this client and assign it — the same
  // reconciler the athlete's own Today uses, run on the client's real sessions.
  // The macrocycle is PERSISTED to the client first, so their Periodize/Today
  // show the same season the coach is programming against.
  const generateWeek = async () => {
    if (generating) return;
    setGenerating(true);
    setGenMsg(null);
    try {
      const enrolled = await enrollClientMacrocycle(link.id, genGoal);
      if (!enrolled) { setGenMsg(t("w.teams.coach.enrollFailed")); return; }
      const days = trainingDaysPerWeek(sessions);
      const wk = Math.max(1, Math.min(genMacro.totalWeeks, genWeek));
      const week = buildTrainingWeek({ macro: genMacro, currentWeek: wk, log: personalTrainingLog(sessions), daysPerWeek: days });
      const results = await Promise.all(week.map((it) => assignToClient(link.id, { name: it.name, blocks: it.blocks, date: it.date })));
      const ok = results.filter(Boolean).length;
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
    await replyToCheckin(id, replyText);
    setReplyFor(null);
    setReplyText("");
    load();
  };

  const field = { fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 10 } as const;
  const sectionLabel = (text: string, accent = false) => (
    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: accent ? txt(C, C.lime) : C.ash, marginTop: 20, marginBottom: 10 }}>{text}</Text>
  );
  const selChip = (key: string, lbl: string, selected: boolean, onPress: () => void) => (
    <Pressable key={key} onPress={onPress} style={{ borderWidth: 1, borderColor: selected ? C.lime : C.line, backgroundColor: selected ? `${C.lime}1c` : "transparent", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: selected ? txt(C, C.lime) : C.ash }}>{lbl}</Text>
    </Pressable>
  );

  return (
    <AuroraScreen>
      <Pressable onPress={back} style={{ marginBottom: 10 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>← {t("w.teams.coach.roster")}</Text>
      </Pressable>
      <AHeading style={{ fontSize: fs.display }}>{personName(link.client)}</AHeading>
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 4, marginBottom: 12 }}>{link.client?.email}</Text>

      {/* Roster TAGS */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs, marginBottom: 14 }}>
        {tags.map((tg) => (
          <View key={tg} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: `${C.ash}1f`, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingLeft: 12, paddingRight: 8, paddingVertical: 5 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{tg}</Text>
            <Pressable accessibilityLabel={`${t("w.teams.coach.removeTag")} ${tg}`} onPress={() => saveTags(tags.filter((x) => x !== tg))} hitSlop={6}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.ash, lineHeight: fs.note }}>×</Text>
            </Pressable>
          </View>
        ))}
        <TextInput
          value={tagInput}
          onChangeText={setTagInput}
          onSubmitEditing={addTag}
          returnKeyType="done"
          placeholder={t("w.teams.coach.tagPlaceholder")}
          placeholderTextColor={C.ash}
          accessibilityLabel={t("w.teams.coach.addTagLabel")}
          autoCapitalize="none"
          style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, minWidth: 96 }}
        />
      </View>

      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime), marginBottom: 10 }}>{t("w.teams.coach.diet")}</Text>
      <CoachDiet linkId={link.id} />

      <View style={{ marginTop: 14 }} />
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginBottom: 10 }}>{t("w.teams.coach.coachingNotes")}</Text>
      <ACard>
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder={t("w.teams.coach.addNotePlaceholder")}
          placeholderTextColor={C.ash}
          multiline
          style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 14, minHeight: 56 }}
        />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          <Pressable onPress={() => setIsPrivate((p) => !p)} style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <Text style={{ color: txt(C, isPrivate ? C.lime : C.ash), fontFamily: F.mono }}>{isPrivate ? "☑" : "☐"}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.teams.coach.private")}</Text>
          </Pressable>
          <APill label={t("common.add")} variant="primary" onPress={add} style={{ paddingHorizontal: 24, paddingVertical: 12 }} />
        </View>
      </ACard>

      {loading ? (
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 16 }}>…</Text>
      ) : (
        <>
          {/* PROGRAMMING — assign a saved template + generate a periodized week */}
          {sectionLabel(t("w.teams.coach.programming"))}
          <ACard>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.teams.coach.assignWorkout")}</Text>
            {templates.length === 0 ? (
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, marginTop: 8 }}>{t("w.teams.coach.noTemplates")}</Text>
            ) : (
              <>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 10 }}>
                  {templates.map((tpl) => selChip(tpl.id, tpl.name, assignId === tpl.id, () => setAssignId(assignId === tpl.id ? "" : tpl.id)))}
                </View>
                <View style={{ flexDirection: "row", gap: space.sm, marginTop: 10, alignItems: "center" }}>
                  <TextInput value={assignDate} onChangeText={setAssignDate} placeholder="YYYY-MM-DD" placeholderTextColor={C.ash} accessibilityLabel={t("w.teams.coach.assignDateLabel")} autoCapitalize="none" style={[field, { width: 140 }]} />
                  <APill label={t("w.teams.coach.assign")} variant={assignId ? "primary" : "soft"} onPress={assign} style={{ paddingHorizontal: 22, paddingVertical: 12 }} />
                </View>
              </>
            )}
          </ACard>

          <ACard style={{ marginTop: 12 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.teams.coach.generatePeriodizedWeek")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 6, lineHeight: 18 }}>
              {sessions.length === 0
                ? t("w.teams.coach.genEmptyHint")
                : `${t("w.teams.coach.genHintPre")} (~${trainingDaysPerWeek(sessions)}/${t("w.teams.coach.wkAbbr")}), ${t("w.teams.coach.genHintPost")}`}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 10 }}>
              {GEN_GOALS.map((g) => selChip(`goal:${g}`, g, genGoal === g, () => { setGenGoal(g); setGenWeek(1); }))}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ gap: space.xs, paddingRight: 4 }}>
              {genMacro.blocks.flatMap((b) =>
                b.micros.map((m) => selChip(
                  `wk:${m.week}`,
                  `${t("w.teams.coach.wkAbbr")} ${m.week} – ${b.label}${m.kind === "recovery" ? ` (${t("w.teams.coach.deload")})` : ""}`,
                  genWeek === m.week,
                  () => setGenWeek(m.week),
                )),
              )}
            </ScrollView>
            <View style={{ marginTop: 12 }}>
              <APill
                label={generating ? t("w.teams.coach.generating") : t("w.teams.coach.generateAssign")}
                variant={sessions.length > 0 && !generating ? "primary" : "soft"}
                disabled={sessions.length === 0 || generating}
                onPress={generateWeek}
                style={{ paddingVertical: 14 }}
              />
            </View>
            {genMsg && <View accessibilityLiveRegion="polite"><Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime), marginTop: 8 }}>{genMsg}</Text></View>}
          </ACard>

          {assignments.map((a) => (
            <ACard key={a.id} style={{ marginTop: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{a.name}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 2 }}>{new Date(a.date).toLocaleDateString()}</Text>
                </View>
                <View style={{ backgroundColor: `${a.status === "completed" ? C.lime : a.status === "skipped" ? C.red : C.ash}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, a.status === "completed" ? C.lime : a.status === "skipped" ? C.red : C.ash) }}>{a.status}</Text>
                </View>
              </View>
            </ACard>
          ))}

          {/* WEEKLY CHECK-INS + coach reply */}
          {sectionLabel(t("w.teams.coach.weeklyCheckins"))}
          {checkins.length === 0 ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.teams.coach.noCheckins")}</Text>
          ) : (
            checkins.map((c) => (
              <ACard key={c.id} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ fontFamily: F.semi, fontSize: fs.note, color: C.chalk }}>{new Date(c.weekOf).toLocaleDateString()}</Text>
                  {c.adherencePct != null && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{c.adherencePct}% {t("w.teams.coach.adherence")}</Text>}
                </View>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 6 }}>
                  {t("w.teams.coach.energy")} {c.energy ?? "—"} – {t("w.teams.coach.sleep")} {c.sleep ?? "—"} – {t("w.teams.coach.freshness")} {c.soreness ?? "—"} – {t("w.teams.coach.mood")} {c.mood ?? "—"}
                  {c.bodyMassKg != null ? ` – ${c.bodyMassKg}kg` : ""}
                </Text>
                {c.note ? <Text style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, marginTop: 6, lineHeight: 20 }}>{c.note}</Text> : null}
                {c.coachReply ? (
                  <View style={{ marginTop: 10, paddingLeft: 10 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.teams.coach.yourReply")}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, marginTop: 4, lineHeight: 20 }}>{c.coachReply}</Text>
                  </View>
                ) : replyFor === c.id ? (
                  <View style={{ marginTop: 10 }}>
                    <TextInput
                      value={replyText}
                      onChangeText={setReplyText}
                      placeholder={t("w.teams.coach.replyPlaceholder")}
                      placeholderTextColor={C.ash}
                      accessibilityLabel={t("w.teams.coach.replyLabel")}
                      multiline
                      style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 14, minHeight: 56 }}
                    />
                    <View style={{ flexDirection: "row", gap: space.sm, marginTop: 8 }}>
                      <APill label={t("w.teams.coach.sendReply")} variant="primary" onPress={() => sendReply(c.id)} style={{ paddingHorizontal: 20, paddingVertical: 12 }} />
                      <APill label={t("common.cancel")} variant="soft" onPress={() => { setReplyFor(null); setReplyText(""); }} style={{ paddingHorizontal: 20, paddingVertical: 12 }} />
                    </View>
                  </View>
                ) : (
                  <View style={{ marginTop: 10, alignSelf: "flex-start" }}>
                    <APill label={t("w.teams.coach.reply")} variant="primary" onPress={() => { setReplyFor(c.id); setReplyText(""); }} style={{ paddingHorizontal: 22, paddingVertical: 12 }} />
                  </View>
                )}
              </ACard>
            ))
          )}

          {notes.map((n) => (
            <ACard key={n.id} style={{ marginTop: 12 }}>
              {n.private && (
                <View style={{ alignSelf: "flex-start", backgroundColor: `${C.ash}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{t("w.teams.coach.private")}</Text>
                </View>
              )}
              <Text style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, marginTop: n.private ? 8 : 0, lineHeight: 20 }}>{n.body}</Text>
            </ACard>
          ))}

          {sessions.length > 0 && <ClientWeek sessions={sessions} t={t} />}

          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime), marginTop: 20, marginBottom: 10 }}>{t("w.teams.coach.recentSessions")}</Text>
          {sessions.length === 0 ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.teams.coach.noSessions")}</Text>
          ) : (
            sessions.map((s) => (
              <ACard key={s.id} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontFamily: F.semi, fontSize: fs.note, color: C.chalk }}>{s.title}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{new Date(s.startedAt).toLocaleDateString()}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: space.sm, marginTop: 8 }}>
                  <View style={{ backgroundColor: C.ink, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: C.line }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{sessionVolume(s.blocks).toLocaleString()} kg</Text>
                  </View>
                  <View style={{ backgroundColor: C.ink, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: C.line }}>
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
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime), marginTop: 20, marginBottom: 10 }}>{t("w.teams.coach.thisWeek")}</Text>
      <ACard>
        {r.sessions === 0 ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("recap.noneThisWeek")}</Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}>
              <Metric label={t("w.teams.coach.sessionsWord")} value={`${r.sessions}`} color={C.chalk} />
              <Metric label={t("summary.kgMoved")} value={r.volume.toLocaleString()} color={txt(C, C.lime)} />
              <Metric label={t("recap.activeDays")} value={`${r.activeDays}`} color={C.chalk} />
              <Metric label={t("recap.prs")} value={`${r.prs.length}`} color={r.prs.length ? txt(C, C.lime) : C.ash} />
              {r.topMuscle && <Metric label={t("recap.top")} value={MUSCLE_LABEL[r.topMuscle.muscle] ?? r.topMuscle.muscle} color={C.chalk} />}
            </View>
            {hasPrev && (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, r.volumeDelta >= 0 ? C.lime : C.amber), marginTop: 14 }}>
                {r.sessionsDelta >= 0 ? "+" : ""}{r.sessionsDelta} {t("w.teams.coach.sessionsWord")} – {r.volumeDelta >= 0 ? "+" : ""}
                {r.volumeDelta.toLocaleString()} kg {t("recap.vsLastWeek")}
              </Text>
            )}
            {r.prs.length > 0 && (
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 10 }}>
                <AuroraIcon name="trophy" size={14} color={C.chalk} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.caption, color: C.chalk, lineHeight: 18 }}>
                  {r.prs.slice(0, 4).map((p) => formatStrengthPr(p, { first: t("w.teams.coach.first"), moreReps: t("summary.morePrReps") })).join(" – ")}
                </Text>
              </View>
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
