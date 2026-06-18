"use client";

import { useState } from "react";
import { groupedNav, navForPersona, navVisibleTo, sanitizePersonaAccess, AURORA_NAV_ICONS, type AuroraIconName } from "@hybrid/core";
import { usePersona } from "@/lib/persona";
import { useFlags } from "@/lib/use-flags";
import { useLang } from "@/lib/i18n";
import { useTemplate } from "@/lib/use-template";
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
            {groups.map((g) => (
              <div key={g.group} style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: C("ash"), marginBottom: 8 }}>
                  {t(`nav.group.${g.group}`) === `nav.group.${g.group}` ? g.group : t(`nav.group.${g.group}`)}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                  {g.items.map(({ id, label: fb }) => {
                    const on = id === activeId;
                    return (
                      <button key={id} onClick={() => go(id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 16, cursor: "pointer", textAlign: "left", border: `1px solid ${on ? C("lime") : C("line")}`, background: on ? "color-mix(in srgb, var(--color-lime) 12%, transparent)" : C("ink"), color: on ? C("lime") : C("chalk"), fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600 }}>
                        <AuroraIcon name={AURORA_NAV_ICONS[id] ?? "info"} size={18} strokeWidth={2.6} color={on ? C("lime") : C("ash")} />
                        {label(id, fb)}
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
        <div style={{ pointerEvents: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", maxWidth: 460, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: "9px 10px", boxShadow: "0 8px 28px rgba(0,0,0,.4)" }}>
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
