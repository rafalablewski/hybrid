import { forwardRef, useEffect, useRef, useState } from "react";
import { View, Text, Share, type TextStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { brand, fmtWeight, fmtTonnage, kgToUnit, storyStyle, statCountUp, type StoryStyle, type StoryStyleId, type WeeklyRecap, type WeightUnit } from "@hybrid/core";
import { C, F, Kicker } from "./ui";

const MUSCLE_LABEL: Record<string, string> = {
  quads: "Quads",
  glutes: "Glutes",
  posterior: "Posterior chain",
  back: "Back",
  chest: "Chest",
  shoulders: "Shoulders",
  triceps: "Triceps",
};
const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

export type ShareBest = { name: string; e1rm: number; pr?: boolean };
export type ShareStats = {
  title: string;
  minutes: number;
  sets: number;
  volume: number;
  bests: ShareBest[];
};

// The branded card that gets captured to a PNG for social. Rendered visibly in
// the summary + session-detail screens; `ref` points at the exact node to grab.
export const WorkoutShareCard = forwardRef<View, { stats: ShareStats; t: (k: string) => string; units?: WeightUnit }>(
  ({ stats, t, units = "kg" }, ref) => (
    <View
      ref={ref}
      collapsable={false}
      style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: `${C.lime}55`, borderRadius: 18, padding: 20 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontFamily: F.black, fontSize: 20, color: C.chalk, letterSpacing: -1 }}>
          {brand.name}
          <Text style={{ color: C.lime }}>.</Text>
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.lime, letterSpacing: 2 }}>{t("welcome.tagline")}</Text>
      </View>
      <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.chalk, marginTop: 14 }}>{stats.title || "Workout"}</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16 }}>
        <Stat label={t("summary.minutes")} value={String(stats.minutes)} />
        <Stat label={t("summary.sets")} value={String(stats.sets)} />
        <Stat label={t("summary.volumeMoved")} value={fmtTonnage(stats.volume, units)} />
      </View>
      {stats.bests.length > 0 && (
        <View style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }}>
          <Kicker>{t("summary.todaysBests")}</Kicker>
          {stats.bests.slice(0, 4).map((b) => (
            <View key={b.name} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.chalk }}>
                {b.pr ? "🏆 " : ""}{b.name}
              </Text>
              <Text style={{ fontFamily: F.bold, fontSize: 14, color: b.pr ? C.lime : C.chalk }}>{fmtWeight(b.e1rm, units)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  ),
);
WorkoutShareCard.displayName = "WorkoutShareCard";

// Branded 9:16 STORY card — sized for an Instagram/TikTok story. Rendered
// off-screen in the summary and captured to a tall PNG via the same shareWorkout
// path. `width` is the on-screen capture width (device pixel ratio scales the
// output up, so a phone-width card exports near 1080px wide).
export const WorkoutStoryCard = forwardRef<View, { stats: ShareStats; t: (k: string) => string; units?: WeightUnit; width: number; firstEver?: boolean }>(
  ({ stats, t, units = "kg", width, firstEver }, ref) => (
    <View
      ref={ref}
      collapsable={false}
      style={{ width, height: Math.round((width * 16) / 9), backgroundColor: C.ink, padding: width * 0.09, justifyContent: "space-between" }}
    >
      {/* Lime glow disc — the Aurora membrane look on the dark backdrop. */}
      <View pointerEvents="none" style={{ position: "absolute", top: -width * 0.2, right: -width * 0.25, width: width * 0.9, height: width * 0.9, borderRadius: width * 0.45, backgroundColor: `${C.lime}22` }} />
      <View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ fontFamily: F.black, fontSize: width * 0.072, color: C.chalk, letterSpacing: -1 }}>
            {brand.name}
            <Text style={{ color: C.lime }}>.</Text>
          </Text>
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: width * 0.03, color: C.lime, letterSpacing: 2, marginTop: 6 }}>{t("welcome.tagline").toUpperCase()}</Text>
        <Text style={{ fontFamily: F.black, fontSize: width * 0.092, color: C.chalk, marginTop: width * 0.12, lineHeight: width * 0.1 }}>
          {firstEver ? "First workout 🎉" : stats.title || "Workout"}
        </Text>
      </View>

      <View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: width * 0.06 }}>
          <Stat label={t("summary.minutes")} value={String(stats.minutes)} />
          <Stat label={t("summary.sets")} value={String(stats.sets)} />
          <Stat label={t("summary.volumeMoved")} value={fmtTonnage(stats.volume, units)} />
        </View>
        {stats.bests.length > 0 && (
          <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: width * 0.05 }}>
            <Kicker>{t("summary.todaysBests")}</Kicker>
            {stats.bests.slice(0, 5).map((b) => (
              <View key={b.name} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: width * 0.035 }}>
                <Text style={{ fontFamily: F.semi, fontSize: width * 0.042, color: C.chalk }}>{b.pr ? "🏆 " : ""}{b.name}</Text>
                <Text style={{ fontFamily: F.bold, fontSize: width * 0.042, color: b.pr ? C.lime : C.chalk }}>{fmtWeight(b.e1rm, units)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <Text style={{ fontFamily: F.mono, fontSize: width * 0.03, color: C.ash }}>{t("share.tracked")}</Text>
    </View>
  ),
);
WorkoutStoryCard.displayName = "WorkoutStoryCard";

