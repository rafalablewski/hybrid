import { useEffect, useState } from "react";
import { View, Text, TextInput, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Loading, F, PressScale as Pressable } from "../lib/ui";
import { AuroraScreen, ACard, cardStack, AChip, ASearch } from "../components/aurora/kit";
import { useTheme, txt } from "../lib/theme";
import { useLang } from "../lib/i18n";
import type {
  CoachCard, CoachStorefrontResponse, CoachProfileResponse, CoachProgramData,
  CoachEnrollmentsResponse, StorefrontProgram, StorefrontReview, ProgramPreviewWeek,
  ProgramPreviewDay, ProgramPreviewItem, EnrollmentRow,
} from "@hybrid/core";
import {
  getCoaches, getCoach, enrollProgram, postReview,
  getCoachProfile, putCoachProfile, getCoachPrograms, patchProgram, getEnrollments, respondEnrollment,
} from "../lib/social-api";
import { Avatar, Stars, Empty, SButton } from "../components/social-kit";
import { GlassToggle } from "../components/glass-toggle";
import { useConfirm } from "../components/aurora/confirm";
import Sheet from "../components/aurora/sheet";

// ---- coach detail (what a client sees) ----
function CoachModal({ handle, onClose }: { handle: string; onClose: () => void }) {
  const { notify } = useConfirm();
  const C = useTheme().palette;
  const { t } = useLang();
  const [data, setData] = useState<CoachStorefrontResponse | null>(null);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const load = () => getCoach(handle).then(setData);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [handle]);
  const c = data?.coach;
  return (
    <Sheet visible onClose={onClose}>
          <>
            {!data || !c ? <Loading /> : (
              <>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <Avatar url={c.avatarUrl} name={c.name} handle={c.handle} size={64} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 20 }}>{c.name || `@${c.handle}`}{c.coachVerified ? <Text style={{ color: txt(C, C.blue) }}> ✓</Text> : null}</Text>
                    <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 13 }}>@{c.handle}</Text>
                    <View style={{ marginTop: 4 }}><Stars rating={data.rating} /></View>
                  </View>
                </View>
                {c.headline ? <Text style={{ color: txt(C, C.lime), fontWeight: "600", marginTop: 12 }}>{c.headline}</Text> : null}
                {c.bio ? <Text style={{ color: C.chalk, fontSize: 14, lineHeight: 22, marginTop: 8 }}>{c.bio}</Text> : null}
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                  {c.specialties?.map((s: string) => <View key={s} style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line }}><Text style={{ color: C.chalk, fontSize: 12 }}>{s}</Text></View>)}
                </View>
                {c.priceNote ? <Text style={{ color: C.ash, fontSize: 13, marginTop: 10 }}>💳 {c.priceNote}</Text> : null}
                {data.isMyCoach ? <Text style={{ color: txt(C, C.lime), fontSize: 13, marginTop: 10 }}>✓ {t("w.coaches.isYourCoach")}</Text> : null}

                <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700", marginTop: 22, marginBottom: 6 }}>{t("w.coaches.onlinePrograms")}</Text>
                {data.programs.length === 0 ? <Text style={{ color: C.ash, fontSize: 13 }}>{t("w.coaches.noPublished")}</Text> : data.programs.map((p: StorefrontProgram) => (
                  <View key={p.id} style={{ backgroundColor: C.ink2, borderRadius: 16, padding: 14, marginBottom: 10 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700" }}>{p.name}</Text>
                        <Text style={{ color: C.ash, fontSize: 12 }}>{[p.goal, p.level, p.weeks ? `${p.weeks} ${t("w.coaches.weeks")}` : null].filter(Boolean).join(" – ")}</Text>
                      </View>
                      {p.enrollmentStatus ? <Text style={{ color: p.enrollmentStatus === "active" ? C.lime : C.amber, fontFamily: F.mono, fontSize: 12 }}>{p.enrollmentStatus === "active" ? `${t("w.coaches.enrolled")} ✓` : t("w.social.requested")}</Text>
                        : data.isMe ? null : <SButton label={enrolling === p.id ? t("w.coaches.starting") : t("w.coaches.start")} small disabled={!!enrolling} onPress={async () => { if (enrolling) return; setEnrolling(p.id); const r = await enrollProgram(p.id); setEnrolling(null); if (r.error) { notify(t("common.error"), r.error); return; } load(); }} />}
                    </View>
                    {p.summary ? <Text style={{ color: C.chalk, fontSize: 13, marginTop: 8, lineHeight: 19 }}>{p.summary}</Text> : null}
                    {Array.isArray(p.preview) && p.preview.length > 0 && (
                      <>
                        <Pressable onPress={() => setPreview(preview === p.id ? null : p.id)}><Text style={{ color: txt(C, C.lime), fontSize: 12, fontFamily: F.bold, marginTop: 8 }}>{preview === p.id ? `${t("w.coaches.hidePreview")} ▲` : `${t("w.coaches.previewPlan")} ▼`}</Text></Pressable>
                        {preview === p.id && (
                          <View style={{ marginTop: 8 }}>
                            {p.preview.map((w: ProgramPreviewWeek, wi: number) => (
                              <View key={wi} style={{ marginBottom: 8 }}>
                                <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("w.coaches.week")} {wi + 1}</Text>
                                {w.days.map((d: ProgramPreviewDay, di: number) => (
                                  <View key={di} style={{ marginTop: 4 }}>
                                    <Text style={{ color: C.chalk, fontSize: 12.5, fontFamily: F.bold }}>{d.day || `${t("w.coaches.day")} ${di + 1}`}</Text>
                                    <Text style={{ color: C.ash, fontSize: 12 }}>{d.items.map((it: ProgramPreviewItem) => `${it.name}${it.sr ? ` ${it.sr}` : ""}`).join(" – ") || "—"}</Text>
                                  </View>
                                ))}
                              </View>
                            ))}
                          </View>
                        )}
                      </>
                    )}
                  </View>
                ))}

                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 22 }}>
                  <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700" }}>{t("w.coaches.reviews")} ({data.reviews.length})</Text>
                  {data.isMyCoach && !data.isMe && <SButton label={reviewOpen ? t("common.cancel") : t("w.coaches.writeReview")} ghost small onPress={() => setReviewOpen((o) => !o)} />}
                </View>
                {reviewOpen && (
                  <View style={{ backgroundColor: C.ink2, borderRadius: 16, padding: 14, marginTop: 10 }}>
                    <View style={{ flexDirection: "row", gap: 4, marginBottom: 8 }}>
                      {[1, 2, 3, 4, 5].map((n) => <Pressable key={n} onPress={() => setRating(n)}><Text style={{ fontSize: 24, color: n <= rating ? C.gold : C.line }}>★</Text></Pressable>)}
                    </View>
                    <TextInput value={body} onChangeText={setBody} multiline placeholder={t("w.coaches.reviewPlaceholder")} placeholderTextColor={C.ash} style={{ minHeight: 56, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: C.line, color: C.chalk, fontSize: 13 }} />
                    <View style={{ marginTop: 8 }}><SButton label={t("w.coaches.submitReview")} small onPress={async () => { const r = await postReview(handle, { rating, body }); if (r.error) { notify(t("common.error"), r.error); return; } setReviewOpen(false); setBody(""); load(); }} /></View>
                  </View>
                )}
                {data.reviews.map((rv: StorefrontReview) => (
                  <View key={rv.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Avatar url={rv.author?.avatarUrl} name={rv.author?.displayName} handle={rv.author?.handle} size={26} />
                      <Text style={{ color: C.chalk, fontWeight: "600", fontSize: 13 }}>{rv.author?.displayName || `@${rv.author?.handle}`}</Text>
                      <Text style={{ color: C.gold, fontSize: 12 }}>{"★".repeat(rv.rating)}</Text>
                    </View>
                    {rv.body ? <Text style={{ color: C.ash, fontSize: 13, marginTop: 6, lineHeight: 19 }}>{rv.body}</Text> : null}
                  </View>
                ))}
              </>
            )}
          </>
    </Sheet>
  );
}

