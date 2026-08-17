import { useEffect, useState } from "react";
import { View, Text, TextInput, ScrollView, ActivityIndicator, type StyleProp, type ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import { fs, Loading, LoadSwap, F, PressScale as Pressable } from "../lib/ui";
import { AuroraScreen, ACard, cardStack, AChip, ASearch } from "../components/aurora/kit";
import { useTheme, txt, type Palette } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { seedPerson, userPagePath } from "@hybrid/core";
import type {
  CoachCard, CoachProfileResponse, CoachProgramData,
  CoachEnrollmentsResponse, EnrollmentRow,
} from "@hybrid/core";
import {
  getCoaches, getCoachProfile, putCoachProfile, getCoachPrograms, patchProgram, getEnrollments, respondEnrollment,
} from "../lib/social-api";
import { Avatar, Stars, Empty, SButton } from "../components/social-kit";
import { GlassToggle } from "../components/glass-toggle";
import { useConfirm } from "../components/aurora/confirm";
import { usePersonSource } from "../lib/shared-element";
import { useListMotion } from "../lib/list-motion";
import { Glyph } from "../components/aurora/icons";

/**
 * THE MARKETPLACE (mobile) — the directory, and a coach's own storefront EDITOR.
 *
 * Reading a coach happens on their PAGE (/u/<handle>), where coaching is a tab
 * on the person rather than a sheet of its own — a coach is one human with more
 * to offer, not a second kind of profile.
 */

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
  return (
    <LoadSwap loading={!data}>
      {() => {
        if (!data) return null;
        if (!data.isCoach) return <Empty title={t("w.coaches.coachesOnly")} sub={t("w.coaches.coachesOnlySub")} />;
        const inp = { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, color: C.chalk, fontSize: fs.bodyLg, marginBottom: 12 } as const;

        return (
          <View>
            {!data.handle && <ACard style={cardStack}><View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Glyph name="warn" size={fs.body + 2} color={txt(C, C.amber) as string} /><Text style={{ color: txt(C, C.amber), flex: 1 }}>{t("w.coaches.claimHandle")}</Text></View></ACard>}
            <ACard style={cardStack}>
              <Text style={{ color: C.chalk, fontFamily: F.bold, marginBottom: 12 }}>{t("w.coaches.yourStorefront")}</Text>
              <TextInput value={form.headline} onChangeText={(v) => setForm({ ...form, headline: v })} placeholder={t("w.coaches.headline")} placeholderTextColor={C.ash} style={inp} />
              <TextInput value={form.bio} onChangeText={(v) => setForm({ ...form, bio: v })} multiline placeholder={t("w.coaches.bio")} placeholderTextColor={C.ash} style={{ ...inp, minHeight: 70 }} />
              <TextInput value={form.specialties} onChangeText={(v) => setForm({ ...form, specialties: v })} placeholder={t("w.coaches.specialties")} placeholderTextColor={C.ash} style={inp} />
              <TextInput value={form.sports} onChangeText={(v) => setForm({ ...form, sports: v })} placeholder={t("w.coaches.sports")} placeholderTextColor={C.ash} style={inp} />
              <TextInput value={form.priceNote} onChangeText={(v) => setForm({ ...form, priceNote: v })} placeholder={t("w.coaches.pricingNote")} placeholderTextColor={C.ash} style={inp} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}><Text style={{ color: C.chalk, fontSize: fs.body }}>{t("w.coaches.acceptingClients")}</Text><GlassToggle value={form.acceptingClients} onValueChange={(v) => setForm({ ...form, acceptingClients: v })} accessibilityLabel={t("w.coaches.acceptingClients")} /></View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}><Text style={{ color: C.chalk, fontSize: fs.body }}>{t("w.coaches.autoAccept")}</Text><GlassToggle value={form.autoAccept} onValueChange={(v) => setForm({ ...form, autoAccept: v })} accessibilityLabel={t("w.coaches.autoAccept")} /></View>
              <SButton label={saved ? `${t("w.coaches.saved")} ✓` : t("w.coaches.saveStorefront")} onPress={async () => { const r = await putCoachProfile({ ...form, specialties: form.specialties.split(",").map((s: string) => s.trim()).filter(Boolean), sports: form.sports.split(",").map((s: string) => s.trim()).filter(Boolean) }); if (r.error) { notify(t("common.error"), r.error); return; } setSaved(true); setTimeout(() => setSaved(false), 1500); load(); }} />
            </ACard>

            <Text style={{ color: C.chalk, fontFamily: F.bold, marginTop: 18, marginBottom: 8 }}>{t("w.coaches.programsCount")} ({programs.length})</Text>
            <ACard style={cardStack}>
              {programs.length === 0 ? <Empty title={t("w.coaches.noPrograms")} sub={t("w.coaches.noProgramsSub")} /> : programs.map((p) => (
                <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
                  <View><Text style={{ color: C.chalk, fontFamily: F.semi }}>{p.name}</Text><Text style={{ color: C.ash, fontSize: fs.caption }}>{p.goal ?? "—"}</Text></View>
                  <SButton label={p.published ? `${t("w.coaches.published")} ✓` : t("w.coaches.publish")} ghost={!p.published} small onPress={async () => { await patchProgram(p.id, { published: !p.published }); load(); }} />
                </View>
              ))}
            </ACard>

            {enroll.incoming?.length > 0 && (
              <>
                <Text style={{ color: C.chalk, fontFamily: F.bold, marginTop: 18, marginBottom: 8 }}>{t("w.coaches.enrolmentRequests")}</Text>
                <ACard style={cardStack}>
                  {enroll.incoming.map((e: EnrollmentRow) => (
                    <View key={e.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
                      <Avatar url={e.client?.avatarUrl} name={e.client?.displayName} handle={e.client?.handle} size={36} />
                      <View style={{ flex: 1 }}><Text style={{ color: C.chalk, fontFamily: F.semi }}>{e.client?.displayName || `@${e.client?.handle}`}</Text><Text style={{ color: C.ash, fontSize: fs.caption }}>{e.programName} – {e.status}</Text></View>
                      {e.status === "requested" && <View style={{ flexDirection: "row", gap: 6 }}><SButton label={t("w.coaches.accept")} small onPress={async () => { await respondEnrollment({ enrollmentId: e.id, action: "accept" }); load(); }} /><SButton label={t("w.coaches.decline")} ghost small onPress={async () => { await respondEnrollment({ enrollmentId: e.id, action: "decline" }); load(); }} /></View>}
                    </View>
                  ))}
                </ACard>
              </>
            )}
          </View>
        );
      }}
    </LoadSwap>
  );
}

