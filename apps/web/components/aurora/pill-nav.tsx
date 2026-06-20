"use client";

import { useState } from "react";
import { groupedNav, navForPersona, navVisibleTo, sanitizePersonaAccess, AURORA_NAV_ICONS, FUNNEL, type AuroraIconName } from "@hybrid/core";
import { usePersona } from "@/lib/persona";
import { useFlags } from "@/lib/use-flags";
import { useLang } from "@/lib/i18n";
import { useTemplate } from "@/lib/use-template";
import { track } from "@/lib/track";
import { AuroraIcon } from "./icons";

/**
 * AURORA pill nav (web) — the floating bottom pill bar, the web twin of the
 * mobile Aurora tab bar. On web it COEXISTS with the left sidebar (the sidebar
 * is the full nav; this is quick-access to the five funnel destinations). Self-
 * gates to Aurora (renders null in Classic). Glyphs are the uploaded design-kit
 * line icons only. "More" opens a sheet with the full persona-filtered nav.
 */
const PRIMARY: { id: string; icon: AuroraIconName; label: string }[] = [
  { id: "today", icon: "village", label: "Today" },
  { id: "cockpit", icon: "user-circle", label: "Cockpit" },
  { id: "log", icon: "list-add", label: "Train" },
  { id: "history", icon: "copy", label: "History" },
];

const C = (v: string) => `var(--color-${v})`;

export default function AuroraPillNav({ activeId, onSelect }: { activeId?: string; onSelect: (id: string) => void }) {
  const aurora = useTemplate().template === "aurora";
  const persona = usePersona();
  const { isEnabled, value } = useFlags();
  const { t } = useLang();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!aurora) return null;

  const access = sanitizePersonaAccess(value("access.personaNav"));
  const label = (id: string, fallback: string) => (t(`nav.${id}`) === `nav.${id}` ? fallback : t(`nav.${id}`));
  const go = (id: string) => { setMoreOpen(false); onSelect(id); };

  const tabs = PRIMARY.filter((p) => p.id !== "cockpit" || navVisibleTo(persona, "cockpit", access));
  const moreActive = moreOpen || (activeId != null && !tabs.some((tb) => tb.id === activeId));
  const groups = groupedNav(navForPersona(persona, undefined, access))
    .map((g) => ({ ...g, items: g.items.filter((it) => isEnabled(`nav.${it.id}`)) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      {moreOpen && (
        <div onClick={() => setMoreOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: "var(--font-display)" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 720, maxHeight: "80vh", overflowY: "auto", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: "28px 28px 0 0", padding: "20px 20px 110px" }}>
            <div style={{ width: 40, height: 4, borderRadius: 999, background: C("line"), margin: "0 auto 16px" }} />

            {/* Unlock Full — the one accent in the hub (parity with the mobile
                More tab's membership card). Casual users only. */}
            {persona === "casual" && isEnabled("nav.upgrade") && (
              <button
                onClick={() => { track(FUNNEL.upgradeEntryClick, { client: "web", source: "more" }); go("upgrade"); }}
                style={{ position: "relative", overflow: "hidden", display: "block", width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 18, padding: 18, borderRadius: 22, background: C("ink"), border: `1px solid color-mix(in srgb, var(--color-lime) 50%, transparent)`, boxShadow: "0 10px 26px -10px color-mix(in srgb, var(--color-lime) 32%, transparent)" }}
              >
                <span style={{ position: "absolute", top: -54, right: -44, width: 168, height: 168, borderRadius: 84, background: "color-mix(in srgb, var(--color-lime) 16%, transparent)", pointerEvents: "none" }} />
                <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".2em", color: C("lime") }}>UPGRADE</span>
                <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 22, color: C("chalk"), marginTop: 8, letterSpacing: "-.02em" }}>Unlock Full</span>
                <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), marginTop: 5, maxWidth: 240 }}>Plans, analytics, your Twin, the Cockpit &amp; 12+ tools.</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 14, background: C("lime"), color: C("ink"), borderRadius: 999, padding: "9px 18px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13 }}>Go Full →</span>
              </button>
            )}

            {groups.map((g) => (
              <div key={g.group} style={{ marginBottom: 18 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: C("ash"), marginBottom: 8 }}>
                  {t(`nav.group.${g.group}`) === `nav.group.${g.group}` ? g.group : t(`nav.group.${g.group}`)}
                </div>
                {/* Springboard grid — rounded glyph tiles, one text colour (chalk),
                    matching the mobile More tab. Active tile takes the lime accent. */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 4 }}>
                  {g.items.map(({ id, label: fb }) => {
                    const on = id === activeId;
                    return (
                      <button key={id} onClick={() => go(id)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "10px 2px", background: "transparent", border: "none", cursor: "pointer" }}>
                        <span style={{ width: 54, height: 54, borderRadius: 18, display: "grid", placeItems: "center", border: `1px solid ${on ? C("lime") : C("line")}`, background: on ? "color-mix(in srgb, var(--color-lime) 12%, transparent)" : C("ink") }}>
                          <AuroraIcon name={AURORA_NAV_ICONS[id] ?? "info"} size={22} strokeWidth={2.6} color={on ? C("lime") : C("chalk")} />
                        </span>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 600, color: on ? C("lime") : C("chalk"), textAlign: "center", lineHeight: 1.2, maxWidth: 84, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label(id, fb)}</span>
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
          {tabs.map((tab) => (
            <PillButton key={tab.id} icon={tab.icon} label={label(tab.id, tab.label)} active={tab.id === activeId} onClick={() => go(tab.id)} />
          ))}
          <PillButton icon="settings" label="More" active={moreActive} onClick={() => setMoreOpen((v) => !v)} />
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
