import { useEffect, useMemo, useState, type ReactNode } from "react";
import { View, Text } from "react-native";
import {
  fmtWeight, prRecordsBetween, splitFigure,
  type ActivityRange, type BodyweightInput, type LoggedSession, type PrRecord, type PrSet, type WeightUnit,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { F, PressScale as Pressable, TABULAR, fs, leading, space, trackFigure, tracking, ty } from "../../lib/ui";
import { ASection } from "./kit";

/**
 * RECORDS — the Progress cluster's own block: ONE QUOTE, THEN A LEDGER.
 *
 * These used to sit on the Performance tab's "Your week" card, computed over a
 * ROLLING seven days while the Today card counted a real calendar week — two
 * cards one tab apart, both labelled as the week, reporting different numbers.
 * A PR belongs to the period it happened in, so it belongs to whatever window
 * the Progress filter is showing, which is why the range arrives as a prop
 * rather than being resolved here.
 *
 * ── WHAT THIS WAS, AND WHY IT IS NOT THAT ──────────────────────────────────
 *
 * It shipped as a RAIL of equal cells, each a lift, a load at fs.display and a
 * caption ("more reps", "from 82.5"), with a 24dp dissolve painted over both
 * edges. Three things were wrong with it and all three are gone:
 *
 *   THE DISSOLVE PAINTED THE GROUND IT STOOD ON. It filled two LinearGradients
 *     with `C.ink` — but this block sits on the SCREEN, and the screen is not
 *     ink: AuroraField lays a 14% lime bloom, a 16% Muskmelon and a 10% blue
 *     glow over it. Ink on top does not dissolve anything, it DELETES the field
 *     for 24dp and leaves a black band with a hard inner edge. Worse, it was
 *     always on: the viewport width was only ever written by the scroll
 *     handler, so the first paint compared the content against a viewport of 0
 *     and lit the right edge before the athlete had touched it. A real soft
 *     edge has to mask ALPHA (a MaskedView, which this app does not carry);
 *     painting ink over ink is the version that is cheap and looks broken.
 *
 *   A SIXTH HORIZONTAL RAIL SAID NOTHING NEW. Today already scrolls sideways in
 *     five places. The peeking-cell affordance is fine; a rail of the same
 *     cards as everything above it is not a reason to build one.
 *
 *   THE FIGURE DID NOT ANSWER THE QUESTION. A load alone cannot tell
 *     `70 × 9 → 70 × 10` — six weeks grinding a rep out — from `65 × 8 →
 *     70 × 10`, your first plate at 70. Both print "70 kg", and "more reps"
 *     underneath is a caption, not a path.
 *
 * ── WHAT IT IS NOW ─────────────────────────────────────────────────────────
 *
 * A QUOTE and a LEDGER, in the market grammar the figures already imply:
 *
 *   THE QUOTE is the period's biggest move — the load at fs.stat in CHALK, the
 *     reps beside it as a quiet multiplier, the pair it moved between under it
 *     and the delta in chartreuse. The level is context; the change is the news,
 *     which is why the accent moved off the figure and onto the delta. A lime
 *     figure that had not moved (a rep record headlines a load that stood still)
 *     was claiming to be the thing that changed.
 *
 *   THE LEDGER is every other record, one line each: the lift, the pair, the
 *     delta. Tabular mono in a fixed column, so four records compare straight
 *     down the page — which is the whole value of the block and exactly what a
 *     rail could never do.
 *
 * THE PAIR IS THE DESIGN. Colour and SIZE carry the direction with no legend:
 * the origin is small and ash, the arrival is larger and chalk, the delta is
 * chartreuse. `×` and `→` are the same glyphs in every language this app
 * speaks, so the busiest line in the block needs no translation and no unit
 * conversion. A first-ever lift takes an em dash for its origin, so it uses the
 * same shape as everything else rather than a special case.
 *
 * NO CHART. The rail's successor carried an eight-session strip for a while: on
 * a record the newest bar is the maximum BY DEFINITION, so it drew the same
 * rising shape every time — a picture with one possible outcome. A lift's real
 * trajectory lives on its exercise page (`topLoadTrendWithPRs`), plotted
 * against every PR, which is the screen a record row should open into.
 *
 * Silent when the period holds none: an empty celebration is not a celebration.
 */

/** Records shown before the ledger offers "Show all" — a year can hold forty,
 *  and forty rows is a database, not a celebration. */
const LEDGER_CAP = 4;

/**
 * ONE PAIR — `70 × 9 → 70 × 10`, the move a record made.
 *
 * Sized, not just coloured: `from` sits a rung below `to` so the line GROWS as
 * it is read, which is the one thing every record has in common.
 *
 * ── THE COLUMNS WERE ALL TOO NARROW, AND HAD BEEN SINCE THEY SHIPPED ──────
 *
 * Every width here was a guess with a confident comment attached. The arrival
 * column reserved 62dp and its own note claimed "`120.5 × 12` is the widest
 * real pair" — that pair is TEN CHARACTERS of Söhne Mono at `fs.body`, which
 * is 10 × 14 × 0.6 = 84dp. It did not fit. Neither did "100 × 10" (67dp), nor
 * any other pair the ledger can print: the column was too narrow for the
 * ORDINARY case, not just the extreme one, so the row had been quietly cutting
 * the figure it exists to show.
 *
 * The others were the same story in miniature: the origin cut a ten-character
 * pair, and the delta cut "+12 reps", every Polish rep delta ("+1 powt." is
 * 62dp against 58), "+12 Wdh." and "+12.5 kg".
 *
 * These are MONO, so the width is the length: `monoWidthDp` in core, and the
 * numbers below are that function's answer for the widest string each column
 * can hold, not an estimate of it. Ten characters is the cap on a pair —
 * five for the load ("120.5", or "1,240" in pounds), three for " × ", two for
 * the reps — and `records.render.test.tsx` fails if any of them overruns.
 */

/**
 * THE WIDTHS, AND THE +1 IS DELIBERATE.
 *
 * Each column is its widest content PLUS ONE CHARACTER. A column sized to its
 * exact worst case has no tolerance at all: the arrival's widest pair is
 * exactly 84.0dp in an 84dp box, and at that point a sub-pixel rounding, a
 * locale that groups thousands where we did not expect it, or simply a string
 * nobody thought of takes it over. One character is the smallest unit the
 * content is made of, so it is the natural slack — and in mono it is a number
 * rather than a feeling.
 */

/** Ten characters at `fs.caption`: "+12 powt." and "+120.5 kg" are the widest
 *  deltas across the three languages, at nine. Reserved even when a row has no
 *  delta, so a ledger of four records does not step in and out at its right
 *  edge. */
const DELTA_W = 78;
/** Eleven characters of mono at `fs.body`. Ten is the widest pair `point()`
 *  can build — five for the load ("120.5", or "1,240" in pounds), three for
 *  " × ", two for the reps. */
const ARRIVAL_W = 92;
/** The same eleven characters at `fs.nano`. */
const ORIGIN_W = 66;

function Path({ r }: { r: PrRecord }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.xs }}>
      <Text numberOfLines={1} style={{ ...TABULAR, width: ORIGIN_W, textAlign: "right", fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>
        {r.prev ? point(r.prev) : "—"}
      </Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, opacity: 0.55 }}>→</Text>
      <Text numberOfLines={1} style={{ ...TABULAR, width: ARRIVAL_W, textAlign: "right", fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>
        {point(r.now)}
      </Text>
    </View>
  );
}

