"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  fs,
  space,
  groupedNavWithLocks,
  sanitizePersonaAccess,
  AURORA_NAV_ICONS,
  SIDE_MENU_PRIMARY,
  SIDE_MENU_FOOTER,
  SIDE_MENU_NAMED_IDS,
  SIDE_MENU_WIDTH,
  FUNNEL,
  type SideMenuRow,
  type TodayTabId,
} from "@hybrid/core";
import { accentText } from "@/lib/ui";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useFlags } from "@/lib/use-flags";
import { useLang } from "@/lib/i18n";
import { track } from "@/lib/track";
import { useDialog } from "@/lib/use-dialog";
import { AuroraIcon } from "./icons";
import { HubGlyph } from "./today-tabs";

/**
 * THE SIDE MENU (web) — the drawer behind the Today header's avatar, the web
 * twin of apps/mobile/components/aurora/side-menu.tsx. Rows, order and targets
 * come from @hybrid/core side-menu.ts, so the two clients cannot drift.
 *
 * It slides in from the LEFT edge, under a scrim, and it is where the app's
 * navigation-by-name lives now that the bottom bar spends its fifth slot on
 * Messages rather than on a springboard (see nav-bar.ts). Three bands:
 *   • IDENTITY — who you are, tapping through to Profile.
 *   • THE PRIMARY LIST — Profile, History, the three hub views, Nutrition. The
 *     hub rows switch Today in place (the drawer lives inside the hub), so
 *     "Performance" here and the middle pill above the calendar do one thing.
 *   • ALL TOOLS — the full persona-filtered nav, the springboard the More tab
 *     used to hold. It GROWS IN PLACE behind a bare ＋ (never an arrow: there
 *     is no destination behind it), and it is what keeps every screen reachable
 *     now that More is gone.
 *   • THE FOOTER — Connections, Settings and privacy, Help center, smaller,
 *     then Sign out.
 *
 * It PORTALS to <body>: the app shell is a transformed surface
 * (.motion-recede-host), and a position:fixed panel inside a transformed
 * ancestor is trapped by it.
 */

const C = (v: string) => `var(--color-${v})`;

/** The drawer panel's own inset. Deliberately NOT the page gutter: the panel is
 *  its own container floating over the screen, so it sets its own padding. The
 *  mobile twin uses the same 16. */
const PANEL_PAD = 16;

