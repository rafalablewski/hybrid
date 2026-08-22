import { useEffect, useRef } from "react";
import { View, Text } from "react-native";
import {
  READINESS_FACE, readinessReasonsKey,
  type Prescription, type ReadinessDeficit, type ReadinessFact, type ReadinessVerdict,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { F, fs, leading, tracking, ty} from "../../lib/ui";
import Sheet from "./sheet";
import ReadinessFace from "./readiness-face";
import { ReadinessRing, ReadinessBar, ReadinessLedger, ReadinessBlock } from "./readiness-ring";

/**
 * THE EXPLAINED DAY — what the readiness ring opens into.
 *
 * The ring is the product's signature object because it is the one figure that
 * accounts for itself; this is where the accounting is laid out at full size.
 * It replaces an INLINE EXPANDER that lived on the Performance screen and
 * nowhere else: a chevron that unfolded the bar, the ledger and the provenance
 * line in place, pushing the rest of the page down, reachable only by an
 * athlete who had paid and then scrolled to it. Today's ring had no equivalent
 * at all — it opened nothing.
 *
 * A sheet rather than an expander, for three reasons that are all the same
 * reason. It can be opened from anywhere the ring is drawn, so the ring is one
 * object with one door instead of two rings with one and a half. It gets the
 * whole panel, so the ring can be drawn at a size where the runs are actually
 * separable rather than at the 56dp the card row affords. And it can carry the
 * two things the expander never had room to say — the CLAMP (when the scale
 * stopped before the arithmetic did) and what the number actually selects for
 * today's session.
 *
 * Everything here is READ, never re-derived: the deficit, its costs, the runs,
 * the facts and the verdict all arrive computed from the ONE reading of the day
 * the host screen made. Two surfaces computing their own would be exactly the
 * defect the ring exists to rule out, one layer up.
 */
export default function ReadinessDaySheet({ deficit, facts, verdict, rx, onClose }: {
  /** The day being explained, or null when the sheet is closed. */
  deficit: ReadinessDeficit | null;
  facts: ReadinessFact[];
  verdict: ReadinessVerdict;
  /** Today's prescription, when the host has one — what the number selects. */
  rx?: Prescription | null;
  onClose: () => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  // Hold the last day through the EXIT animation, exactly as the freshness and
  // reading sheets do: reading `deficit` directly empties the panel the instant
  // it starts sliding down.
  const held = useRef<ReadinessDeficit | null>(deficit);
  useEffect(() => { if (deficit) held.current = deficit; }, [deficit]);
  const d = deficit ?? held.current;

  return (
    <Sheet visible={!!deficit} onClose={onClose} title={t("w.home.readiness.sheetTitle")} sub={t("w.home.readiness.sheetSub")}>
      {d ? (
        <View style={{ gap: 22 }}>
          {/* THE RING, at a size where the runs separate. The card face draws it
              at 56 because that is what a row affords; here it gets 112, which
              is the whole argument for this being a sheet. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
            <ReadinessRing deficit={d} size={112} />
            <View style={{ flex: 1 }}>
              <Text style={ty(C, "kicker")}>
                {t("w.home.readiness.dayLabel")}
              </Text>
              {/* THE FACE — one line, naming the limiter and nothing else. The
                  same sentence the card wears, so the two cannot disagree. */}
              <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, marginTop: 5, lineHeight: leading(fs.subtitle) }}>
                {t(verdict.key).replace("{tissue}", verdict.muscle ? t(`w.home.today.muscle.${verdict.muscle}`) : "")}
              </Text>
            </View>
          </View>

          {/* THE SPLIT — the bar, then the arithmetic. The meta says what the
              engine guarantees, because "sums to 100" is the claim being made
              and a claim stated on the surface that makes it is worth more than
              one buried in a source comment. */}
          <ReadinessBlock
            head={t("w.home.readiness.splitHead")}
            meta={t(readinessReasonsKey(verdict.reasons)).replace("{n}", String(verdict.reasons))}
          >
            <View style={{ marginBottom: 18 }}>
              <ReadinessBar deficit={d} />
            </View>
            <ReadinessLedger deficit={d} facts={facts} />

            {/* THE CLAMP, which nothing surfaced before this sheet existed.
                Readiness never reads outside 35..98, so on a genuinely wrecked
                week the arithmetic keeps falling after the number has stopped —
                and a figure that has hit its own floor is a figure that is no
                longer measuring anything. The ceiling case already earns a
                ledger row of its own (the engine gives it a named cost rather
                than letting the points fall off the edge); the FLOOR case
                cannot, because there is nothing left to take, so it says so
                here in a sentence instead of quietly rounding. */}
            {d.clamped === "floor" && (
              <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: txt(C, C.amber), marginTop: 14, lineHeight: leading(fs.caption) }}>
                {t("w.home.readiness.floorNote")}
              </Text>
            )}
          </ReadinessBlock>

          {/* WHAT IT PICKS — the number is not a score, it is an input, and this
              is the only place that says what it was an input TO. Deliberately
              modest about it: readiness chooses the day's primary movement (the
              most recovered pattern the athlete can train, which is exactly the
              tissue term the ring's biggest arc names) — it does NOT scale the
              working load, and claiming it did would be the kind of tidy
              overstatement this card exists to refuse. The one thing that DOES
              scale the load is the athlete's own one-tap check-in, and that is
              stated separately below, in its own voice. */}
          {rx && (
            <ReadinessBlock head={t("w.home.readiness.movesHead")}>
              <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, lineHeight: leading(fs.body) }}>
                {t("w.home.readiness.movesPrimary")
                  .replace("{move}", rx.primary.move)
                  .replace("{n}", String(Math.round(rx.primary.recovery)))}
              </Text>
              {rx.readinessAdjust && (() => {
                const adj = rx.readinessAdjust!;
                const tint = C[READINESS_FACE[adj.feeling].accent];
                const key = adj.loadPct === undefined ? "rxWreckedBw" : adj.feeling === "primed" ? "rxPrimed" : adj.feeling === "flat" ? "rxFlat" : "rxWrecked";
                return (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
                    <ReadinessFace feeling={adj.feeling} scale={0.55} />
                    <Text style={{ flex: 1, fontFamily: F.monoBold, fontSize: fs.caption, color: txt(C, tint), lineHeight: leading(fs.caption) }}>
                      {t(`w.home.today.${key}`).replace("{pct}", String(adj.loadPct ?? ""))}
                    </Text>
                  </View>
                );
              })()}
            </ReadinessBlock>
          )}
        </View>
      ) : null}
    </Sheet>
  );
}
