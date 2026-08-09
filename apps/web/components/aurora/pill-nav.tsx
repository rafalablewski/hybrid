"use client";

import { accentText } from "@/lib/ui";
import { useState, useRef, useLayoutEffect, useEffect } from "react";
import {
  fs,
  AURORA_NAV_TABS,
  AURORA_NAV_ACTIONS,
  AURORA_NAV_GEOMETRY,
  AURORA_NAV_MATERIAL,
  AURORA_TRAIN_GLYPH,
  AURORA_ICON_PATHS,
  formatSessionElapsed,
  type AuroraIconName,
  type AuroraNavActionId,
} from "@hybrid/core";
import { loadWorkoutDraft, type WorkoutDraft } from "@/lib/workout-draft";
import { useLang } from "@/lib/i18n";
import { useTemplate } from "@/lib/use-template";
import { AuroraIcon } from "./icons";

/**
 * AURORA pill nav (web) — the floating bottom bar, the web twin of the mobile
 * Aurora bar. A SPLIT bar: FOUR tabs (icon + label) inside a single Liquid
 * Glass capsule — the places — and the app's one VERB as a detached circle of
 * the same glass beside it, with a session accessory riding above the whole
 * bar when a workout is in progress.
 *
 * The circle carries whatever @hybrid/core's auroraNavAction resolves for the
 * visible surface: TRAIN by default (the launcher — exactly what the retired
 * Train tab opened), ADD POST on the feed, morphing between the two with a
 * glyph crossfade in place. The circle's material is the capsule's own
 * (.aurora-navglass); the accent lives in its GLYPH — lime, the "go" colour —
 * never in its glass. That detached slot reads as the search role to an iOS 26
 * eye; nav-bar.ts records why HYBRID spends it on the verb anyway.
 *
 * Persistent session state lives in the accessory above the bar (the system's
 * mini-player slot), never as a tab.
 *
 * On web it COEXISTS with the left sidebar on desktop (the sidebar is the full
 * nav; this is quick-access to the funnel destinations). Self-gates to Aurora
 * (renders null in Classic). Glyphs are the design-kit line icons, plus the
 * shared inline dumbbell for Train.
 *
 * The bar carries NO menu of its own any more. It used to end in a "More" tab
 * that opened a springboard sheet of every screen; that sheet is now the SIDE
 * MENU behind the Today header's avatar (aurora/side-menu.tsx), which is one
 * tap from every hub tab and does not spend a bar slot on a directory.
 */
// The capsule reads Today, Nutrition, Messages, Profile — the four places (see
// @hybrid/core nav-bar.ts: discovery is not a daily destination, eating is;
// Messages holds the slot More used to). Train rides beside them as the
// detached action. Plans/History/Performance/Feed and the rest of the toolkit
// live in the side menu.
const TABS = AURORA_NAV_TABS;

// Geometry + material are shared with mobile via @hybrid/core so the two
// clients cannot drift (they previously hard-coded their own copies).
const { slotH: SLOT_H, lensW: LENS_W, padV: PAD_V, padH: PAD_H, miniSlotH: MINI_SLOT_H, miniLensW: MINI_LENS_W, labelH: LABEL_H, actionGap: ACTION_GAP, accessoryGap: ACC_GAP } = AURORA_NAV_GEOMETRY;
const M = AURORA_NAV_MATERIAL;

const C = (v: string) => `var(--color-${v})`;

