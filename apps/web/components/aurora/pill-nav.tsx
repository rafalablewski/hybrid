"use client";

import { useState, useRef, useLayoutEffect, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fs, space, groupedNavWithLocks, sanitizePersonaAccess, AURORA_NAV_ICONS, FUNNEL, type AuroraIconName } from "@hybrid/core";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useFlags } from "@/lib/use-flags";
import { useLang } from "@/lib/i18n";
import { useTemplate } from "@/lib/use-template";
import { track } from "@/lib/track";
import { useDialog } from "@/lib/use-dialog";
import { AuroraIcon } from "./icons";

/**
 * AURORA pill nav (web) — the floating bottom bar in the iOS 26 SwiftUI
 * TabView anatomy, the web twin of the mobile Aurora bar: the four side tabs
 * (icon + label) live inside a Liquid Glass capsule and Train floats BESIDE it
 * as a detached circular action (Apple's split tab bar — the tab group + the
 * standalone accessory), replacing the old centre FAB that punched through the
 * bar. On web it COEXISTS with the left sidebar (the sidebar is the full nav;
 * this is quick-access to the five funnel destinations). Self-gates to Aurora
 * (renders null in Classic). Glyphs are the uploaded design-kit line icons
 * only. "More" opens a sheet with the full persona-filtered nav.
 */
// PRIMARY tabs sit to the LEFT inside the capsule; More · Profile sit to the
// right. The bar reads Today · Explore · More · Profile — [Train]. Explore
// opens the social/discovery surface (the Feed screen); Profile returns to the
// bar (it also lives in the Today header). Plans/History/Cockpit stay
// reachable from the More sheet.
const PRIMARY: { id: string; icon: AuroraIconName; label: string }[] = [
  { id: "today", icon: "village", label: "Today" },
  { id: "explore", icon: "globe", label: "Explore" },
];