/** A set, as the pair prints it — bare numbers, because the unit is on the
 *  quote's own figure and repeating it four times per line is noise. */
const point = (p: PrSet): string => `${trim(p.load)} × ${p.reps}`;
const trim = (n: number): string => String(Math.round(n * 10) / 10);

export default function PeriodRecords({
  sessions,
  range,
  /** The window's name, as the head above it prints it — one source, so the
   *  card and this block can never disagree about which period is in force. */
  windowName,
  units,
  bw,
  onSession,
}: {
  sessions: LoggedSession[];
  range: ActivityRange;
  windowName: string;
  units: WeightUnit;
  bw?: BodyweightInput;
  onSession?: (id: string) => void;
}) {
  const { t, lang } = useLang();
  const { palette: C } = useTheme();
  const [all, setAll] = useState(false);

  const records = useMemo(
    () => prRecordsBetween(sessions, range.from, range.through + 1, bw),
    [sessions, range, bw],
  );

  // A new period is a new set of records — an expanded ledger must not carry over.
  useEffect(() => { setAll(false); }, [range.id]);

  if (records.length === 0) return null;

  const [quote, ...rest] = records;
  // A LIFT'S RECORDS SIT TOGETHER. Ranking is by gain, so the two rows of an
  // 80 × 1 / 70 × 10 day can land at opposite ends of the ledger — and the
  // second one, arriving alone under an unrelated lift, is the fused record all
  // over again from the reader's side. Grouping keeps each lift where its BEST
  // record ranked (so the order is still the gain's), puts the quote's sibling
  // directly under the quote, and is what makes "named once" mean anything.
  const grouped = [
    ...rest.filter((r) => r.lift === quote!.lift),
    ...groupByLift(rest.filter((r) => r.lift !== quote!.lift)),
  ];
  const rows = all ? grouped : grouped.slice(0, LEDGER_CAP);

  /** The delta, in the athlete's own units and never an estimate. */
  const delta = (r: PrRecord): string | null => {
    if (!r.delta) return null;
    if (r.delta.kind === "first") return t("w.home.act.prNew");
    if (r.delta.kind === "load") return `+${fmtWeight(r.delta.kg, units)}`;
    return r.delta.reps === 1
      ? t("w.home.act.prRepDeltaOne")
      : t("w.home.act.prRepDelta").replace("{n}", String(r.delta.reps));
  };

  /** Spoken form — the pair reads as words, and the axis a row is about is
   *  carried visually by the delta and by nothing a screen reader hears. */
  const spoken = (r: PrRecord): string =>
    [
      r.lift,
      t(r.axis === "load" ? "w.home.act.prAxisLoad" : "w.home.act.prAxisStrength"),
      r.prev
        ? t("w.home.act.prPath").replace("{a}", point(r.prev)).replace("{b}", point(r.now))
        : point(r.now),
      delta(r) ?? "",
      onSession && r.sessionId ? t("w.home.act.prOpen") : "",
    ]
      .filter(Boolean)
      .join(" – ");

  const open = (r: PrRecord) =>
    onSession && r.sessionId ? () => onSession(r.sessionId!) : undefined;

  const [value, unit] = splitFigure(fmtWeight(quote!.now.load, units));
  const quoteDelta = delta(quote!);
  const day = quote!.at
    ? new Date(quote.at).toLocaleDateString(lang, { weekday: "short" })
    : null;

  return (
    <View style={{ marginTop: 24 }}>
      {/* THE KIT'S OWN HEAD. The right slot carries the WINDOW and NOTHING ELSE
          — a block headed "Records" with no period would read as all-time, so
          the window is the one thing that has to be there.

          IT WAS HAND-ROLLED, at mono `micro` in SENTENCE CASE, which made it
          one of three spellings of a single eyebrow inside one scroll: sentence
          case here, uppercase `micro` on Exercises, uppercase `nano` on
          Endurance. All three now render through `ASection`, which is what the
          section-head ratchet has been pointing at all along — the standard
          existed, these three simply were not using it. */}
      <ASection title={t("w.home.act.recordsTitle")} meta={windowName} style={{ marginHorizontal: 2, marginTop: 0 }} />

      {/* ── THE QUOTE — the period's biggest move, ranked by the very percent
          the rows print, so the block cannot headline one record while the
          table argues for another. ─────────────────────────────────────── */}
      <Quoted onPress={open(quote!)} a11y={spoken(quote!)}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          {/* THE LIFT IS WHAT THE CELEBRATION IS ABOUT, and it was set in the
              smallest, quietest type in the block — 10dp ash uppercase, under a
              46dp figure. Reading size, chalk, the display face. */}
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.bold, fontSize: fs.subtitle, letterSpacing: tracking(fs.subtitle), color: C.chalk }}>
            {quote!.lift}
          </Text>
          {day && (
            <Text style={ty(C, "kicker")}>{day}</Text>
          )}
        </View>

        {/* THE FIGURE IS CHALK. The accent belongs to the change — see the
            header note. The reps ride beside it as a multiplier, at reading
            size, because they are the second coordinate of the same fact. */}
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 4 }}>
          <Text style={{ ...TABULAR, fontFamily: F.monoBold, fontSize: fs.stat, lineHeight: leading(fs.stat, "flush"), letterSpacing: trackFigure(fs.stat), color: C.chalk }}>
            {value}
            <Text style={{ fontSize: fs.subtitle, letterSpacing: tracking(fs.subtitle, "label"), color: C.ash }}> {unit}</Text>
          </Text>
          <Text style={{ ...TABULAR, fontFamily: F.mono, fontSize: fs.subtitle, color: C.ash }}>× {quote!.now.reps}</Text>
        </View>

        {/* THE ORIGIN ONLY. The quote printed the whole pair here — "50 × 8 →
            50 × 12" — under a figure that had just said "50 kg × 12": four
            numbers for a fact with three, with the biggest thing on the screen
            repeated 30dp beneath itself. The arrival is already the headline,
            so this line says the one part the headline cannot: where it came
            from. The delta sits WITH it rather than flush to the screen edge,
            which is where ~180dp of dead gutter used to be. */}
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: space.sm }}>
          {/* A DEBUT PRINTS NO ORIGIN. The ledger keeps the em dash, because
              there the pair is a SHAPE and a first record should read like every
              other row rather than as a special case. Here the shape is gone —
              this is a sentence, not a column — so an origin that does not exist
              says nothing at all, and the delta beside it already says "New".
              Printing the word twice, 8dp apart, is the fault this whole pass is
              about. */}
          {quote!.prev && (
            <Text style={{ ...TABULAR, fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>
              {t("w.home.act.prFrom").replace("{v}", point(quote!.prev))}
            </Text>
          )}
          {quoteDelta && (
            <Text style={{ ...TABULAR, fontFamily: F.mono, fontSize: fs.bodyLg, color: txt(C, C.lime) }}>{quoteDelta}</Text>
          )}
        </View>
      </Quoted>

      {/* ── THE LEDGER — every other record, one line each. A lift that set two
          records in one session (the 80 × 1 / 70 × 10 day) files two rows, and
          the second leaves the name column EMPTY the way a ledger omits a
          repeated key. Visually only: the spoken label still names the lift, so
          a reader never meets a record with no subject. ─────────────────── */}
      {rows.length > 0 && (
        <View style={{ marginTop: 22, gap: 13 }}>
          {rows.map((r, i) => (
            <Row
              key={`${r.lift} ${r.axis}`}
              name={i > 0 && rows[i - 1]!.lift === r.lift ? "" : r.lift}
              r={r}
              delta={delta(r)}
              a11y={spoken(r)}
              onPress={open(r)}
            />
          ))}
        </View>
      )}

      {/* THE EXPANDER — it GROWS IN PLACE, so it wears a bare ＋ and no ring,
          and its label is ash: the accent is the "go" colour and this goes
          nowhere. (It used to be a bare mono label in a rail slot, which is
          neither of the two shapes the exit grammar allows.) */}
      {!all && rest.length > LEDGER_CAP && (
        <Pressable
          onPress={() => setAll(true)}
          accessibilityRole="button"
          style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16, paddingVertical: 6 }}
        >
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>＋</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking(fs.micro, "label"), color: C.ash }}>
            {t("w.home.act.showAll").replace("{n}", String(records.length))}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** Same-lift records made adjacent, each group holding the position its best
 *  record earned. Stable: a lift that files one record does not move at all. */
