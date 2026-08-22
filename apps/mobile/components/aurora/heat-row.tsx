import { useMemo, useState } from "react";
import { View, Text } from "react-native";
import {
  CLEARANCE_FAST,
  CLEARANCE_SLOW,
  HEAT_SESSION_MIN_EQUIV,
  heatSittings,
  leading,
  saunaClearance,
  space,
  tracking,
  type LoggedSession,
  type RecoveryReport,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { fs, F, PressScale } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { useHeatSignalsQuery, useRevalidate } from "../../lib/queries";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { ACard } from "./kit";
import { AuroraIcon } from "./icons";
import { HeatSheet } from "./heat-sheet";

/**
 * THE HEAT ROW — Today's Recover cluster.
 *
 * WHAT IT PUTS ON THE FACE, and why it is this and not a count. A row that said
 * only "Heat →" would be a button wearing a card; the week's own figure is the
 * thing the athlete cannot get anywhere else, and it is the CHRONIC channel's
 * input — sittings per week is exactly what the volume multiplier reads, so
 * showing it here means the number that moves their MRV is visible without
 * opening anything.
 *
 * Equivalent minutes rather than raw minutes, for the same reason the engine
 * counts them: 30 minutes in a 55 °C cabin and 30 at 90 °C are not the same
 * week, and a row that adds them together would be reporting a total the model
 * does not use.
 *
 * THE GLYPH IS A BARE ＋, NOT A RINGED ARROW. House rule, and it is honest
 * here: tapping this grows the log in place through a sheet — it does not open
 * a destination. An arrow would promise a screen that does not exist. It is
 * ASH, like every other expander mark in the app (the Other-sports tail, the
 * endurance block's All-sports control, this feature's OWN sheet — "bare ＋/−
 * in ash"): a hue on a control mark says "go", and this one goes nowhere. It
 * wore amber, which made it the single tinted glyph in the Recover cluster and
 * the only expander in the product not in ash.
 *
 * IT SITS IN TODAY'S RHYTHM, AND WEARS TODAY'S CARD HEAD. Two things it did
 * not do. Every block on the screen owns its own 16dp top gap (the plan hero,
 * the done floor, the check-in card, RtpPanel; the chromeless doors take 14) —
 * this one emitted none, so its card butted flush against the check-in card
 * clustered directly above it, two hairlines touching with nothing between
 * them. And its title was the one card title on Today in BOOK weight: the
 * check-in beside it heads at F.bold/16, the protocol at F.black/20, the doors
 * at F.bold/14. "Heat" now heads exactly as "Readiness" does — same cluster,
 * same rung.
 */
export function HeatRow({ sessions = [], recovery = [] }: { sessions?: LoggedSession[]; recovery?: RecoveryReport[] } = {}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  // The SHARED cache entry, not a private fetch: today's readiness ring and the
  // volume model read the same rows, so a sitting saved here has to invalidate
  // the one thing they all read or the row updates and the score does not.
  const { data: rows = [] } = useHeatSignalsQuery();
  const revalidate = useRevalidate();
  // °C is stored; the DISPLAY unit follows the weight unit the athlete already
  // set (lb → °F), so a pounds-and-Fahrenheit athlete is never shown Celsius.
  const { units } = useLoggerPrefs();

  // This calendar week's sittings, counted the way the engine counts them.
  const week = useMemo(() => {
    const now = Date.now();
    const d = new Date(now);
    const dow = (d.getDay() + 6) % 7; // Monday-first, matching the week rail
    d.setHours(0, 0, 0, 0);
    const start = d.getTime() - dow * 86_400_000;
    const mine = heatSittings(rows).filter((x) => {
      const ts = Date.parse(x.ts);
      return ts >= start && ts <= now;
    });
    return {
      count: mine.filter((x) => x.equivMin >= HEAT_SESSION_MIN_EQUIV).length,
      equiv: Math.round(mine.reduce((a, x) => a + x.equivMin, 0)),
    };
  }, [rows]);

  /**
   * THE PAYOFF — the athlete's OWN measured answer, not the literature's.
   *
   * `saunaClearance` splits their clean recovery pairs by whether heat fell
   * inside the gap. It returns zero confidence until BOTH sides clear the pair
   * floor, which in practice is four to six weeks, and this block renders
   * nothing at all until then rather than a direction it cannot support. That
   * silence is the feature: the same standard the clearance estimator it is
   * built on already holds itself to.
   */
  const clearance = useMemo(
    () => (sessions.length ? saunaClearance(sessions, recovery, rows) : null),
    [sessions, recovery, rows],
  );
  // The verdict reads off the DELTA, not either side's absolute index — the
  // question is "does heat help ME", and an athlete who clears slowly overall
  // can still clear meaningfully faster after a sauna. Reading the absolute
  // would have called that "no difference". The band is the one the clearance
  // model already uses in both directions (CLEARANCE_FAST/SLOW bracket 1.0 by
  // the same +/-0.15), so there is no second scale to learn.
  const MEANINGFUL = Math.min(1 - CLEARANCE_FAST, CLEARANCE_SLOW - 1);
  const verdictKey = !clearance || clearance.confidence <= 0
    ? null
    : clearance.delta < -MEANINGFUL
      ? "w.recovery.heat.clearFaster"
      : clearance.delta > MEANINGFUL
        ? "w.recovery.heat.clearSlower"
        : "w.recovery.heat.clearSame";

  return (
    <>
      {/* The gap belongs to the PressScale, not to the card inside it: a margin
          on the card would sit inside the pressed surface's own box. */}
      <PressScale
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t("w.recovery.heat.add")}
        style={{ marginTop: space.lg }}
      >
        <ACard>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.ms }}>
            <View style={{ flex: 1 }}>
              {/* -0.3, the value the check-in card and the protocol card
                  already head at — not the display tightening (-0.5), which is the
                  masthead's rung. */}
              <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, letterSpacing: tracking(fs.subtitle), color: C.chalk }}>{t("w.recovery.heat.row")}</Text>
              {/* THE FIGURES READ AS FIGURES. This row exists to put the chronic
                  channel's own number on Today — sittings per week is exactly
                  what the volume multiplier reads — and a sentence buries it.
                  Composed rather than joined: a `.replace` into one string is
                  what the middot rule calls out, and it also leaves nothing for
                  the type to distinguish. */}
              {week.count > 0 ? (
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: 3 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>
                    <Text style={{ color: C.chalk }}>{week.count}</Text> {t("w.recovery.heat.rowWeek")}
                  </Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>
                    <Text style={{ color: C.chalk }}>{week.equiv}</Text> {t("w.recovery.heat.rowEquiv")}
                  </Text>
                </View>
              ) : (
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 3 }}>
                  {t("w.recovery.heat.rowEmpty")}
                </Text>
              )}
            </View>
            {/* Bare ＋ in ASH — it grows in place. No ring, because nothing
                opens; no hue, because nothing goes. DRAWN, not typed: the
                fullwidth ＋ text character took its weight and centring from
                the mono face, in an app with a vector icon set and a size →
                stroke rule. */}
            <AuroraIcon name="plus" size={20} color={C.ash} />
          </View>
        </ACard>
      </PressScale>

      {/* Only once it can honestly say something. */}
      {verdictKey && clearance && (
        <ACard style={{ marginTop: space.sm }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking(fs.micro, "label"), textTransform: "uppercase", color: C.ash, marginBottom: space.ms }}>
            {t("w.recovery.heat.clearTitle")}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.xs }}>
            <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: txt(C, C.amber) }}>{t("w.recovery.heat.clearWith")}</Text>
            <Text style={{ fontFamily: F.monoBold, fontSize: fs.bodyLg, color: txt(C, C.amber) }}>{clearance.withHeat.index.toFixed(2)}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash }}>{t("w.recovery.heat.clearWithout")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk }}>{clearance.withoutHeat.index.toFixed(2)}</Text>
          </View>
          <View style={{ height: 1, backgroundColor: C.line, marginVertical: space.md }} />
          <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption) }}>
            {t(verdictKey)}{" "}
            {t("w.recovery.heat.clearPairs").replace("{n}", String(clearance.withSamples.length + clearance.withoutSamples.length))}
          </Text>
        </ACard>
      )}

      <HeatSheet visible={open} onClose={() => setOpen(false)} onLogged={revalidate.heat} weightUnit={units} />
    </>
  );
}