// iOS 26 tab-bar geometry (matching the mobile bar): each slot is icon +
// label, the selection lens is a capsule covering both, and the detached Train
// circle matches the bar's full height.
const LENS_W = 60;
const SLOT_H = 46;
const TRAIN_D = 58;
// MINI (small) geometry — once the bar has shrunk on scroll it goes ICON-ONLY:
// the labels collapse away and every slot tightens to the glyph, exactly like
// the native iOS 26 minimized tab bar. Label row height (10px glyph line + the
// 2px gap under the icon) is what animates to 0.
const MINI_LENS_W = 44;
const MINI_SLOT_H = 34;
const MINI_TRAIN_D = 46;
const LABEL_H = 14;

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

  // Sliding selection indicator (the iOS 26 glass lens): a single translucent
  // highlight that SPRINGS to the active flat slot and STRETCHES mid-travel
  // (scaled by travel DISTANCE, like Instagram's blob), instead of a static
  // per-tab background. barRef is the capsule (the offset parent); flatRefs
  // holds the four flat buttons; wrapRef is the whole split bar (capsule +
  // Train circle) for the shrink-on-scroll. The detached Train circle is
  // excluded (it has its own glow) — while Train is active the indicator FADES
  // OUT IN PLACE but stays mounted, so re-entering a side tab travels/fades
  // instead of popping.
  const wrapRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const flatRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [ind, setInd] = useState<{ x: number; top: number } | null>(null);
  const [indShown, setIndShown] = useState(false);
  const [stretch, setStretch] = useState(1);
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

  // Which of the four flat slots is lit: Today/Explore/Profile by route, "more"
  // when its sheet is open or the active screen isn't a bar slot. Train (the
  // centre FAB) maps to none → the indicator fades out while Train is active.
  const flatSlotIds = new Set<string>([...PRIMARY.map((tb) => tb.id), "train", "log", "profile"]);
  const moreLit = moreOpen || (activeId != null && !flatSlotIds.has(activeId));
  const activeFlat = moreLit
    ? "more"
    : activeId === "today" || activeId === "explore" || activeId === "profile"
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
        setStretch(Math.min(1 + Math.abs(next.x - prev.x) / 240, 1.9));
        stretchTimer = setTimeout(() => setStretch(1), 150);
      } else {
        // Any non-travelling placement (first paint, resize, reduced motion,
        // reappearing after Train) settles at rest width.
        setStretch(1);
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

  if (!aurora) return null;

  const initials = ((session?.name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!).join("") || "·").toUpperCase();
  const signOut = () => { closeMore(); logout(); router.replace("/login"); };

  const access = sanitizePersonaAccess(value("access.personaNav"));
  const label = (id: string, fallback: string) => (t(`nav.${id}`) === `nav.${id}` ? fallback : t(`nav.${id}`));
  const go = (id: string) => { closeMore(); onSelect(id); };

  const tabs = PRIMARY;
  // "More" lights only when the active screen isn't one of the bar slots
  // (Today, Explore/feed, Train/log, Profile) and the sheet isn't explicitly
  // open. Profile is now a bar slot (right of More); everything else (Plans,
  // History, Cockpit, …) lives in the More sheet, so landing on those lights
  // "More".
  const barIds = new Set<string>([...tabs.map((t) => t.id), "train", "log", "profile"]);
  const moreActive = moreOpen || (activeId != null && !barIds.has(activeId));
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
              <div style={{ display: "flex", alignItems: "center", gap: 13, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 20, padding: 15, marginBottom: 16 }}>
                <button onClick={() => go("profile")} style={{ display: "flex", alignItems: "center", gap: 13, flex: 1, minWidth: 0, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}>
                  <span style={{ width: 42, height: 42, borderRadius: 21, flexShrink: 0, display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--color-lime) 13%, transparent)", border: `1px solid ${C("lime")}`, fontFamily: "var(--font-display)", fontWeight: 900, fontSize: fs.note, color: C("lime") }}>{initials}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.subtitle, color: C("chalk"), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{session.name || t("nav.you")}</span>
                    <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 3 }}>{[session.role.toUpperCase(), session.entitlement === "paid" ? "FULL" : "FREE"].join(" – ")}</span>
                  </span>
                </button>
                <button onClick={() => go("settings")} aria-label={label("settings", "Settings")} style={{ width: 40, height: 40, borderRadius: 13, flexShrink: 0, display: "grid", placeItems: "center", background: C("ink2"), border: `1px solid ${C("line")}`, cursor: "pointer" }}>
                  <AuroraIcon name="settings" size={19} strokeWidth={2.6} color={C("chalk")} />
                </button>
              </div>
            )}

            {/* Unlock Full — the one accent in the hub (parity with the mobile
                More tab's membership card). Casual users only. */}
            {persona === "casual" && isEnabled("nav.upgrade") && (
              <button
                onClick={() => { track(FUNNEL.upgradeEntryClick, { client: "web", source: "more" }); go("upgrade"); }}
                style={{ position: "relative", overflow: "hidden", display: "block", width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 18, padding: 18, borderRadius: 22, background: C("ink"), border: `1px solid color-mix(in srgb, var(--premium-accent) 50%, transparent)`, boxShadow: "0 10px 26px -10px color-mix(in srgb, var(--premium-accent) 32%, transparent)" }}
              >
                <span style={{ position: "absolute", top: -54, right: -44, width: 168, height: 168, borderRadius: 84, background: "color-mix(in srgb, var(--premium-accent) 16%, transparent)", pointerEvents: "none" }} />
                <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".2em", color: "var(--premium-accent-text)" }}>{t("w.home.pillnav.upgradeKicker")}</span>
                <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 22, color: C("chalk"), marginTop: 8, letterSpacing: "-.02em" }}>{t("nav.upgrade")}</span>
                <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 5, maxWidth: 240 }}>{t("w.home.pillnav.upgradeBlurb")}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: space.sm, marginTop: 14, background: "var(--premium-accent)", color: "var(--premium-accent-ink)", borderRadius: 999, padding: "9px 18px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body }}>{t("w.home.pillnav.goFull")}</span>
              </button>
            )}

            {/* Search — filters the springboard tiles by label (parity with the mobile More tab). */}
            <div style={{ display: "flex", alignItems: "center", gap: space.sm, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: "0 14px", marginBottom: 18 }}>
              <AuroraIcon name="search" size={18} strokeWidth={2.4} color={C("ash")} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${totalTools} tools & screens`}
                aria-label="Search tools"
                autoCapitalize="none"
                autoCorrect="off"
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C("chalk"), fontFamily: "var(--font-display)", fontSize: fs.body, padding: "13px 0" }}
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
                      <button key={id} onClick={openItem} title={locked ? `${name} (Full)` : name} aria-label={locked ? `${name} (Full)` : name} style={{ position: "relative", minHeight: 80, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, padding: "12px 4px", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 14, cursor: "pointer", opacity: locked ? 0.6 : 1 }}>
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
        {/* The iOS 26 split bar: [glass capsule with the four tabs] + [detached
            Train circle], shrinking together on scroll. */}
        <div ref={wrapRef} style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: 10, width: "100%", maxWidth: 460 }}>
          {/* The Liquid Glass capsule — a clearer, brighter frost than the old
              tinted pill (the page genuinely fizzes through, like the native
              iOS 26 TabView material), with a hairline edge + top rim light. */}
          <div ref={barRef} style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", background: "color-mix(in srgb, var(--color-ink2) 40%, transparent)", backdropFilter: "blur(24px) saturate(1.5)", WebkitBackdropFilter: "blur(24px) saturate(1.5)", border: `1px solid color-mix(in srgb, var(--color-chalk) 14%, transparent)`, borderRadius: 999, padding: "6px 8px", boxShadow: "0 8px 28px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.16)" }}>
            {/* The single sliding highlight — a translucent glass lens (not an
                opaque pill: the active glyph stays chalk over it, like the
                native glass selection) that springs between flat slots
                (transform), stretching mid-travel (scaleX, distance-scaled) for
                the liquid feel; sits behind the icons (zIndex 0). While Train
                is active it fades out in place (opacity) but stays MOUNTED, so
                the next selection travels instead of popping in. */}
            {ind && (
              <span
                aria-hidden
                style={{
                  position: "absolute", left: 0, top: ind.top, width: lensW, height: slotH, borderRadius: slotH / 2,
                  background: "color-mix(in srgb, var(--color-chalk) 14%, transparent)",
                  border: `1px solid color-mix(in srgb, var(--color-chalk) 16%, transparent)`,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,.18)",
                  transformOrigin: "center",
                  transform: `translateX(${ind.x}px) scaleX(${stretch})`,
                  opacity: indShown ? 1 : 0,
                  transition: reduced ? "none" : "transform .34s cubic-bezier(.32,1.36,.44,1), opacity .18s ease, width .22s cubic-bezier(.4,0,.2,1), height .22s cubic-bezier(.4,0,.2,1), top .22s cubic-bezier(.4,0,.2,1)",
                  zIndex: 0, pointerEvents: "none",
                }}
              />
            )}
            {/* Today · Explore · More · Profile */}
            {tabs.map((tab) => (
              <PillButton key={tab.id} innerRef={(el) => { flatRefs.current[tab.id] = el; }} icon={tab.icon} label={tab.id === "explore" ? t("nav.explore") : label(tab.id, tab.label)} active={tab.id === activeId} reduced={reduced} mini={mini} onClick={() => go(tab.id)} />
            ))}
            <PillButton innerRef={(el) => { flatRefs.current.more = el; }} icon="grid" label={t("nav.more")} active={moreActive} reduced={reduced} mini={mini} onClick={() => setMoreOpen((v) => !v)} />
            <PillButton innerRef={(el) => { flatRefs.current.profile = el; }} icon="user-circle" label={t("nav.profile")} active={activeId === "profile"} reduced={reduced} mini={mini} onClick={() => go("profile")} />
          </div>
          <TrainFab label={label("log", "Train")} active={activeId === "train" || activeId === "log"} mini={mini} reduced={reduced} onClick={() => go("train")} />
        </div>
      </div>
    </>
  );
}

function PillButton({ icon, label, active, reduced, mini, onClick, innerRef }: { icon: AuroraIconName; label: string; active: boolean; reduced: boolean; mini: boolean; onClick: () => void; innerRef?: (el: HTMLButtonElement | null) => void }) {
  // Each item is icon + label (the iOS 26 TabView item), stacked TWICE: an ash
  // base and a chalk active overlay. zIndex 1 keeps the stack above the shared
  // sliding glass lens, which is drawn once in the bar, not per-button. The
  // active tint is a CROSSFADE synced to the lens's arrival — the incoming
  // glyph waits a beat (~.1s delay) so it lands WITH the sliding lens; an
  // instant flip reads as "icon changed, pill lagging" (the Instagram-audit
  // finding). Outgoing fades back immediately. Over the translucent lens the
  // active glyph stays bright (chalk), never inverting to dark-on-glass.
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
      <AuroraIcon name={icon} size={21} strokeWidth={4} color={color} />
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
    <button ref={innerRef} onClick={onClick} aria-label={label} aria-pressed={active} style={{ position: "relative", zIndex: 1, flex: 1, height: mini ? MINI_SLOT_H : SLOT_H, display: "grid", placeItems: "center", background: "transparent", border: "none", cursor: "pointer", padding: 0, transition: trans }}>
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
          {item(C("chalk"))}
        </span>
      </span>
    </button>
  );
}

/**
 * The detached Train action — the standalone lime circle beside the capsule
 * (the iOS 26 accessory-button idiom), bar-height, with an inline dumbbell
 * glyph and a soft lime glow: the app's CTA identity in Apple's
 * prominent-button slot. Shrinks with the capsule when the bar goes MINI, so
 * the circle keeps matching the bar height in both states.
 */
function TrainFab({ label, active, mini, reduced, onClick }: { label: string; active: boolean; mini: boolean; reduced: boolean; onClick: () => void }) {
  const d = mini ? MINI_TRAIN_D : TRAIN_D;
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      style={{
        width: d, height: d, flexShrink: 0, borderRadius: "50%", display: "grid", placeItems: "center",
        background: C("lime"), border: "none", cursor: "pointer",
        transition: reduced ? "none" : "width .22s cubic-bezier(.4,0,.2,1), height .22s cubic-bezier(.4,0,.2,1)",
        boxShadow: `0 8px 22px -6px color-mix(in srgb, var(--color-lime) 55%, transparent)${active ? `, 0 0 0 2px color-mix(in srgb, var(--color-lime) 40%, transparent)` : ""}`,
      }}
    >
      <svg viewBox="0 0 24 24" width={mini ? 22 : 26} height={mini ? 22 : 26} fill="none" stroke={C("ink")} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />
      </svg>
    </button>
  );
}
