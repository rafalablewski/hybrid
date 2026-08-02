"use client";

// WORKOUT WRAPPED (web) — the individual-session view, rendered as the reference
// prototype (reference/pr-wrapped-flow.html) 1:1: opening a session IS the
// experience — the PR reveal (if any) → the premium Wrapped panels you SCROLL
// through → the story-share sheet. The set breakdown + charts + manage ride
// along as a trailing `details` section. Mobile parity: apps/mobile/components/
// workout-wrapped.tsx.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  sessionWrapped,
  fitScale,
  HERO_FIT_EM,
  HERO_TRACKING_EM,
  STAT_FIT_EM,
  liftStanding,
  hasActiveConnection,
  feelSamples,
  loadBaseline,
  doneReceipt,
  sessionCelebration,
  isFullAccess,
  volumeByMuscle,
  sessionFunFact,
  funFactText,
  sessionVolume,
  blockBestE1rm,
  blockTopLoad,
  strengthPrDelta,
  formatCardioPr,
  fmtWeight,
  formatSportPace,
  formatSportDistance,
  prsForSession,
  cardioPrsForSession,
  sessionSignature,
  SIGNATURE_MIN_BARS,
  statCountUp,
  storyStyle,
  STORY_STYLES,
  DEFAULT_STORY_STYLE,
  deviceComparisonRows,
  deviceImportedSession,
  deviceMarkFor,
  deviceSourceLabel,
  deviceTrueSession,
  sessionEnergy,
  type DeviceWorkout,
  type StoryStyleId,
  type LoggedSession,
  type WeightUnit,
  type BodyweightLookup,
} from "@hybrid/core";
import { usePersona } from "@/lib/persona";
import { useLang } from "@/lib/i18n";
import { shareWorkoutSlide, shareText, type StorySlide, type ShareBest } from "@/lib/workout-share";
import { StoryCard } from "./story-card";
import { FeelPrompt } from "./feel-prompt";
import { AuroraIcon } from "./icons";
import { CtaLabel } from "./cta-label";
import { DeviceMark } from "./device-mark";
import { fs, space, LIME, LIME_HEX, VIOLET, CHALK, ASH, INK2, LINE, ON_ACCENT, disp, mono, Mono, txt } from "@/lib/ui";

const GOLD = "#e6c34e";
const PANEL_BG = "#0a0b09";

const CONFETTI = Array.from({ length: 18 }, (_, i) => {
  const a = (i / 18) * Math.PI * 2;
  const d = 70 + (i % 5) * 22;
  const colors = [LIME, GOLD, "#6cb6bd", "#8ba0cc"];
  return { tx: Math.round(Math.cos(a) * d), ty: Math.round(Math.sin(a) * d - 30), color: colors[i % 4]!, delay: 0.25 + (i % 3) * 0.05 };
});

// A number that ticks up from 0 → its final value on mount, then rests on the
// exact string. Honours reduced-motion. Mirrors mobile CountUp.
function CountUp({ value }: { value: string }) {
  const [d, setD] = useState(value);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setD(value); return; }
    const { target, format } = statCountUp(value);
    if (!target) { setD(value); return; }
    let raf = 0, t0 = 0;
    const tick = (now: number) => {
      if (!t0) t0 = now;
      const p = Math.min(1, (now - t0) / 900);
      const e = 1 - Math.pow(1 - p, 3);
      if (p < 1) { setD(format(target * e)); raf = requestAnimationFrame(tick); } else setD(value);
    };
    setD(format(0));
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{d}</>;
}