export default function AuroraPillNav({ activeId, action = "train", onSelect, onAction }: { activeId?: string; action?: AuroraNavActionId; onSelect: (id: string) => void; onAction?: (id: AuroraNavActionId) => void }) {
  const aurora = useTemplate().template === "aurora";
  const { t } = useLang();

  // Sliding selection indicator (the glass lens): a single translucent highlight
  // that SPRINGS to the active slot and STRETCHES mid-travel (scaled by travel
  // DISTANCE) instead of a static per-tab background. barRef is the capsule (the
  // offset parent); flatRefs holds the four tab buttons; wrapRef is the whole
  // stack (accessory + capsule + action circle) for the shrink-on-scroll. A
  // screen that isn't on the capsule (the Train launcher, the logger, a side
  // menu leaf) lights nothing and the lens fades out in place, staying MOUNTED
  // so the next selection travels instead of popping in.
  const wrapRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const flatRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [ind, setInd] = useState<{ x: number; top: number } | null>(null);
  const [indShown, setIndShown] = useState(false);
  const [stretch, setStretch] = useState(1);
  // Counter-squash across the travel axis. Stretching alone reads as a blob
  // smearing; a real liquid lens also thins as it elongates, which is what
  // makes an identical duration feel snappy rather than floaty.
  const [squash, setSquash] = useState(1);
  const [reduced, setReduced] = useState(false);
  const indRef = useRef<{ x: number; top: number } | null>(null);
  const indShownRef = useRef(false);
  const firstRef = useRef(true);
  // MINI (icon-only) state — see the shrink-on-scroll effect below. Hysteresis
  // keeps it from flickering at the threshold.
  const [mini, setMini] = useState(false);
  const miniRef = useRef(false);
  const lensW = mini ? MINI_LENS_W : LENS_W;
  const slotH = mini ? MINI_SLOT_H : SLOT_H;
  const lastActiveRef = useRef<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Which of the four slots is lit. A screen that is NOT on the capsule lights
  // nothing and the lens fades out where it stands — the Train launcher and the
  // live logger belong to the action circle now, so they light no slot either.
  const slotIds = new Set<string>(TABS.map((tb) => tb.id));
  const activeFlat = activeId != null && slotIds.has(activeId) ? activeId : null;

  // Reposition the indicator whenever the active slot changes (and on resize).
  // On the first paint it snaps into place; after that it springs, stretching
  // mid-travel proportionally to the distance (further slot → longer blob).
  useLayoutEffect(() => {
    const reducedNow = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stretchTimer: ReturnType<typeof setTimeout> | undefined;
    const place = () => {
      const bar = barRef.current;
      const el = activeFlat ? flatRefs.current[activeFlat] : null;
      if (!bar || !el) {
        // Off-capsule screen: fade out where it stands (keep `ind`, so it can
        // travel back from the same spot when a slot is selected again). Reset
        // the stretch too — the pending settle timer was cleared by the effect
        // cleanup, so without this a mid-stretch hop off the capsule left the
        // hidden indicator permanently elongated (review finding).
        indShownRef.current = false;
        lastActiveRef.current = activeFlat;
        setIndShown(false);
        setStretch(1);
        setSquash(1);
        return;
      }
      // `top` is the button's own offset (never a measured height): the button
      // box IS the slot and the lens matches its height, so the two align by
      // construction — and it stays correct mid-transition while the slot is
      // animating between the full and MINI heights.
      const next = { x: el.offsetLeft + (el.offsetWidth - lensW) / 2, top: el.offsetTop };
      const prev = indRef.current;
      const wasShown = indShownRef.current;
      // Only a genuine slot CHANGE travels. Re-placing because the bar went
      // icon-only shifts x by the lens-width delta alone — that must resize in
      // place, not fire the travel stretch.
      const travelled = lastActiveRef.current !== activeFlat;
      lastActiveRef.current = activeFlat;
      indRef.current = next;
      indShownRef.current = true;
      setInd(next);
      setIndShown(true);
      if (!firstRef.current && !reducedNow && wasShown && travelled && prev && Math.abs(next.x - prev.x) > 1) {
        const dist = Math.abs(next.x - prev.x);
        setStretch(Math.min(1 + dist / 240, 1.9));
        setSquash(Math.max(1 - dist / 900, 0.86));
        stretchTimer = setTimeout(() => { setStretch(1); setSquash(1); }, 150);
      } else {
        // Any non-travelling placement (first paint, resize, reduced motion,
        // reappearing after a non-slot screen) settles at rest width.
        setStretch(1);
        setSquash(1);
      }
      firstRef.current = false;
    };
    place();
    const onResize = () => { firstRef.current = true; place(); };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); if (stretchTimer) clearTimeout(stretchTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFlat, mini]);

  // Shrink-on-scroll (the tabBarMinimizeBehavior feel): full size at the very
  // top, the bar scales down smoothly as the page scrolls. The whole split bar
  // (wrapRef — capsule + action circle) is scaled; the sliding indicator is a
  // child, so it shrinks with it. Applied imperatively per animation frame
  // (transform isn't in the bar's React-managed style, so it's never clobbered
  // on re-render); honours reduced motion; recomputed on screen change so a
  // short screen re-expands.
  // Past the threshold the bar also goes ICON-ONLY (`mini`): the labels
  // collapse away and the slots tighten, so the small bar is glyphs alone —
  // the native minimized tab bar. That's a LAYOUT change (with its own CSS
  // transition), so it's a hysteresis-guarded boolean rather than a continuous
  // ramp, and the residual scale is gentler now that the geometry does most of
  // the shrinking.
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const bar = wrapRef.current;
      if (!bar) return;
      const y = window.scrollY || 0;
      const p = reduce ? 0 : y <= 0 ? 0 : y >= 48 ? 1 : y / 48;
      bar.style.transformOrigin = "bottom center";
      bar.style.transform = `scale(${1 - 0.06 * p})`;
      bar.style.opacity = String(1 - 0.06 * p);
      const wantMini = miniRef.current ? p > 0.25 : p > 0.6;
      if (wantMini !== miniRef.current) { miniRef.current = wantMini; setMini(wantMini); }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    window.addEventListener("scroll", onScroll, { passive: true });
    apply();
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [activeId]);

  // SESSION ACCESSORY — an in-progress workout rides ABOVE the capsule, in the
  // tab-bar accessory slot (the system home for players and active orders),
  // never as a tab. Re-read on every screen change plus cross-tab writes; the
  // clock only ticks while a draft actually exists.
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const sync = () => setDraft(loadWorkoutDraft());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener("focus", sync); };
  }, [activeId]);
  useEffect(() => {
    if (!draft) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [draft]);

  if (!aurora) return null;

  const label = (id: string, fallback: string) => (t(`nav.${id}`) === `nav.${id}` ? fallback : t(`nav.${id}`));
  const go = (id: string) => onSelect(id);

  // The accessory is redundant once you're already in the Train launcher or the
  // live logger, so it stands down there.
  const showAccessory = draft != null && activeId !== "train" && activeId !== "log";

  return (
    <>
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50, display: "flex", justifyContent: "center", padding: "0 16px 16px", pointerEvents: "none" }}>
        {/* The bar stack: [session accessory] over [glass capsule with the four
            tabs + the detached action circle], shrinking together on scroll. */}
        <div ref={wrapRef} style={{ pointerEvents: "auto", display: "flex", flexDirection: "column", alignItems: "stretch", gap: ACC_GAP, width: "100%", maxWidth: 480 }}>
          {showAccessory && draft && (
            <SessionAccessory draft={draft} nowTs={nowTs} reduced={reduced} onResume={() => go("train")} resumeLabel={t("common.resume") === "common.resume" ? "Resume" : t("common.resume")} />
          )}
          <div style={{ display: "flex", alignItems: "center", gap: ACTION_GAP }}>
          {/* The Liquid Glass capsule. The material lives in globals.css as
              .aurora-navglass — a nearly clear body under a modest blur, a
              specular rim arc, a refraction band at the edge and a dark bottom
              lip. The old inline recipe (40% ink film under blur(24) with a
              uniform hairline) was frosted glass, not Liquid Glass. */}
          <div ref={barRef} className="aurora-navglass" style={{ position: "relative", flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 999, padding: `${PAD_V}px ${PAD_H}px` }}>
            {/* The single sliding highlight — a LIFTED lens: thinner glass than
                the capsule carrying it (clearer + brighter), with its own drop
                shadow onto the bar surface and a specular arc on top, so the
                selection reads as a lens rather than a stroked outline. It
                springs between slots (transform), stretching along travel and
                counter-squashing across it (distance-scaled) for the liquid
                feel, and sits behind the glyphs. */}
            {ind && (
              <span
                aria-hidden
                style={{
                  position: "absolute", left: 0, top: ind.top, width: lensW, height: slotH, borderRadius: slotH / 2,
                  background: `rgba(var(--glass-rgb), ${M.lensOpacity})`,
                  backdropFilter: `blur(${M.lensBlur}px) brightness(${M.lensBrightness})`,
                  WebkitBackdropFilter: `blur(${M.lensBlur}px) brightness(${M.lensBrightness})`,
                  border: `1px solid rgba(var(--glass-rgb), .24)`,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,.30), 0 3px 9px -1px rgba(0,0,0,.34)",
                  transformOrigin: "center",
                  transform: `translateX(${ind.x}px) scaleX(${stretch}) scaleY(${squash})`,
                  opacity: indShown ? 1 : 0,
                  transition: reduced ? "none" : "transform .34s cubic-bezier(.32,1.36,.44,1), opacity .18s ease, width .22s cubic-bezier(.4,0,.2,1), height .22s cubic-bezier(.4,0,.2,1), top .22s cubic-bezier(.4,0,.2,1)",
                  zIndex: 1, pointerEvents: "none",
                }}
              />
            )}
            {/* Today, Nutrition, Messages, Profile */}
            {TABS.map((tab) => (
              <PillButton
                key={tab.id}
                innerRef={(el) => { flatRefs.current[tab.id] = el; }}
                glyph={tab.glyph}
                label={label(tab.id, tab.label)}
                active={activeFlat === tab.id}
                reduced={reduced}
                mini={mini}
                onClick={() => go(tab.id)}
              />
            ))}
          </div>
          {/* THE ACTION — the detached circle. Same glass, one verb. */}
          <ActionCircle
            action={action}
            label={label(action === "post" ? "addPost" : "train", AURORA_NAV_ACTIONS[action].label)}
            mini={mini}
            reduced={reduced}
            onClick={() => onAction?.(action)}
          />
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The SESSION ACCESSORY — an in-progress workout, shown above the capsule in
 * the tab-bar accessory slot (Apple's home for players and active orders, the
 * mini-player idiom). This is where persistent state belongs; a tab bar carries
 * navigation, so "start training" is content-layer and live-session status is
 * accessory-layer. The lime dot is a semantic status indicator, not decoration.
 */
