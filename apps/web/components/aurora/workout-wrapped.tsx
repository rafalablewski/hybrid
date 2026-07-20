"use client";

// WORKOUT WRAPPED — the premium recap + story-share overlay opened from the
// individual-workout page. Two steps: (1) WRAPPED — the free basics
// (sets/reps/volume/time) then premium analytics gated behind Full; (2) SHARE —
// the multi-story picker (the same StoryCard + STORY_STYLES the finish screen
// uses). Mobile parity: apps/mobile/components/workout-wrapped.tsx.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  sessionWrapped,
  liftStanding,
  sessionCelebration,
  isFullAccess,
  volumeByMuscle,
  sessionFunFact,
  funFactText,
  sessionVolume,
  blockBestE1rm,
  fmtWeight,
  fmtTonnage,
  paceClock,
  formatSportDistance,
  prsForSession,
  cardioPrsForSession,
  sessionSignature,
  SIGNATURE_MIN_BARS,
  storyStyle,
  STORY_STYLES,
  DEFAULT_STORY_STYLE,
  type StoryStyleId,
  type LoggedSession,
  type WeightUnit,
  type BodyweightLookup,
} from "@hybrid/core";
import { usePersona } from "@/lib/persona";
import { useLang } from "@/lib/i18n";
import { shareWorkoutSlide, shareText, type StorySlide, type ShareBest } from "@/lib/workout-share";
import { StoryCard } from "./story-card";
import {
  fs,
  space,
  LIME,
  LIME_HEX,
  VIOLET,
  CHALK,
  ASH,
  INK2,
  LINE,
  ON_ACCENT,
  disp,
  mono,
  Mono,
  txt,
} from "@/lib/ui";

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
  /** dated bodyweight lookup — the same one session-detail holds */
  bw: BodyweightLookup;
  onClose: () => void;
}) {
  const { t } = useLang();
  const router = useRouter();
  const full = isFullAccess(usePersona());
  const [step, setStep] = useState<"wrapped" | "share">("wrapped");
  const [styleId, setStyleId] = useState<StoryStyleId>(DEFAULT_STORY_STYLE);
  const [active, setActive] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState("");
  // "Where you stand" needs the athlete's talent cohort (sport/sex/age) — fetched
  // on open; the percentile only renders when it (and a bodyweight) exist.
  const [cohort, setCohort] = useState<{ sport: string; sex: "M" | "F"; age: number } | null>(null);
  const pagerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/talent")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const p = d?.profile;
        if (alive && p && typeof p.age === "number") setCohort({ sport: p.sport, sex: p.sex === "F" ? "F" : "M", age: p.age });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Esc closes; lock body scroll while the takeover is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const bwHere = bw(session.startedAt);
  const wrapped = sessionWrapped(session, all, { units, bw });
  const prs = prsForSession(all, session.id, bw);
  const cardioPrs = cardioPrsForSession(all, session.id);
  const cel = sessionCelebration(prs, cardioPrs);

  const minutes = session.completedAt
    ? Math.max(1, Math.round((Date.parse(session.completedAt) - Date.parse(session.startedAt)) / 60000))
    : 0;
  const volume = sessionVolume(session.blocks, false, bwHere);
  const sets = session.blocks.reduce((n, b) => n + (b.kind === "strength" ? b.sets.length : 1), 0);

  // Bests for the story slides (est-1RM per lift, PR-marked), heaviest first.
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
  // "Where you stand" — the heaviest lift's relative-strength standing vs the
  // athlete's cohort (estimate from the documented synthetic norms).
  const standing = cohort && bests[0] && bwHere ? liftStanding(bests[0].e1rm, bwHere, cohort) : null;

  // ── Shareable slides (same shape/order as the finish carousel) ──
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
  // Hero values + the bespoke workout-page share designs (Trophy / Signature),
  // which LEAD the picker so the mockup's iconic cards are the first thing shared.
  const heroBig = cel
    ? cel.kind === "strength"
      ? fmtWeight(cel.e1rm, units)
      : cel.prKind === "distance"
        ? formatSportDistance(cel.value, cel.move)
        : `${paceClock(cel.value)} /km`
    : fmtTonnage(volume, units);
  const heroSub = cel ? (cel.kind === "strength" ? cel.lift : cel.move) : t("summary.volumeMoved");
  const signature = sessionSignature(session);
  const bespoke: StorySlide[] = [
    ...(cel ? [{ kind: "trophy", eyebrow: t("summary.slide.prs"), value: heroBig, caption: heroSub, sub: cel.total > 1 ? `${cel.total} ${t("summary.newPrs")}` : t("summary.prOne") } as StorySlide] : []),
    ...(signature.length >= SIGNATURE_MIN_BARS ? [{ kind: "signature", eyebrow: t("session.wrapped.title"), bars: signature, value: heroBig, caption: session.title } as StorySlide] : []),
  ];
  const slides: StorySlide[] = [
    ...bespoke,
    { kind: "overview", eyebrow: t("summary.slide.overview"), stats: { title: session.title, minutes, sets, volume, bests, firstEver: false } },
    { kind: "stat", eyebrow: t("summary.slide.time"), value: String(minutes), unit: t("summary.minutes") },
    { kind: "stat", eyebrow: t("summary.slide.load"), value: fmtTonnage(volume, units), unit: t("summary.volumeMoved") },
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
    const caption = shareText({ title: session.title, minutes, sets, volume, bests, firstEver: false }, units, t);
    const how = await shareWorkoutSlide(slides[activeIdx]!, caption, units, t, styleId);
    setSharing(false);
    if (how === "downloaded") setShareMsg(t("w.train.logger.downloaded"));
    else if (how === "shared" || how === "text") setShareMsg(t("w.train.logger.shared"));
  };

  const onPagerScroll = () => {
    const el = pagerRef.current;
    if (el) setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };
  const goTo = (i: number) => {
    const el = pagerRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    background: "color-mix(in srgb, #050505 82%, transparent)",
    backdropFilter: "blur(6px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    overflowY: "auto",
    padding: "24px 14px 40px",
  };
  const panel: React.CSSProperties = {
    width: "100%",
    maxWidth: 460,
    fontFamily: "var(--font-display)",
    color: txt(CHALK),
  };

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-label={t("session.wrapped.title")} onClick={onClose}>
      <div style={panel} className="win-pop" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: space.md }}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".18em" }} c={VIOLET}>
            ✦ {t("session.wrapped.title")}
          </Mono>
          <button
            onClick={onClose}
            aria-label={t("summary.doneToday")}
            style={{ width: 34, height: 34, borderRadius: 999, border: `1px solid ${LINE}`, background: INK2, color: txt(ASH), fontSize: 15, cursor: "pointer" }}
          >
            ✕
          </button>
        </div>

        {step === "wrapped" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: space.md }}>
            {/* Hero */}
            <div style={{ position: "relative", overflow: "hidden", borderRadius: 22, padding: space.lg, border: `1px solid color-mix(in srgb, ${LIME} 30%, ${LINE})`, background: `radial-gradient(130% 120% at 85% 0%, color-mix(in srgb, ${VIOLET} 22%, transparent), transparent 55%), radial-gradient(120% 100% at 0% 100%, color-mix(in srgb, ${LIME} 12%, transparent), transparent 60%), ${INK2}` }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle }}>{session.title}</div>
              <div style={{ ...disp, fontWeight: 800, fontSize: 56, letterSpacing: "-.03em", lineHeight: 1, marginTop: 8 }}>{heroBig}</div>
              <div style={{ ...disp, fontWeight: 700, fontSize: fs.body, marginTop: 6, color: txt(cel ? LIME : ASH) }}>{heroSub}</div>
              {/* Session signature — the effort fingerprint (one bar per set). */}
              {signature.length >= SIGNATURE_MIN_BARS && (
                <div aria-hidden style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 40, marginTop: space.md }}>
                  {signature.map((v, i) => (
                    <div key={i} style={{ flex: 1, height: `${Math.round(v * 100)}%`, borderRadius: 3, background: `linear-gradient(180deg, ${LIME_HEX}, color-mix(in srgb, ${LIME} 15%, transparent))`, opacity: 0.5 + v * 0.5 }} />
                  ))}
                </div>
              )}
              {/* Basics grid (free) */}
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(4, wrapped.basics.length)}, 1fr)`, gap: 1, marginTop: space.md, background: LINE, border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
                {wrapped.basics.map((b) => (
                  <div key={b.labelKey} style={{ background: "#0e0f0d", padding: "12px 6px", textAlign: "center" }}>
                    <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle, fontVariantNumeric: "tabular-nums" }}>{b.value}</div>
                    <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginTop: 3 }}>{t(b.labelKey)}</Mono>
                  </div>
                ))}
              </div>
            </div>

            {/* Premium analytics */}
            <div style={{ position: "relative", borderRadius: 18, padding: space.lg, border: `1px solid ${LINE}`, background: INK2, overflow: "hidden" }}>
              <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".14em" }} c={VIOLET}>✦ {t("session.wrapped.premium")}</Mono>
              <div style={{ marginTop: space.md, display: "flex", flexDirection: "column", filter: full ? "none" : "blur(7px)", userSelect: full ? "auto" : "none", pointerEvents: full ? "auto" : "none" }} aria-hidden={!full}>
                {standing && (
                  <div style={{ marginBottom: space.md, paddingBottom: space.md, borderBottom: `1px solid ${LINE}` }}>
                    <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }}>{t("session.wrapped.standing")}</Mono>
                    <div style={{ ...disp, fontWeight: 800, fontSize: 40, letterSpacing: "-.02em", marginTop: 4, color: txt(LIME) }}>
                      {t("session.wrapped.top")} {standing.topPct}%
                    </div>
                    <Mono s={{ fontSize: fs.caption }}>{cohort!.sport} — {t("session.wrapped.estimate")}</Mono>
                  </div>
                )}
                {wrapped.facts.map((f) => (
                  <div key={f.labelKey + f.value} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "12px 0", borderBottom: `1px solid ${LINE}` }}>
                    <Mono s={{ fontSize: fs.caption, textTransform: "uppercase", letterSpacing: ".06em" }}>{t(f.labelKey)}</Mono>
                    <span style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle, color: f.tone === "up" ? txt(LIME) : f.tone === "down" ? txt(ASH) : txt(CHALK), fontVariantNumeric: "tabular-nums" }}>{f.value}</span>
                  </div>
                ))}
              </div>
              {!full && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", padding: space.lg, gap: 12, background: "linear-gradient(180deg, transparent, color-mix(in srgb, #0c0d0c 78%, transparent) 55%)" }}>
                  <Mono s={{ fontSize: fs.caption, textAlign: "center" }}>{t("session.wrapped.locked")}</Mono>
                  <button
                    onClick={() => { onClose(); router.push("/upgrade"); }}
                    style={{ ...disp, fontWeight: 800, fontSize: fs.body, background: VIOLET, color: ON_ACCENT, border: "none", borderRadius: 999, padding: "12px 22px", cursor: "pointer" }}
                  >
                    ✦ {t("session.wrapped.unlock")}
                  </button>
                </div>
              )}
            </div>

            {/* → Share */}
            <button
              onClick={() => setStep("share")}
              style={{ ...disp, width: "100%", background: LIME, color: ON_ACCENT, border: "none", borderRadius: 14, padding: "15px 18px", fontWeight: 800, fontSize: fs.body, cursor: "pointer" }}
            >
              ↗ {t("summary.share")}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle }}>{t("session.wrapped.chooseStory")}</div>
              <button onClick={() => setStep("wrapped")} style={{ ...mono, fontSize: fs.caption, color: txt(ASH), background: "none", border: "none", cursor: "pointer" }}>← {t("session.wrapped.title")}</button>
            </div>

            {/* Story picker — swipe; TAP a card to cycle the look */}
            <div ref={pagerRef} onScroll={onPagerScroll} style={{ display: "flex", gap: 0, overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", touchAction: "pan-x", WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}>
              {slides.map((s, i) => (
                <div key={i} style={{ flex: "0 0 100%", scrollSnapAlign: "center", display: "flex", justifyContent: "center" }}>
                  <div role="button" tabIndex={0} onClick={cycleStyle} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cycleStyle(); } }} aria-label={`${t(st.nameKey)} — ${t("summary.cardHint")}`} style={{ cursor: "pointer", borderRadius: 15, boxShadow: "0 24px 60px rgba(0,0,0,.45)" }}>
                    <StoryCard slide={s} st={st} w={300} t={t} units={units} active={i === activeIdx} />
                  </div>
                </div>
              ))}
            </div>

            {/* Dots */}
            <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
              {slides.map((_, i) => (
                <button key={i} type="button" onClick={() => goTo(i)} aria-label={slides[i]!.eyebrow} aria-current={i === activeIdx} style={{ width: i === activeIdx ? 18 : 6, height: 6, padding: 0, border: "none", borderRadius: 3, background: i === activeIdx ? LIME_HEX : LINE, transition: "width .2s", cursor: "pointer" }} />
              ))}
            </div>
            <Mono s={{ fontSize: fs.nano, letterSpacing: ".15em", textAlign: "center", textTransform: "uppercase", marginTop: 2 }}>{t(st.nameKey)} — {t("summary.cardHint")}</Mono>

            <button
              onClick={share}
              disabled={sharing}
              style={{ ...disp, width: "100%", background: LIME, color: ON_ACCENT, border: "none", borderRadius: 14, padding: "15px 18px", fontWeight: 800, fontSize: fs.body, cursor: sharing ? "default" : "pointer", opacity: sharing ? 0.6 : 1, marginTop: 4 }}
            >
              {shareMsg || (sharing ? "…" : `↗ ${t("summary.share")}`)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
