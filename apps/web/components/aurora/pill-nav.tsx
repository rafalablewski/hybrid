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
 * AURORA pill nav (web) — the floating bottom pill bar, the web twin of the
 * mobile Aurora tab bar. On web it COEXISTS with the left sidebar (the sidebar
 * is the full nav; this is quick-access to the five funnel destinations). Self-
 * gates to Aurora (renders null in Classic). Glyphs are the uploaded design-kit
 * line icons only. "More" opens a sheet with the full persona-filtered nav.
 */
// PRIMARY pills sit to the LEFT of the elevated center Train action; More ·
// Profile sit to the right. The bar reads Today · Explore · [Train] · More ·
// Profile. Explore opens the social/discovery surface (the Feed screen); Profile
// returns to the bar (it also lives in the Today header). Plans/History/Cockpit
// stay reachable from the More sheet.
const PRIMARY: { id: string; icon: AuroraIconName; label: string }[] = [
  { id: "today", icon: "village", label: "Today" },
  { id: "explore", icon: "globe", label: "Explore" },
];

const C = (v: string) => `var(--color-${v})`;

// Per-cluster accent tint (the mobile GROUP_META spectrum), so the springboard
// tiles read the same across all three More surfaces. Ash for Account.
const GROUP_ACCENT: Record<string, string> = { home: "lime", train: "lime", analyze: "blue", recovery: "amber", social: "violet", teams: "red", account: "ash" };
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

  // Sliding selection indicator (the Instagram-style liquid pill): a single
  // chalk highlight that SPRINGS to the active flat slot and STRETCHES mid-
  // travel (scaled by travel DISTANCE, like Instagram's blob), instead of a
  // static per-tab background. barRef is the offset parent; flatRefs holds the
  // four flat buttons. The centre Train FAB is excluded (it has its own glow) —
  // while Train is active the indicator FADES OUT IN PLACE but stays mounted,
  // so re-entering a side tab travels/fades instead of popping.
  const barRef = useRef<HTMLDivElement>(null);
  const flatRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [ind, setInd] = useState<{ x: number; top: number } | null>(null);
  const [indShown, setIndShown] = useState(false);
  const [stretch, setStretch] = useState(1);
  const [reduced, setReduced] = useState(false);
  const indRef = useRef<{ x: number; top: number } | null>(null);
  const indShownRef = useRef(false);
  const firstRef = useRef(true);

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
        setIndShown(false);
        setStretch(1);
        return;
      }
      const next = { x: el.offsetLeft + (el.offsetWidth - 52) / 2, top: el.offsetTop + (el.offsetHeight - 52) / 2 };
      const prev = indRef.current;
      const wasShown = indShownRef.current;
      indRef.current = next;
      indShownRef.current = true;
      setInd(next);
      setIndShown(true);
      if (!firstRef.current && !reducedNow && wasShown && prev && Math.abs(next.x - prev.x) > 1) {
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
  }, [activeFlat]);

  // Shrink-on-scroll (the Instagram behaviour): full size at the very top, the
  // pill scales down smoothly as the page scrolls. The whole bar (barRef) is
  // scaled — the FAB + sliding indicator are its children, so they shrink with
  // it. Applied imperatively per animation frame (transform isn't in the bar's
  // React-managed style, so it's never clobbered on re-render); honours reduced
  // motion; recomputed on screen change so a short screen re-expands.
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const bar = barRef.current;
      if (!bar) return;
      const y = window.scrollY || 0;
      const p = reduce ? 0 : y <= 0 ? 0 : y >= 48 ? 1 : y / 48;
      bar.style.transformOrigin = "bottom center";
      bar.style.transform = `scale(${1 - 0.16 * p})`;
      bar.style.opacity = String(1 - 0.06 * p);
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
              const accent = C(GROUP_ACCENT[g.group] ?? "lime");
              const groupName = t(`nav.group.${g.group}`) === `nav.group.${g.group}` ? g.group : t(`nav.group.${g.group}`);
              return (
              <div key={g.group} style={{ marginBottom: 18 }}>
                {/* Cluster header — accent marker + label (no count; parity with the mobile More tab + the drawer). */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 2, background: accent, flex: "none" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".16em", textTransform: "uppercase", color: C("ash") }}>{groupName}</span>
                </div>
                {/* Springboard grid — 4-col neutral bordered cells (icon + label inside),
                    section colour on the header marker, sand lock for premium. */}
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
        {/* Liquid-glass pill — a frosted blur lets the page fizz through, lighter
            than the classic .liquid-glass (translucent tint + a top rim highlight,
            no grain/sheen). */}
        <div ref={barRef} style={{ position: "relative", pointerEvents: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", maxWidth: 460, background: "color-mix(in srgb, var(--color-ink2) 62%, transparent)", backdropFilter: "blur(18px) saturate(1.2)", WebkitBackdropFilter: "blur(18px) saturate(1.2)", border: `1px solid color-mix(in srgb, var(--color-chalk) 12%, transparent)`, borderRadius: 999, padding: "9px 10px", boxShadow: "0 8px 28px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.14)" }}>
          {/* The single sliding highlight — springs between flat slots (transform),
              stretching mid-travel (scaleX, distance-scaled) for the liquid feel;
              sits behind the icons (zIndex 0). While Train is active it fades out
              in place (opacity) but stays MOUNTED, so the next selection travels
              instead of popping in. */}
          {ind && (
            <span
              aria-hidden
              style={{
                position: "absolute", left: 0, top: ind.top, width: 52, height: 52, borderRadius: 26,
                background: C("chalk"), transformOrigin: "center",
                transform: `translateX(${ind.x}px) scaleX(${stretch})`,
                opacity: indShown ? 1 : 0,
                transition: reduced ? "none" : "transform .34s cubic-bezier(.32,1.36,.44,1), opacity .18s ease",
                zIndex: 0, pointerEvents: "none",
              }}
            />
          )}
          {/* Today · Explore | [Train] | More · Profile */}
          {tabs.map((tab) => (
            <PillButton key={tab.id} innerRef={(el) => { flatRefs.current[tab.id] = el; }} icon={tab.icon} label={tab.id === "explore" ? t("nav.explore") : label(tab.id, tab.label)} active={tab.id === activeId} reduced={reduced} onClick={() => go(tab.id)} />
          ))}
          <TrainFab label={label("log", "Train")} active={activeId === "train" || activeId === "log"} onClick={() => go("train")} />
          <PillButton innerRef={(el) => { flatRefs.current.more = el; }} icon="grid" label={t("nav.more")} active={moreActive} reduced={reduced} onClick={() => setMoreOpen((v) => !v)} />
          <PillButton innerRef={(el) => { flatRefs.current.profile = el; }} icon="user-circle" label={t("nav.profile")} active={activeId === "profile"} reduced={reduced} onClick={() => go("profile")} />
        </div>
      </div>
    </>
  );
}