function SessionAccessory({ draft, nowTs, reduced, onResume, resumeLabel }: { draft: WorkoutDraft; nowTs: number; reduced: boolean; onResume: () => void; resumeLabel: string }) {
  return (
    <button
      onClick={onResume}
      className="aurora-navglass pressable"
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%", height: AURORA_NAV_GEOMETRY.accessoryH,
        padding: `0 ${PAD_H + 4}px`, borderRadius: 999, cursor: "pointer",
        textAlign: "left", font: "inherit",
        transition: reduced ? "none" : "opacity .2s ease",
      }}
    >
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, background: C("lime"), boxShadow: `0 0 8px ${C("lime")}` }} />
      <span style={{ minWidth: 0, flex: 1, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: fs.note, color: C("chalk"), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{draft.title}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{formatSessionElapsed(draft.startedAt, nowTs)}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: accentText("lime"), flexShrink: 0 }}>{resumeLabel}</span>
    </button>
  );
}

/**
 * THE ACTION CIRCLE — the detached verb beside the capsule. Its diameter is the
 * capsule's full height (slotH + 2·padV, so it shrinks in step with the MINI
 * bar), its material is the capsule's own glass, and the accent lives in the
 * GLYPH: lime, the "go" colour, because this is the one thing on the bar that
 * ACTS rather than navigates. When the surface changes the verb (feed → Add
 * post) the two glyphs CROSSFADE in place with a small spring on the incoming
 * one — the circle itself never moves, so the morph reads as the same button
 * changing its mind, not a new button arriving.
 */