// ── Multi-slide story cards ────────────────────────────────────────────────
// The summary carousel turns each slide into its own shareable 9:16 story. The
// screen precomputes a SlideData payload per slide; SlideStoryCard renders the
// matching body inside a shared branded frame (wordmark/glow/footer) so every
// slide shares with one consistent look.

export type SlideData =
  | { kind: "overview"; eyebrow: string; stats: ShareStats; firstEver?: boolean }
  | { kind: "stat"; eyebrow: string; value: string; unit: string; caption?: string }
  | { kind: "prs"; eyebrow: string; headline: string; rows: { left: string; right: string; hot?: boolean }[] }
  | { kind: "muscle"; eyebrow: string; bars: { label: string; pct: number; value: string }[] }
  | { kind: "fun"; eyebrow: string; emoji: string; text: string };

// Style-aware stat cell for the story card (colours come from the chosen style).
function StoryStat({ label, value, st, width }: { label: string; value: string; st: StoryStyle; width: number }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ fontFamily: F.black, fontSize: width * 0.092, color: st.text }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: width * 0.03, color: st.muted, letterSpacing: 1, marginTop: width * 0.01 }}>{label}</Text>
    </View>
  );
}

const StoryShell = forwardRef<View, { width: number; eyebrow: string; tracked: string; st: StoryStyle; children: React.ReactNode }>(
  ({ width, eyebrow, tracked, st, children }, ref) => (
    <View
      ref={ref}
      collapsable={false}
      style={{ width, height: Math.round((width * 16) / 9), backgroundColor: st.bg, padding: width * 0.09, justifyContent: "space-between", overflow: "hidden", borderRadius: width * 0.05 }}
    >
      {/* Optional diagonal gradient over the base (top-left → bottom-right). */}
      {st.gradient && (
        <LinearGradient
          pointerEvents="none"
          colors={[st.gradient.from, st.gradient.to]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
      )}
      {/* Soft glow discs — the look that distinguishes each style. */}
      {st.discs.map((d, i) => {
        const size = width * d.r * 2;
        return (
          <View
            key={i}
            pointerEvents="none"
            style={{ position: "absolute", left: width * d.x - size / 2, top: ((width * 16) / 9) * d.y - size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: d.color }}
          />
        );
      })}
      {/* Optional translucent glass slab inset behind the content. */}
      {st.panel && (
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: width * 0.045, left: width * 0.045, right: width * 0.045, bottom: width * 0.045, borderRadius: width * 0.045, backgroundColor: st.panel.fill, borderWidth: st.panel.border ? 1.5 : 0, borderColor: st.panel.border }}
        />
      )}
      <View>
        <Text style={{ fontFamily: F.black, fontSize: width * 0.072, color: st.wordmark, letterSpacing: -1 }}>
          {brand.name}
          <Text style={{ color: st.accent }}>.</Text>
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: width * 0.03, color: st.accent, letterSpacing: 2, marginTop: 6 }}>{eyebrow.toUpperCase()}</Text>
      </View>
      <View style={{ flex: 1, justifyContent: "center" }}>{children}</View>
      <Text style={{ fontFamily: F.mono, fontSize: width * 0.03, color: st.muted }}>
        {tracked.endsWith(`${brand.name}.`) ? tracked.slice(0, -(brand.name.length + 1)) : `${tracked} `}
        {/* Render the trailing brand as the LOGO — display wordmark + lime dot. */}
        <Text style={{ fontFamily: F.black, color: st.wordmark }}>
          {brand.name}<Text style={{ color: st.accent }}>.</Text>
        </Text>
      </Text>
    </View>
  ),
);
StoryShell.displayName = "StoryShell";