function PillButton({ icon, label, active, reduced, onClick, innerRef }: { icon: AuroraIconName; label: string; active: boolean; reduced: boolean; onClick: () => void; innerRef?: (el: HTMLButtonElement | null) => void }) {
  return (
    // zIndex 1 keeps the glyph above the shared sliding highlight; the highlight
    // itself (chalk pill) is drawn once in the bar, not per-button. The active
    // ink tint is a CROSSFADE overlay synced to the highlight's arrival — the
    // incoming glyph waits a beat (~.1s delay) so it lands WITH the sliding
    // pill; an instant flip reads as "icon changed, pill lagging" (the
    // Instagram-audit finding). Outgoing fades back immediately.
    <button ref={innerRef} onClick={onClick} aria-label={label} aria-pressed={active} style={{ position: "relative", zIndex: 1, flex: 1, height: 52, display: "grid", placeItems: "center", background: "transparent", border: "none", cursor: "pointer" }}>
      <span style={{ position: "relative", width: 52, height: 52, borderRadius: 26, display: "grid", placeItems: "center" }}>
        <AuroraIcon name={icon} size={22} strokeWidth={2.6} color={C("ash")} />
        <span
          aria-hidden
          style={{
            position: "absolute", inset: 0, display: "grid", placeItems: "center",
            opacity: active ? 1 : 0,
            transition: reduced ? "none" : active ? "opacity .2s ease .1s" : "opacity .12s ease",
          }}
        >
          <AuroraIcon name={icon} size={22} strokeWidth={2.6} color={C("ink")} />
        </span>
      </span>
    </button>
  );
}

/**
 * The elevated center Train action — a larger lime circle raised above the bar
 * (an ink ring + soft lime glow) with an inline dumbbell glyph, like the mockup.
 */
function TrainFab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={label} aria-pressed={active} style={{ position: "relative", zIndex: 1, flex: 1, height: 52, display: "grid", placeItems: "center", background: "transparent", border: "none", cursor: "pointer" }}>
      <span
        style={{
          width: 58, height: 58, borderRadius: "50%", display: "grid", placeItems: "center",
          background: C("lime"), border: `4px solid ${C("ink")}`,
          boxShadow: `0 10px 24px -6px color-mix(in srgb, var(--color-lime) 60%, transparent)${active ? `, 0 0 0 2px color-mix(in srgb, var(--color-lime) 40%, transparent)` : ""}`,
          transform: "translateY(-20px)",
        }}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke={C("ink")} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />
        </svg>
      </span>
    </button>
  );
}
