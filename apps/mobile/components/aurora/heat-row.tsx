import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import {
  HEAT_SESSION_MIN_EQUIV,
  heatSittings,
  space,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { fs, F, PressScale } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { fetchHeatSignals } from "../../lib/api";
import { ACard, RADIUS } from "./kit";
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
 * a destination. An arrow would promise a screen that does not exist.
 */
export function HeatRow() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchHeatSignals>>>([]);

  const load = useCallback(() => {
    fetchHeatSignals().then(setRows).catch(() => {});
  }, []);
  useEffect(load, [load]);

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

  const meta = week.count > 0
    ? t("w.recovery.heat.rowMeta").replace("{n}", String(week.count)).replace("{m}", String(week.equiv))
    : t("w.recovery.heat.rowEmpty");

  return (
    <>
      <PressScale onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={t("w.recovery.heat.add")}>
        <ACard style={{ paddingVertical: 13, paddingHorizontal: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.ms }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk }}>{t("w.recovery.heat.row")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{meta}</Text>
            </View>
            {/* Bare ＋ — it grows in place. No ring, because nothing opens. */}
            <View
              style={{
                width: 30, height: 30, borderRadius: RADIUS.pill,
                alignItems: "center", justifyContent: "center",
              }}
            >
              <Text style={{ fontFamily: F.mono, fontSize: fs.title, color: txt(C, C.amber) }}>＋</Text>
            </View>
          </View>
        </ACard>
      </PressScale>

      <HeatSheet visible={open} onClose={() => setOpen(false)} onLogged={load} />
    </>
  );
}
