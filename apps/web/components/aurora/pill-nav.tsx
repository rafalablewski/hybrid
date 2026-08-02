"use client";

import { useState, useRef, useLayoutEffect, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  fs,
  space,
  groupedNavWithLocks,
  sanitizePersonaAccess,
  AURORA_NAV_ICONS,
  AURORA_NAV_TABS,
  AURORA_NAV_GEOMETRY,
  AURORA_NAV_MATERIAL,
  AURORA_TRAIN_GLYPH,
  formatSessionElapsed,
  FUNNEL,
  type AuroraIconName,
} from "@hybrid/core";
import { loadWorkoutDraft, type WorkoutDraft } from "@/lib/workout-draft";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useFlags } from "@/lib/use-flags";
import { useLang } from "@/lib/i18n";
import { useTemplate } from "@/lib/use-template";
import { track } from "@/lib/track";
import { useDialog } from "@/lib/use-dialog";
import { AuroraIcon } from "./icons";

/**
 * AURORA pill nav (web) — the floating bottom bar, the web twin of the mobile
 * Aurora bar. FIVE tabs (icon + label) inside a single Liquid Glass capsule,
 * with a session accessory riding above it when a workout is in progress.
 *
 * Anatomy follows Apple's tab-bar guidance instead of approximating it. Two
 * corrections from the previous build, both recorded in @hybrid/core's
 * AURORA_NAV_TABS:
 *  - Tab bars carry NAVIGATION; "avoid placing screen-specific actions in the
 *    tab bar". Train is a destination (it opens the Train launcher, which is
 *    what the old circle did too), so it is simply a tab.
 *  - A circle DETACHED beside an iOS 26 tab bar is the SEARCH role — it morphs
 *    into a search field on tap. The old lime Train circle sat in that slot and
 *    read as search to anyone fluent in the platform. The slot is now unused
 *    and stays free for real search.
 * Persistent session state lives in the accessory above the bar (the system's
 * mini-player slot), never as a tab.
 *
 * On web it COEXISTS with the left sidebar (the sidebar is the full nav; this
 * is quick-access to the funnel destinations). Self-gates to Aurora (renders
 * null in Classic). Glyphs are the design-kit line icons, plus the shared
 * inline dumbbell for Train. "More" opens a sheet with the full persona-
 * filtered nav.
 */
// The bar reads Today, Nutrition, Train, More, Profile — five, which is Apple's
// ceiling for iPhone. Nutrition holds the slot Explore used to (see @hybrid/core
// nav-bar.ts: discovery is not a daily destination, eating is); Profile also
// lives in the Today header. Plans/History/Cockpit/Feed stay reachable from the
// More sheet.
const TABS = AURORA_NAV_TABS;

// Geometry + material are shared with mobile via @hybrid/core so the two
// clients cannot drift (they previously hard-coded their own copies).
const { slotH: SLOT_H, lensW: LENS_W, padV: PAD_V, padH: PAD_H, miniSlotH: MINI_SLOT_H, miniLensW: MINI_LENS_W, labelH: LABEL_H, accessoryGap: ACC_GAP } = AURORA_NAV_GEOMETRY;
const M = AURORA_NAV_MATERIAL;

const C = (v: string) => `var(--color-${v})`;

