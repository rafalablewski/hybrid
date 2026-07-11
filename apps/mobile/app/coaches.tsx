import { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, Modal, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Card, Loading, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import {
  getCoaches, getCoach, enrollProgram, postReview,
  getCoachProfile, putCoachProfile, getCoachPrograms, patchProgram, getEnrollments, respondEnrollment,
} from "../lib/social-api";
import { Avatar, Stars, Empty, SButton, SPill } from "../components/social-kit";
import { GlassToggle } from "../components/glass-toggle";

// ---- coach detail (what a client sees) ----
function CoachModal({ handle, onClose }: { handle: string; onClose: () => void }) {
  const C = useTheme().palette;
  const [data, setData] = useState<any>(null);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const load = () => getCoach(handle).then(setData);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [handle]);
  const c = data?.coach;
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,.6)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: C.ink, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%", borderWidth: 1, borderColor: C.line }}>
          <Pressable onPress={onClose} style={{ alignSelf: "flex-end", padding: 16 }}><Text style={{ color: C.ash, fontSize: 22 }}>×</Text></Pressable>
          <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0 }}>
            {!c ? <ActivityIndicator color={C.lime} /> : (
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
                {data.isMyCoach ? <Text style={{ color: txt(C, C.lime), fontSize: 13, marginTop: 10 }}>✓ This is your coach.</Text> : null}

                <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700", marginTop: 22, marginBottom: 6 }}>Online programs</Text>
                {data.programs.length === 0 ? <Text style={{ color: C.ash, fontSize: 13 }}>No published programs yet.</Text> : data.programs.map((p: any) => (
                  <View key={p.id} style={{ backgroundColor: C.ink2, borderRadius: 16, padding: 14, marginBottom: 10 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700" }}>{p.name}</Text>
                        <Text style={{ color: C.ash, fontSize: 12 }}>{[p.goal, p.level, p.weeks ? `${p.weeks} weeks` : null].filter(Boolean).join(" · ")}</Text>
                      </View>
                      {p.enrollmentStatus ? <Text style={{ color: p.enrollmentStatus === "active" ? C.lime : C.amber, fontFamily: F.mono, fontSize: 12 }}>{p.enrollmentStatus === "active" ? "Enrolled ✓" : "Requested"}</Text>
                        : data.isMe ? null : <SButton label={enrolling === p.id ? "Starting…" : "Start"} small disabled={!!enrolling} onPress={async () => { if (enrolling) return; setEnrolling(p.id); const r: any = await enrollProgram(p.id); setEnrolling(null); if (r.error) { alert(r.error); return; } load(); }} />}
                    </View>
                    {p.summary ? <Text style={{ color: C.chalk, fontSize: 13, marginTop: 8, lineHeight: 19 }}>{p.summary}</Text> : null}
                    {Array.isArray(p.preview) && p.preview.length > 0 && (
                      <>
                        <Pressable onPress={() => setPreview(preview === p.id ? null : p.id)}><Text style={{ color: txt(C, C.lime), fontSize: 12, fontFamily: F.bold, marginTop: 8 }}>{preview === p.id ? "Hide preview ▲" : "Preview the plan ▼"}</Text></Pressable>
                        {preview === p.id && (
                          <View style={{ marginTop: 8 }}>
                            {p.preview.map((w: any, wi: number) => (
                              <View key={wi} style={{ marginBottom: 8 }}>
                                <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, textTransform: "uppercase", letterSpacing: 0.5 }}>Week {wi + 1}</Text>
                                {w.days.map((d: any, di: number) => (
                                  <View key={di} style={{ marginTop: 4 }}>
                                    <Text style={{ color: C.chalk, fontSize: 12.5, fontFamily: F.bold }}>{d.day || `Day ${di + 1}`}</Text>
                                    <Text style={{ color: C.ash, fontSize: 12 }}>{d.items.map((it: any) => `${it.name}${it.sr ? ` ${it.sr}` : ""}`).join(" · ") || "—"}</Text>
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
                  <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700" }}>Reviews ({data.reviews.length})</Text>
                  {data.isMyCoach && !data.isMe && <SButton label={reviewOpen ? "Cancel" : "Write a review"} ghost small onPress={() => setReviewOpen((o) => !o)} />}
                </View>
                {reviewOpen && (
                  <View style={{ backgroundColor: C.ink2, borderRadius: 16, padding: 14, marginTop: 10 }}>
                    <View style={{ flexDirection: "row", gap: 4, marginBottom: 8 }}>
                      {[1, 2, 3, 4, 5].map((n) => <Pressable key={n} onPress={() => setRating(n)}><Text style={{ fontSize: 24, color: n <= rating ? C.gold : C.line }}>★</Text></Pressable>)}
                    </View>
                    <TextInput value={body} onChangeText={setBody} multiline placeholder="How was the coaching?" placeholderTextColor={C.ash} style={{ minHeight: 56, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: C.line, color: C.chalk, fontSize: 13 }} />
                    <View style={{ marginTop: 8 }}><SButton label="Submit review" small onPress={async () => { const r: any = await postReview(handle, { rating, body }); if (r.error) { alert(r.error); return; } setReviewOpen(false); setBody(""); load(); }} /></View>
                  </View>
                )}
                {data.reviews.map((rv: any) => (
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
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ---- coach's own storefront ----
function Storefront() {
  const C = useTheme().palette;
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<any>({ headline: "", bio: "", specialties: "", sports: "", acceptingClients: true, autoAccept: false, priceNote: "" });
  const [programs, setPrograms] = useState<any[]>([]);
  const [enroll, setEnroll] = useState<any>({ incoming: [] });
  const [saved, setSaved] = useState(false);
  const load = async () => {
    const d: any = await getCoachProfile(); setData(d);
    if (d.profile) setForm({ headline: d.profile.headline ?? "", bio: d.profile.bio ?? "", specialties: (d.profile.specialties ?? []).join(", "), sports: (d.profile.sports ?? []).join(", "), acceptingClients: d.profile.acceptingClients, autoAccept: d.profile.autoAccept, priceNote: d.profile.priceNote ?? "" });
    const pr: any = await getCoachPrograms(); setPrograms(pr.programs ?? []);
    setEnroll(await getEnrollments());
  };
  useEffect(() => { load(); }, []);
  if (!data) return <Loading />;
  if (!data.isCoach) return <Empty title="Coaches only" sub="Apply to become a coach to publish programs and appear in the marketplace." />;
  const inp = { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, color: C.chalk, fontSize: 14, marginBottom: 12 } as const;

  return (
    <View>
      {!data.handle && <Card><Text style={{ color: txt(C, C.amber) }}>⚠ Claim a @handle on My profile first — the marketplace lists you by handle.</Text></Card>}
      <Card>
        <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700", marginBottom: 12 }}>Your storefront</Text>
        <TextInput value={form.headline} onChangeText={(v) => setForm({ ...form, headline: v })} placeholder="Headline" placeholderTextColor={C.ash} style={inp} />
        <TextInput value={form.bio} onChangeText={(v) => setForm({ ...form, bio: v })} multiline placeholder="Bio" placeholderTextColor={C.ash} style={{ ...inp, minHeight: 70 }} />
        <TextInput value={form.specialties} onChangeText={(v) => setForm({ ...form, specialties: v })} placeholder="Specialties (comma-separated)" placeholderTextColor={C.ash} style={inp} />
        <TextInput value={form.sports} onChangeText={(v) => setForm({ ...form, sports: v })} placeholder="Sports (comma-separated)" placeholderTextColor={C.ash} style={inp} />
        <TextInput value={form.priceNote} onChangeText={(v) => setForm({ ...form, priceNote: v })} placeholder="Pricing note" placeholderTextColor={C.ash} style={inp} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}><Text style={{ color: C.chalk, fontSize: 13 }}>Accepting clients</Text><GlassToggle value={form.acceptingClients} onValueChange={(v) => setForm({ ...form, acceptingClients: v })} accessibilityLabel="Accepting clients" /></View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}><Text style={{ color: C.chalk, fontSize: 13 }}>Auto-accept enrolments</Text><GlassToggle value={form.autoAccept} onValueChange={(v) => setForm({ ...form, autoAccept: v })} accessibilityLabel="Auto-accept enrolments" /></View>
        <SButton label={saved ? "Saved ✓" : "Save storefront"} onPress={async () => { const r: any = await putCoachProfile({ ...form, specialties: form.specialties.split(",").map((s: string) => s.trim()).filter(Boolean), sports: form.sports.split(",").map((s: string) => s.trim()).filter(Boolean) }); if (r.error) { alert(r.error); return; } setSaved(true); setTimeout(() => setSaved(false), 1500); load(); }} />
      </Card>

      <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700", marginTop: 18, marginBottom: 8 }}>Programs ({programs.length})</Text>
      <Card>
        {programs.length === 0 ? <Empty title="No programs yet" sub="Build a program in the Coach console, then publish it here." /> : programs.map((p) => (
          <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <View><Text style={{ color: C.chalk, fontWeight: "600" }}>{p.name}</Text><Text style={{ color: C.ash, fontSize: 12 }}>{p.goal ?? "—"}</Text></View>
            <SButton label={p.published ? "Published ✓" : "Publish"} ghost={!p.published} small onPress={async () => { await patchProgram(p.id, { published: !p.published }); load(); }} />
          </View>
        ))}
      </Card>

      {enroll.incoming?.length > 0 && (
        <>
          <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700", marginTop: 18, marginBottom: 8 }}>Enrolment requests</Text>
          <Card>
            {enroll.incoming.map((e: any) => (
              <View key={e.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <Avatar url={e.client?.avatarUrl} name={e.client?.displayName} handle={e.client?.handle} size={36} />
                <View style={{ flex: 1 }}><Text style={{ color: C.chalk, fontWeight: "600" }}>{e.client?.displayName || `@${e.client?.handle}`}</Text><Text style={{ color: C.ash, fontSize: 12 }}>{e.programName} · {e.status}</Text></View>
                {e.status === "requested" && <View style={{ flexDirection: "row", gap: 6 }}><SButton label="Accept" small onPress={async () => { await respondEnrollment({ enrollmentId: e.id, action: "accept" }); load(); }} /><SButton label="Decline" ghost small onPress={async () => { await respondEnrollment({ enrollmentId: e.id, action: "decline" }); load(); }} /></View>}
              </View>
            ))}
          </Card>
        </>
      )}
    </View>
  );
}

export default function CoachesScreen() {
  const C = useTheme().palette;
  const router = useRouter();
  const [tab, setTab] = useState<"browse" | "storefront">("browse");
  const [q, setQ] = useState("");
  const [coaches, setCoaches] = useState<any[] | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [isCoach, setIsCoach] = useState(false);

  const load = () => getCoaches(q.trim() || undefined).then((r: any) => setCoaches(r.coaches ?? []));
  useEffect(() => { const id = setTimeout(load, 200); return () => clearTimeout(id); /* eslint-disable-next-line */ }, [q]);
  useEffect(() => { getCoachProfile().then((d: any) => setIsCoach(!!d.isCoach)); }, []);

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.chalk, fontSize: 18 }}>‹</Text></Pressable>
        <View style={{ flex: 1 }}><Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 24 }}>Coaches</Text><Text style={{ color: C.ash, fontSize: 13 }}>Find a coach · start a program.</Text></View>
      </View>
      {isCoach && (
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          <SPill label="Browse" active={tab === "browse"} onPress={() => setTab("browse")} />
          <SPill label="My coaching" active={tab === "storefront"} onPress={() => setTab("storefront")} />
        </View>
      )}

      {tab === "storefront" && isCoach ? <Storefront /> : (
        <>
          <TextInput value={q} onChangeText={setQ} placeholder="Search coaches, sports…" placeholderTextColor={C.ash} style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, color: C.chalk, fontSize: 15, marginBottom: 16 }} />
          {!coaches ? <Loading /> : coaches.length === 0 ? <Empty title="No coaches yet" sub="When coaches publish their storefronts they'll appear here." /> : coaches.map((c) => (
            <Pressable key={c.userId} onPress={() => setDetail(c.handle)}>
              <Card>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                  <Avatar url={c.avatarUrl} name={c.name} handle={c.handle} size={52} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700" }}>{c.name || `@${c.handle}`}{c.coachVerified ? <Text style={{ color: txt(C, C.blue) }}> ✓</Text> : null}{!c.acceptingClients ? <Text style={{ color: C.ash, fontSize: 11 }}> · full</Text> : null}</Text>
                    <Text style={{ color: C.ash, fontSize: 13 }}>{c.headline || c.specialties.join(" · ") || `@${c.handle}`}</Text>
                    <View style={{ flexDirection: "row", gap: 12, marginTop: 4, alignItems: "center" }}>
                      <Text style={{ color: C.ash, fontSize: 12, fontFamily: F.mono }}>{c.programs} program{c.programs === 1 ? "" : "s"}</Text>
                      <Stars rating={c.rating} size={12} />
                    </View>
                  </View>
                </View>
              </Card>
            </Pressable>
          ))}
        </>
      )}
      {detail && <CoachModal handle={detail} onClose={() => { setDetail(null); load(); }} />}
    </Screen>
  );
}