export default function CoachesScreen() {
  // Survivors of a filter MOVE to their new positions; only arrivals fade.
  const refilter = useListMotion();
  const C = useTheme().palette;
  const { t } = useLang();
  const router = useRouter();
  const [tab, setTab] = useState<"browse" | "storefront">("browse");
  const [q, setQ] = useState("");
  const [coaches, setCoaches] = useState<CoachCard[] | null>(null);
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
          <ASearch value={q} onChange={(v: string) => refilter(() => setQ(v))} placeholder={t("w.coaches.search")} />
          {/* The placeholder HANDS OVER to the coaches — it fades out where they
              fade in rather than being replaced in one frame (lib/ui LoadSwap). */}
          <LoadSwap loading={!coaches}>
          {coaches?.length === 0 ? <Empty title={t("w.coaches.none")} sub={t("w.coaches.noneSub")} /> : coaches?.map((c) => (
            <CoachRow key={c.userId} c={c} C={C} t={t} onOpen={() => { seedPerson({ handle: c.handle, displayName: c.name, avatarUrl: c.avatarUrl, coachVerified: c.coachVerified }); router.push(userPagePath(c.handle)); }} cardStack={cardStack} />
          ))}
          </LoadSwap>
        </>
      )}
    </AuroraScreen>
  );
}

/**
 * One coach, and the FACE THAT TRAVELS. The row's 52px avatar and the 84px
 * portrait heading the page it opens are literally the same image of the same
 * person, so it grows rather than being re-rendered at the far end with no
 * thread back to what was touched. The row only has to say WHO it opens: the
 * Avatar registered itself under that handle (lib/shared-element), which is
 * what every other door to a person's page now does too.
 */
function CoachRow({ c, C, t, onOpen, cardStack }: { c: CoachCard; C: Palette; t: (k: string) => string; onOpen: () => void; cardStack: StyleProp<ViewStyle> }) {
  const armPerson = usePersonSource();
  return (
      <Pressable onPress={() => { armPerson(c.handle); onOpen(); }}>
        <ACard style={cardStack}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Avatar url={c.avatarUrl} name={c.name} handle={c.handle} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.chalk, fontFamily: F.bold }}>{c.name || `@${c.handle}`}{c.coachVerified ? <Text style={{ color: txt(C, C.blue) }}> ✓</Text> : null}{!c.acceptingClients ? <Text style={{ color: C.ash, fontSize: fs.micro }}> – {t("w.coaches.full")}</Text> : null}</Text>
              <Text style={{ color: C.ash, fontSize: fs.body }}>{c.headline || c.specialties.join(" – ") || `@${c.handle}`}</Text>
              <View style={{ flexDirection: "row", gap: 12, marginTop: 4, alignItems: "center" }}>
                <Text style={{ color: C.ash, fontSize: fs.caption, fontFamily: F.mono }}>{c.programs} {c.programs === 1 ? t("w.coaches.program") : t("w.coaches.programsWord")}</Text>
                <Stars rating={c.rating} size={12} />
              </View>
            </View>
          </View>
        </ACard>
      </Pressable>
  );
}