// A number that ticks up from 0 → final when `run` flips true, then settles on
// the EXACT original string. The visible carousel card IS the capture node, so
// it must rest on the true value; the animation runs once on first view and a
// share is always a later, deliberate tap.
function CountUpText({ value, run, style }: { value: string; run: boolean; style: TextStyle }) {
  const [disp, setDisp] = useState(value);
  const done = useRef(false);
  useEffect(() => { done.current = false; setDisp(value); }, [value]);
  useEffect(() => {
    if (!run || done.current) return;
    const { target, format } = statCountUp(value);
    if (!target) return;
    done.current = true;
    const dur = 900;
    const t0 = Date.now();
    let raf: ReturnType<typeof requestAnimationFrame>;
    const tick = () => {
      const p = Math.min((Date.now() - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      if (p < 1) { setDisp(format(target * e)); raf = requestAnimationFrame(tick); }
      else setDisp(value);
    };
    setDisp(format(0));
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, value]);
  return <Text style={style}>{disp}</Text>;
}

export const SlideStoryCard = forwardRef<View, { slide: SlideData; t: (k: string) => string; units?: WeightUnit; width: number; styleId?: StoryStyleId; animate?: boolean }>(
  ({ slide, t, units = "kg", width, styleId, animate = false }, ref) => {
    const tracked = t("share.tracked");
    const st = storyStyle(styleId);
    if (slide.kind === "overview") {
      const s = slide.stats;
      return (
        <StoryShell ref={ref} width={width} eyebrow={slide.eyebrow} tracked={tracked} st={st}>
          <Text style={{ fontFamily: F.black, fontSize: width * 0.088, color: st.text, marginBottom: width * 0.08 }}>
            {slide.firstEver ? "First workout 🎉" : s.title || "Workout"}
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <StoryStat label={t("summary.minutes")} value={String(s.minutes)} st={st} width={width} />
            <StoryStat label={t("summary.sets")} value={String(s.sets)} st={st} width={width} />
            <StoryStat label={t("summary.volumeMoved")} value={fmtTonnage(s.volume, units)} st={st} width={width} />
          </View>
        </StoryShell>
      );
    }
    if (slide.kind === "stat") {
      return (
        <StoryShell ref={ref} width={width} eyebrow={slide.eyebrow} tracked={tracked} st={st}>
          <CountUpText value={slide.value} run={animate} style={{ fontFamily: F.black, fontSize: width * 0.3, color: st.text, lineHeight: width * 0.28, letterSpacing: -1 }} />
          <Text style={{ fontFamily: F.mono, fontSize: width * 0.036, color: st.muted, letterSpacing: 2, marginTop: width * 0.03 }}>{slide.unit.toUpperCase()}</Text>
          {slide.caption ? <Text style={{ fontFamily: F.bold, fontSize: width * 0.05, color: st.text, marginTop: width * 0.04, lineHeight: width * 0.06 }}>{slide.caption}</Text> : null}
        </StoryShell>
      );
    }
    if (slide.kind === "prs") {
      return (
        <StoryShell ref={ref} width={width} eyebrow={slide.eyebrow} tracked={tracked} st={st}>
          <Text style={{ fontFamily: F.black, fontSize: width * 0.07, color: st.barFill, marginBottom: width * 0.05 }}>{slide.headline}</Text>
          {slide.rows.slice(0, 6).map((r, i) => (
            <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: width * 0.035 }}>
              <Text style={{ fontFamily: F.semi, fontSize: width * 0.044, color: st.text }}>{r.hot ? "🏆 " : ""}{r.left}</Text>
              <Text style={{ fontFamily: F.bold, fontSize: width * 0.044, color: r.hot ? st.barFill : st.text }}>{r.right}</Text>
            </View>
          ))}
        </StoryShell>
      );
    }
    if (slide.kind === "muscle") {
      return (
        <StoryShell ref={ref} width={width} eyebrow={slide.eyebrow} tracked={tracked} st={st}>
          {slide.bars.map((b, i) => (
            <View key={i} style={{ marginTop: width * 0.04 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: width * 0.015 }}>
                <Text style={{ fontFamily: F.semi, fontSize: width * 0.04, color: st.text }}>{b.label}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: width * 0.035, color: st.muted }}>{b.value}</Text>
              </View>
              <View style={{ height: width * 0.03, borderRadius: width * 0.015, backgroundColor: st.barTrack, overflow: "hidden" }}>
                <View style={{ width: `${Math.max(4, b.pct)}%`, height: "100%", backgroundColor: st.barFill }} />
              </View>
            </View>
          ))}
        </StoryShell>
      );
    }
    return (
      <StoryShell ref={ref} width={width} eyebrow={slide.eyebrow} tracked={tracked} st={st}>
        <Text style={{ fontSize: width * 0.22, textAlign: "center" }}>{slide.emoji}</Text>
        <Text style={{ fontFamily: F.bold, fontSize: width * 0.06, color: st.text, textAlign: "center", marginTop: width * 0.05, lineHeight: width * 0.075 }}>{slide.text}</Text>
      </StoryShell>
    );
  },
);
SlideStoryCard.displayName = "SlideStoryCard";

