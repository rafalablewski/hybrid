"use client";

// WORKOUT WRAPPED (web) — the individual-session view, rendered as the reference
// prototype (reference/pr-wrapped-flow.html) 1:1: opening a session IS the
// experience — the PR reveal (if any) → the premium Wrapped panels you SCROLL
// through → the story-share sheet. The set breakdown + charts + manage ride
// along as a trailing `details` section. Mobile parity: apps/mobile/components/
// workout-wrapped.tsx.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
  statCountUp,
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
}: {
  session: LoggedSession;
  all: LoggedSession[];
  units: WeightUnit;
  bw: BodyweightLookup;
  onBack: () => void;
  /** the workout's charts + set breakdown + manage row (trailing section) */
  details: ReactNode;
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/talent").then((r) => (r.ok ? r.json() : null)).then((d) => {
      const p = d?.profile;
      if (alive && p && typeof p.age === "number") setCohort({ sport: p.sport, sex: p.sex === "F" ? "F" : "M", age: p.age });
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
  const wrapped = sessionWrapped(session, all, { units, bw });
  const prs = prsForSession(all, session.id, bw);
  const cardioPrs = cardioPrsForSession(all, session.id);
  const cel = sessionCelebration(prs, cardioPrs);
  const minutes = session.completedAt ? Math.max(1, Math.round((Date.parse(session.completedAt) - Date.parse(session.startedAt)) / 60000)) : 0;
  const volume = sessionVolume(session.blocks, false, bwHere);
  const sets = session.blocks.reduce((n, b) => n + (b.kind === "strength" ? b.sets.length : 1), 0);
  const signature = sessionSignature(session);

  const bestMap = new Map<string, number>();
  for (const b of session.blocks)
    if (b.kind === "strength") {
      const e = Math.round(blockBestE1rm(b, bwHere));
      if (e > 0) bestMap.set(b.name, Math.max(bestMap.get(b.name) ?? 0, e));
    }
  const prSet = new Set(prs.map((p) => p.lift));
  const bests: ShareBest[] = [...bestMap.entries()].map(([name, e1rm]) => ({ name, e1rm, pr: prSet.has(name) })).sort((a, b) => b.e1rm - a.e1rm);
  const standing = cohort && bests[0] && bwHere ? liftStanding(bests[0].e1rm, bwHere, cohort) : null;

  const heroBig = cel
    ? cel.kind === "strength" ? fmtWeight(cel.e1rm, units) : cel.prKind === "distance" ? formatSportDistance(cel.value, cel.move) : `${paceClock(cel.value)} /km`
    : fmtTonnage(volume, units);
  const heroSub = cel
    ? cel.kind === "strength" ? `${cel.lift} — ${cel.firstEver ? t("summary.firstEver") : `+${fmtWeight(cel.e1rm - (cel.previous ?? 0), units)}`}` : cel.move
    : session.title;

  // ── story slides for the share sheet (trophy + signature lead) ──
  const muscleVol = volumeByMuscle(session.blocks, false, bwHere);
  const muscleMax = muscleVol[0]?.volume ?? 0;
  const funFact = sessionFunFact(session.blocks, bwHere);
  const prRows: { left: string; right: string; hot?: boolean }[] = [
    ...prs.map((p) => ({ left: p.lift, right: p.previous == null ? t("summary.firstTime") : `+${fmtWeight(p.e1rm - p.previous, units)}`, hot: true })),
    ...cardioPrs.map((p) => ({ left: p.kind === "distance" ? `${p.move} ${p.value} km` : p.move, right: "", hot: true })),
    ...bests.filter((b) => !prs.some((p) => p.lift === b.name)).slice(0, 6).map((b) => ({ left: b.name, right: fmtWeight(b.e1rm, units) })),
  ];
  const prHeadline = prs.length > 0 ? `🏆 ${prs.length} ${t("summary.newPrs")}` : cardioPrs.length > 0 ? `🏃 ${cardioPrs.length} ${t("summary.newCardioPrs")}` : t("summary.todaysBests");
  const bespoke: StorySlide[] = [
    ...(cel ? [{ kind: "trophy", eyebrow: t("summary.slide.prs"), value: heroBig, caption: cel.kind === "strength" ? cel.lift : cel.move, sub: cel.total > 1 ? `${cel.total} ${t("summary.newPrs")}` : t("summary.prOne") } as StorySlide] : []),
    ...(signature.length >= SIGNATURE_MIN_BARS ? [{ kind: "signature", eyebrow: t("session.wrapped.title"), bars: signature, value: heroBig, caption: session.title } as StorySlide] : []),
  ];
  const slides: StorySlide[] = [
    ...bespoke,
    { kind: "overview", eyebrow: t("summary.slide.overview"), stats: { title: session.title, minutes, sets, volume, bests, firstEver: false } },
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
    try {
      const caption = shareText({ title: session.title, minutes, sets, volume, bests, firstEver: false }, units, t);
      const how = await shareWorkoutSlide(slides[activeIdx]!, caption, units, t, styleId);
      if (how === "downloaded") setShareMsg(t("w.train.logger.downloaded"));
      else if (how === "shared" || how === "text") setShareMsg(t("w.train.logger.shared"));
    } finally {
      setSharing(false);
    }
  };
  const onPagerScroll = () => { const el = pagerRef.current; if (el) setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); };
  const goTo = (i: number) => { const el = pagerRef.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" }); };

  // Which panels exist (dots + active tracking); details rides after them.
  const keys: ("reveal" | "hero" | "premium" | "standing")[] = [
    ...(cel ? ["reveal" as const] : []),
    "hero" as const,
    ...(wrapped.facts.length ? ["premium" as const] : []),
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
      <button onClick={onBack} aria-label={t("summary.doneToday")} style={{ position: "fixed", top: 14, left: 14, zIndex: 70, width: 40, height: 40, borderRadius: 13, border: `1px solid ${LINE}`, background: "rgba(0,0,0,.4)", color: txt(CHALK), fontSize: 18, cursor: "pointer" }}>←</button>

      {/* ── REVEAL ── */}
      {cel && (
        <section style={{ ...panelStyle, justifyContent: "center", alignItems: "center", textAlign: "center" }} className="pr-rise">
          <div aria-hidden className="pr-rays" style={{ position: "absolute", top: "34%", left: "50%", width: 380, height: 380, marginLeft: -190, marginTop: -190, pointerEvents: "none", borderRadius: "50%", background: "conic-gradient(from 0deg, rgba(230,195,78,.16), transparent 22%, rgba(198,248,79,.12) 40%, transparent 55%, rgba(230,195,78,.16) 72%, transparent 90%)" }} />
          <div aria-hidden style={{ position: "absolute", top: "40%", left: "50%", pointerEvents: "none" }}>
            {CONFETTI.map((c, i) => (
              <span key={i} className="pr-confetti" style={{ position: "absolute", width: 8, height: 8, borderRadius: 2, background: c.color, animationDelay: `${c.delay}s`, "--tx": `${c.tx}px`, "--ty": `${c.ty}px` } as CSSProperties} />
            ))}
          </div>
          <div className="pr-trophy" style={{ fontSize: 88, lineHeight: 1 }}>🏆</div>
          <Mono s={{ fontSize: fs.body, letterSpacing: ".2em", textTransform: "uppercase", marginTop: 20 }} c={GOLD}>{cel.total > 1 ? `${cel.total} ${t("summary.newPrs")}` : t("summary.prOne")}</Mono>
          <div style={{ ...disp, fontWeight: 900, fontSize: "clamp(64px, 20vw, 104px)", letterSpacing: "-.05em", lineHeight: .9, marginTop: 10 }}><CountUp value={heroBig} /></div>
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
        <div style={{ ...disp, fontWeight: 900, fontSize: "clamp(64px, 22vw, 112px)", letterSpacing: "-.06em", lineHeight: .8, position: "relative" }}><CountUp value={heroBig} /></div>
        <div style={{ ...disp, fontWeight: 700, fontSize: fs.body, marginTop: 12, color: txt(cel ? LIME : CHALK), position: "relative" }}>{heroSub}</div>
        {signature.length >= SIGNATURE_MIN_BARS && (
          <div aria-hidden style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 44, marginTop: 18, position: "relative" }}>
            {signature.map((v, i) => (<div key={i} style={{ flex: 1, height: `${Math.round(v * 100)}%`, borderRadius: 3, background: `linear-gradient(180deg, ${LIME_HEX}, color-mix(in srgb, ${LIME} 15%, transparent))`, opacity: 0.5 + v * 0.5 }} />))}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(4, wrapped.basics.length)}, 1fr)`, gap: 1, marginTop: 20, background: LINE, border: `1px solid ${LINE}`, borderRadius: 16, overflow: "hidden", position: "relative" }}>
          {wrapped.basics.map((b) => (
            <div key={b.labelKey} style={{ background: "#0e0f0d", padding: "14px 6px", textAlign: "center" }}>
              <div style={{ ...disp, fontWeight: 900, fontSize: 22, fontVariantNumeric: "tabular-nums" }}>{b.value}</div>
              <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginTop: 3 }}>{t(b.labelKey)}</Mono>
            </div>
          ))}
        </div>
        {scrollHint}
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
            <button onClick={() => { onBack(); router.push("/upgrade"); }} style={{ ...disp, marginTop: 24, alignSelf: "flex-start", fontWeight: 800, fontSize: fs.body, background: VIOLET, color: ON_ACCENT, border: "none", borderRadius: 999, padding: "12px 22px", cursor: "pointer" }}>✦ {t("session.wrapped.unlock")}</button>
          )}
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
            <button onClick={() => { setActive(0); setSheetOpen(true); }} style={{ ...disp, width: "100%", background: LIME, color: ON_ACCENT, border: "none", borderRadius: 16, padding: "17px", fontWeight: 900, fontSize: fs.note, cursor: "pointer", boxShadow: "0 10px 30px rgba(0,0,0,.4)" }}>↗ {t("summary.share")}</button>
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
                  <div role="button" tabIndex={0} onClick={cycleStyle} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cycleStyle(); } }} aria-label={`${t(st.nameKey)} — ${t("summary.cardHint")}`} style={{ cursor: "pointer", borderRadius: 15, boxShadow: "0 24px 60px rgba(0,0,0,.45)" }}>
                    <StoryCard slide={s} st={st} w={300} t={t} units={units} active={i === activeIdx} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 7, margin: "14px 0" }}>
              {slides.map((_, i) => (<button key={i} type="button" onClick={() => goTo(i)} aria-label={slides[i]!.eyebrow} aria-current={i === activeIdx} style={{ width: i === activeIdx ? 20 : 7, height: 7, padding: 0, border: "none", borderRadius: 4, background: i === activeIdx ? LIME_HEX : LINE, cursor: "pointer" }} />))}
            </div>
            <button onClick={share} disabled={sharing} style={{ ...disp, width: "100%", background: LIME, color: ON_ACCENT, border: "none", borderRadius: 14, padding: "16px 18px", fontWeight: 900, fontSize: fs.note, cursor: sharing ? "default" : "pointer", opacity: sharing ? 0.6 : 1 }}>{shareMsg || (sharing ? "…" : `↗ ${t("summary.shareStory")}`)}</button>
          </div>
        </div>
      )}
    </div>
  );
}