export function WorkoutWrapped({
  session,
  all,
  units,
  bw,
  onBack,
  details,
  onNavigate,
}: {
  session: LoggedSession;
  all: LoggedSession[];
  units: WeightUnit;
  bw: BodyweightLookup;
  onBack: () => void;
  /** the workout's charts + set breakdown + manage row (trailing section) */
  details: ReactNode;
  /** switch the app shell to another screen (the shell is one page, not routes)
   *  — used by the Full upsell and the connect-a-device CTA. */
  onNavigate?: (screen: string) => void;
}) {
  const { t } = useLang();
  const router = useRouter();
  const full = isFullAccess(usePersona());
  const [panel, setPanel] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [styleId, setStyleId] = useState<StoryStyleId>(DEFAULT_STORY_STYLE);
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState("");
  const [cohort, setCohort] = useState<{ sport: string; sex: "M" | "F"; age: number } | null>(null);
  // null = not known yet (don't flash a "connect a device" prompt at someone
  // who already has one connected).
  const [deviceConnected, setDeviceConnected] = useState<boolean | null>(null);
  // The device's read of THIS workout (Apple Watch match). Matching is a
  // HealthKit read only the phone can perform — the web renders the result and
  // can unlink it; the panel points the unmatched case at the iPhone app.
  const [device, setDevice] = useState<DeviceWorkout | null>(session.device ?? null);
  const [unlinking, setUnlinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/talent").then((r) => (r.ok ? r.json() : null)).then((d) => {
      const p = d?.profile;
      if (alive && p && typeof p.age === "number") setCohort({ sport: p.sport, sex: p.sex === "F" ? "F" : "M", age: p.age });
    }).catch(() => {});
    fetch("/api/connections").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (alive && d) setDeviceConnected(hasActiveConnection(d.connections));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") (sheetOpen ? setSheetOpen(false) : onBack()); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onBack, sheetOpen]);

  const bwHere = bw(session.startedAt);
  // The session AS THE APP NOW READS IT: an unlink done on this screen takes
  // effect immediately, without waiting for the refetch to land.
  const view = useMemo(() => ({ ...session, device }), [session, device]);
  const wrapped = sessionWrapped(view, all, { units, bw });
  // Device-first (every figure on this screen) and the logged-only read, which
  // exists solely for the comparison panel's left column.
  const receipt = doneReceipt(view, { bodyweightKg: bwHere });
  const logged = doneReceipt(session, { bodyweightKg: bwHere, ignoreDevice: true });
  // "vs your usual" compares the athlete to THEMSELVES over the last month —
  // never a cohort, and never until there are enough rated sessions for the
  // comparison to mean anything (loadBaseline enforces the floor). Memoised:
  // feelSamples walks every logged session.
  const feelBaseline = useMemo(
    () => loadBaseline(feelSamples(all, bw), { excludeId: session.id }),
    [all, bw, session.id],
  );
  const prs = prsForSession(all, session.id, bw);
  const cardioPrs = cardioPrsForSession(all, session.id);
  const cel = sessionCelebration(prs, cardioPrs);
  // The share card's minutes: the trusted (device-first) duration, falling back
  // to the wall-clock span for a session with nothing better.
  const minutes = receipt.durationMin ?? (session.completedAt ? Math.max(1, Math.round((Date.parse(session.completedAt) - Date.parse(session.startedAt)) / 60000)) : 0);
  const volume = sessionVolume(session.blocks, false, bwHere);
  const sets = session.blocks.reduce((n, b) => n + (b.kind === "strength" ? b.sets.length : 1), 0);
  const signature = sessionSignature(session);

  // Per-lift bests = the HEAVIEST weight actually moved (#231), never an e1RM.
  const bestMap = new Map<string, number>();
  for (const b of session.blocks)
    if (b.kind === "strength") {
      const w = blockTopLoad(b, bwHere);
      if (w > 0) bestMap.set(b.name, Math.max(bestMap.get(b.name) ?? 0, w));
    }
  const prSet = new Set(prs.map((p) => p.lift));
  const bests: ShareBest[] = [...bestMap.entries()].map(([name, weight]) => ({ name, weight, pr: prSet.has(name) })).sort((a, b) => b.weight - a.weight);
  // "Where you stand" is a RELATIVE-STRENGTH percentile — the benchmark norms
  // are built on estimated 1RM, so this one keeps e1RM on purpose.
  const topE1rm = session.blocks.reduce((m, b) => (b.kind === "strength" ? Math.max(m, Math.round(blockBestE1rm(b, bwHere))) : m), 0);
  const standing = cohort && topE1rm > 0 && bwHere ? liftStanding(topE1rm, bwHere, cohort) : null;

  // No PR to celebrate → the hero shows the number that DEFINES this kind of
  // session (distance for a swim, tonnage for a lift, time for a match), not
  // tonnage for everything — which read "0.0 t" on every cardio log.
  // A pace PR reads in the MOVE's own split — a pool swim is "3:52 /100m", not
  // the "39:13 /km" a hard-coded per-km label made of it.
  const heroBig = cel
    ? cel.kind === "strength" ? fmtWeight(cel.topLoad, units) : cel.prKind === "distance" ? formatSportDistance(cel.value, cel.move) : formatSportPace(cel.value, cel.move)
    : wrapped.headline.value;
  // A record isn't always a heavier bar — more reps at the same load is a real
  // PR, and claiming "+0 kg" there would be a lie.
  const heroSub = cel
    ? cel.kind === "strength" ? `${cel.lift} — ${strengthPrDelta(cel, { first: t("summary.firstEver"), moreReps: t("summary.morePrReps") }, units)}` : cel.move
    : session.title;

  // What a PR row says on the right — shared with the other client so the
  // three-way branch can't drift ("+0 kg" would read as no progress at all).
  const prDelta = (p: { topLoad: number; previousTopLoad: number | null }) =>
    strengthPrDelta(p, { first: t("summary.firstTime"), moreReps: t("summary.morePrReps") }, units);

  // ── story slides for the share sheet (trophy + signature lead) ──
  const muscleVol = volumeByMuscle(session.blocks, false, bwHere);
  const muscleMax = muscleVol[0]?.volume ?? 0;
  // The fun fact is a distance/tonnage comparison — measured where a device
  // measured it.
  const funFact = sessionFunFact(deviceTrueSession(view).blocks, bwHere);
  const prRows: { left: string; right: string; hot?: boolean }[] = [
    ...prs.map((p) => ({ left: p.lift, right: prDelta(p), hot: true })),
    // The shared cardio formatter, same as the post-workout PR slide — raw km
    // would read a 400 m swim PR as "Swimming 0.4 km" and drop the delta.
    ...cardioPrs.map((p) => ({ left: formatCardioPr(p, t("summary.firstTime")), right: "", hot: true })),
    ...bests.filter((b) => !prs.some((p) => p.lift === b.name)).slice(0, 6).map((b) => ({ left: b.name, right: fmtWeight(b.weight, units) })),
  ];
  // Pluralized — "1 new PR", not "1 new PRs"; identical on both clients.
  const prHeadline = prs.length > 0 ? `🏆 ${prs.length} ${prs.length > 1 ? t("w.train.logger.newPrs") : t("w.train.logger.newPr")}` : cardioPrs.length > 0 ? `🏃 ${cardioPrs.length} ${cardioPrs.length > 1 ? t("w.train.logger.cardioPrs") : t("w.train.logger.cardioPr")}` : t("summary.todaysBests");
  const bespoke: StorySlide[] = [
    ...(cel ? [{ kind: "trophy", eyebrow: t("summary.slide.prs"), value: heroBig, caption: cel.kind === "strength" ? cel.lift : cel.move, sub: cel.total > 1 ? `${cel.total} ${t("summary.newPrs")}` : t("summary.prOne") } as StorySlide] : []),
    ...(signature.length >= SIGNATURE_MIN_BARS ? [{ kind: "signature", eyebrow: t("session.wrapped.title"), bars: signature, value: heroBig, caption: session.title } as StorySlide] : []),
  ];
  // The overview card is a GYM card (title + minutes/sets/volume): on a swim it
  // would read "1 set, 0.0 t", so it only rides along when the session actually
  // did that kind of work. The single-stat card headlines the same number the
  // hero does, so a cardio log leads with its distance instead of zero tonnage.
  const gymSession = wrapped.discipline === "strength" || wrapped.discipline === "mixed";
  const slides: StorySlide[] = [
    ...bespoke,
    ...(gymSession
      ? [{ kind: "overview", eyebrow: t("summary.slide.overview"), stats: { title: session.title, minutes, sets, volume, bests, firstEver: false } } as StorySlide]
      : []),
    { kind: "stat", eyebrow: t("summary.slide.load"), value: wrapped.headline.value, unit: t(wrapped.headline.labelKey) },
    { kind: "prs", eyebrow: t("summary.slide.prs"), headline: prHeadline, rows: prRows.length ? prRows : [{ left: t("summary.todaysBests"), right: "" }] },
    ...(muscleVol.length ? [{ kind: "muscle", eyebrow: t("summary.slide.muscle"), bars: muscleVol.slice(0, 6).map((m) => ({ label: t(`muscle.${m.muscle}`), pct: muscleMax ? Math.round((m.volume / muscleMax) * 100) : 0, value: fmtWeight(m.volume, units) })) } as StorySlide] : []),
    ...(funFact ? [{ kind: "fun", eyebrow: t("summary.slide.fun"), emoji: funFact.emoji, text: funFactText(funFact, units, t) } as StorySlide] : []),
  ];
  const activeIdx = Math.min(active, slides.length - 1);
  const st = storyStyle(styleId);
  const cycleStyle = () => setStyleId((cur) => STORY_STYLES[(STORY_STYLES.findIndex((s) => s.id === cur) + 1) % STORY_STYLES.length]!.id);

  const share = async () => {
    setSharing(true);
    setShareMsg("");
    try {
      // Headline the SAME record the reveal hero showed (see mobile parity).
      const captionHeadline = cel && cel.kind === "strength" ? `\u{1F3C6} ${cel.lift} ${fmtWeight(cel.topLoad, units)}` : null;
      const caption = shareText({ title: session.title, minutes, sets, volume, bests, firstEver: false }, units, t, captionHeadline);
      const how = await shareWorkoutSlide(slides[activeIdx]!, caption, units, t, styleId);
      if (how === "downloaded") setShareMsg(t("w.train.logger.downloaded"));
      else if (how === "shared" || how === "text") setShareMsg(t("w.train.logger.shared"));
    } finally {
      setSharing(false);
    }
  };
  // Leave the takeover, then switch the shell. The shell is ONE page with a
  // `screen` state, so a router push would 404; `onNavigate` is the real move
  // and the push only remains as the fallback for a caller that didn't wire it.
  const go = (screen: string) => {
    onBack();
    if (onNavigate) onNavigate(screen);
    else router.push(`/${screen}`);
  };
  const onPagerScroll = () => { const el = pagerRef.current; if (el) setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); };
  const goTo = (i: number) => { const el = pagerRef.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" }); };

  // The post-workout self-report ("How did that feel?") and the device panel:
  // once this session is MATCHED to a watch workout (done on the phone) the
  // panel shows the measured read next to the logged one; until then (and only
  // when nothing is measuring this athlete) it is the connect-a-device prompt.
  const showDeviceAd = !device && deviceConnected === false && (wrapped.sparse || wrapped.energy == null);
  // A session the import CREATED has no logged side at all — its block is the
  // recording, copied. Showing those echoes as "you logged" would invent a
  // second reading out of our own rounding, so the panel goes single-column.
  const imported = device != null && deviceImportedSession({ ...session, device });
  // Both columns come from the LOGGED read — the device's own figures are the
  // other column, and passing the effective ones would print them twice.
  const comparison = device
    ? deviceComparisonRows(
        imported
          ? { device }
          : {
              device,
              durationMin: logged.durationMin,
              estimatedKcal: sessionEnergy(session, { bodyweightKg: bwHere, durationMin: logged.durationMin, ignoreDevice: true })?.kcal ?? null,
              distanceKm: logged.distanceKm,
              elevationM: logged.elevationM,
            },
      )
    : [];
  const deviceName = deviceSourceLabel(device);
  // Whether this connector ships artwork. When it doesn't, every lockup below
  // falls back to naming the device in text — same sentence, no glyph.
  const deviceMark = deviceMarkFor(device?.provider) != null;
  const unlinkDevice = async () => {
    if (unlinking) return;
    setUnlinking(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device: null }),
      });
      if (res.ok) setDevice(null);
    } finally {
      setUnlinking(false);
    }
  };

  // Which panels exist (dots + active tracking); details rides after them.
  const keys: ("reveal" | "hero" | "feel" | "premium" | "device" | "standing")[] = [
    ...(cel ? ["reveal" as const] : []),
    "hero" as const,
    "feel" as const,
    ...(wrapped.facts.length ? ["premium" as const] : []),
    ...(device || showDeviceAd ? ["device" as const] : []),
    "standing" as const,
  ];
  const onScroll = () => { const el = scrollRef.current; if (el) setPanel(Math.round(el.scrollTop / Math.max(1, el.clientHeight))); };
  const showDock = panel < keys.length;

  const container: CSSProperties = { position: "fixed", inset: 0, zIndex: 60, background: PANEL_BG, overflowY: "auto", scrollSnapType: "y proximity", color: txt(CHALK), fontFamily: "var(--font-display)" };
  const panelStyle: CSSProperties = { minHeight: "100dvh", scrollSnapAlign: "start", position: "relative", padding: "72px 26px 150px", display: "flex", flexDirection: "column", overflow: "hidden", boxSizing: "border-box", maxWidth: 560, margin: "0 auto" };
  const eyebrow = (label: string) => <Mono s={{ fontSize: fs.micro, letterSpacing: ".16em", textTransform: "uppercase" }} c={GOLD}>✦ {label}</Mono>;
  const scrollHint = <Mono s={{ fontSize: fs.micro, letterSpacing: ".1em", textAlign: "center", marginTop: 16, opacity: 0.8 }}>{t("session.wrapped.scroll")} ↑</Mono>;

  return (
    <div ref={scrollRef} onScroll={onScroll} style={container}>
      {/* Back — fixed top-left */}
      <button onClick={onBack} aria-label={t("summary.doneToday")} style={{ position: "fixed", top: 14, left: 14, zIndex: 70, width: 40, height: 40, borderRadius: 12, border: `1px solid ${LINE}`, background: "rgba(0,0,0,.4)", color: txt(CHALK), fontSize: 18, cursor: "pointer" }}>←</button>

      {/* ── REVEAL ── */}
      {cel && (
        <section style={{ ...panelStyle, justifyContent: "center", alignItems: "center", textAlign: "center" }} className="pr-rise">
          <div aria-hidden className="pr-rays" style={{ position: "absolute", top: "34%", left: "50%", width: 380, height: 380, marginLeft: -190, marginTop: -190, pointerEvents: "none", borderRadius: "50%", background: "conic-gradient(from 0deg, rgba(230,195,78,.16), transparent 22%, rgba(198,248,79,.12) 40%, transparent 55%, rgba(230,195,78,.16) 72%, transparent 90%)" }} />
          <div aria-hidden style={{ position: "absolute", top: "40%", left: "50%", pointerEvents: "none" }}>
            {CONFETTI.map((c, i) => (
              <span key={i} className="pr-confetti" style={{ position: "absolute", width: 8, height: 8, borderRadius: 2, background: c.color, animationDelay: `${c.delay}s`, "--tx": `${c.tx}px`, "--ty": `${c.ty}px` } as CSSProperties} />
            ))}
          </div>
          <div className="pr-trophy" style={{ lineHeight: 1 }}><AuroraIcon name="trophy" size={88} color={GOLD} /></div>
          <Mono s={{ fontSize: fs.body, letterSpacing: ".2em", textTransform: "uppercase", marginTop: 20 }} c={GOLD}>{cel.total > 1 ? `${cel.total} ${t("summary.newPrs")}` : t("summary.prOne")}</Mono>
          <div style={{ ...disp, fontWeight: 900, fontSize: `calc(clamp(64px, 20vw, 104px) * ${fitScale(heroBig, HERO_FIT_EM, { trackingEm: HERO_TRACKING_EM })})`, letterSpacing: "-.05em", lineHeight: .9, marginTop: 10, whiteSpace: "nowrap" }}><CountUp value={heroBig} /></div>
          <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle, marginTop: 8 }}>{heroSub}</div>
          {scrollHint}
        </section>
      )}

      {/* ── HERO ── */}
      <section style={panelStyle}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(120% 60% at 85% 6%, color-mix(in srgb, ${VIOLET} 20%, transparent), transparent 55%), radial-gradient(90% 55% at 0% 100%, color-mix(in srgb, ${LIME} 12%, transparent), transparent 60%)` }} />
        {eyebrow(t("session.wrapped.title"))}
        <div style={{ ...disp, fontWeight: 900, fontSize: "clamp(34px, 10vw, 46px)", letterSpacing: "-.03em", lineHeight: 1.02, marginTop: 12, position: "relative" }}>{session.title}</div>
        <div style={{ flex: 1 }} />
        <div style={{ ...disp, fontWeight: 900, fontSize: `calc(clamp(64px, 22vw, 112px) * ${fitScale(heroBig, HERO_FIT_EM, { trackingEm: HERO_TRACKING_EM })})`, letterSpacing: "-.06em", lineHeight: .8, position: "relative", whiteSpace: "nowrap" }}><CountUp value={heroBig} /></div>
        <div style={{ ...disp, fontWeight: 700, fontSize: fs.body, marginTop: 12, color: txt(cel ? LIME : CHALK), position: "relative" }}>{heroSub}</div>
        {signature.length >= SIGNATURE_MIN_BARS && (
          <div aria-hidden style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 44, marginTop: 18, position: "relative" }}>
            {signature.map((v, i) => (<div key={i} style={{ flex: 1, height: `${Math.round(v * 100)}%`, borderRadius: 3, background: `linear-gradient(180deg, ${LIME_HEX}, color-mix(in srgb, ${LIME} 15%, transparent))`, opacity: 0.5 + v * 0.5 }} />))}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(4, wrapped.basics.length)}, 1fr)`, gap: 1, marginTop: 20, background: LINE, border: `1px solid ${LINE}`, borderRadius: 16, overflow: "hidden", position: "relative" }}>
          {wrapped.basics.map((b) => (
            <div key={b.labelKey} style={{ background: "#0e0f0d", padding: "14px 6px", textAlign: "center" }}>
              {/* A modelled figure wears a "~" — it is never presented as a
                  measurement (see core/energy.ts). */}
              <div style={{ ...disp, fontWeight: 900, fontSize: 22 * fitScale((b.estimate ? "~" : "") + b.value, STAT_FIT_EM), fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{b.estimate ? "~" : ""}{b.value}</div>
              <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginTop: 3 }}>{t(b.labelKey)}</Mono>
            </div>
          ))}
        </div>
        {/* The watch's read of this exact workout rides on the row — matched on
            the phone (HealthKit is native-only); here it shows as synced. */}
        {device && (
          <div style={{ marginTop: 14, alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 8, border: `1px solid color-mix(in srgb, ${CHALK} 32%, transparent)`, borderRadius: 999, padding: "8px 14px", position: "relative" }}>
            {/* The lockup finishes the sentence, so the copy never repeats the
                device's name. Chip and mark are both chalk: the artwork can't
                be tinted, and a white logo next to lime text would read as two
                claims at once. See core/device-marks.ts. */}
            <Mono s={{ fontSize: fs.micro, letterSpacing: ".06em" }} c={CHALK}>{t("session.device.measuredOn")}</Mono>
            {deviceMark ? (
              <DeviceMark provider={device.provider} height={16} on="dark" label={deviceName ?? undefined} />
            ) : (
              <Mono s={{ fontSize: fs.micro, letterSpacing: ".06em" }} c={CHALK}>{deviceName ?? t("session.device.matchedChip")}</Mono>
            )}
          </div>
        )}
        {scrollHint}
      </section>

      {/* ── HOW DID THAT FEEL? ── */}
      {/* The immediate read, for a session opened later that was never rated.
          The card says what a late answer is worth rather than pretending it is
          the in-the-gym reading. See core/feel-schedule.ts. */}
      <section style={{ ...panelStyle, justifyContent: "center" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(80% 45% at 20% 10%, color-mix(in srgb, ${LIME} 10%, transparent), transparent 60%)` }} />
        <FeelPrompt
          sessionId={session.id}
          minutes={receipt.durationMin}
          initialFeel={session.feel ?? null}
          initialFatigue={session.fatigue ?? null}
          sessionEnd={session.completedAt ?? session.startedAt ?? null}
          baseline={feelBaseline}
          eyebrow={eyebrow}
        />
      </section>

      {/* ── PREMIUM ── */}
      {wrapped.facts.length > 0 && (
        <section style={{ ...panelStyle, justifyContent: "center" }}>
          {eyebrow(t("session.wrapped.premium"))}
          <div style={{ ...disp, fontWeight: 900, fontSize: 22, marginTop: 8, marginBottom: 18 }}>{t("session.wrapped.premiumLead")}</div>
          <div style={{ filter: full ? "none" : "blur(7px)", pointerEvents: full ? "auto" : "none", userSelect: full ? "auto" : "none" }} aria-hidden={!full}>
            {wrapped.facts.map((f) => (
              <div key={f.labelKey + f.value} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "16px 0", borderBottom: `1px solid ${LINE}` }}>
                <Mono s={{ fontSize: fs.caption, textTransform: "uppercase", letterSpacing: ".06em" }}>{t(f.labelKey)}</Mono>
                <span style={{ ...disp, fontWeight: 900, fontSize: 26, color: f.tone === "up" || f.labelKey === "session.wrapped.est1rm" ? txt(LIME) : txt(VIOLET), fontVariantNumeric: "tabular-nums" }}>{f.value}</span>
              </div>
            ))}
          </div>
          {!full && (
            <button onClick={() => go("upgrade")} style={{ ...disp, marginTop: 24, alignSelf: "flex-start", fontWeight: 800, fontSize: fs.body, background: VIOLET, color: ON_ACCENT, border: "none", borderRadius: 999, padding: "12px 22px", cursor: "pointer" }}>✦ {t("session.wrapped.unlock")}</button>
          )}
        </section>
      )}

      {/* ── THE DEVICE'S READ (matched) ── */}
      {device && (
        <section style={{ ...panelStyle, justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(80% 45% at 90% 15%, color-mix(in srgb, ${LIME} 12%, transparent), transparent 60%)` }} />
          {eyebrow(t("session.device.panelTitle"))}
          <div style={{ ...disp, fontWeight: 900, fontSize: "clamp(26px, 8vw, 34px)", letterSpacing: "-.02em", lineHeight: 1.05, marginTop: 12, position: "relative" }}>{device.activityLabel}</div>
          <Mono s={{ fontSize: fs.caption, marginTop: 10, lineHeight: 1.5, position: "relative", display: "block" }}>{t(imported ? "session.device.leadImported" : "session.device.lead")}</Mono>
          <div style={{ marginTop: 20, border: `1px solid ${LINE}`, borderRadius: 16, overflow: "hidden", position: "relative" }}>
            <div style={{ display: "flex", padding: "10px 14px", background: "#0e0f0d" }}>
              <div style={{ flex: 1.1 }} />
              {/* An imported session has no logged column — the recording IS the log. */}
              {!imported && (
                <Mono s={{ flex: 1, fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", textAlign: "right" }}>{t("session.device.appCol")}</Mono>
              )}
              {/* The lockup heads the measured column instead of the device's
                  name, and the column's figures below are chalk with it — the
                  whole measured side reads in one ink. */}
              {deviceMark ? (
                <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
                  <DeviceMark provider={device.provider} height={15} on="dark" label={deviceName ?? undefined} />
                </div>
              ) : (
                <Mono s={{ flex: 1, fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", textAlign: "right" }} c={CHALK}>{deviceName ?? t("session.device.deviceCol")}</Mono>
              )}
            </div>
            {comparison.map((r) => (
              <div key={r.labelKey} style={{ display: "flex", alignItems: "baseline", padding: "12px 14px", background: "#0e0f0d", borderTop: `1px solid ${LINE}` }}>
                <Mono s={{ flex: 1.1, fontSize: fs.micro, letterSpacing: ".06em", textTransform: "uppercase" }}>{t(r.labelKey)}</Mono>
                {/* A modelled figure wears a "~" — never presented as a measurement. */}
                {!imported && (
                  <span style={{ ...disp, flex: 1, fontWeight: 700, fontSize: fs.caption, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.app != null ? `${r.appEstimate ? "~" : ""}${r.app}` : "—"}</span>
                )}
                <span style={{ ...disp, flex: 1, fontWeight: 900, fontSize: fs.caption, textAlign: "right", color: txt(CHALK), fontVariantNumeric: "tabular-nums" }}>{r.device ?? "—"}</span>
              </div>
            ))}
          </div>
          <Mono s={{ fontSize: fs.micro, marginTop: 12, lineHeight: 1.5, position: "relative", display: "block" }}>{t(imported ? "session.device.truthImported" : "session.device.truth")}</Mono>
          <div style={{ display: "flex", gap: 16, marginTop: 18, position: "relative" }}>
            <button onClick={() => void unlinkDevice()} disabled={unlinking} style={{ ...mono, fontSize: fs.caption, color: txt(ASH), background: "none", border: "none", cursor: unlinking ? "default" : "pointer", padding: 0, opacity: unlinking ? 0.5 : 1 }}>{t("session.device.unlink")}</button>
          </div>
        </section>
      )}

      {/* ── CONNECT A DEVICE ── */}
      {showDeviceAd && (
        <section style={{ ...panelStyle, justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(80% 45% at 90% 15%, color-mix(in srgb, ${VIOLET} 18%, transparent), transparent 60%)` }} />
          {eyebrow(t("session.wrapped.device.title"))}
          <div style={{ ...disp, fontWeight: 900, fontSize: "clamp(26px, 8vw, 34px)", letterSpacing: "-.02em", lineHeight: 1.05, marginTop: 12, position: "relative" }}>{t("session.wrapped.device.lead")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, marginTop: 22, background: LINE, border: `1px solid ${LINE}`, borderRadius: 16, overflow: "hidden", position: "relative" }}>
            {[
              ["♥", "session.wrapped.device.hr"],
              ["🔥", "session.wrapped.device.energy"],
              ["⏱", "session.wrapped.device.time"],
              ["🌙", "session.wrapped.device.recovery"],
            ].map(([glyph, key]) => (
              <div key={key} style={{ background: "#0e0f0d", padding: "14px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                <span aria-hidden style={{ fontSize: 16 }}>{glyph}</span>
                <span style={{ ...disp, fontWeight: 700, fontSize: fs.caption }}>{t(key!)}</span>
              </div>
            ))}
          </div>
          <button onClick={() => go("connections")} style={{ ...disp, marginTop: 22, alignSelf: "flex-start", fontWeight: 800, fontSize: fs.body, background: LIME, color: ON_ACCENT, border: "none", borderRadius: 999, padding: "12px 24px", cursor: "pointer", position: "relative" }}><CtaLabel>{`${t("session.wrapped.device.cta")} →`}</CtaLabel></button>
          <Mono s={{ fontSize: fs.caption, marginTop: 16, lineHeight: 1.5, position: "relative", display: "block" }}>
            {bwHere ? t("session.wrapped.device.estimate") : t("session.wrapped.device.bodyweight")}
          </Mono>
          {/* HealthKit is native-only, so the workout match itself lives on the
              phone — say so instead of dead-ending the web athlete. */}
          <Mono s={{ fontSize: fs.caption, marginTop: 8, lineHeight: 1.5, position: "relative", display: "block" }}>{t("session.device.matchOnPhone")}</Mono>
        </section>
      )}

      {/* ── STANDING + SIGNATURE ── */}
      <section style={{ ...panelStyle, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(70% 40% at 50% 12%, color-mix(in srgb, ${GOLD} 14%, transparent), transparent 60%)` }} />
        {standing ? (
          <div style={{ position: "relative" }}>
            {eyebrow(t("session.wrapped.standing"))}
            <div style={{ ...disp, fontWeight: 900, fontSize: 62, letterSpacing: "-.03em", marginTop: 14 }}>{t("session.wrapped.top")}</div>
            <div style={{ ...disp, fontWeight: 900, fontSize: 62, letterSpacing: "-.03em", lineHeight: .95, color: txt(LIME) }}>{standing.topPct}%</div>
            <div style={{ ...disp, fontWeight: 700, fontSize: fs.body, marginTop: 12 }}>{cohort!.sport} — {t("session.wrapped.estimate")}</div>
          </div>
        ) : (
          <div style={{ position: "relative" }}>{eyebrow(t("session.wrapped.title"))}</div>
        )}
        {signature.length >= SIGNATURE_MIN_BARS && (
          <div style={{ position: "relative", marginTop: 32 }}>
            <div aria-hidden style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 3, height: 72 }}>
              {signature.map((v, i) => (<div key={i} style={{ width: 6, height: `${Math.round(v * 100)}%`, borderRadius: 3, background: `linear-gradient(180deg, ${LIME_HEX}, color-mix(in srgb, ${LIME} 12%, transparent))`, opacity: 0.45 + v * 0.55 }} />))}
            </div>
            <Mono s={{ fontSize: fs.micro, letterSpacing: ".1em", marginTop: 12, display: "block" }}>{t("session.wrapped.signatureCap")}</Mono>
          </div>
        )}
      </section>

      {/* ── DETAILS (charts + breakdown + manage) ── */}
      <div style={{ background: "var(--color-ink)", padding: "28px 18px 64px", maxWidth: 720, margin: "0 auto" }}>
        {details}
      </div>

      {/* Sticky share dock — over the wrapped panels only */}
      {showDock && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 65, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ width: "100%", maxWidth: 460, padding: "0 24px 24px", pointerEvents: "auto" }}>
            <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 14 }}>
              {keys.map((_, i) => (<div key={i} style={{ width: i === Math.min(panel, keys.length - 1) ? 18 : 6, height: 6, borderRadius: 3, background: i === Math.min(panel, keys.length - 1) ? LIME_HEX : LINE }} />))}
            </div>
            <button onClick={() => { setActive(0); setSheetOpen(true); }} style={{ ...disp, width: "100%", background: LIME, color: ON_ACCENT, border: "none", borderRadius: 16, padding: "16px", fontWeight: 900, fontSize: fs.note, cursor: "pointer", boxShadow: "0 10px 30px rgba(0,0,0,.4)" }}>↗ {t("summary.share")}</button>
          </div>
        </div>
      )}

      {/* ── SHARE SHEET ── */}
      {sheetOpen && (
        <div onClick={() => setSheetOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(4,4,4,.72)", backdropFilter: "blur(6px)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} className="win-pop" style={{ background: "#0e100d", borderRadius: "28px 28px 0 0", borderTop: `1px solid ${LINE}`, padding: "16px 16px 26px", maxWidth: 520, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
            <div style={{ width: 38, height: 4, borderRadius: 2, background: LINE, margin: "2px auto 14px" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle }}>{t("session.wrapped.chooseStory")}</div>
              <button onClick={() => setSheetOpen(false)} style={{ ...mono, fontSize: fs.caption, color: txt(ASH), background: "none", border: "none", cursor: "pointer" }}>{t("summary.doneToday")}</button>
            </div>
            <div ref={pagerRef} onScroll={onPagerScroll} style={{ display: "flex", gap: 0, overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", touchAction: "pan-x", overscrollBehaviorX: "contain" }}>
              {slides.map((s, i) => (
                <div key={i} style={{ flex: "0 0 100%", scrollSnapAlign: "center", display: "flex", justifyContent: "center" }}>
                  <div role="button" tabIndex={0} onClick={cycleStyle} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cycleStyle(); } }} aria-label={`${t(st.nameKey)} — ${t("summary.cardHint")}`} style={{ cursor: "pointer", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,.45)" }}>
                    <StoryCard slide={s} st={st} w={300} t={t} units={units} active={i === activeIdx} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 8, margin: "14px 0" }}>
              {slides.map((_, i) => (<button key={i} type="button" onClick={() => goTo(i)} aria-label={slides[i]!.eyebrow} aria-current={i === activeIdx} style={{ width: i === activeIdx ? 20 : 7, height: 7, padding: 0, border: "none", borderRadius: 4, background: i === activeIdx ? LIME_HEX : LINE, cursor: "pointer" }} />))}
            </div>
            <button onClick={share} disabled={sharing} style={{ ...disp, width: "100%", background: LIME, color: ON_ACCENT, border: "none", borderRadius: 16, padding: "16px 18px", fontWeight: 900, fontSize: fs.note, cursor: sharing ? "default" : "pointer", opacity: sharing ? 0.6 : 1 }}>{shareMsg || (sharing ? "…" : `↗ ${t("summary.shareStory")}`)}</button>
          </div>
        </div>
      )}
    </div>
  );
}