export default function AuroraPillNav({ activeId, onSelect }: { activeId?: string; onSelect: (id: string) => void }) {
  const aurora = useTemplate().template === "aurora";
  const persona = usePersona();
  const { session, logout } = useSession();
  const router = useRouter();
  const { isEnabled, value } = useFlags();
  const { t } = useLang();
  const [moreOpen, setMoreOpen] = useState(false);
  const [query, setQuery] = useState("");
  const closeMore = () => { setMoreOpen(false); setQuery(""); };
  const dialogRef = useDialog<HTMLDivElement>(closeMore, moreOpen);

  // Sliding selection indicator (the glass lens): a single translucent highlight
  // that SPRINGS to the active slot and STRETCHES mid-travel (scaled by travel
  // DISTANCE) instead of a static per-tab background. barRef is the capsule (the
  // offset parent); flatRefs holds the five tab buttons; wrapRef is the whole
  // stack (accessory + capsule) for the shrink-on-scroll. All five destinations
  // are slots now, so the lens has no hidden state — it only fades out on a
  // screen that isn't on the bar at all, staying MOUNTED so the next selection
  // travels instead of popping in.
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

  // Which of the five slots is lit. Train is a real slot now (it was the
  // detached circle, which mapped to none and made the lens fade out), so every
  // bar destination lights one — the lens no longer has a hidden state.
  // "more" lights when its sheet is open or the active screen isn't a bar slot.
  const slotIds = new Set<string>([...TABS.map((tb) => tb.id), "log"]);
  const moreLit = moreOpen || (activeId != null && !slotIds.has(activeId));
  const activeFlat = moreLit
    ? "more"
    : activeId === "log"
      ? "train"
      : activeId != null && slotIds.has(activeId)
        ? activeId
        : null;

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
        // Train / none: fade out where it stands (keep `ind`, so it can travel
        // back from the same spot when a side tab is selected again). Reset the
        // stretch too — the pending settle timer was cleared by the effect
        // cleanup, so without this a mid-stretch hop to Train left the hidden
        // indicator permanently elongated (review finding).
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
  // (wrapRef — capsule + Train circle) is scaled; the sliding indicator is a
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

  const initials = ((session?.name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!).join("") || "·").toUpperCase();
  const signOut = () => { closeMore(); logout(); router.replace("/login"); };

  const access = sanitizePersonaAccess(value("access.personaNav"));
  const label = (id: string, fallback: string) => (t(`nav.${id}`) === `nav.${id}` ? fallback : t(`nav.${id}`));
  const go = (id: string) => { closeMore(); onSelect(id); };

  // The accessory is redundant once you're already in the Train launcher or the
  // live logger, so it stands down there.
  const showAccessory = draft != null && activeId !== "train" && activeId !== "log";
  // Premium (Full) items a free user hasn't unlocked show LOCKED (🔒) here rather
  // than hidden, so the whole toolkit is visible; a locked tile upsells.
  const groups = groupedNavWithLocks(persona, access)
    .map((g) => ({ ...g, items: g.items.filter((x) => isEnabled(`nav.${x.item.id}`)) }))
    .filter((g) => g.items.length > 0);

  // Springboard search — filters the launcher tiles by (localized) label and
  // drops clusters left empty by the filter, so the grid stays tight. Parity
  // with the mobile More tab's search-first springboard.
  const totalTools = groups.reduce((n, g) => n + g.items.length, 0);
  const q = query.trim().toLowerCase();
  const shown = q
    ? groups
        .map((g) => ({ ...g, items: g.items.filter(({ item }) => label(item.id, item.label).toLowerCase().includes(q)) }))
        .filter((g) => g.items.length > 0)
    : groups;

  return (
    <>
      {moreOpen && (
        <div onClick={closeMore} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: "var(--font-display)" }}>
          <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1} onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 720, maxHeight: "80vh", overflowY: "auto", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: "28px 28px 0 0", padding: "20px 20px 110px" }}>
            <div style={{ width: 40, height: 4, borderRadius: 999, background: C("line"), margin: "0 auto 16px" }} />

            {/* Identity — avatar + name + role/entitlement (tap → profile) with a
                Settings cog, matching the mobile More tab's identity card. */}
            {session && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: 16, marginBottom: 16 }}>
                <button onClick={() => go("profile")} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                  <span style={{ width: 42, height: 42, borderRadius: 999, flexShrink: 0, display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--color-lime) 13%, transparent)", border: `1px solid ${C("lime")}`, fontFamily: "var(--font-display)", fontWeight: 900, fontSize: fs.note, color: C("lime") }}>{initials}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.subtitle, color: C("chalk"), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{session.name || t("nav.you")}</span>
                    <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 3 }}>{[session.role.toUpperCase(), session.entitlement === "paid" ? "FULL" : "FREE"].join(" – ")}</span>
                  </span>
                </button>
                <button onClick={() => go("settings")} aria-label={label("settings", "Settings")} style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: "grid", placeItems: "center", background: C("ink2"), border: `1px solid ${C("line")}`, cursor: "pointer" }}>
                  <AuroraIcon name="settings" size={19} strokeWidth={2.6} color={C("chalk")} />
                </button>
              </div>
            )}

            {/* Unlock Full — the one accent in the hub (parity with the mobile
                More tab's membership card). Casual users only. */}
            {persona === "casual" && isEnabled("nav.upgrade") && (
              <button
                onClick={() => { track(FUNNEL.upgradeEntryClick, { client: "web", source: "more" }); go("upgrade"); }}
                style={{ position: "relative", overflow: "hidden", display: "block", width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 18, padding: 18, borderRadius: 28, background: C("ink"), border: `1px solid color-mix(in srgb, var(--premium-accent) 50%, transparent)`, boxShadow: "0 10px 26px -10px color-mix(in srgb, var(--premium-accent) 32%, transparent)" }}
              >
                <span style={{ position: "absolute", top: -54, right: -44, width: 168, height: 168, borderRadius: 84, background: "color-mix(in srgb, var(--premium-accent) 16%, transparent)", pointerEvents: "none" }} />
                <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".2em", color: "var(--premium-accent-text)" }}>{t("w.home.pillnav.upgradeKicker")}</span>
                <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 22, color: C("chalk"), marginTop: 8, letterSpacing: "-.02em" }}>{t("nav.upgrade")}</span>
                <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 5, maxWidth: 240 }}>{t("w.home.pillnav.upgradeBlurb")}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: space.sm, marginTop: 14, background: "var(--premium-accent)", color: "var(--premium-accent-ink)", borderRadius: 999, padding: "8px 18px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body }}>{t("w.home.pillnav.goFull")}</span>
              </button>
            )}

            {/* Search — filters the springboard tiles by label (parity with the mobile More tab). */}
            <div style={{ display: "flex", alignItems: "center", gap: space.sm, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "0 14px", marginBottom: 18 }}>
              <AuroraIcon name="search" size={18} strokeWidth={2.4} color={C("ash")} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${totalTools} tools & screens`}
                aria-label="Search tools"
                autoCapitalize="none"
                autoCorrect="off"
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C("chalk"), fontFamily: "var(--font-display)", fontSize: fs.body, padding: "12px 0" }}
              />
              {query.length > 0 && (
                <button onClick={() => setQuery("")} aria-label="Clear search" style={{ background: "transparent", border: "none", cursor: "pointer", color: C("ash"), fontSize: 18, lineHeight: 1 }}>×</button>
              )}
            </div>

            {shown.map((g) => {
              const groupName = t(`nav.group.${g.group}`) === `nav.group.${g.group}` ? g.group : t(`nav.group.${g.group}`);
              return (
              <div key={g.group} style={{ marginBottom: 18 }}>
                {/* Cluster header — label only, no marker (decorative dots/squares
                    before text are banned; parity with the mobile More tab). */}
                <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".16em", textTransform: "uppercase", color: C("ash") }}>{groupName}</span>
                </div>
                {/* Springboard grid — 4-col neutral bordered cells (icon + label
                    inside), sand lock for premium. */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: space.xs }}>
                  {g.items.map(({ item: { id, label: fb }, locked }) => {
                    const name = label(id, fb);
                    const openItem = () => { if (locked) { track(FUNNEL.upgradeEntryClick, { client: "web", source: `more-${id}` }); go("upgrade"); } else go(id); };
                    return (
                      <button key={id} onClick={openItem} title={locked ? `${name} (Full)` : name} aria-label={locked ? `${name} (Full)` : name} style={{ position: "relative", minHeight: 80, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 4px", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, cursor: "pointer", opacity: locked ? 0.6 : 1 }}>
                        <AuroraIcon name={AURORA_NAV_ICONS[id] ?? "info"} size={22} strokeWidth={2.4} color={locked ? C("ash") : C("chalk")} />
                        <span style={{ fontFamily: "var(--font-display)", fontSize: fs.micro, fontWeight: 600, color: locked ? C("ash") : C("chalk"), textAlign: "center", lineHeight: 1.15, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{name}</span>
                        {locked && (
                          <span aria-hidden style={{ position: "absolute", top: 6, right: 6, display: "grid", placeItems: "center" }}>
                            <AuroraIcon name="lock" size={11} strokeWidth={2.4} color="var(--amber-text)" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              );
            })}
            {q.length > 0 && shown.length === 0 && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), textAlign: "center", padding: "22px 0 10px" }}>{`No tools match “${query}”.`}</div>
            )}

            {/* Sign out — matching the mobile More tab's bottom action. */}
            {session && (
              <button onClick={signOut} style={{ display: "block", width: "100%", textAlign: "center", marginTop: 10, padding: "14px 0", background: "none", border: "none", cursor: "pointer", color: C("ash"), fontFamily: "var(--font-mono)", fontSize: fs.body }}>{t("common.signout")}</button>
            )}
          </div>
        </div>
      )}

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50, display: "flex", justifyContent: "center", padding: "0 18px 18px", pointerEvents: "none" }}>
        {/* The bar stack: [session accessory] over [glass capsule with the five
            tabs], shrinking together on scroll. */}
        <div ref={wrapRef} style={{ pointerEvents: "auto", display: "flex", flexDirection: "column", alignItems: "stretch", gap: ACC_GAP, width: "100%", maxWidth: 480 }}>
          {showAccessory && draft && (
            <SessionAccessory draft={draft} nowTs={nowTs} reduced={reduced} onResume={() => go("train")} resumeLabel={t("common.resume") === "common.resume" ? "Resume" : t("common.resume")} />
          )}
          {/* The Liquid Glass capsule. The material lives in globals.css as
              .aurora-navglass — a nearly clear body under a modest blur, a
              specular rim arc, a refraction band at the edge and a dark bottom
              lip. The old inline recipe (40% ink film under blur(24) with a
              uniform hairline) was frosted glass, not Liquid Glass. */}
          <div ref={barRef} className="aurora-navglass" style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 999, padding: `${PAD_V}px ${PAD_H}px` }}>
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
            {/* Today, Nutrition, Train, More, Profile */}
            {TABS.map((tab) => (
              <PillButton
                key={tab.id}
                innerRef={(el) => { flatRefs.current[tab.id] = el; }}
                glyph={tab.glyph}
                label={label(tab.id, tab.label)}
                active={activeFlat === tab.id}
                reduced={reduced}
                mini={mini}
                onClick={() => (tab.id === "more" ? setMoreOpen((v) => !v) : go(tab.id))}
              />
            ))}
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
      className="aurora-navglass"
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
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("lime"), flexShrink: 0 }}>{resumeLabel}</span>
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
  // Train's dumbbell is the one glyph outside the kit's PNG-mirrored union, so
  // it is stroked inline from the shared path data (same 72 viewBox, same
  // weight) rather than going through AuroraIcon.
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
    <button ref={innerRef} onClick={onClick} aria-label={label} aria-pressed={active} style={{ position: "relative", zIndex: 2, flex: 1, height: mini ? MINI_SLOT_H : SLOT_H, display: "grid", placeItems: "center", background: "transparent", border: "none", cursor: "pointer", padding: 0, transition: trans }}>
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
