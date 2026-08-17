import { type ReactNode } from "react";
import { View, Text } from "react-native";
import {
  KEPT_ARC_ALPHA, readinessRole, readinessRingSegments, readinessRingTicks,
  type ReadinessDeficit, type ReadinessFact, type RingSegment, type SemanticRole,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { leading, tracking, fs, F } from "../../lib/ui";
import { APressCard, Ring, withAlpha } from "./kit";
import { AuroraIcon } from "./icons";

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
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.label, color: C.ash }}>
          {t("w.home.readiness.barKept").replace("{n}", String(deficit.kept))}
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.label, color: C.ash }}>
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
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.label, color: C.ash, marginTop: 12, lineHeight: leading(fs.nano) + 3 }}>
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
 * THE DAY OBJECT — the ring's card face, and the whole card is the door.
 *
 * Three things and no fourth: the ring, one line naming what is limiting the
 * day, and the bar underneath proving the parts sum to the figure. Reading it
 * takes about a second; opening it gives the full arithmetic. That is the
 * entire brief — one object an athlete meets every morning, which can be
 * glanced at and can also be audited, and which never says anything it cannot
 * defend.
 *
 * THE WHOLE CARD IS THE HIT TARGET. The Performance screen put this behind a
 * nano-mono row with a chevron on its right edge; a 10pt label is not something
 * anyone finds with a thumb, and the object being explained — the ring — was
 * not part of the control at all. Here the ring, the sentence and the bar are
 * one press, with the chevron riding the label row as the visible affordance
 * (the same grammar the freshness columns and the reading use).
 *
 * THE AFFORDANCE IS THE ⓘ, not an arrow or a chevron, because what this opens
 * is an EXPLANATION of the figure beside it — the same mark the freshness
 * columns and the readiness reading already wear for "explain THIS number". The
 * glyph is already a ring, so nothing draws a second one around it.
 *
 * NO DECORATIVE MARKER before the label, and the affordance sits on the RIGHT
 * of the label row: this is the SectionHead idiom the house rule fixes, not a
 * variation on it.
 */
export function ReadinessDayCard({ deficit, verdict, onOpen, style }: {
  deficit: ReadinessDeficit;
  verdict: { key: string; muscle: string | null; reasons: number; doorKey: string; deficit: number };
  onOpen: () => void;
  style?: Parameters<typeof APressCard>[0]["style"];
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const line = t(verdict.key).replace("{tissue}", verdict.muscle ? t(`w.home.today.muscle.${verdict.muscle}`) : "");
  return (
    <APressCard
      onPress={onOpen}
      a11yLabel={`${t("w.home.readiness.dayLabel")} ${deficit.kept} – ${line} – ${t(verdict.doorKey).replace("{n}", String(verdict.deficit))}`}
      style={style}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <ReadinessRing deficit={deficit} size={56} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.label, color: C.ash }}>
              {t("w.home.readiness.dayLabel")}
            </Text>
            <AuroraIcon name="info" size={13} color={C.ash} />
          </View>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, marginTop: 3, lineHeight: leading(fs.subtitle) }}>
            {line}
          </Text>
        </View>
      </View>
      {/* The proof, on the face. A ring can be glanced at but its runs cannot be
          compared around a circle; straightened out they can, and the two
          figures under the ends are the sum law stated in the open rather than
          asserted in a source comment. Drawn only when something actually left
          the 100 — at a clean score there is one run, and a full-width bar of a
          single colour under two labels reading "Kept 98 / Spent 0" is chrome. */}
      {deficit.costs.length > 0 && (
        <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line }}>
          <ReadinessBar deficit={deficit} height={8} />
        </View>
      )}
    </APressCard>
  );
}

/** A section head inside the explanation: display-face title left, mono meta on
 *  the RIGHT of the same row, no marker before it (house rule). */
export function ReadinessBlock({ head, meta, children }: { head: string; meta?: string; children: ReactNode }) {
  const { palette: C } = useTheme();
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <Text style={{ flex: 1, fontFamily: F.black, fontSize: fs.note, color: C.chalk }}>{head}</Text>
        {meta ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking.label, color: C.ash }}>{meta}</Text> : null}
      </View>
      {children}
    </View>
  );
}