// ---- coach's own storefront ----
function Storefront() {
  const { notify } = useConfirm();
  const C = useTheme().palette;
  const { t } = useLang();
  const [data, setData] = useState<CoachProfileResponse | null>(null);
  // `visibility` has no mobile UI control, but it MUST round-trip: the PUT handler
  // does a full update (visibility defaults to "public"), so omitting it would
  // silently reset an "unlisted" storefront to public on every mobile save.
  const [form, setForm] = useState({ headline: "", bio: "", specialties: "", sports: "", acceptingClients: true, autoAccept: false, priceNote: "", visibility: "public" });
  const [programs, setPrograms] = useState<CoachProgramData[]>([]);
  const [enroll, setEnroll] = useState<CoachEnrollmentsResponse>({ incoming: [], mine: [] });
  const [saved, setSaved] = useState(false);
  const load = async () => {
    const d = await getCoachProfile(); setData(d);
    if (d.profile) setForm({ headline: d.profile.headline ?? "", bio: d.profile.bio ?? "", specialties: (d.profile.specialties ?? []).join(", "), sports: (d.profile.sports ?? []).join(", "), acceptingClients: d.profile.acceptingClients, autoAccept: d.profile.autoAccept, priceNote: d.profile.priceNote ?? "", visibility: d.profile.visibility });
    const pr = await getCoachPrograms(); setPrograms(pr.programs ?? []);
    setEnroll(await getEnrollments());
  };
  useEffect(() => { load(); }, []);
  if (!data) return <Loading />;
  if (!data.isCoach) return <Empty title={t("w.coaches.coachesOnly")} sub={t("w.coaches.coachesOnlySub")} />;
  const inp = { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, color: C.chalk, fontSize: 14, marginBottom: 12 } as const;

  return (
    <View>
      {!data.handle && <ACard style={cardStack}><Text style={{ color: txt(C, C.amber) }}>⚠ {t("w.coaches.claimHandle")}</Text></ACard>}
      <ACard style={cardStack}>
        <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700", marginBottom: 12 }}>{t("w.coaches.yourStorefront")}</Text>
        <TextInput value={form.headline} onChangeText={(v) => setForm({ ...form, headline: v })} placeholder={t("w.coaches.headline")} placeholderTextColor={C.ash} style={inp} />
        <TextInput value={form.bio} onChangeText={(v) => setForm({ ...form, bio: v })} multiline placeholder={t("w.coaches.bio")} placeholderTextColor={C.ash} style={{ ...inp, minHeight: 70 }} />
        <TextInput value={form.specialties} onChangeText={(v) => setForm({ ...form, specialties: v })} placeholder={t("w.coaches.specialties")} placeholderTextColor={C.ash} style={inp} />
        <TextInput value={form.sports} onChangeText={(v) => setForm({ ...form, sports: v })} placeholder={t("w.coaches.sports")} placeholderTextColor={C.ash} style={inp} />
        <TextInput value={form.priceNote} onChangeText={(v) => setForm({ ...form, priceNote: v })} placeholder={t("w.coaches.pricingNote")} placeholderTextColor={C.ash} style={inp} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}><Text style={{ color: C.chalk, fontSize: 13 }}>{t("w.coaches.acceptingClients")}</Text><GlassToggle value={form.acceptingClients} onValueChange={(v) => setForm({ ...form, acceptingClients: v })} accessibilityLabel={t("w.coaches.acceptingClients")} /></View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}><Text style={{ color: C.chalk, fontSize: 13 }}>{t("w.coaches.autoAccept")}</Text><GlassToggle value={form.autoAccept} onValueChange={(v) => setForm({ ...form, autoAccept: v })} accessibilityLabel={t("w.coaches.autoAccept")} /></View>
        <SButton label={saved ? `${t("w.coaches.saved")} ✓` : t("w.coaches.saveStorefront")} onPress={async () => { const r = await putCoachProfile({ ...form, specialties: form.specialties.split(",").map((s: string) => s.trim()).filter(Boolean), sports: form.sports.split(",").map((s: string) => s.trim()).filter(Boolean) }); if (r.error) { notify(t("common.error"), r.error); return; } setSaved(true); setTimeout(() => setSaved(false), 1500); load(); }} />
      </ACard>

      <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700", marginTop: 18, marginBottom: 8 }}>{t("w.coaches.programsCount")} ({programs.length})</Text>
      <ACard style={cardStack}>
        {programs.length === 0 ? <Empty title={t("w.coaches.noPrograms")} sub={t("w.coaches.noProgramsSub")} /> : programs.map((p) => (
          <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <View><Text style={{ color: C.chalk, fontWeight: "600" }}>{p.name}</Text><Text style={{ color: C.ash, fontSize: 12 }}>{p.goal ?? "—"}</Text></View>
            <SButton label={p.published ? `${t("w.coaches.published")} ✓` : t("w.coaches.publish")} ghost={!p.published} small onPress={async () => { await patchProgram(p.id, { published: !p.published }); load(); }} />
          </View>
        ))}
      </ACard>

      {enroll.incoming?.length > 0 && (
        <>
          <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700", marginTop: 18, marginBottom: 8 }}>{t("w.coaches.enrolmentRequests")}</Text>
          <ACard style={cardStack}>
            {enroll.incoming.map((e: EnrollmentRow) => (
              <View key={e.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <Avatar url={e.client?.avatarUrl} name={e.client?.displayName} handle={e.client?.handle} size={36} />
                <View style={{ flex: 1 }}><Text style={{ color: C.chalk, fontWeight: "600" }}>{e.client?.displayName || `@${e.client?.handle}`}</Text><Text style={{ color: C.ash, fontSize: 12 }}>{e.programName} – {e.status}</Text></View>
                {e.status === "requested" && <View style={{ flexDirection: "row", gap: 6 }}><SButton label={t("w.coaches.accept")} small onPress={async () => { await respondEnrollment({ enrollmentId: e.id, action: "accept" }); load(); }} /><SButton label={t("w.coaches.decline")} ghost small onPress={async () => { await respondEnrollment({ enrollmentId: e.id, action: "decline" }); load(); }} /></View>}
              </View>
            ))}
          </ACard>
        </>
      )}
    </View>
  );
}

