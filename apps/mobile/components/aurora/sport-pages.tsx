import { View, Text } from "react-native";
import {
  sportPageTitle,
  formatDisciplinePace, formatDuration, durationUnits,
  type SportPage,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { F, MAX_FONT_SCALE, fs, space, tracking, ty } from "../../lib/ui";
import Nameplate from "./nameplate";

/**
 * ENDURANCE — every discipline you train, ON ONE SCREEN.
 *
 * ── WHAT THIS WAS, AND THE CONTRADICTION IT SHIPPED WITH ──────────────────
 *
 * A PAGER: one sport per screen width, snapped, with a 164dp filled area chart
 * ("the ridge") on each. Its own docblock stated the section's purpose as *the
 * comparison, not the depth* — and then built the one layout in which comparing
 * is impossible. You cannot hold two figures against each other when the design
 * guarantees that only one of them is ever on screen; and the pager deliberately
 * showed NO peek of its neighbour, because a peek clipped the next sport's name
 * mid-letter. So the section's stated job and its geometry were in flat
 * contradiction, and the geometry was winning.
 *
 * THE RIDGE went with it, and it is worth saying why rather than just deleting
 * it. It was the largest object in the section and the least load-bearing:
 * eight weekly minute totals for a SINGLE sport, drawn with no baseline, no
 * target and no second sport to read against. What it could say was "some weeks
 * you ran more" — at 164dp, above two facts (68.4 km, 4:48/km) that were worth
 * more and were set at 16. It was also the app's SECOND inline chart language,
 * beside the shared 24dp history strip the Today rail drew — and that strip has
 * since gone the same way (see the exercise card), so the cluster now draws no
 * inline chart at all. The instruments that remain are the DEEP ones on a
 * sport's or a movement's own page, which is where a chart has room to be read.
 *
 * ── WHAT IT IS NOW ────────────────────────────────────────────────────────
 *
 * A grid of NAMEPLATES, two up. Six disciplines in roughly the height the pager
 * spent on one, all of them comparable at a glance, which is what the section
 * said it was for.
 *
 * THE NAME LEADS because this is a screen you SCAN. You are not reading these
 * cards, you are looking for one of them — and a discipline is the ideal
 * nameplate subject: "Running", "Cycling", "Rowing" are single short words, so
 * nothing wraps and nothing truncates. Core's `fitsNameplate` is where that
 * condition is checked rather than assumed; the movement catalogue fails it,
 * which is exactly why Today's Exercises keeps a different shape.
 *
 * MINUTES ARE STILL THE FIGURE — the one measure a swim, a ride and a squash
 * match share, and the reason the plates can be compared at all.
 *
 * THE SECOND FACT IS THE DISCIPLINE'S OWN RATE, in its own unit: /km on the
 * road, /100m in the pool, /500m on the erg, km/h on the bike, through
 * `formatDisciplinePace` — the one function that knows. Distance was the other
 * candidate and it is INFORMATIONALLY THE SAME CHOICE: with minutes already on
 * the plate, pace and distance each derive from the other, so the tie breaks on
 * which one an athlete reads directly. That is the pace. Distance, zones,
 * splits and every effort are one tap away on the sport's own page, which
 * already owns them.
 *
 * A SPORT WITH NO PACE shows the fact it actually carries — its longest effort
 * — and never a dash standing in for a metric it was never going to have. That
 * rule survives unchanged from the pager.
 *
 * NO EXIT RING. The pager needed one because a full-bleed page does not look
 * tappable; a plate carries a thing and opens it, which is what a card does.
 * Six ring-arrows left the screen with it.
 */
export default function AuroraSportPages({
  pages,
  onOpen,
  head = true,
}: {
  /** Built by the CALLER (core `sportPages`), not here, because the caller also
   *  needs the count: an empty window means the whole section — seam, headline
   *  and all — must not render, and a block that can only report its emptiness
   *  after it has been mounted leaves a stray heading above nothing. */
  pages: SportPage[];
  /** Where a plate goes. Omit it and the plates are not buttons at all — the
   *  same rule the pager had: never an affordance promising a destination there
   *  isn't. */
  onOpen?: (page: SportPage) => void;
  /** The block's own title row. Off on Today, whose GroupMark already says
   *  "Endurance" and carries the window in its right slot. */
  head?: boolean;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  if (pages.length === 0) return null;

  return (
    <View>
      {head && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: space.sm,
            marginHorizontal: space.xxs / 2,
            marginBottom: space.sm,
          }}
        >
          <Text style={{ fontFamily: F.black, fontSize: fs.title, letterSpacing: tracking(fs.title), color: C.chalk }}>
            {t("endurance.title")}
          </Text>
          <SportPagesWindow />
        </View>
      )}

      {/* TWO UP. Wide enough that a discipline's name sets on one line at
          fs.display, narrow enough that six of them are one glance rather than
          a scroll. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {pages.map((page) => (
          <Plate key={page.key} page={page} onOpen={onOpen} />
        ))}
      </View>
    </View>
  );
}

/**
 * THE WINDOW, said once for the whole section.
 *
 * Exported because on Today it does not render here: the Endurance GroupMark
 * carries it in the right slot, which is where the Explore SectionHead grammar
 * puts a head-level fact. It is the fix for the fault the lanes had worst —
 * every figure under this label answers for the same eight weeks, where the
 * lanes printed whole-history totals under an ALL TIME head, over an eight-week
 * chart, beneath a THIS WEEK card.
 */
export function SportPagesWindow() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={ty(C, "kicker")}>
      {t("w.home.end.window8")}
    </Text>
  );
}

/** One discipline. The plate is the whole target; `Nameplate` owns the type. */
function Plate({ page, onOpen }: { page: SportPage; onOpen?: (p: SportPage) => void }) {
  const { t } = useLang();
  const title = sportPageTitle(page, t);
  const hero = formatDuration(page.minutes, durationUnits(t));

  // A rate needs a discipline to be READ in. A ball sport has neither, so it
  // shows the fact every sport carries instead: how many times you turned up.
  //
  // IT WAS THE LONGEST EFFORT AND THAT DID NOT FIT. "LONGEST 1h 32min" beside a
  // "14h 43min" figure measures 168dp inside a 153dp plate, so it shipped
  // ellipsised — "LONGEST 1h 3…" — which is a plate saying a number it will not
  // finish. The count is short in all three languages (the German "4 EINHEITEN"
  // is the widest at 145dp) and it is COMPARABLE across every plate, which the
  // longest effort never was: 14h over four matches and 14h over twenty are
  // different training, and this is the fact that separates them. The longest
  // effort keeps its place on the sport's own page.
  const rate =
    page.secPerKm != null && page.discipline
      ? formatDisciplinePace(page.secPerKm, page.discipline)
      : page.efforts > 0
        ? `${page.efforts} ${t("endurance.efforts")}`
        : undefined;

  return (
    <View style={{ flexBasis: "47%", flexGrow: 1 }}>
      <Nameplate
        name={title}
        figure={hero}
        note={rate}
        onPress={onOpen ? () => onOpen(page) : undefined}
        a11y={[title, hero, rate].filter(Boolean).join(" – ")}
      />
    </View>
  );
}
