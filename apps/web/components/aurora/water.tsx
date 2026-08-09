"use client";

import { useState } from "react";
import {
  formatVolume,
  hydrationPresets,
  hydrationVessels,
  type Hydration,
  type HydrationPreset,
} from "@hybrid/core";
import { fs, CARD_PAD } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";
import Sheet from "./sheet";
import type { WeightUnit } from "@hybrid/core";

const C = (v: string) => `var(--color-${v})`;

/**
 * WATER (web) — the twin of apps/mobile/components/aurora/water.tsx.
 *
 * `water` was a SignalKind and a NutritionDay field from the beginning and
 * neither client ever wrote or drew one, so the day's hydration silently summed
 * zeros. Every figure here comes from @hybrid/core's hydration engine, so the
 * phone and the browser cannot disagree about the target, the pace or the state.
 *
 * THE VESSEL ROW, not a fourth macro hairline. Under the calorie ring sit three
 * hairline meters for protein, carbs and fat; a fourth one for water would read
 * as a fourth macro, which it is not — it has no energy, no Atwater factor and
 * no place in the split. Water is counted in vessels because that is how people
 * actually count it ("I've had three bottles"), so it is drawn in vessels: a
 * discrete row whose LENGTH comes from the target and whose FILL comes from the
 * day. The row therefore never moves as you drink, which a proportional bar
 * would appear to do on a training day when the target grows underneath it.
 *
 * THE PACE IS PROSE, not a tick. The engine knows where the hour of day says
 * you should be, and the honest way to say "you are 400 ml behind for this
 * hour" is to say it. A marker on the row would need a legend to decode and
 * would collide with the fill it sits on.
 */
export default function WaterCard({
  h,
  units,
  onAdd,
  onUndo,
  canUndo,
  style,
}: {
  h: Hydration;
  units: WeightUnit;
  /** log one preset; the caller owns the write + the optimistic update */
  onAdd: (ml: number) => void;
  /** remove the most recent water log of this day */
  onUndo?: () => void;
  canUndo?: boolean;
  style?: React.CSSProperties;
}) {
  const { t } = useLang();
  const [basis, setBasis] = useState(false);
  const presets = hydrationPresets(units);
  const vessels = hydrationVessels(h, units);
  const met = h.state === "met";

  // ONE state line, in the state's own colour. Lime is the "go" colour and is
  // spent only on a met target; "behind" takes amber rather than red because
  // being short of water at 4pm is a nudge, not a breach.
  const stateLine =
    h.state === "met"
      ? { text: t("w.recovery.nutrition.waterMet"), color: "var(--lime-text)" }
      : h.state === "behind"
        ? { text: t("w.recovery.nutrition.waterBehind").replace("{v}", formatVolume(h.behindMl, units)), color: "var(--amber-text)" }
        : h.state === "empty"
          ? { text: t("w.recovery.nutrition.waterEmpty"), color: C("ash") }
          : { text: t("w.recovery.nutrition.waterOnTrack"), color: C("ash") };

  return (
    <div
      style={{
        background: C("ink2"),
        border: `1px solid ${C("line")}`,
        borderRadius: 28,
        boxShadow: "var(--shadow-card)",
        padding: CARD_PAD,
        ...style,
      }}
    >
      {/* HEAD — title left, state right. The Explore SectionHead grammar: no
          marker on the left, the one piece of state on the right of the same
          row. */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <b style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, color: C("chalk") }}>
          {t("w.recovery.nutrition.water")}
        </b>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: fs.nano,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color: stateLine.color,
            textAlign: "right",
          }}
        >
          {stateLine.text}
        </span>
      </div>

      {/* THE FIGURE — what is in, against what the day asked for. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 14 }}>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 900,
            fontSize: 38,
            letterSpacing: "-.03em",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            color: met ? "var(--lime-text)" : C("chalk"),
          }}
        >
          {formatVolume(h.ml, units)}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>
          / {formatVolume(h.target, units)}
        </span>
        {/* The explainer. ⓘ is ALREADY a ring, so no second ring is drawn
            around it (house rule). */}
        <button
          className="pressable"
          onClick={() => setBasis(true)}
          aria-label={t("w.recovery.nutrition.waterBasis")}
          title={t("w.recovery.nutrition.waterBasis")}
          style={{ marginLeft: "auto", background: "none", border: "none", padding: 4, cursor: "pointer", display: "grid", placeItems: "center", color: C("ash") }}
        >
          <AuroraIcon name="info" size={17} color={C("ash")} />
        </button>
      </div>

      {/* THE VESSEL ROW — length from the target, fill from the day. */}
      <div
        style={{ display: "flex", gap: 4, marginTop: 14 }}
        role="img"
        aria-label={`${formatVolume(h.ml, units)} / ${formatVolume(h.target, units)}`}
      >
        {Array.from({ length: vessels.total }, (_, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              height: 8,
              borderRadius: 3,
              background: i < vessels.filled ? C("lime") : C("line"),
              transition: "background .28s cubic-bezier(.4,0,.2,1)",
            }}
          />
        ))}
      </div>

      {/* What is left, and — on a training day — where the extra came from. A
          met target says so in the state line above and does not repeat it. */}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), marginTop: 10, lineHeight: 1.6 }}>
        {!met && <>{t("w.recovery.nutrition.waterLeft").replace("{v}", formatVolume(h.leftMl, units))}</>}
        {h.trained && (
          <>
            {!met && <br />}
            {t("w.recovery.nutrition.waterSweat").replace("{v}", formatVolume(h.sweatMl, units))}
          </>
        )}
      </div>

      {/* ADD — one tap per vessel. Undo takes the last tap back by DELETING the
          Signal it wrote, never by appending a negative reading. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        {presets.map((p: HydrationPreset) => (
          <button
            key={p.ml}
            className="pressable"
            onClick={() => onAdd(p.ml)}
            aria-label={t("w.recovery.nutrition.waterAdd").replace("{v}", formatVolume(p.ml, units))}
            style={{
              flex: "1 1 0",
              minWidth: 78,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              fontSize: fs.caption,
              color: "var(--lime-text)",
              background: "transparent",
              border: `1px solid color-mix(in srgb, var(--color-lime) 42%, ${C("line")})`,
              borderRadius: 999,
              padding: "10px 8px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <AuroraIcon name="add" size={13} color="var(--lime-text)" />
            {formatVolume(p.ml, units)}
          </button>
        ))}
      </div>

      {canUndo && onUndo && (
        <button
          className="pressable"
          onClick={onUndo}
          style={{
            marginTop: 10,
            background: "none",
            border: "none",
            padding: "4px 2px",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: fs.nano,
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: C("ash"),
          }}
        >
          {t("w.recovery.nutrition.waterUndo")}
        </button>
      )}

      <Sheet open={basis} onClose={() => setBasis(false)} title={t("w.recovery.nutrition.waterBasis")}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: fs.body, lineHeight: 1.6, color: C("chalk"), margin: 0 }}>
          {t("w.recovery.nutrition.waterBasisBody")}
        </p>
      </Sheet>
    </div>
  );
}
