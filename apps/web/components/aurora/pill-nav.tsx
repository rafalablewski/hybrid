"use client";

import { useState } from "react";
import { fs, space, groupedNavWithLocks, sanitizePersonaAccess, AURORA_NAV_ICONS, FUNNEL, type AuroraIconName } from "@hybrid/core";
import { usePersona } from "@/lib/persona";
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

export default function AuroraPillNav({ activeId, onSelect }: { activeId?: string; onSelect: (id: string) => void }) {
  const aurora = useTemplate().template === "aurora";
  const persona = usePersona();
  const { isEnabled, value } = useFlags();
  const { t } = useLang();
  const [moreOpen, setMoreOpen] = useState(false);
  const dialogRef = useDialog<HTMLDivElement>(() => setMoreOpen(false), moreOpen);

  if (!aurora) return null;

  const access = sanitizePersonaAccess(value("access.personaNav"));
  const label = (id: string, fallback: string) => (t(`nav.${id}`) === `nav.${id}` ? fallback : t(`nav.${id}`));
  const go = (id: string) => { setMoreOpen(false); onSelect(id); };

  const tabs = PRIMARY;
  // "More" lights only when the active screen isn't one of the bar slots
  // (Today, Explore/feed, Train/log, Profile) and the sheet isn't explicitly
  // open. Profile is now a bar slot (right of More); everything else (Plans,
  // History, Cockpit, …) lives in the More sheet, so landing on those lights
  // "More".
  const barIds = new Set<string>([...tabs.map((t) => t.id), "log", "profile"]);
  const moreActive = moreOpen || (activeId != null && !barIds.has(activeId));
  // Premium (Full) items a free user hasn't unlocked show LOCKED (🔒) here rather
  // than hidden, so the whole toolkit is visible; a locked tile upsells.
  const groups = groupedNavWithLocks(persona, access)
    .map((g) => ({ ...g, items: g.items.filter((x) => isEnabled(`nav.${x.item.id}`)) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      {moreOpen && (
        <div onClick={() => setMoreOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: "var(--font-display)" }}>
          <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1} onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 720, maxHeight: "80vh", overflowY: "auto", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: "28px 28px 0 0", padding: "20px 20px 110px" }}>
            <div style={{ width: 40, height: 4, borderRadius: 999, background: C("line"), margin: "0 auto 16px" }} />

            {/* Unlock Full — the one accent in the hub (parity with the mobile
                More tab's membership card). Casual users only. */}
            {persona === "casual" && isEnabled("nav.upgrade") && (
              <button
                onClick={() => { track(FUNNEL.upgradeEntryClick, { client: "web", source: "more" }); go("upgrade"); }}
                style={{ position: "relative", overflow: "hidden", display: "block", width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 18, padding: 18, borderRadius: 22, background: C("ink"), border: `1px solid color-mix(in srgb, var(--color-lime) 50%, transparent)`, boxShadow: "0 10px 26px -10px color-mix(in srgb, var(--color-lime) 32%, transparent)" }}
              >
                <span style={{ position: "absolute", top: -54, right: -44, width: 168, height: 168, borderRadius: 84, background: "color-mix(in srgb, var(--color-lime) 16%, transparent)", pointerEvents: "none" }} />
                <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".2em", color: C("lime") }}>{t("w.home.pillnav.upgradeKicker")}</span>
                <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 22, color: C("chalk"), marginTop: 8, letterSpacing: "-.02em" }}>{t("nav.upgrade")}</span>
                <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 5, maxWidth: 240 }}>{t("w.home.pillnav.upgradeBlurb")}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: space.sm, marginTop: 14, background: C("lime"), color: C("ink"), borderRadius: 999, padding: "9px 18px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body }}>{t("w.home.pillnav.goFull")}</span>
              </button>
            )}

            {groups.map((g) => (
              <div key={g.group} style={{ marginBottom: 18 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".16em", textTransform: "uppercase", color: C("ash"), marginBottom: 8 }}>
                  {t(`nav.group.${g.group}`) === `nav.group.${g.group}` ? g.group : t(`nav.group.${g.group}`)}
                </div>
                {/* Springboard grid — rounded glyph tiles, one text colour (chalk),
                    matching the mobile More tab. Active tile takes the lime accent. */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: space.xxs }}>
                  {g.items.map(({ item: { id, label: fb }, locked }) => {
                    const on = id === activeId;
                    const openItem = () => { if (locked) { track(FUNNEL.upgradeEntryClick, { client: "web", source: `more-${id}` }); go("upgrade"); } else go(id); };
                    return (
                      <button key={id} onClick={openItem} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: space.sm, padding: "10px 2px", background: "transparent", border: "none", cursor: "pointer" }}>
                        <span style={{ position: "relative", width: 54, height: 54, borderRadius: 18, display: "grid", placeItems: "center", border: `1px solid ${on ? C("lime") : C("line")}`, background: on ? "color-mix(in srgb, var(--color-lime) 12%, transparent)" : C("ink"), opacity: locked ? 0.75 : 1 }}>
                          <AuroraIcon name={AURORA_NAV_ICONS[id] ?? "info"} size={22} strokeWidth={2.6} color={on ? C("lime") : C("chalk")} />
                          {locked && <span aria-hidden style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, background: C("ink2"), border: `1px solid color-mix(in srgb, var(--color-lime) 55%, transparent)`, display: "grid", placeItems: "center", fontSize: 10 }}>🔒</span>}
                        </span>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: fs.micro, fontWeight: 600, color: on ? C("lime") : locked ? C("ash") : C("chalk"), textAlign: "center", lineHeight: 1.2, maxWidth: 84, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label(id, fb)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50, display: "flex", justifyContent: "center", padding: "0 18px 18px", pointerEvents: "none" }}>
        {/* Liquid-glass pill — a frosted blur lets the page fizz through, lighter
            than the classic .liquid-glass (translucent tint + a top rim highlight,
            no grain/sheen). */}
        <div style={{ pointerEvents: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", maxWidth: 460, background: "color-mix(in srgb, var(--color-ink2) 62%, transparent)", backdropFilter: "blur(18px) saturate(1.2)", WebkitBackdropFilter: "blur(18px) saturate(1.2)", border: `1px solid color-mix(in srgb, var(--color-chalk) 12%, transparent)`, borderRadius: 999, padding: "9px 10px", boxShadow: "0 8px 28px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.14)" }}>
          {/* Today · Explore | [Train] | More · Profile */}
          {tabs.map((tab) => (
            <PillButton key={tab.id} icon={tab.icon} label={tab.id === "explore" ? t("nav.explore") : label(tab.id, tab.label)} active={tab.id === activeId} onClick={() => go(tab.id)} />
          ))}
          <TrainFab label={label("log", "Train")} active={activeId === "log"} onClick={() => go("log")} />
          <PillButton icon="settings" label={t("nav.more")} active={moreActive} onClick={() => setMoreOpen((v) => !v)} />
          <PillButton icon="user-circle" label={t("nav.profile")} active={activeId === "profile"} onClick={() => go("profile")} />
        </div>
      </div>
    </>
  );
}

function PillButton({ icon, label, active, onClick }: { icon: AuroraIconName; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={label} aria-pressed={active} style={{ flex: 1, height: 52, display: "grid", placeItems: "center", background: "transparent", border: "none", cursor: "pointer" }}>
      <span style={{ width: 52, height: 52, borderRadius: 26, display: "grid", placeItems: "center", background: active ? C("chalk") : "transparent" }}>
        <AuroraIcon name={icon} size={22} strokeWidth={2.6} color={active ? C("ink") : C("ash")} />
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
    <button onClick={onClick} aria-label={label} aria-pressed={active} style={{ flex: 1, height: 52, display: "grid", placeItems: "center", background: "transparent", border: "none", cursor: "pointer" }}>
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