export default function AuroraSideMenu({
  open,
  onClose,
  onNavigate,
  onHubTab,
  activeHub,
}: {
  open: boolean;
  onClose: () => void;
  /** Canonical nav id → the app-shell screen (upgrade opens the paywall sheet). */
  onNavigate: (id: string) => void;
  /** Switch the Today hub in place. */
  onHubTab: (tab: TodayTabId) => void;
  /** Which hub view is showing, so its row reads as the current one. */
  activeHub: TodayTabId;
}) {
  const { session, logout } = useSession();
  const persona = usePersona();
  const router = useRouter();
  const { isEnabled, value } = useFlags();
  const { t } = useLang();
  const [toolsOpen, setToolsOpen] = useState(false);
  const panelRef = useDialog<HTMLDivElement>(onClose, open);
  // The panel is only in the DOM while it can be seen, so a closed drawer costs
  // nothing and its focus trap is never armed. `mounted` guards the portal
  // against SSR (document does not exist on the server).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // A fresh open starts with the toolbox shut — an expander that remembers
  // being open turns the drawer into the springboard it replaced.
  useEffect(() => { if (!open) setToolsOpen(false); }, [open]);
  // The page behind must not scroll under an open drawer.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!mounted || !open || !session) return null;

  const label = (id: string, fallback: string) => (t(`nav.${id}`) === `nav.${id}` ? fallback : t(`nav.${id}`));
  const initials = (session.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!).join("") || "·").toUpperCase();

  const go = (id: string) => { onClose(); onNavigate(id); };
  const pick = (row: SideMenuRow) => {
    if (row.target.kind === "hub") { onClose(); onHubTab(row.target.tab); return; }
    go(row.target.screen);
  };
  const signOut = () => { onClose(); logout(); router.replace("/login"); };

  // ALL TOOLS — everything the persona may see that the drawer has not already
  // named. Premium items a free user hasn't unlocked stay VISIBLE with a lock
  // and route to the paywall, so the whole toolkit is legible from here.
  const named = new Set<string>(SIDE_MENU_NAMED_IDS);
  const groups = groupedNavWithLocks(persona, sanitizePersonaAccess(value("access.personaNav")))
    .map((g) => ({ ...g, items: g.items.filter((x) => isEnabled(`nav.${x.item.id}`) && !named.has(x.item.id)) }))
    .filter((g) => g.items.length > 0);
  const toolCount = groups.reduce((n, g) => n + g.items.length, 0);

  const rowBtn = (row: SideMenuRow, small: boolean) => {
    const active = row.target.kind === "hub" && row.target.tab === activeHub;
    const tint = active ? C("lime") : C("chalk");
    return (
      <button
        className="pressable"
        key={row.id}
        onClick={() => pick(row)}
        aria-current={active ? "page" : undefined}
        style={{
          display: "flex", alignItems: "center", gap: small ? 12 : 14, width: "100%",
          padding: small ? "9px 4px" : "12px 4px",
          background: "none", border: "none", cursor: "pointer", textAlign: "left",
          color: small ? C("ash") : tint,
        }}
      >
        <span style={{ display: "grid", placeItems: "center", width: small ? 20 : 24, height: small ? 20 : 24, flexShrink: 0, color: small ? C("ash") : tint }}>
          {row.hub
            ? <HubGlyph name={row.hub} size={small ? 18 : 22} strokeWidth={small ? 4 : 3.6} />
            : <AuroraIcon name={row.icon ?? "info"} size={small ? 18 : 22} strokeWidth={small ? 4 : 3.6} color="currentColor" />}
        </span>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: small ? 600 : 800, fontSize: small ? fs.body : fs.title, letterSpacing: small ? 0 : "-.01em" }}>
          {t(row.labelKey) === row.labelKey ? row.label : t(row.labelKey)}
        </span>
      </button>
    );
  };

  return createPortal(
    <>
      <div
        onClick={onClose}
        aria-hidden
        style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(0,0,0,.55)", backdropFilter: "blur(2px)" }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("nav.primary")}
        tabIndex={-1}
        className="motion-side-menu"
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 71,
          width: SIDE_MENU_WIDTH, maxWidth: "86vw",
          display: "flex", flexDirection: "column",
          background: C("ink"), borderRight: `1px solid ${C("line")}`,
          boxShadow: "0 24px 60px -20px rgba(0,0,0,.7)",
          fontFamily: "var(--font-display)", outline: "none",
        }}
      >
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: `max(20px, env(safe-area-inset-top, 0px)) ${PANEL_PAD}px max(20px, env(safe-area-inset-bottom, 0px))` }}>
          {/* IDENTITY — the avatar again (you opened the drawer from it), the
              name, and what the account is. Tapping it goes to Profile, which
              is also the list's first row: the header is the FACE, the row is
              the destination, and people reach for both. */}
          <button
            className="pressable"
            onClick={() => go("profile")}
            style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 18 }}
          >
            <span style={{ display: "grid", placeItems: "center", width: 46, height: 46, borderRadius: 999, background: "color-mix(in srgb, var(--color-lime) 13%, transparent)", border: `1px solid ${C("lime")}`, fontWeight: 900, fontSize: fs.subtitle, color: accentText("lime") }}>{initials}</span>
            <span style={{ display: "block", marginTop: 10, fontWeight: 800, fontSize: fs.heading, letterSpacing: "-.02em", color: C("chalk"), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{session.name || t("nav.you")}</span>
            <span style={{ display: "block", marginTop: 3, fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>
              {[session.role.toUpperCase(), session.entitlement === "paid" ? "FULL" : "FREE"].join(" – ")}
            </span>
          </button>

          {/* THE PRIMARY LIST */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {SIDE_MENU_PRIMARY.map((row) => rowBtn(row, false))}
          </div>

          {/* ALL TOOLS — grows in place. A bare ＋/− with an ash count, never a
              ringed arrow: nothing opens, the list unfolds where it stands. */}
          {toolCount > 0 && (
            <>
              <button
                className="pressable"
                onClick={() => setToolsOpen((v) => !v)}
                aria-expanded={toolsOpen}
                style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", marginTop: 10, padding: "12px 4px", background: "none", border: "none", cursor: "pointer", textAlign: "left", color: C("ash") }}
              >
                <span aria-hidden style={{ width: 24, display: "grid", placeItems: "center", fontFamily: "var(--font-mono)", fontSize: 20, lineHeight: 1, color: C("ash") }}>{toolsOpen ? "−" : "＋"}</span>
                <span style={{ flex: 1, fontWeight: 700, fontSize: fs.bodyLg, color: C("ash") }}>{t("nav.allTools")}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>{toolCount}</span>
              </button>

              {toolsOpen && (
                <div style={{ paddingLeft: 38, paddingBottom: 6 }}>
                  {groups.map((g) => (
                    <div key={g.group} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0 4px" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>
                          {t(`nav.group.${g.group}`) === `nav.group.${g.group}` ? g.group : t(`nav.group.${g.group}`)}
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{g.items.length}</span>
                      </div>
                      {g.items.map(({ item, locked }) => {
                        const name = label(item.id, item.label);
                        return (
                          <button
                            className="pressable"
                            key={item.id}
                            onClick={() => {
                              if (locked) { track(FUNNEL.upgradeEntryClick, { client: "web", source: `sidemenu-${item.id}` }); go("upgrade"); return; }
                              go(item.id === "log" ? "train" : item.id);
                            }}
                            aria-label={locked ? `${name} (Full)` : name}
                            style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "8px 0", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                          >
                            <AuroraIcon name={AURORA_NAV_ICONS[item.id] ?? "info"} size={17} strokeWidth={4.5} color={locked ? C("ash") : C("chalk")} />
                            <span style={{ flex: 1, fontWeight: 600, fontSize: fs.body, color: locked ? C("ash") : C("chalk") }}>{name}</span>
                            {locked && <AuroraIcon name="lock" size={12} strokeWidth={4.5} color="var(--premium-accent-text)" />}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* UNLOCK FULL — the one accent in the drawer, casual users only. */}
          {persona === "casual" && isEnabled("nav.upgrade") && (
            <button
              className="pressable"
              onClick={() => { track(FUNNEL.upgradeEntryClick, { client: "web", source: "sidemenu" }); go("upgrade"); }}
              style={{ position: "relative", overflow: "hidden", display: "block", width: "100%", textAlign: "left", cursor: "pointer", marginTop: 14, padding: 16, borderRadius: 22, background: C("ink2"), border: `1px solid color-mix(in srgb, var(--premium-accent) 50%, transparent)` }}
            >
              <span aria-hidden style={{ position: "absolute", top: -50, right: -40, width: 150, height: 150, borderRadius: 75, background: "color-mix(in srgb, var(--premium-accent) 16%, transparent)", pointerEvents: "none" }} />
              <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".12em", color: "var(--premium-accent-text)" }}>{t("w.home.pillnav.upgradeKicker")}</span>
              <span style={{ display: "block", fontWeight: 900, fontSize: 20, color: C("chalk"), marginTop: 6, letterSpacing: "-.02em" }}>{t("nav.upgrade")}</span>
              <span style={{ display: "inline-flex", alignItems: "center", marginTop: 12, background: "var(--premium-accent)", color: "var(--premium-accent-ink)", borderRadius: 999, padding: "7px 14px", fontWeight: 700, fontSize: fs.note }}>{t("w.home.pillnav.goFull")}</span>
            </button>
          )}

          {/* ADMIN — operators only, and it leaves the app shell entirely. */}
          {session.role === "admin" && (
            <button
              className="pressable"
              onClick={() => { onClose(); router.push("/admin"); }}
              style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", marginTop: 14, padding: "10px 4px", background: "none", border: "none", cursor: "pointer", textAlign: "left", color: "var(--amber-text)" }}
            >
              <AuroraIcon name="verified" size={18} strokeWidth={4} color="var(--amber-text)" />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 700 }}>Admin console</span>
            </button>
          )}

          {/* THE FOOTER — same rows, smaller: about the account, not the training.
              Separated by whitespace, never a hairline rule. */}
          <div style={{ display: "flex", flexDirection: "column", marginTop: 22 }}>
            {SIDE_MENU_FOOTER.map((row) => rowBtn(row, true))}
            <button
              className="pressable"
              onClick={signOut}
              style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "9px 4px", marginTop: 2, background: "none", border: "none", cursor: "pointer", textAlign: "left", color: C("ash") }}
            >
              <span style={{ display: "grid", placeItems: "center", width: 20, height: 20, flexShrink: 0 }}>
                <AuroraIcon name="logout" size={18} strokeWidth={4} color={C("ash")} />
              </span>
              <span style={{ fontWeight: 600, fontSize: fs.body }}>{t("common.signout")}</span>
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
