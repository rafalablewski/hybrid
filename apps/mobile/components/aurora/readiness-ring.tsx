import { type ReactNode } from "react";
import { View, Text } from "react-native";
import {
  KEPT_ARC_ALPHA, readinessRole, readinessRingSegments, readinessRingTicks,
  type ReadinessDeficit, type ReadinessFact, type RingSegment, type SemanticRole,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { leading, tracking, fs, F } from "../../lib/ui";
import { Ring, withAlpha } from "./kit";

/**
 * THE READINESS RING — the product's one signature object, in ONE file.
 *
 * It is the only figure in the app that accounts for itself. Readiness is a
 * number out of 100, and the ring does not gauge what it KEPT and leave a
 * sentence beside it to explain the rest — it draws the whole 100, one run of
 * ticks per cause, sized by what that cause actually took. The engine
 * (packages/core/src/engines/readiness-deficit.ts) guarantees that `kept` plus
 * every cost sums to exactly 100, with largest-remainder apportionment so the
 * integers cannot drift and a minimum-arc rule so a cost too small to see is
 * still drawn. "Back fatigue is the main drag" is a safe sentence; "back
 * fatigue cost you 22 points" is a claim, and this is the object that can
 * defend it.
 *
 * WHY IT IS A COMPONENT NOW, and this is the whole reason the file exists.
 * The ring lived inline inside the Performance screen — the ring, the
 * straightened bar, the ledger rows, the provenance line, roughly 120 lines of
 * it in an 865-line file, reachable only by an athlete who has paid and then
 * scrolled. Today — the screen everyone opens every day — drew a DIFFERENT
 * ring: a bare 44dp gauge of the same number with no tick colours, no
 * accounting, no label and nothing behind a tap. Two rings, one day, and the
 * one on the most-used screen was the one that could not explain itself. So
 * the object is extracted whole and both screens render it: same paint, same
 * runs, same arithmetic, same door.
 *
 * ONE PAINT, taken from the segment and never re-derived. Each run carries the
 * role it is drawn from AND whether it is held back (`dim`), because the kept
 * run wears the readiness BAND's colour and that collides with a cause's in
 * every band but the top one — at a score of 53, kept and the wearable were the
 * same sand, so a legend swatch worth one tick pointed at the seventeen the
 * score kept. The hue stays (severity reads before any number does) and the
 * WEIGHT separates them. A caller that paints a run from anything but
 * `segPaint` is the bug this export exists to prevent.
 */

type Palette = ReturnType<typeof useTheme>["palette"];

/** A semantic role as a colour to DRAW WITH — the accent-TEXT tone, not the raw
 *  fill. `roleColor` returns the fill, tuned to sit under something; `txt()`
 *  maps a fill to the AA-guarded tone. */
export const rolePaint = (C: Palette, role: SemanticRole) => txt(C, roleColor(C, role));

/** One run of the ring, painted. Both the role and the holding-back come from
 *  the segment, so the arcs, the bar and the ledger's swatches resolve the same
 *  colour from the same field. */
export const segPaint = (C: Palette, s: Pick<RingSegment, "role" | "dim">) =>
  s.dim ? withAlpha(rolePaint(C, s.role), KEPT_ARC_ALPHA) : rolePaint(C, s.role);

/** The kept run's own paint, for the ledger total's swatch. */
export const keptPaint = (C: Palette, kept: number) =>
  segPaint(C, { role: readinessRole(kept), dim: true });

/**
 * The ring itself: the score inside, the causes around it.
 *
 * `size` is the only knob, and the figure scales with it rather than being
 * passed separately — a ring whose number is set independently of its diameter
 * is how one surface ends up with a 56dp ring wearing a 13pt figure and another
 * a 118dp ring wearing the same one.
 */
export function ReadinessRing({ deficit, size = 56 }: { deficit: ReadinessDeficit; size?: number }) {
  const { palette: C } = useTheme();
  const ticks = readinessRingTicks(deficit);
  // The figure is a fixed fraction of the diameter, rounded to a whole point.
  // 0.32 puts a 56dp ring at 18 and a 112dp ring at 36 — both inside the type
  // ladder's ceiling, which is what keeps this off the figure ratchet.
  const figure = Math.round(size * 0.32);
  return (
    <Ring
      value={deficit.kept}
      size={size}
      color={roleColor(C, readinessRole(deficit.kept))}
      track={C.line}
      tickColors={ticks.map((s) => segPaint(C, s))}
    >
      <Text style={{ fontFamily: F.black, fontSize: figure, color: C.chalk }}>{deficit.kept}</Text>
    </Ring>
  );
}

/**
 * THE BAR — the ring's own runs, straightened out.
 *
 * It reads the SAME segments the arcs do, so the two cannot disagree, and it is
 * the piece that makes "these parts sum to this number" legible without opening
 * anything: a full-width strip divided in the proportions of the ring, with the
 * two figures under its ends. This is why it belongs on the card face and not
 * only inside the explanation.
 */
export function ReadinessBar({ deficit, height = 10 }: { deficit: ReadinessDeficit; height?: number }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const segs = readinessRingSegments(deficit);
  return (
    <View>
      <View style={{ flexDirection: "row", gap: 2, height }}>
        {segs.map((s, i) => (
          <View key={i} style={{ flex: s.points, minWidth: 6, borderRadius: 2, backgroundColor: segPaint(C, s) }} />
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking(fs.nano, "label"), color: C.ash }}>
          {t("w.home.readiness.barKept").replace("{n}", String(deficit.kept))}
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking(fs.nano, "label"), color: C.ash }}>
          {t("w.home.readiness.barSpent").replace("{n}", String(deficit.deficit))}
        </Text>
      </View>
    </View>
  );
}

