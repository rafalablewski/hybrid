import { View } from "react-native";
import { withAlpha } from "./kit";
import { ALPHA } from "@hybrid/core";

/**
 * HISTORY STRIP (mobile) — the Progress cluster's ONE chart of the recent
 * past. Up to eight bars in a fixed-height zone: past periods at a 34% tint,
 * the current (last) period at full strength, in the consuming block's
 * semantic hue — chartreuse for lifts, teal for endurance, sand for sports.
 * (The brand names this doc used — Lyons Blue, Fleur De Lis — outlived the
 * values behind them: the sport channel is sand, and violet's value is steel.)
 * Consumed by the exercises rail, the endurance lanes and the other-sports
 * tiles so the three rails draw history identically; the numbers come
 * normalized from @hybrid/core (historyStripBars / volumeBars /
 * sportWeekBars).
 */
export default function HistoryStrip({ bars, color, height = 24, held = -1 }: {
  /** 0..1 bar heights, oldest → newest (core-normalized). */
  bars: number[];
  /** The block's semantic hue, resolved from the palette. */
  color: string;
  height?: number;
  /** The bar under a held finger, when the strip is being scrubbed (−1 for
   *  none). It takes full strength INSTEAD of the current period: the "latest"
   *  accent would otherwise compete with the answer that was asked for. */
  held?: number;
}) {
  if (bars.length < 2) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height }}>
      {bars.map((h, i) => (
        <View
          key={i}
          style={{
            flex: 1, borderRadius: 2,
            height: Math.max(3, Math.round(h * height)),
            backgroundColor: (held >= 0 ? i === held : i === bars.length - 1) ? color : withAlpha(color, ALPHA.line),
          }}
        />
      ))}
    </View>
  );
}
