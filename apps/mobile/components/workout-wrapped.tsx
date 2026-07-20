import { useEffect, useRef, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import {
  sessionWrapped,
  sessionCelebration,
  isFullAccess,
  volumeByMuscle,
  sessionFunFact,
  funFactText,
  sessionVolume,
  sessionSignature,
  SIGNATURE_MIN_BARS,
  liftStanding,
  blockBestE1rm,
  fmtWeight,
  fmtTonnage,
  paceClock,
  formatSportDistance,
  prsForSession,
  cardioPrsForSession,
  storyStyle,
  STORY_STYLES,
  DEFAULT_STORY_STYLE,
  type StoryStyleId,
  type LoggedSession,
  type WeightUnit,
  type BodyweightLookup,
} from "@hybrid/core";
import { fetchTalent } from "../lib/api";
import { usePersona } from "../lib/persona";
import { usePremiumAccent } from "../lib/premium-accent";
import { useLang } from "../lib/i18n";
import { SlideStoryCard, shareWorkout, type SlideData, type ShareBest } from "../lib/share";
import { fs, F, Mono } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";

/**
 * WORKOUT WRAPPED — the premium recap + story-share overlay opened from the
 * individual-workout page. Two steps: WRAPPED (free basics → premium analytics
 * gated behind Full) and SHARE (the multi-story picker reusing SlideStoryCard +
 * STORY_STYLES). Web parity: apps/web/components/aurora/workout-wrapped.tsx.
 */
export function WorkoutWrapped({
  session,
  all,
  units,
  bw,
  onClose,
}: {
  session: LoggedSession;
  all: LoggedSession[];
  units: WeightUnit;
  bw: BodyweightLookup;
  onClose: () => void;
}) {
  const C = useTheme().palette;
  const { t } = useLang();
  const router = useRouter();
  const premium = usePremiumAccent();
  const full = isFullAccess(usePersona());
  const [step, setStep] = useState<"wrapped" | "share">("wrapped");
  const [styleId, setStyleId] = useState<StoryStyleId>(DEFAULT_STORY_STYLE);
  const [active, setActive] = useState(0);
  // "Where you stand" needs the athlete's talent cohort (sport/sex/age).
  const [cohort, setCohort] = useState<{ sport: string; sex: "M" | "F"; age: number } | null>(null);
  const pagerRef = useRef<ScrollView>(null);
  const storyRefs = useRef<Record<number, View | null>>({});

  useEffect(() => {
    let alive = true;
    fetchTalent()
      .then((d) => {
        const p = d.profile;
        if (alive && p && typeof p.age === "number") setCohort({ sport: p.sport, sex: p.sex === "F" ? "F" : "M", age: p.age });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const winW = Dimensions.get("window").width;
  const slideW = winW;
  const previewW = Math.min(280, winW - 96);

  const bwHere = bw(session.startedAt);
  const wrapped = sessionWrapped(session, all, { units, bw });
  const prs = prsForSession(all, session.id, bw);
  const cardioPrs = cardioPrsForSession(all, session.id);
  const cel = sessionCelebration(prs, cardioPrs);

  const minutes = session.completedAt
    ? Math.max(1, Math.round((new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 60000))
    : 0;
  const volume = sessionVolume(session.blocks, false, bwHere);
  const sets = session.blocks.reduce((n, b) => n + (b.kind === "strength" ? b.sets.length : 1), 0);

  const bestMap = new Map<string, number>();
  for (const b of session.blocks)
    if (b.kind === "strength") {
      const e = Math.round(blockBestE1rm(b, bwHere));
      if (e > 0) bestMap.set(b.name, Math.max(bestMap.get(b.name) ?? 0, e));
    }
  const prSet = new Set(prs.map((p) => p.lift));
  const bests: ShareBest[] = [...bestMap.entries()]
    .map(([name, e1rm]) => ({ name, e1rm, pr: prSet.has(name) }))
    .sort((a, b) => b.e1rm - a.e1rm);
  const standing = cohort && bests[0] && bwHere ? liftStanding(bests[0].e1rm, bwHere, cohort) : null;

  const muscleVol = volumeByMuscle(session.blocks);
  const muscleMax = muscleVol[0]?.volume ?? 0;
  const funFact = sessionFunFact(session.blocks, bwHere);
  const prRows: { left: string; right: string; hot?: boolean }[] = [
    ...prs.map((p) => ({ left: p.lift, right: p.previous == null ? t("summary.firstTime") : `+${fmtWeight(p.e1rm - p.previous, units)}`, hot: true })),
    ...cardioPrs.map((p) => ({ left: p.kind === "distance" ? `${p.move} ${p.value} km` : p.move, right: "", hot: true })),
    ...bests.filter((b) => !prs.some((p) => p.lift === b.name)).slice(0, 6).map((b) => ({ left: b.name, right: fmtWeight(b.e1rm, units) })),
  ];
  const prHeadline = prs.length > 0
    ? `🏆 ${prs.length} ${t("summary.newPrs")}`
    : cardioPrs.length > 0
      ? `🏃 ${cardioPrs.length} ${t("summary.newCardioPrs")}`
      : t("summary.todaysBests");
  const heroBig = cel
    ? cel.kind === "strength"
      ? fmtWeight(cel.e1rm, units)
      : cel.prKind === "distance"
        ? formatSportDistance(cel.value, cel.move)
        : `${paceClock(cel.value)} /km`
    : fmtTonnage(volume, units);
  const heroSub = cel ? (cel.kind === "strength" ? cel.lift : cel.move) : t("summary.volumeMoved");
  const signature = sessionSignature(session);
  // The bespoke workout-page share designs (Trophy / Signature) LEAD the picker.
  const bespoke: SlideData[] = [
    ...(cel ? [{ kind: "trophy", eyebrow: t("summary.slide.prs"), value: heroBig, caption: heroSub, sub: cel.total > 1 ? `${cel.total} ${t("summary.newPrs")}` : t("summary.prOne") } as SlideData] : []),
    ...(signature.length >= SIGNATURE_MIN_BARS ? [{ kind: "signature", eyebrow: t("session.wrapped.title"), bars: signature, value: heroBig, caption: session.title } as SlideData] : []),
  ];
  const slides: SlideData[] = [
    ...bespoke,
    { kind: "overview", eyebrow: t("summary.slide.overview"), stats: { title: session.title, minutes, sets, volume, bests }, firstEver: false },
    { kind: "stat", eyebrow: t("summary.slide.time"), value: String(minutes), unit: t("summary.minutes") },
    { kind: "stat", eyebrow: t("summary.slide.load"), value: fmtTonnage(volume, units), unit: t("summary.volumeMoved") },
    { kind: "prs", eyebrow: t("summary.slide.prs"), headline: prHeadline, rows: prRows.length ? prRows : [{ left: t("summary.todaysBests"), right: "" }] },
    ...(muscleVol.length ? [{ kind: "muscle", eyebrow: t("summary.slide.muscle"), bars: muscleVol.slice(0, 6).map((m) => ({ label: t(`muscle.${m.muscle}`), pct: muscleMax ? Math.round((m.volume / muscleMax) * 100) : 0, value: fmtWeight(m.volume, units) })) } as SlideData] : []),
    ...(funFact ? [{ kind: "fun", eyebrow: t("summary.slide.fun"), emoji: funFact.emoji, text: funFactText(funFact, units, t) } as SlideData] : []),
  ];
  const activeIdx = Math.min(active, slides.length - 1);
  const st = storyStyle(styleId);
  const cycleStyle = () => setStyleId((cur) => STORY_STYLES[(STORY_STYLES.findIndex((s) => s.id === cur) + 1) % STORY_STYLES.length]!.id);

  const shareText = [
    `\u{1F4AA} ${session.title || "Workout"} — ${t("share.done")}`,
    `${minutes ? `${minutes} min – ` : ""}${sets} ${t("summary.sets").toLowerCase()} – ${fmtTonnage(volume, units)}`,
    prs[0] ? `\u{1F3C6} ${prs[0].lift} ${fmtWeight(prs[0].e1rm, units)}` : bests[0] ? `${t("share.topLift")}: ${bests[0].name} ${fmtWeight(bests[0].e1rm, units)}` : null,
    t("share.tracked"),
  ].filter(Boolean).join("\n");
  const shareNow = () => shareWorkout({ current: storyRefs.current[activeIdx] ?? null }, shareText, t("summary.shareStory"));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(4,4,4,0.82)" }}>
        <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 60, paddingBottom: 40 }}>
          {/* Header */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.8, color: premium.text, textTransform: "uppercase" }}>✦ {t("session.wrapped.title")}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t("summary.doneToday")} style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: C.ash, fontSize: 15 }}>✕</Text>
            </Pressable>
          </View>

          {step === "wrapped" ? (
            <View style={{ gap: 14 }}>
              {/* Hero */}
              <View style={{ borderRadius: 22, padding: 20, borderWidth: 1, borderColor: `${C.lime}44`, backgroundColor: C.ink2, overflow: "hidden" }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{session.title}</Text>
                <Text style={{ fontFamily: F.black, fontSize: 50, color: C.chalk, letterSpacing: -1, marginTop: 8 }}>{heroBig}</Text>
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: cel ? txt(C, C.lime) : C.ash, marginTop: 4 }}>{heroSub}</Text>
                {/* Session signature — the effort fingerprint (one bar per set). */}
                {signature.length >= SIGNATURE_MIN_BARS && (
                  <View style={{ flexDirection: "row", alignItems: "flex-end", height: 40, marginTop: 14, gap: 3 }}>
                    {signature.map((v, i) => (
                      <View key={i} style={{ flex: 1, height: `${Math.round(v * 100)}%`, borderRadius: 3, backgroundColor: C.lime, opacity: 0.45 + v * 0.55 }} />
                    ))}
                  </View>
                )}
                {/* Basics grid (free) */}
                <View style={{ flexDirection: "row", marginTop: 16, borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: "hidden" }}>
                  {wrapped.basics.map((b, i) => (
                    <View key={b.labelKey} style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 4, alignItems: "center", backgroundColor: C.card, borderLeftWidth: i ? 1 : 0, borderLeftColor: C.line }}>
                      <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.chalk }}>{b.value}</Text>
                      <Text style={{ fontFamily: F.mono, fontSize: 8, letterSpacing: 1, color: C.ash, textTransform: "uppercase", marginTop: 3 }}>{t(b.labelKey)}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Premium analytics */}
              <View style={{ borderRadius: 18, padding: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, overflow: "hidden" }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.5, color: premium.text, textTransform: "uppercase" }}>✦ {t("session.wrapped.premium")}</Text>
                <View style={{ marginTop: 14, opacity: full ? 1 : 0.18 }}>
                  {standing && (
                    <View style={{ marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.line }}>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1, color: C.ash, textTransform: "uppercase" }}>{t("session.wrapped.standing")}</Text>
                      <Text style={{ fontFamily: F.black, fontSize: 36, color: txt(C, C.lime), marginTop: 4 }}>{t("session.wrapped.top")} {standing.topPct}%</Text>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{cohort!.sport} — {t("session.wrapped.estimate")}</Text>
                    </View>
                  )}
                  {wrapped.facts.map((f) => (
                    <View key={f.labelKey + f.value} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textTransform: "uppercase" }}>{t(f.labelKey)}</Text>
                      <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: f.tone === "up" ? txt(C, C.lime) : f.tone === "down" ? C.ash : C.chalk }}>{f.value}</Text>
                    </View>
                  ))}
                </View>
                {!full && (
                  <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, top: 0, alignItems: "center", justifyContent: "flex-end", padding: 20, gap: 12 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textAlign: "center" }}>{t("session.wrapped.locked")}</Text>
                    <Pressable onPress={() => { onClose(); router.push("/upgrade"); }} style={{ backgroundColor: premium.fill, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 22 }}>
                      <Text style={{ fontFamily: F.black, fontSize: fs.body, color: premium.ink }}>✦ {t("session.wrapped.unlock")}</Text>
                    </Pressable>
                  </View>
                )}
              </View>

              <Pressable onPress={() => setStep("share")} style={{ backgroundColor: C.lime, borderRadius: 14, paddingVertical: 15, alignItems: "center" }}>
                <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.onAccent }}>↗ {t("summary.share")}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{t("session.wrapped.chooseStory")}</Text>
                <Pressable onPress={() => setStep("wrapped")} accessibilityRole="button">
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>← {t("session.wrapped.title")}</Text>
                </Pressable>
              </View>

              <ScrollView ref={pagerRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setActive(Math.round(e.nativeEvent.contentOffset.x / slideW))}>
                {slides.map((s, i) => (
                  <View key={i} style={{ width: slideW, alignItems: "center" }}>
                    <Pressable onPress={cycleStyle} accessibilityRole="button" accessibilityLabel={`${t(st.nameKey)} — ${t("summary.cardHint")}`} style={{ borderRadius: previewW * 0.05, backgroundColor: st.bg, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 8 }}>
                      <SlideStoryCard ref={(r) => { storyRefs.current[i] = r; }} slide={s} t={t} units={units} width={previewW} styleId={styleId} animate={i === activeIdx} />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>

              <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 4 }}>
                {slides.map((s, i) => (
                  <Pressable key={i} hitSlop={8} accessibilityRole="button" accessibilityLabel={s.eyebrow} onPress={() => pagerRef.current?.scrollTo({ x: i * slideW, animated: true })} style={{ width: i === activeIdx ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === activeIdx ? C.lime : C.line }} />
                ))}
              </View>
              <Mono color={C.ash} style={{ textAlign: "center", marginTop: 2, fontSize: fs.nano, letterSpacing: 1.5 }}>{`${t(st.nameKey)} — ${t("summary.cardHint")}`.toUpperCase()}</Mono>

              <Pressable onPress={shareNow} style={{ backgroundColor: C.lime, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 4 }}>
                <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.onAccent }}>↗ {t("summary.share")}</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