/**
 * THE LEDGER — the arcs, as arithmetic you can audit.
 *
 * Same points, same order, same paint as the ring, opening on the baseline 100
 * and closing on the score itself, so every colour on the ring is named by a
 * row and the rows visibly sum to the figure inside it. The total carries the
 * kept swatch for the same reason.
 */
export function ReadinessLedger({ deficit, facts }: { deficit: ReadinessDeficit; facts?: ReadinessFact[] }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  // A positive wearable nudge keeps its sign — it is the one fact here that can
  // read either way, and "+4" is a different statement from "4".
  const factLine = (f: ReadinessFact) =>
    t(f.key)
      .replace("{tissue}", f.muscle ? t(`w.home.today.muscle.${f.muscle}`) : "")
      .replace("{n}", f.value > 0 && f.key === "w.home.readiness.factWearable" ? `+${f.value}` : String(f.value));

  return (
    <View>
      <View style={{ gap: 7 }}>
        <LedgerRow C={C} label={t("w.home.readiness.baseline")} value="100" />
        {deficit.costs.map((c, i) => (
          <LedgerRow
            key={i}
            C={C}
            swatch={rolePaint(C, c.role)}
            label={t(c.key).replace("{tissue}", c.muscle ? t(`w.home.today.muscle.${c.muscle}`) : "")}
            value={`−${c.points}`}
            tint={rolePaint(C, c.role)}
          />
        ))}
        <View style={{ height: 1, backgroundColor: C.line }} />
        <LedgerRow C={C} swatch={keptPaint(C, deficit.kept)} label={t("w.home.readiness.total")} value={String(deficit.kept)} strong />
      </View>

      {/* PROVENANCE — the measured inputs the rows can't carry: the limiting
          tissue's own fatigue, the energy-system load, and the two terms that
          are INVISIBLE in a ledger by construction (a positive wearable nudge
          and the heat credit take no arc and no row — they shrink every other
          share instead, so without a line here a reading that moved the score
          would show nowhere at all). */}
      {facts && facts.length > 0 && (
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking(fs.nano, "label"), color: C.ash, marginTop: 12, lineHeight: leading(fs.nano) + 3 }}>
          {`${t("w.home.readiness.provFrom")} – ${facts.map(factLine).join(", ")}`}
        </Text>
      )}
    </View>
  );
}

/** One row of the ledger: the arc's own colour, what it is, what it cost.
 *  Tabular by construction — every value sits on the same right edge. */
function LedgerRow({
  C, label, value, swatch, tint, strong,
}: { C: Palette; label: string; value: string; swatch?: string; tint?: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: swatch ?? "transparent" }} />
      <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.caption, color: strong ? C.chalk : C.ash }} numberOfLines={2}>{label}</Text>
      <Text style={{ fontFamily: strong ? F.monoBold : F.mono, fontSize: fs.caption, color: strong ? C.chalk : tint ?? C.ash }}>{value}</Text>
    </View>
  );
}

/**
 * THE DAY OBJECT USED TO LIVE HERE, and what replaced it is worth writing down
 * rather than discovering from a diff.
 *
 * `ReadinessDayCard` was the ring, one line naming the day's limiter, and —
 * under a hairline — the straightened bar with "Kept 64 / Spent 36" beneath its
 * ends. Two things were wrong with it and only one of them was the bar. The BAR
 * ON THE FACE proved a sum whose parts it could not name: the runs are
 * unlabelled until the ledger names them, so on the card it was one number
 * stated twice next to a strip of colour. It draws in the SHEET now (see
 * readiness-day-sheet.tsx), directly above the ledger that names every run in
 * it, which is where the proof was always legible.
 *
 * The deeper fault was the card's whole grammar: it stated a DIAGNOSIS. An
 * athlete opening the app at six in the morning does not need to be told which
 * tissue is limiting them; they need to be told what to train. That is the day
 * BAND (aurora/day-band.tsx, deciding through core's day-band.ts), and it is
 * the only host of the ring's door now.
 *
 * The RING itself is unchanged and still lives above — the sheet draws it at
 * 112, and any future surface that wants it imports `ReadinessRing`.
 */

/** A section head inside the explanation: display-face title left, mono meta on
 *  the RIGHT of the same row, no marker before it (house rule). */
export function ReadinessBlock({ head, meta, children }: { head: string; meta?: string; children: ReactNode }) {
  const { palette: C } = useTheme();
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <Text style={{ flex: 1, fontFamily: F.black, fontSize: fs.note, color: C.chalk }}>{head}</Text>
        {meta ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking(fs.nano, "label"), color: C.ash }}>{meta}</Text> : null}
      </View>
      {children}
    </View>
  );
}