// Branded "this week" recap card — also captured to a PNG for social.
export const RecapShareCard = forwardRef<View, { recap: WeeklyRecap; t: (k: string) => string; units?: WeightUnit }>(
  ({ recap, t, units = "kg" }, ref) => {
    const hasPrev = recap.prevSessions > 0 || recap.prevVolume > 0;
    return (
      <View
        ref={ref}
        collapsable={false}
        style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: `${C.lime}55`, borderRadius: 18, padding: 20 }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontFamily: F.black, fontSize: 20, color: C.chalk, letterSpacing: -1 }}>
            {brand.name}
            <Text style={{ color: C.lime }}>.</Text>
          </Text>
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.lime, letterSpacing: 2 }}>{t("recap.title").toUpperCase()}</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 18 }}>
          <Stat label={t("recap.sessions")} value={String(recap.sessions)} />
          <Stat label={t("summary.volumeMoved")} value={fmtTonnage(recap.volume, units)} />
          <Stat label={t("recap.prs")} value={String(recap.prs.length)} />
        </View>
        <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>
            {recap.activeDays} {t("recap.activeDays")}
          </Text>
          {recap.distanceKm > 0 && (
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>
              {recap.distanceKm} km
            </Text>
          )}
          {recap.topMuscle && (
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>
              {t("recap.top")} {MUSCLE_LABEL[recap.topMuscle.muscle] ?? recap.topMuscle.muscle}
            </Text>
          )}
        </View>
        {hasPrev && (
          <Text style={{ fontFamily: F.bold, fontSize: 12, color: recap.volumeDelta >= 0 ? C.lime : C.amber, marginTop: 10 }}>
            {signed(recap.sessionsDelta)} {t("recap.sessions")} · {signed(Math.round(kgToUnit(recap.volumeDelta, units)))} {units} {t("recap.vsLastWeek")}
          </Text>
        )}
      </View>
    );
  },
);
RecapShareCard.displayName = "RecapShareCard";

export function recapShareText(recap: WeeklyRecap, t: (k: string) => string, units: WeightUnit = "kg"): string {
  return [
    `\u{1F4C8} ${t("recap.title")} — HYBRID`,
    `${recap.sessions} ${t("recap.sessions")} · ${fmtTonnage(recap.volume, units)} · ${recap.prs.length} ${t("recap.prs")}`,
    recap.prs[0] ? `\u{1F3C6} ${recap.prs[0].lift} ${fmtWeight(recap.prs[0].e1rm, units)}` : null,
    t("share.tracked"),
  ]
    .filter(Boolean)
    .join("\n");
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ fontFamily: F.black, fontSize: 26, color: C.chalk }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

/** Capture the card to an image and open the share sheet; fall back to text. */
export async function shareWorkout(ref: React.RefObject<View | null>, text: string, title: string) {
  try {
    if (ref.current) {
      const uri = await captureRef(ref, { format: "png", quality: 1, result: "tmpfile" });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: title });
        return;
      }
    }
  } catch {
    /* fall through to text share */
  }
  try {
    await Share.share({ message: text });
  } catch {
    /* user dismissed */
  }
}
