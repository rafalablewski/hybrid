"use client";

import { useEffect, useMemo, useState } from "react";
import { fs, space, routineSummary, type SessionBlock } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import Sheet from "./sheet";
import { CtaLabel } from "./cta-label";

const C = (v: string) => `var(--color-${v})`;

/** A saved routine (WorkoutTemplate) as the client needs it here. */
export type QuickRoutine = {
  id: string;
  name: string;
  blocks: SessionBlock[];
  favourite?: boolean;
};

/**
 * AURORA Quick-start sheet (web) — the fourth "Train your way" path. Re-launch a
 * routine you already own in one tap: FAVOURITES ride a snap rail on top (inside
 * the sheet, so they respect its padding — bleed is only for screen-level rails),
 * the rest sit under a shuffle-able "Rediscover" list. Each card/row starts the
 * session immediately via onLaunch; the ★ toggles the favourite. Mirrors the
 * mobile sheet (aurora/quick-start.tsx). Driven by the shared Sheet primitive.
 */
export default function QuickStartSheet({
  open,
  onClose,
  routines,
  onLaunch,
  onToggleFavourite,
  onBuildNew,
}: {
  open: boolean;
  onClose: () => void;
  routines: QuickRoutine[];
  onLaunch: (r: QuickRoutine) => void;
  onToggleFavourite: (r: QuickRoutine) => void;
  onBuildNew: () => void;
}) {
  const { t } = useLang();

  const favourites = useMemo(() => routines.filter((r) => r.favourite), [routines]);
  const rest = useMemo(() => routines.filter((r) => !r.favourite), [routines]);

  // "Rediscover" = the non-favourites in a shuffled order. Re-roll on demand; a
  // fresh order is also picked whenever the pool changes (e.g. star a routine).
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    setOrder(shuffle(rest.map((r) => r.id)));
  }, [rest]);
  const rediscover = useMemo(() => {
    const byId = new Map(rest.map((r) => [r.id, r] as const));
    const seq = order.map((id) => byId.get(id)).filter(Boolean) as QuickRoutine[];
    // Any not yet in `order` (race on first paint) fall in after.
    for (const r of rest) if (!order.includes(r.id)) seq.push(r);
    return seq;
  }, [rest, order]);

  return (
    <Sheet open={open} onClose={onClose} title={t("w.home.quickStart.title")} sub={t("w.home.quickStart.sub")}>
      {routines.length === 0 ? (
        <div style={{ padding: "16px 2px 8px" }}>
          <div style={{ fontWeight: 700, fontSize: fs.subtitle, color: C("chalk") }}>{t("w.home.quickStart.empty")}</div>
          <div style={{ fontSize: fs.note, color: C("ash"), marginTop: 6, lineHeight: 1.5 }}>{t("w.home.quickStart.emptySub")}</div>
        </div>
      ) : (
        <>
          {favourites.length > 0 && (
            <div style={{ marginBottom: rediscover.length > 0 ? 16 : 4 }}>
              <SubHead label={`★ ${t("w.home.quickStart.favourites")}`} />
              {/* Favourites rail — snap slider that RESPECTS the sheet padding
                  (no negative-margin bleed): a rail hosted in a Sheet honours its
                  container, per the full-bleed rule. */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  overflowX: "auto",
                  scrollSnapType: "x mandatory",
                  scrollbarWidth: "none",
                  padding: "2px 0 8px",
                }}
              >
                {favourites.map((r) => (
                  <FavouriteCard key={r.id} r={r} t={t} onLaunch={() => onLaunch(r)} onToggleFav={() => onToggleFavourite(r)} />
                ))}
              </div>
            </div>
          )}

          {rediscover.length > 0 && (
            <div>
              <SubHead
                label={favourites.length > 0 ? t("w.home.quickStart.rediscover") : t("w.home.quickStart.all")}
                action={
                  rediscover.length > 1
                    ? { label: `↻ ${t("w.home.quickStart.shuffle")}`, onClick: () => setOrder(shuffle(rest.map((x) => x.id))) }
                    : undefined
                }
              />
              <div>
                {rediscover.map((r, i) => (
                  <RoutineRow key={r.id} r={r} i={i} t={t} onLaunch={() => onLaunch(r)} onToggleFav={() => onToggleFavourite(r)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <button className="pressable"
        onClick={() => { onClose(); onBuildNew(); }}
        style={{
          marginTop: 16,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          background: "transparent",
          border: `1px dashed ${C("line")}`,
          borderRadius: 16,
          padding: "12px",
          color: C("ash"),
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          letterSpacing: ".08em",
        }}
      >
        ＋ {t("w.home.quickStart.buildNew")}
      </button>
    </Sheet>
  );
}

// ── pieces ────────────────────────────────────────────────────────────────

function SubHead({ label, action }: { label: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "6px 2px 10px" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{label}</span>
      {action && (
        <button className="pressable"
          onClick={action.onClick}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: ".08em",
            color: "var(--violet-text)",
            background: "color-mix(in srgb, var(--color-violet) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--color-violet) 32%, transparent)",
            borderRadius: 999,
            padding: "5px 12px",
            cursor: "pointer",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/** The routine's honest one-liner: "6 moves" (+ " – 34 min" when the routine
 *  actually carries cardio/conditioning minutes). No fabricated durations. */
function metaLine(blocks: SessionBlock[], t: (k: string) => string): string {
  const { moves, minutes } = routineSummary(blocks);
  const movesLabel = moves === 1 ? t("w.home.quickStart.oneMove") : t("w.home.quickStart.moves").replace("{n}", String(moves));
  if (minutes != null) return `${movesLabel} – ${t("w.home.quickStart.min").replace("{n}", String(minutes))}`;
  return movesLabel;
}

const GLYPHS = ["◧", "⬡", "◇", "▦", "◆", "⬢"];
const ACCENTS = ["blue", "lime", "amber", "violet"] as const;
/** A stable per-routine glyph + accent from its id, so a routine looks the same
 *  every time without storing decoration. */
function decor(id: string): { glyph: string; accent: string } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return { glyph: GLYPHS[h % GLYPHS.length]!, accent: ACCENTS[h % ACCENTS.length]! };
}

function Star({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button className="pressable"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={label}
      aria-pressed={on}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 2,
        lineHeight: 1,
        fontSize: 14,
        color: on ? C("amber") : C("ash"),
        opacity: on ? 1 : 0.55,
      }}
    >
      {on ? "★" : "☆"}
    </button>
  );
}

function FavouriteCard({ r, t, onLaunch, onToggleFav }: { r: QuickRoutine; t: (k: string) => string; onLaunch: () => void; onToggleFav: () => void }) {
  const { glyph, accent } = decor(r.id);
  const fill = C(accent);
  const text = `var(--${accent}-text)`;
  return (
    <button className="pressable"
      onClick={onLaunch}
      aria-label={r.name}
      style={{
        position: "relative",
        overflow: "hidden",
        scrollSnapAlign: "start",
        flex: "0 0 66%",
        minWidth: "66%",
        textAlign: "left",
        border: `1px solid ${C("line")}`,
        borderRadius: 28,
        padding: 16,
        cursor: "pointer",
        color: C("chalk"),
        background: `radial-gradient(120% 80% at 90% -12%, color-mix(in srgb, ${fill} 16%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, ${fill} 6%, ${C("ink2")}), ${C("ink2")})`,
      }}
    >
      <div style={{ position: "absolute", top: 10, right: 10 }}>
        <Star on={!!r.favourite} label={t("w.home.quickStart.removeFav")} onClick={onToggleFav} />
      </div>
      <span aria-hidden style={{ fontSize: 16, lineHeight: 1, color: text }}>{glyph}</span>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 15, letterSpacing: "-.01em", marginTop: 10, paddingRight: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), marginTop: 5 }}>{metaLine(r.blocks, t)}</div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: text, marginTop: 12, display: "block" }}><CtaLabel size={12}>{`${t("w.home.quickStart.start")} →`}</CtaLabel></span>
    </button>
  );
}

function RoutineRow({ r, i, t, onLaunch, onToggleFav }: { r: QuickRoutine; i: number; t: (k: string) => string; onLaunch: () => void; onToggleFav: () => void }) {
  const { glyph, accent } = decor(r.id);
  const fill = C(accent);
  const text = `var(--${accent}-text)`;
  return (
    <div
      onClick={onLaunch}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onLaunch(); } }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 2px",
        borderTop: i ? `1px solid ${C("line")}` : "none",
        cursor: "pointer",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 36,
          height: 36,
          flex: "0 0 auto",
          borderRadius: 12,
          display: "grid",
          placeItems: "center",
          fontSize: 15,
          color: text,
          background: `color-mix(in srgb, ${fill} 13%, ${C("ink2")})`,
          border: `1px solid color-mix(in srgb, ${fill} 26%, transparent)`,
        }}
      >
        {glyph}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: fs.body, color: C("chalk"), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), marginTop: 2 }}>{metaLine(r.blocks, t)}</div>
      </div>
      <Star on={!!r.favourite} label={r.favourite ? t("w.home.quickStart.removeFav") : t("w.home.quickStart.addFav")} onClick={onToggleFav} />
      <span aria-hidden style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: C("ash") }}>›</span>
    </div>
  );
}

/** Fisher–Yates, non-mutating. */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}