function ActionCircle({ action, label, mini, reduced, onClick }: { action: AuroraNavActionId; label: string; mini: boolean; reduced: boolean; onClick: () => void }) {
  const d = (mini ? MINI_SLOT_H : SLOT_H) + PAD_V * 2;
  // The incoming glyph springs from slightly small; a bare opacity swap reads
  // as a redraw, not a morph. Driven by a two-frame transition (set small,
  // then release) rather than a keyframe so it needs no global CSS.
  const [settled, setSettled] = useState(true);
  const prevRef = useRef(action);
  useEffect(() => {
    if (prevRef.current === action) return;
    prevRef.current = action;
    if (reduced) return;
    setSettled(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setSettled(true)));
    return () => cancelAnimationFrame(id);
  }, [action, reduced]);

  // Both glyphs stay mounted and stacked so the crossfade has two real layers.
  // The dumbbell is the shared inline path (outside the kit's PNG-mirrored
  // union); Add post is the kit's own `list-add` compose mark. Stroke 4 at 23 —
  // the bar's unified nav weight, a touch larger than the 21 tab glyphs since
  // the circle carries no label.
  const glyph = (id: AuroraNavActionId, on: boolean) => (
    <span
      aria-hidden
      style={{
        position: "absolute", inset: 0, display: "grid", placeItems: "center",
        opacity: on ? 1 : 0,
        transform: on && !settled ? "scale(.72)" : "scale(1)",
        transition: reduced ? "none" : on
          ? "opacity .18s ease, transform .34s cubic-bezier(.32,1.36,.44,1)"
          : "opacity .14s ease",
      }}
    >
      {id === "train" ? (
        <svg width={23} height={23} viewBox="0 0 72 72" fill="none" aria-hidden>
          <path d={AURORA_TRAIN_GLYPH} stroke={C("lime")} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width={23} height={23} viewBox="0 0 72 72" fill="none" aria-hidden>
          {AURORA_ICON_PATHS["list-add"].map((p) => (
            <path key={p} d={p} stroke={C("lime")} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </svg>
      )}
    </span>
  );

  return (
    <button
      className="aurora-navglass pressable"
      onClick={onClick}
      aria-label={label}
      style={{
        position: "relative", width: d, height: d, flexShrink: 0,
        borderRadius: 999, border: "none", padding: 0, cursor: "pointer",
        transition: reduced ? "none" : "width .22s cubic-bezier(.4,0,.2,1), height .22s cubic-bezier(.4,0,.2,1)",
      }}
    >
      {glyph("train", action === "train")}
      {glyph("post", action === "post")}
    </button>
  );
}

function PillButton({ glyph, label, active, reduced, mini, onClick, innerRef }: { glyph: AuroraIconName | "train"; label: string; active: boolean; reduced: boolean; mini: boolean; onClick: () => void; innerRef?: (el: HTMLButtonElement | null) => void }) {
  // Each item is icon + label (the tab-bar item), stacked TWICE: an ash base and
  // a LIME active overlay. zIndex 2 keeps the stack above the shared sliding
  // glass lens (zIndex 1), which is drawn once in the bar, not per-button. The
  // active tint is a CROSSFADE synced to the lens's arrival — the incoming
  // glyph waits a beat (~.1s delay) so it lands WITH the sliding lens; an
  // instant flip reads as "icon changed, pill lagging".
  // The active colour is the brand tint, not chalk: chalk-against-ash at an
  // identical stroke weight is a Material tell, where iOS moves the selected
  // item to a true tint (it also swaps to a filled symbol, which this kit —
  // line icons only, per the project rule — expresses as tint alone).
  // Glyph weight 4.5 (viewBox units, ~1.3px at 21) — the shared NAV-BAR weight,
  // matching mobile's AuroraSvgIcon in global-nav. Before this the clients
  // drifted (web stroked the bar at a 2.6 hairline, mobile at the design-kit 6);
  // 4.5 is the unified midpoint, a touch lighter than the kit default so the
  // glyphs sit comfortably beside a 10pt label on glass.
  // When the bar is MINI (shrunk on scroll) the label row collapses to zero
  // height and fades out, leaving the glyph alone — the icon-only small bar.
  // The height is what animates (not `display`), so the slot morphs smoothly
  // between the two sizes. The button keeps its aria-label either way, so the
  // name never disappears for assistive tech.
  const item = (color: string) => (
    <span style={{ display: "grid", justifyItems: "center" }}>
      {glyph === "train" ? (
        <svg width={21} height={21} viewBox="0 0 72 72" fill="none" aria-hidden>
          <path d={AURORA_TRAIN_GLYPH} stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <AuroraIcon name={glyph} size={21} strokeWidth={4} color={color} />
      )}
      <span
        style={{
          display: "block", overflow: "hidden",
          height: mini ? 0 : LABEL_H, opacity: mini ? 0 : 1,
          transition: reduced ? "none" : "height .22s cubic-bezier(.4,0,.2,1), opacity .16s ease",
        }}
      >
        <span style={{ display: "block", paddingTop: 2, fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 600, lineHeight: "12px", color, whiteSpace: "nowrap", maxWidth: LENS_W - 4, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      </span>
    </span>
  );
  const trans = reduced ? "none" : "width .22s cubic-bezier(.4,0,.2,1), height .22s cubic-bezier(.4,0,.2,1)";
  return (
    <button className="pressable" ref={innerRef} onClick={onClick} aria-label={label} aria-pressed={active} style={{ position: "relative", zIndex: 2, flex: 1, height: mini ? MINI_SLOT_H : SLOT_H, display: "grid", placeItems: "center", background: "transparent", border: "none", cursor: "pointer", padding: 0, transition: trans }}>
      <span style={{ position: "relative", width: mini ? MINI_LENS_W : LENS_W, height: mini ? MINI_SLOT_H : SLOT_H, display: "grid", placeItems: "center", transition: trans }}>
        {item(C("ash"))}
        <span
          aria-hidden
          style={{
            position: "absolute", inset: 0, display: "grid", placeItems: "center",
            opacity: active ? 1 : 0,
            transition: reduced ? "none" : active ? "opacity .2s ease .1s" : "opacity .12s ease",
          }}
        >
          {item(C("lime"))}
        </span>
      </span>
    </button>
  );
}
