"use client";

// The on-screen 9:16 story card — the web DOM twin of mobile's SlideStoryCard,
// and the exact preview of what the <canvas> painter (drawSlideStory) exports.
// Extracted from the finish screen so BOTH the post-workout finish carousel and
// the individual-workout "Wrapped" share picker render the same card.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { brand, fmtTonnage, fmtWeight, statCountUp, type StoryStyle, type WeightUnit } from "@hybrid/core";
import type { StorySlide } from "@/lib/workout-share";

/** A number that ticks up from 0 to its final value when `run` flips true, then
 *  settles on the EXACT original string (so it matches the shared canvas PNG).
 *  Preview-only — the web share image is painted separately on a <canvas>. */
export function CountUp({ value, run, style }: { value: string; run: boolean; style?: CSSProperties }) {
  const [disp, setDisp] = useState(value);
  const done = useRef(false);
  useEffect(() => {
    done.current = false;
    setDisp(value);
  }, [value]);
  useEffect(() => {
    if (!run || done.current || typeof requestAnimationFrame === "undefined") return;
    const { target, format } = statCountUp(value);
    if (!target) return;
    done.current = true;
    const dur = 900;
    const t0 = Date.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min((Date.now() - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      if (p < 1) {
        setDisp(format(target * e));
        raf = requestAnimationFrame(tick);
      } else setDisp(value); // settle to the exact original (== the shared PNG)
    };
    setDisp(format(0));
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, value]);
  return <span style={style}>{disp}</span>;
}

/** The real 9:16 story card, rendered in the DOM so the on-screen preview is
 *  exactly what gets shared (the PNG is painted from the same StoryStyle). `w`
 *  is the on-screen width; everything scales from the 1080-wide design grid. */
export function StoryCard({ slide, st, w, t, units, active = false }: { slide: StorySlide; st: StoryStyle; w: number; t: (k: string) => string; units: WeightUnit; active?: boolean }) {
  const h = (w * 16) / 9;
  const k = w / 1080; // design grid → on-screen scale
  const px = (n: number) => `${n * k}px`;
  const D = "var(--font-display)";
  const M = "var(--font-mono)";
  const body = (() => {
    if (slide.kind === "overview") {
      const s = slide.stats;
      const stat = [
        { label: "MIN", value: String(s.minutes) },
        { label: t("w.train.logger.liveSets"), value: String(s.sets) },
        { label: t("w.train.logger.liveVolume"), value: fmtTonnage(s.volume, units) },
      ];
      return (
        <>
          <div style={{ fontFamily: D, fontWeight: 900, fontSize: px(92), color: st.text, lineHeight: 1.05 }}>{s.firstEver ? "First workout 🎉" : s.title || "Workout"}</div>
          <div style={{ display: "flex", marginTop: px(80) }}>
            {stat.map((c, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center" }}>
                <CountUp value={c.value} run={active} style={{ display: "block", fontFamily: D, fontWeight: 900, fontSize: px(86), color: st.text }} />
                <div style={{ fontFamily: M, fontSize: px(28), color: st.muted, letterSpacing: ".1em", marginTop: px(8) }}>{c.label}</div>
              </div>
            ))}
          </div>
        </>
      );
    }
    if (slide.kind === "stat")
      return (
        <div>
          <CountUp value={slide.value} run={active} style={{ display: "block", fontFamily: D, fontWeight: 900, fontSize: px(280), color: st.text, lineHeight: 0.9, letterSpacing: "-0.04em" }} />
          <div style={{ fontFamily: M, fontSize: px(38), color: st.muted, letterSpacing: ".2em", marginTop: px(24) }}>{slide.unit.toUpperCase()}</div>
          {slide.caption && <div style={{ fontFamily: D, fontWeight: 700, fontSize: px(48), color: st.text, marginTop: px(30), lineHeight: 1.2 }}>{slide.caption}</div>}
        </div>
      );
    if (slide.kind === "prs")
      return (
        <>
          <div style={{ fontFamily: D, fontWeight: 800, fontSize: px(64), color: st.barFill }}>{slide.headline}</div>
          <div style={{ marginTop: px(40) }}>
            {slide.rows.slice(0, 7).map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: px(36) }}>
                <span style={{ fontFamily: D, fontWeight: 600, fontSize: px(46), color: st.text }}>{r.hot ? "🏆 " : ""}{r.left}</span>
                {r.right && <span style={{ fontFamily: D, fontWeight: 800, fontSize: px(46), color: r.hot ? st.barFill : st.text }}>{r.right}</span>}
              </div>
            ))}
          </div>
        </>
      );
    if (slide.kind === "muscle")
      return (
        <div>
          {slide.bars.map((b, i) => (
            <div key={i} style={{ marginTop: px(44) }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: px(14) }}>
                <span style={{ fontFamily: D, fontWeight: 600, fontSize: px(44), color: st.text }}>{b.label}</span>
                <span style={{ fontFamily: M, fontSize: px(34), color: st.muted }}>{b.value}</span>
              </div>
              <div style={{ height: px(22), borderRadius: px(11), background: st.barTrack, overflow: "hidden" }}>
                <div style={{ width: active ? `${Math.max(4, b.pct)}%` : "0%", height: "100%", background: st.barFill, borderRadius: px(11), transition: "width .8s cubic-bezier(.2,.9,.2,1)", transitionDelay: `${i * 0.08}s` }} />
              </div>
            </div>
          ))}
        </div>
      );
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: px(200), lineHeight: 1 }}>{slide.emoji}</div>
        <div style={{ fontFamily: D, fontWeight: 800, fontSize: px(60), color: st.text, marginTop: px(40), lineHeight: 1.25 }}>{slide.text}</div>
      </div>
    );
  })();

  const background = st.gradient ? `linear-gradient(135deg, ${st.gradient.from}, ${st.gradient.to})` : st.bg;
  return (
    <div style={{ position: "relative", width: w, height: h, borderRadius: px(54), overflow: "hidden", background, boxSizing: "border-box" }}>
      {st.discs.map((d, i) => {
        const size = w * d.r * 2;
        return (
          <div key={i} style={{ position: "absolute", left: w * d.x - size / 2, top: h * d.y - size / 2, width: size, height: size, borderRadius: "50%", background: `radial-gradient(circle, ${d.color} 0%, rgba(0,0,0,0) 70%)`, pointerEvents: "none" }} />
        );
      })}
      {st.panel && (
        <div style={{ position: "absolute", inset: w * 0.045, borderRadius: px(40), background: st.panel.fill, border: st.panel.border ? `2px solid ${st.panel.border}` : "none", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", pointerEvents: "none" }} />
      )}
      <div style={{ position: "absolute", inset: 0, padding: `${px(170)} ${px(96)}`, display: "flex", flexDirection: "column", justifyContent: "space-between", boxSizing: "border-box" }}>
        <div>
          <div style={{ fontFamily: D, fontWeight: 900, fontSize: px(64), color: st.wordmark, letterSpacing: "-0.02em" }}>
            {brand.name}<span style={{ color: st.accent }}>.</span>
          </div>
          <div style={{ fontFamily: M, fontSize: px(28), color: st.accent, letterSpacing: ".14em", marginTop: px(10) }}>{slide.eyebrow.toUpperCase()}</div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>{body}</div>
        {(() => {
          // "Tracked with HYBRID." — render the trailing brand as the LOGO
          // (display wordmark + lime dot) rather than plain muted text.
          const tracked = t("share.tracked");
          const mark = `${brand.name}.`;
          const prefix = tracked.endsWith(mark) ? tracked.slice(0, -mark.length) : `${tracked} `;
          return (
            <div style={{ fontFamily: M, fontSize: px(30), color: st.muted, display: "flex", alignItems: "baseline", flexWrap: "wrap" }}>
              {prefix}
              <span style={{ fontFamily: D, fontWeight: 900, color: st.wordmark, letterSpacing: "-0.02em" }}>
                {brand.name}<span style={{ color: st.accent }}>.</span>
              </span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