function groupByLift(rows: PrRecord[]): PrRecord[] {
  const groups = new Map<string, PrRecord[]>();
  for (const r of rows) {
    const g = groups.get(r.lift);
    if (g) g.push(r);
    else groups.set(r.lift, [r]);
  }
  return [...groups.values()].flat();
}

/** The quote's press target — a record opens the session that set it, the same
 *  promise the figures above this block make. Plain when there is nothing to
 *  open, so an untappable figure never presses in. */
function Quoted({ onPress, a11y, children }: { onPress?: () => void; a11y: string; children: ReactNode }) {
  if (!onPress) return <View>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y}>
      {children}
    </Pressable>
  );
}

/** ONE LEDGER LINE — name, pair, delta. The name truncates and the pair never
 *  does: the pair is the data, and the lift is the part a reader can infer from
 *  the row above it. */
function Row({ name, r, delta, a11y, onPress }: {
  name: string;
  r: PrRecord;
  delta: string | null;
  a11y: string;
  onPress?: () => void;
}) {
  const { palette: C } = useTheme();
  const body = (
    // ── TWO LINES, AND THE ARITHMETIC IS WHY ────────────────────────────────
    //
    // The row carried four facts on ONE line: the lift, the origin, the
    // arrival and the delta. Add up what they actually need and it does not
    // close. The widest lift name in the catalogue is "Single Arm Dumbbell
    // Row" at 166dp; the path needs 60 + 84 with its arrow and gaps, so 162;
    // the delta needs 71; the gaps 22. That is 421dp of content on a 366dp
    // line, and it had been fitting only because three of the four were
    // truncating.
    //
    // Every way of closing that gap on one line costs something real. Shrink
    // the columns and the figures cut — that is where this started. Shrink the
    // NAME and the row fails at the only job its first column has, which this
    // file already fixed once and wrote down. Drop the origin and the row
    // stops showing the move it exists to show.
    //
    // So the row stops fighting for one line. THE SUBJECT AND ITS HEADLINE
    // share the top — the lift, and how far it moved — and the workings sit
    // underneath. The name gets 287dp and is never cut in any language; the
    // pair gets the whole left edge and lines up down the ledger. It is the
    // same answer the plate's base and the exercise card arrived at, for the
    // same reason: two facts that both vary do not share a line.
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
        {/* THE NAME TAKES WHAT IS LEFT, not a fixed 88dp. A repeated key may be
            omitted — that is what a ledger does — but a lift appearing ONCE was
            being cut to "Barbell Ben…" and "Dumbbell La…", which is the row
            failing at the only job the column has. Reading size and chalk for
            the same reason the quote's name changed: it is the subject. */}
        <Text
          numberOfLines={1}
          style={{ flex: 1, minWidth: 0, fontFamily: F.semi, fontSize: fs.body, color: name ? C.chalk : C.ash }}
        >
          {name}
        </Text>
        {/* THE DELTA IS THE ROW'S HEADLINE, so it sits on the row's own line —
            "+1 rep" is what you read the ledger FOR, and the pair below is the
            working that lets you check it. Its column is reserved even when a
            row has none, so four records do not step in and out at the right
            edge. */}
        <Text
          numberOfLines={1}
          style={{ ...TABULAR, width: DELTA_W, textAlign: "right", fontFamily: F.mono, fontSize: fs.caption, color: delta ? txt(C, C.lime) : "transparent" }}
        >
          {delta ?? ""}
        </Text>
      </View>
      <Path r={r} />
    </View>
  );
  if (!onPress) return <View accessibilityLabel={a11y}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y}>
      {body}
    </Pressable>
  );
}
