import { useMemo, useState } from "react";
import { View, Text } from "react-native";
import {
  sessionMuscleGlows,
  muscleLabelKey,
  fmtWeight,
  BODY_FIGURES,
  type SessionMuscleMap,
  type MuscleCoverage,
  type WeightUnit,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, deltaPaint } from "../../lib/theme";
import { F, MAX_FONT_SCALE, PressScale as Pressable, fs, leading, space, trackFigure, tracking } from "../../lib/ui";
import { BodyFigures } from "./body-map";

/**
 * THE BODY PANEL — where the session's work landed, on a body.
 *
 * The one thing a training app can show that a spreadsheet cannot, and until
 * now the summary did not show it: the muscle read lived three screens down in
 * the details section as seven coarse bars ("shoulders"), while the anatomy
 * engine that names twenty muscles to the percentage point sat wired only to
 * the individual exercise page.
 *
 * The figure is the SHARED mannequin (aurora/body-map.tsx's BodyFigures), fed
 * `sessionMuscleGlows` where the exercise page feeds `muscleGlows` — same
 * geometry, same normalisation, same meaning of "lit", one renderer.
 *
 * THE LEDGER IS THE PICTURE'S TEXT ALTERNATIVE, not a second read of it. The
 * rows beneath name every muscle the figure lights, in order, with its tonnage
 * — which is what a screen reader gets, and what anyone who cannot separate two
 * shades of chartreuse gets. Nothing on this panel is carried by colour alone.
 *
 * TAPPING A MUSCLE — on the figure or in the ledger — moves the headline to it.
 * A body you can touch is the reason the panel is a panel and not an image, and
 * it is how an athlete asks "how much of that was actually triceps".
 */

/** How many rows the ledger prints before the panel would start to crowd. */
const LEDGER_ROWS = 4;
/** A muscle is "neglected" only after a training week has passed without it. */
const NEGLECT_DAYS = 7;
/** At most two names — a list of five reads as an accusation, not a prompt. */
const NEGLECT_NAMES = 2;

export default function SessionBody({
  map,
  coverage,
  units,
}: {
  map: SessionMuscleMap;
  coverage: MuscleCoverage[];
  units: WeightUnit;
}) {
  const C = useTheme().palette;
  const { t } = useLang();
  const [selected, setSelected] = useState<string | null>(null);

  const intensityOf = useMemo(() => {
    const out: Record<string, number> = {};
    for (const g of sessionMuscleGlows(map)) out[g.muscle] = g.intensity;
    return out;
  }, [map]);

  const rows = map.muscles.slice(0, LEDGER_ROWS);
  // The headline follows the finger: the session's driver until a muscle is
  // picked, then the picked one — so the big figure always names what is lit.
  const shown = (selected && map.muscles.find((m) => m.muscle === selected)) || map.lead;
  if (!shown) return null;

  // The neglect line reads off DRIVER appearances only (core/muscleCoverage):
  // assisting somebody else's press is not training a muscle.
  const stale = coverage.filter((c) => c.daysSince != null && c.daysSince >= NEGLECT_DAYS);
  const neglect = stale.slice(0, NEGLECT_NAMES);
  const neglectDays = neglect[0]?.daysSince ?? null;

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: space.md }}>
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{ fontFamily: F.black, fontSize: fs.hero, lineHeight: leading(fs.hero, "flush"), letterSpacing: trackFigure(fs.hero), color: C.chalk }}
        >
          {shown.pct}
          <Text style={{ fontSize: fs.headline, color: C.ash }}>%</Text>
        </Text>
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.bold, fontSize: fs.subtitle, color: txt(C, C.lime) }}>
          {t(muscleLabelKey(shown.muscle)).toLowerCase()} – {fmtWeight(shown.volumeKg, units)}
        </Text>
      </View>

      <View style={{ flex: 1, justifyContent: "center", marginVertical: space.sm }}>
        <BodyFigures
          figures={BODY_FIGURES}
          intensityOf={intensityOf}
          selected={selected}
          onSelect={(m) => setSelected((cur) => (cur === m ? null : m))}
          label={(side) => t(side === "front" ? "session.body.front" : "session.body.back")}
        />
      </View>

      <View>
        {rows.map((m, i) => {
          const on = shown.muscle === m.muscle;
          return (
            <Pressable
              key={m.muscle}
              accessibilityRole="button"
              accessibilityLabel={`${t(muscleLabelKey(m.muscle))} – ${m.pct}% – ${fmtWeight(m.volumeKg, units)}`}
              onPress={() => setSelected((cur) => (cur === m.muscle ? null : m.muscle))}
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                justifyContent: "space-between",
                paddingVertical: space.sm,
                borderTopWidth: i ? 1 : 0,
                borderTopColor: C.line,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  fontFamily: F.mono,
                  fontSize: fs.nano,
                  letterSpacing: tracking(fs.nano, "label"),
                  textTransform: "uppercase",
                  color: on ? C.chalk : C.ash,
                }}
              >
                {t(muscleLabelKey(m.muscle))} – {t(m.tier === "driver" ? "session.body.driver" : "session.body.assist")}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.xs }}>
                <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.chalk }}>
                  {fmtWeight(m.volumeKg, units)}
                </Text>
                {/* A figure with no baseline behind it stays a figure — the
                    delta appears only once the athlete has a norm to beat. */}
                {m.deltaPct != null && (
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: deltaPaint(C, m.deltaPct > 0 ? "up" : m.deltaPct < 0 ? "down" : "flat") }}>
                    {m.deltaPct > 0 ? "+" : ""}{m.deltaPct}% {t("session.body.vsUsual")}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      {neglect.length > 0 && neglectDays != null && (
        <Text
          style={{
            fontFamily: F.mono,
            fontSize: fs.nano,
            letterSpacing: tracking(fs.nano, "label"),
            textTransform: "uppercase",
            color: txt(C, C.amber),
            marginTop: space.ms,
          }}
        >
          {t("session.body.untouched").replace("{days}", String(neglectDays))} – {neglect.map((n) => t(muscleLabelKey(n.muscle))).join(", ")}
        </Text>
      )}

      {/* Honesty: a custom lift the catalog does not know is absent from the
          figure, and the panel says so rather than quietly under-reporting. */}
      {map.unmapped.length > 0 && (
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), color: C.ash, marginTop: space.xs }}>
          {t("session.body.unmapped")
            .replace("{count}", String(map.unmapped.length))
            .replace("{name}", map.unmapped.join(", "))}
        </Text>
      )}
    </>
  );
}