export default function CoachesScreen() {
  const C = useTheme().palette;
  const { t } = useLang();
  const router = useRouter();
  const [tab, setTab] = useState<"browse" | "storefront">("browse");
  const [q, setQ] = useState("");
  const [coaches, setCoaches] = useState<CoachCard[] | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [isCoach, setIsCoach] = useState(false);

  const load = () => getCoaches(q.trim() || undefined).then((r) => setCoaches(r.coaches ?? []));
  useEffect(() => { const id = setTimeout(load, 200); return () => clearTimeout(id); /* eslint-disable-next-line */ }, [q]);
  useEffect(() => { getCoachProfile().then((d) => setIsCoach(!!d.isCoach)); }, []);

  return (
    <AuroraScreen hero={{ rank: "title", title: t("w.coaches.title"), meta: [t("w.coaches.sub")] }}>
      {isCoach && (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          <AChip label={t("w.coaches.browse")} selected={tab === "browse"} onPress={() => setTab("browse")} />
          <AChip label={t("w.coaches.myCoaching")} selected={tab === "storefront"} onPress={() => setTab("storefront")} />
        </View>
      )}

      {tab === "storefront" && isCoach ? <Storefront /> : (
        <>
          <ASearch value={q} onChange={setQ} placeholder={t("w.coaches.search")} />
          {!coaches ? <Loading /> : coaches.length === 0 ? <Empty title={t("w.coaches.none")} sub={t("w.coaches.noneSub")} /> : coaches.map((c) => (
            <Pressable key={c.userId} onPress={() => setDetail(c.handle)}>
              <ACard style={cardStack}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <Avatar url={c.avatarUrl} name={c.name} handle={c.handle} size={52} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700" }}>{c.name || `@${c.handle}`}{c.coachVerified ? <Text style={{ color: txt(C, C.blue) }}> ✓</Text> : null}{!c.acceptingClients ? <Text style={{ color: C.ash, fontSize: 11 }}> – {t("w.coaches.full")}</Text> : null}</Text>
                    <Text style={{ color: C.ash, fontSize: 13 }}>{c.headline || c.specialties.join(" – ") || `@${c.handle}`}</Text>
                    <View style={{ flexDirection: "row", gap: 12, marginTop: 4, alignItems: "center" }}>
                      <Text style={{ color: C.ash, fontSize: 12, fontFamily: F.mono }}>{c.programs} {c.programs === 1 ? t("w.coaches.program") : t("w.coaches.programsWord")}</Text>
                      <Stars rating={c.rating} size={12} />
                    </View>
                  </View>
                </View>
              </ACard>
            </Pressable>
          ))}
        </>
      )}
      {detail && <CoachModal handle={detail} onClose={() => { setDetail(null); load(); }} />}
    </AuroraScreen>
  );
}
