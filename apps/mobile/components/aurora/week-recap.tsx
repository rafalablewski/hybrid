import { useMemo, useRef, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import {
  weeklyRecap,
  fmtTonnage,
  fmtKm,
  fmtWeight,
  kgToUnit,
  LABEL_GAP,
  type LoggedSession,
  type WeightUnit,
  type BodyweightLookup,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { F, MAX_FONT_SCALE, fs, space, tracking, ty } from "../../lib/ui";
import { WeekPageShareCard, MUSCLE_LABEL, recapShareText, shareCardImage, type WeekSharePage } from "../../lib/share";
import { ACard, APill, GUTTER, RADIUS } from "./kit";

// ── THE WEEK SUMMARY, PAGED ─────────────────────────────────────────────────
// The session summary's grammar applied to the week: not one flat card but a
// set of PAGES the athlete moves between — the week's shape, the load, the
// endurance work, the records — each one a complete reading, and the share
// captures WHICHEVER PAGE IS UNDER THE THUMB (the branded WeekPageShareCard,
// off-screen), so choosing what to post is the same gesture as reading it.
// Pages with nothing to say don't render: a week with no cardio has no
// Endurance page rather than an Endurance page of zeros.

/** sec/km → "5:12 /km" for a cardio pace record. */
const paceStr = (secPerKm: number) => `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, "0")} /km`;

const PAGE_GAP = space.sm;

export function WeekRecapPager({ sessions, units, bw }: { sessions: LoggedSession[]; units: WeightUnit; bw: BodyweightLookup }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const lime = txt(C, C.lime) as string;
  const recap = useMemo(() => weeklyRecap(sessions, Date.now(), bw), [sessions, bw]);
  const [active, setActive] = useState(0);
  // The BLEED width (content column + both gutters), measured — the page width
  // derives from it so resting pages align with the content column.
  const [w, setW] = useState(0);
  const pageW = Math.max(0, w - GUTTER * 2);
  const shareRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  const pages = useMemo<WeekSharePage[]>(() => {
    if (recap.sessions === 0) return [];
    const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
    const hasPrev = recap.prevSessions > 0 || recap.prevVolume > 0;
    const P: WeekSharePage[] = [
      {
        tag: t("histview.thisWeek"),
        stats: [
          { label: t("w.analyze.stats.sessions"), value: String(recap.sessions) },
          { label: t("w.analyze.stats.activeDays"), value: String(recap.activeDays) },
          { label: t("w.analyze.stats.minutes"), value: String(Math.round(recap.minutes)) },
        ],
        note: hasPrev
          ? `${signed(Math.round(kgToUnit(recap.volumeDelta, units)))} ${units} – ${signed(recap.sessionsDelta)} ${t("w.teams.coach.sessionsWord")} ${t("recap.vsLastWeek")}`
          : null,
      },
    ];
    if (recap.volume > 0)
      P.push({
        tag: t("recap.pageLoad"),
        stats: [
          { label: t("summary.volumeMoved"), value: fmtTonnage(recap.volume, units) },
          { label: t("summary.sets"), value: String(recap.sets) },
          { label: t("histview.liftsLbl"), value: String(recap.lifts) },
        ],
        note: recap.topMuscle ? `${t("recap.top")} ${MUSCLE_LABEL[recap.topMuscle.muscle] ?? recap.topMuscle.muscle}` : null,
      });
    if (recap.distanceKm > 0)
      P.push({
        tag: t("recap.pageEndurance"),
        stats: [{ label: t("w.analyze.stats.distance"), value: fmtKm(recap.distanceKm) }],
        rows: recap.cardioPrs.slice(0, 3).map((p) => ({ name: p.move, value: p.kind === "pace" ? paceStr(p.value) : fmtKm(p.value), pr: true })),
      });
    if (recap.prs.length > 0)
      P.push({
        tag: t("recap.pageRecords"),
        stats: [{ label: t("recap.prs"), value: String(recap.prs.length + recap.cardioPrs.length) }],
        rows: recap.prs.slice(0, 4).map((p) => ({ name: p.lift, value: fmtWeight(p.topLoad, units), pr: true })),
      });
    return P;
  }, [recap, t, units]);

  if (pages.length === 0) return null;
  const current = pages[Math.min(active, pages.length - 1)]!;

  const doShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareCardImage(shareRef, recapShareText(recap, t, units), t("recap.share"));
    } finally {
      setSharing(false);
    }
  };

  return (
    <View>
      {/* The capture node — the ACTIVE page rendered off-screen as the branded
          card, so the share sheet gets the page the athlete chose, not a
          screenshot of the pager. */}
      <View pointerEvents="none" style={{ position: "absolute", left: -10000, top: 0, opacity: 0, width: 340 }}>
        <WeekPageShareCard ref={shareRef} page={current} t={t} />
      </View>

      {/* Full-bleed pager (the house slider rule): negative margins pull the
          scroll clip to the true screen edge, matching padding re-aligns the
          resting page with the content column. */}
      <View style={{ marginHorizontal: -GUTTER }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {pageW > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={pageW + PAGE_GAP}
            snapToAlignment="start"
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: GUTTER, gap: PAGE_GAP }}
            onScroll={(e) => setActive(Math.max(0, Math.min(pages.length - 1, Math.round(e.nativeEvent.contentOffset.x / (pageW + PAGE_GAP)))))}
            scrollEventThrottle={32}
            accessibilityLabel={t("histview.thisWeek")}
          >
            {pages.map((p, i) => (
              <View key={p.tag} accessible accessibilityLabel={`${p.tag}, ${i + 1}/${pages.length}`} style={{ width: pageW }}>
              <ACard>
                <Text style={ty(C, "kicker", lime)}>{p.tag}</Text>
                <View style={{ flexDirection: "row", gap: space.md, marginTop: space.md }}>
                  {p.stats.map((s) => (
                    <View key={s.label} style={{ flex: 1 }}>
                      <Text style={ty(C, "kicker")}>{s.label}</Text>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.headline, letterSpacing: tracking(fs.headline), color: C.chalk, marginTop: LABEL_GAP }}>
                        {s.value}
                      </Text>
                    </View>
                  ))}
                </View>
                {!!p.rows?.length && (
                  <View style={{ marginTop: space.md, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
                    {p.rows.map((r) => (
                      <View key={r.name} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 }}>
                        <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.semi, fontSize: fs.body, color: C.chalk }}>{r.name}</Text>
                        <Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: r.pr ? lime : C.chalk }}>{r.value}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {!!p.note && <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 10 }}>{p.note}</Text>}
              </ACard>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Position marks (semantic state, not decoration) and the way out. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.sm }}>
        <View style={{ flexDirection: "row", gap: 6 }} accessibilityLabel={`${active + 1}/${pages.length}`}>
          {pages.map((p, i) => (
            <View key={p.tag} style={{ width: 6, height: 6, borderRadius: RADIUS.pill, backgroundColor: i === active ? lime : C.line }} />
          ))}
        </View>
        <APill label={t("recap.share")} size="compact" variant="soft" state={sharing ? "saving" : "idle"} onPress={() => void doShare()} />
      </View>
    </View>
  );
}
