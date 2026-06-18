"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { groupedNav, navForPersona, navVisibleTo, sanitizePersonaAccess, type AuroraIconName } from "@hybrid/core";
import { usePersona } from "@/lib/persona";
import { useFlags } from "@/lib/use-flags";
import { useLang } from "@/lib/i18n";
import { useTemplate } from "@/lib/use-template";
import { AuroraIcon } from "./icons";

/**
 * AURORA pill nav (web) — the floating bottom pill bar, the web twin of the
 * mobile Aurora tab bar. In Aurora it REPLACES the classic left sidebar and
 * appears on every screen (the app-shell passes `onSelect`/`activeId` to drive
 * its in-shell screens; admin & the standalone tool routes render it bare, where
 * it routes to /app?screen=<id>). Self-gates to Aurora — renders null in Classic
 * — and reads persona/flags itself, so it can be dropped anywhere.
 *
 * Five primary destinations mirror mobile (Today · Cockpit · Train · History ·
 * More); "More" opens a sheet with the full persona-filtered nav, taking over
 * the sidebar's role.
 */
type Glyph = "grid" | "chart" | AuroraIconName;
const PRIMARY: { id: string; glyph: Glyph; label: string }[] = [
  { id: "today", glyph: "grid", label: "Today" },
  { id: "cockpit", glyph: "chart", label: "Cockpit" },
  { id: "log", glyph: "add", label: "Train" },
  { id: "history", glyph: "calendar", label: "History" },
];

const C = (v: string) => `var(--color-${v})`;

export default function AuroraPillNav({ activeId, onSelect }: { activeId?: string; onSelect?: (id: string) => void }) {
  const aurora = useTemplate().template === "aurora";
  const router = useRouter();
  const persona = usePersona();
  const { isEnabled, value } = useFlags();
  const { t } = useLang();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!aurora) return null;

  const access = sanitizePersonaAccess(value("access.personaNav"));
  const label = (id: string, fallback: string) => (t(`nav.${id}`) === `nav.${id}` ? fallback : t(`nav.${id}`));
  const go = (id: string) => {
    setMoreOpen(false);
    if (onSelect) onSelect(id);
    else router.push(`/app?screen=${id}`);
  };

  const tabs = PRIMARY.filter((p) => p.id !== "cockpit" || navVisibleTo(persona, "cockpit", access));
  const moreActive = moreOpen || (activeId != null && !tabs.some((tb) => tb.id === activeId));
  const groups = groupedNav(navForPersona(persona, undefined, access))
    .map((g) => ({ ...g, items: g.items.filter((it) => isEnabled(`nav.${it.id}`)) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      {/* MORE sheet — the full nav, replacing the sidebar's grouped list */}
      {moreOpen && (
        <div
          onClick={() => setMoreOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", fontFamily: "var(--font-display)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 720, maxHeight: "80vh", overflowY: "auto", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: "28px 28px 0 0", padding: "20px 20px 110px" }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 999, background: C("line"), margin: "0 auto 16px" }} />
            {groups.map((g) => (
              <div key={g.group} style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: C("ash"), marginBottom: 8 }}>
                  {t(`nav.group.${g.group}`) === `nav.group.${g.group}` ? g.group : t(`nav.group.${g.group}`)}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
                  {g.items.map(({ id, label: fb, icon }) => {
                    const on = id === activeId;
                    return (
                      <button
                        key={id}
                        onClick={() => go(id)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 16, cursor: "pointer", textAlign: "left", border: `1px solid ${on ? C("lime") : C("line")}`, background: on ? `${"var(--color-lime)"}1a` : C("ink"), color: on ? C("lime") : C("chalk"), fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600 }}
                      >
                        <span style={{ fontSize: 16 }}>{icon}</span>
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

      {/* The floating pill bar */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50, display: "flex", justifyContent: "center", padding: "0 18px 18px", pointerEvents: "none" }}>
        <div
          style={{
            pointerEvents: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            maxWidth: 460,
            background: C("ink2"),
            border: `1px solid ${C("line")}`,
            borderRadius: 999,
            padding: "9px 10px",
            boxShadow: "0 8px 28px rgba(0,0,0,.4)",
          }}
        >
          {tabs.map((tab) => (
            <PillButton key={tab.id} glyph={tab.glyph} label={label(tab.id, tab.label)} active={tab.id === activeId} onClick={() => go(tab.id)} />
          ))}
          <PillButton glyph="settings" label="More" active={moreActive} onClick={() => setMoreOpen((v) => !v)} />
        </div>
      </div>
    </>
  );
}

function PillButton({ glyph, label, active, onClick }: { glyph: Glyph; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      style={{ flex: 1, height: 52, display: "grid", placeItems: "center", background: "transparent", border: "none", cursor: "pointer" }}
    >
      <span style={{ width: 52, height: 52, borderRadius: 26, display: "grid", placeItems: "center", background: active ? C("chalk") : "transparent" }}>
        <Glyph glyph={glyph} size={22} color={active ? C("ink") : C("ash")} />
      </span>
    </button>
  );
}

// The home GRID and statistics-style CHART marks aren't in the icon set — draw
// them from primitives (crisp at any size), matching the mobile bar; everything
// else uses the shared Aurora line-icons.
function Glyph({ glyph, size, color }: { glyph: Glyph; size: number; color: string }) {
  if (glyph === "grid") {
    const cell = (size - 5) / 2;
    const sq = { width: cell, height: cell, borderRadius: Math.max(2, cell * 0.3), background: color } as const;
    return (
      <span style={{ width: size, height: size, display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignContent: "space-between" }}>
        <span style={sq} /><span style={sq} /><span style={sq} /><span style={sq} />
      </span>
    );
  }
  if (glyph === "chart") {
    const bw = (size - 6) / 4;
    const bar = (h: number) => ({ width: bw, height: size * h, borderRadius: bw / 2, background: color } as const);
    return (
      <span style={{ width: size, height: size, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <span style={bar(0.5)} /><span style={bar(0.82)} /><span style={bar(0.62)} /><span style={bar(1)} />
      </span>
    );
  }
  return <AuroraIcon name={glyph} size={size} color={color} />;
}
