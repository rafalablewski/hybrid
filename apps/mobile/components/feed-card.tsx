import { type ReactNode } from "react";
import { View, Text, type TextStyle } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import {
  FEED_ROW_PAD,
  feedFigureText,
  cardLead,
  cardQualifier,
  cardRecords,
  cardSetLines,
  feedHeadlineEarnsLead,
  feedHeadlineText,
  feedSharePayload,
  feedStatParts,
  feedSubjectKey,
  feedTierChip,
  isFeedSaved,
  type CardLead,
  type CardRecords,
  type FeedDetail,
  type FeedItemView,
  type FeedStat,
  type Relation,
  type WeightUnit,
} from "@hybrid/core";
import { colors } from "@hybrid/core";
import { F, fs, leading, tracking, PressScale as Pressable , trackFigure} from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { runShare, toggleSavedPost, useFeedSaved } from "../lib/feed-actions";
import { GUTTER, RADIUS, Avatar } from "./aurora/kit";
import { FeedContextMenu, FeedMenuTrigger } from "./feed-menu";

/**
 * THE FEED ROW (mobile) — twin of apps/web/components/feed-card.tsx. Both
 * render the SAME `FeedDetail` computed in core (packages/core/src/feed-card.ts),
 * so the zones, the moment weighting and the provenance rules are one
 * implementation with two renderers.
 *
 * A post is a full-width ROW, not a card: no surface, no border radius, just a
 * hairline under each post, and the row bleeds under AuroraScreen's 12dp gutter
 * so the divider runs edge to edge (the timeline treatment). Moment still
 * drives weight — a p0 record gets the display headline and the big figure —
 * but the container itself never changes.
 *
 * See the web file for the zone map; the rules are identical here:
 * moment drives weight, the tier chip proves the FIGURE (the tick proves the
 * person), tier 0 wears no badge, and a device-measured figure carries the
 * watch signature.
 */

// The row bleeds by the kit's GUTTER — the same value the list's content
// padding uses (feed-view.tsx) — so the divider runs under the physical
// screen edge with content still on the column.

export function WatchGlyph({ color }: { color: string }) {
  return (
    <Svg width={11} height={13} viewBox="0 0 11 14" fill="none">
      <Rect x={1.5} y={3.2} width={8} height={7.6} rx={2.4} stroke={color} strokeWidth={1.3} />
      <Path d="M3.5 3V1.2h4V3M3.5 11v1.8h4V11" stroke={color} strokeWidth={1.3} />
    </Svg>
  );
}

function Bolt({ color, filled }: { color: string; filled: boolean }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 16 16">
      <Path d="M8.8 1.5 3.6 9h3.2l-.9 5.5L11.4 7H8.1Z" fill={filled ? color : "none"} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  );
}

function Bubble({ color }: { color: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 16 16">
      <Path d="M13.5 7.2c0 2.9-2.5 5-5.5 5-.7 0-1.4-.1-2-.3L2.7 13l.6-2.6a5 5 0 0 1-1.3-3.2c0-2.9 2.5-5 5.5-5s6 2.1 6 5Z" fill="none" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

/**
 * ZONE F's private glyphs — the twins of the web card's, drawn from the same
 * path data in the same 16-unit box at the same 1.5 stroke as the bolt and the
 * bubble beside them. (The Aurora icon set is a 72-unit box on its own stroke
 * ramp, so a share icon pulled from there would draw visibly lighter than the
 * two glyphs it sits next to.)
 *
 * The bookmark FILLS when saved, like the bolt does when cheered: saved state
 * has to be readable while scrolling past, not on inspection.
 */
function Bookmark({ color, filled }: { color: string; filled: boolean }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 16 16">
      <Path d="M4 2.5h8v11l-4-3-4 3Z" fill={filled ? color : "none"} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  );
}

/** An arrow leaving a tray — the universal "take this out of here". */
function ShareOut({ color }: { color: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 16 16">
      <Path d="M8 10.5V2.2M5.3 4.9 8 2.2l2.7 2.7" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3.2 8.6v4.2c0 .4.3.7.7.7h8.2c.4 0 .7-.3.7-.7V8.6" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** A mono uppercase chip. `tone` is a brand accent constant; undefined = ash. */
export function Chip({ children, tone }: { children: ReactNode; tone?: string }) {
  const C = useTheme().palette;
  const col = tone ? txt(C, tone) : C.ash;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: tone ? col : C.line, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start" }}>
      {typeof children === "string" ? (
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: col }}>{children.toUpperCase()}</Text>
      ) : (
        children
      )}
    </View>
  );
}

/**
 * THE FOOTER — the session's aggregates, and the card's provenance.
 *
 * It used to be three equal columns, each stacking a value over an uppercase
 * label: a data TABLE, arguing with the content above it for the same
 * attention, and giving tonnage no unit at all. A session's aggregates are a
 * footnote to the record, so they read as one quiet line.
 *
 * NO SEPARATOR CHARACTER. The house rule prefers real layout to a joined
 * string, and here it is available: the figure is chalk and its unit is ash, so
 * a gap alone divides "50 MIN" from "5,360 KG" without a dash between them.
 *
 * The HR figure is no longer drawn in teal. On a card whose one accent is
 * already spent on the improvement, a single coloured number in the footer is
 * the only colour left and reads as emphasis it hasn't earned — the opened post
 * keeps the channel, where the figure has room to mean something.
 *
 * The TIER CHIP lives here now rather than on a record line: provenance
 * qualifies the whole post, not one lift inside it. So the footer draws
 * whenever there are stats OR a tier — a shared PR post has no aggregates and
 * must still be able to say how the claim was corroborated.
 */
function FooterLine({ stats, tier, units }: { stats: FeedStat[]; tier?: FeedDetail["tier"]; units: WeightUnit }) {
  const C = useTheme().palette;
  const { t, lang } = useLang();
  const chip = feedTierChip(tier);
  if (!stats.length && !chip) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12, rowGap: 6, borderTopWidth: 1, borderTopColor: C.line, marginTop: 10, paddingTop: 9 }}>
      {stats.map((s) => {
        const p = feedStatParts(s, units, lang);
        return (
          <View key={s.key} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            {p.device ? <WatchGlyph color={C.ash} /> : null}
            <Text style={{ fontFamily: F.monoBold, fontSize: fs.micro, color: C.chalk }}>
              {p.value}
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, color: C.ash }}>
                {` ${(p.unit ?? t(p.unitKey!)).toUpperCase()}`}
              </Text>
            </Text>
          </View>
        );
      })}
      {chip ? (
        // ASH, not the accent. The accent is the "go" colour and it is spent on
        // the improvement; provenance is a fact about the claim, not a score.
        <View style={{ marginLeft: "auto" }}>
          <Chip>{`${chip.short} ${t(chip.labelKey)}`}</Chip>
        </View>
      ) : null}
    </View>
  );
}

/** ZONE C's one qualifier — a delta in the accent or a short ash FIRST, never
 *  both and never two slots. Core decides which (`cardQualifier`). */
function Qualifier({ of }: { of: { deltaPct?: number; firstEver?: boolean } }) {
  const C = useTheme().palette;
  const { t } = useLang();
  const q = cardQualifier(of);
  if (!q) return null;
  return (
    <Text style={{ fontFamily: F.monoBold, fontSize: fs.micro, letterSpacing: q.kind === "first" ? tracking.caps : undefined, color: q.kind === "delta" ? txt(C, colors.lime) : C.ash }}>
      {q.kind === "delta" ? q.text : t(q.labelKey).toUpperCase()}
    </Text>
  );
}

/**
 * Zone C — THE RECORDS this workout set, listed one after another.
 *
 * A record used to be a card of its own that named the heaviest lift and
 * reduced the others to "3 PRs this session". They are lines on the workout
 * now — and the LOUDEST of them has since been promoted again, out of this list
 * and up into the hero figure (core `cardRecords`). What is left here is the
 * runner-up, and past that a count that opens (the post has all of them).
 *
 * THREE TREATMENTS ON THE LINE, not six: the lift, its figure, and ONE
 * qualifier at the far edge. The tier chip left for the footer (provenance
 * belongs to the post, not to one lift in it) and "first time trained" — a
 * lowercase sentence doing a badge's job — collapsed into the same slot as the
 * delta, which it can never collide with.
 */
function PrLines({ records, units }: { records: CardRecords; units: WeightUnit }) {
  const C = useTheme().palette;
  const { t } = useLang();
  const shown = records.lines;
  const rest = records.rest;
  const total = records.shown.length + rest;
  return (
    <View style={{ marginTop: 8 }}>
      {shown.map((pr, i) => {
        const fig = feedFigureText(pr.topLoadKg, units);
        return (
          <View key={`${pr.lift}-${i}`} style={{ flexDirection: "row", alignItems: "baseline", gap: 8, paddingVertical: 3 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{pr.lift}</Text>
            <Text style={{ fontFamily: F.monoBold, fontSize: fs.note, color: C.chalk }}>
              {fig.value}
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{` ${fig.unit}`}</Text>
            </Text>
            <View style={{ marginLeft: "auto" }}><Qualifier of={pr} /></View>
          </View>
        );
      })}
      {rest > 0 ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{t("feed.prCount").replace("{n}", String(total))}</Text> : null}
    </View>
  );
}

function TopSets({ sets, units }: { sets: NonNullable<FeedDetail["sets"]>; units: WeightUnit }) {
  const C = useTheme().palette;
  if (!sets.length) return null;
  return (
    <View style={{ marginTop: 8 }}>
      {sets.map((l, i) => {
        const load = l.loadKg != null ? feedFigureText(l.loadKg, units) : null;
        return (
          <View
            key={`${l.name}-${i}`}
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12, paddingVertical: 5, borderBottomWidth: i === sets.length - 1 ? 0 : 1, borderBottomColor: C.line }}
          >
            <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.semi, fontSize: fs.body, color: C.chalk }}>{l.name}</Text>
            <Text style={{ fontFamily: F.monoBold, fontSize: fs.caption, color: C.chalk }}>
              {l.sets} × {l.reps}
              {load ? <Text style={{ color: C.ash }}>{` — ${load.value} ${load.unit}`}</Text> : null}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * ZONE C — THE ONE BIG NUMBER. Core decides whether a card gets one and where
 * it comes from (`cardLead`); this only draws it. A record-setting SESSION now
 * reaches this treatment, which it never could while the gate read
 * `archetype === "stat"` — see the note on `cardLead`.
 */
function Figure({ lead, units }: { lead: CardLead; units: WeightUnit }) {
  const C = useTheme().palette;
  const { t } = useLang();
  const fig = lead.figureKg != null && lead.figureKg > 0 ? feedFigureText(lead.figureKg, units) : null;
  const e1 = lead.e1rmKg != null ? feedFigureText(lead.e1rmKg, units) : null;
  return (
    <>
      {/* THE LIFT, as the figure's own label. On a session the headline no
          longer names anything (feedHeadlineEarnsLead), so without this the
          card would open on a bare "210" with nothing saying what was lifted.
          A shared-PR post's headline already says it and passes label: null —
          the same lift twice in one card is the noise this whole pass removes. */}
      {lead.label ? (
        <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, color: C.ash, marginTop: 9 }}>
          {lead.label.toUpperCase()}
        </Text>
      ) : null}
      {fig ? (
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: lead.label ? 3 : 4 }}>
          <Text style={{ fontFamily: F.monoBold, fontSize: fs.stat, lineHeight: leading(fs.stat, "tight"), letterSpacing: trackFigure(fs.stat), color: C.chalk }}>{fig.value}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.title, color: C.ash }}>{fig.unit}</Text>
          {/* THE ONE QUALIFIER, at the far edge of the figure's own line. The
              tier chip used to hold this slot and has gone to the footer:
              provenance qualifies the post, an improvement qualifies THIS
              number. */}
          <View style={{ marginLeft: "auto" }}><Qualifier of={lead} /></View>
        </View>
      ) : null}
      {/* The honest second number, and only that — the delta left for the slot
          above rather than sharing this line with an estimate. */}
      {e1 ? (
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 4 }}>
          {t("feed.e1rm").replace("{v}", `${e1.value} ${e1.unit}`)}
        </Text>
      ) : null}
    </>
  );
}

/** The card's content zones, pressable when there's a workout to open behind
 *  them and a plain View when there isn't — so a status post never advertises
 *  a tap that leads nowhere. */
function Zones({ onPress, children }: { onPress?: () => void; children: ReactNode }) {
  const { t } = useLang();
  if (!onPress) return <View>{children}</View>;
  return (
    <Pressable onPress={onPress} noScale accessibilityRole="button" accessibilityLabel={t("feed.open")}>
      <View>{children}</View>
    </Pressable>
  );
}

/**
 * ZONE F — the actions row, EXPORTED because the individual post screen
 * (app/post.tsx) carries the identical row. Two copies of kudos/comment/save/
 * share is how the same post comes to offer different verbs depending on
 * whether you're looking at it in the stream or on its own page.
 *
 * No border of its own — the row's closing hairline is the only line a post
 * gets, X-style.
 */
export function FeedActions({
  item,
  headline,
  onKudos,
  onComments,
}: {
  item: FeedItemView;
  /** the row's own headline, already translated — so what you share reads like
   *  what you tapped. */
  headline: string;
  onKudos: () => void;
  onComments: () => void;
}) {
  const C = useTheme().palette;
  const { t } = useLang();
  // Saving is per-device and optimistic — the store updates before the write,
  // so the glyph fills on the press frame (lib/feed-actions.ts).
  const saved = isFeedSaved(useFeedSaved(), feedSubjectKey(item));
  return (
  // FOUR GLYPHS, ONE VISUAL CLASS. Kudos and comment used to wear their names
  // while save and share stood bare, so the row read as two labelled buttons
  // plus two unexplained marks. The words are gone and a COUNT takes their
  // place — but only when there is one, because "0" beside a bolt is worse than
  // silence. The labels themselves move to the accessibility layer, where they
  // were missing entirely: the visible text had been doing that job.
  <View style={{ flexDirection: "row", alignItems: "center", gap: 18, marginTop: 10 }}>
    <Pressable onPress={onKudos} hitSlop={8} accessibilityRole="button" accessibilityState={{ selected: item.kudosedByMe }} accessibilityLabel={t("feed.kudos")}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Bolt color={item.kudosedByMe ? txt(C, colors.lime) : C.ash} filled={item.kudosedByMe} />
        {item.kudos > 0 ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: item.kudosedByMe ? txt(C, colors.lime) : C.ash }}>{item.kudos}</Text>
        ) : null}
      </View>
    </Pressable>
    <Pressable onPress={onComments} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("w.social.comment")}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Bubble color={C.ash} />
        {item.comments > 0 ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{item.comments}</Text> : null}
      </View>
    </Pressable>

    {/* THE RIGHT-HAND PAIR — the two PRIVATE verbs, pushed to the far edge
        so the row splits into what you give the author (kudos, comment) and
        what you do for yourself. Neither carries a count: a save is nobody
        else's business and a share isn't a score. */}
    <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 14 }}>
      <Pressable onPress={() => toggleSavedPost(item)} hitSlop={8} accessibilityRole="button" accessibilityState={{ selected: saved }} accessibilityLabel={t(saved ? "feed.unsave" : "feed.save")}>
        {/* Saved fills in CHALK, not the accent: filled-vs-outline already
            carries the state, and lime is spent on the PUBLIC action (the
            bolt) — one accent per row, and a save is nobody's business. */}
        <Bookmark color={saved ? C.chalk : C.ash} filled={saved} />
      </Pressable>
      <Pressable onPress={() => { runShare(feedSharePayload(item, headline || item.title)); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("feed.share")}>
        <ShareOut color={C.ash} />
      </Pressable>
    </View>
  </View>
  );
}

export interface FeedCardProps {
  item: FeedItemView;
  units: WeightUnit;
  onOpenProfile: (handle: string) => void;
  onKudos: () => void;
  onComments: () => void;
  /** Open the post — the WHOLE workout behind this row (feed-workout.tsx).
   *  Absent for cards with no session behind them (a status post), and the
   *  content zones then aren't pressable. */
  onOpen?: () => void;
  onDelete?: () => void;
  /** A change the ⋯ menu made to the AUTHOR rather than this row — a follow
   *  (every card by that person now reads differently) or a block (they leave
   *  the stream). The screen owns the list, so it applies it. */
  onAuthorChanged?: (change: { authorId: string; relation?: Relation; blocked?: boolean }) => void;
  children?: ReactNode;
}

export default function FeedCard({ item, units, onOpenProfile, onKudos, onComments, onOpen, onDelete, onAuthorChanged, children }: FeedCardProps) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const d = item.detail;
  const moment = d?.moment ?? "p2";

  // The headline is still COMPOSED for every card — the share payload and the
  // opened post both need it. What changed is whether ZONE B draws it: core
  // answers that (feedHeadlineEarnsLead), so an auto "Afternoon workout" stops
  // being the largest type on twenty consecutive rows.
  const headline = feedHeadlineText(item, t);
  const leadsWithHeadline = feedHeadlineEarnsLead(item);
  const lead = cardLead(d);
  const records = cardRecords(d);
  const setLines = cardSetLines(d?.sets, records.shown);

  // The app's TITLE face (the twin of web's --font-heading): Archivo. A post's
  // headline is a heading, so it draws in the same face as every other heading
  // in the product.
  //
  // ONE loud thing per card. A p0 that carries a hero figure sets its headline
  // at the ordinary title rung: the number is the moment, and a display-weight
  // heading above a 46pt figure is two heroes arguing. A p0 with no figure —
  // some future archetype that leads with words — still gets the big rung.
  const headlineStyle: TextStyle =
    moment === "p0" && !lead
      ? { fontFamily: F.black, fontSize: fs.headline, lineHeight: leading(fs.headline, "tight"), letterSpacing: tracking.display }
      : { fontFamily: F.bold, fontSize: fs.title, lineHeight: leading(fs.title, "snug") };

  // "Why you're seeing this" — a ranked card from someone the viewer doesn't
  // follow must be able to say why it's here, or it shouldn't be here at all.
  // It rides ABOVE the row as a kicker: identity is one line now, and the
  // reason is about the FEED's choice, not about the person.
  const reason = item.reason ? t(item.reason.key) : null;
  const handle = item.author.handle ? `@${item.author.handle}` : null;

  // The row's body, separated from its full-bleed frame so the long-press
  // context menu can wrap CONTENT of the row's true width: the frame keeps the
  // negative margin and the divider (a preview snapshot should not carry the
  // stream's hairline), the body keeps the gutter padding.
  //
  // The VERTICAL pad is a function of the row's MOMENT (core FEED_ROW_PAD): a
  // p0 opens up, a p2 tightens, and the difference between them is the ranking
  // expressed as rhythm rather than as order. It belongs to the BODY rather
  // than the frame, so the lifted preview carries the same rhythm as the row it
  // was lifted from. Both clients read the same map.
  const body = (
    <View style={{ paddingHorizontal: GUTTER, paddingVertical: FEED_ROW_PAD[moment] }}>
      {/* "Why you're seeing this" — a kicker over the row, because it is the
          feed explaining ITSELF, not a fact about the athlete. */}
      {reason ? (
        <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginBottom: 6 }}>{reason}</Text>
      ) : null}

      {/* ZONE A — identity, ONE line: avatar, name, handle, time. The name and
          the handle are the parts that can be any length, so they are the parts
          that shrink (the handle first — a name is what you recognise); the
          timestamp never shrinks and never wraps, so a post always says when. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable onPress={() => onOpenProfile(item.author.handle)}>
          <Avatar url={item.author.avatarUrl} name={item.author.displayName} handle={item.author.handle} size={36} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>
            {item.author.displayName || handle || t("w.social.you")}
          </Text>
          {/* The handle only earns its own slot when the name isn't already it. */}
          {handle && item.author.displayName ? (
            <Text numberOfLines={1} style={{ flexShrink: 4, fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{handle}</Text>
          ) : null}
          {item.when ? (
            // A spaced en dash divides the two ash figures — never a middot.
            // (A gap alone can't: handle and time are the same face and colour,
            // so with only space between them they read as one string.)
            <Text numberOfLines={1} style={{ flexShrink: 0, fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>
              {handle && item.author.displayName ? "– " : ""}{item.when}
            </Text>
          ) : null}
        </View>
        {/* ZONE A, right — the overflow menu (trigger + menu in one, the
            system's glass menu on iOS 26). This corner used to hold a bare ×
            on your own posts: an unlabelled destructive control, and nothing at
            all on everyone else's, so the stream had no answer to "I don't want
            to see this". Delete now lives INSIDE the menu, labelled and
            explained. Renders nothing when the menu would have no rows (core
            decides — my own session/PR row has nothing to offer). */}
        <FeedMenuTrigger
          handle={item.author.handle}
          authorId={item.author.id}
          mine={item.mine}
          subjectType={item.subjectType}
          subjectId={item.subjectId}
          relation={item.relation}
          onDelete={onDelete}
          onAuthorChanged={onAuthorChanged}
        />
      </View>

      {/* ZONES B–E are ONE target: the post opens to the whole workout behind
          it (the top sets are a preview, not the session). The actions row
          below stays outside it, so a kudos is never an accidental open.
          noScale — a timeline row is not a button that should shrink. */}
      <Zones onPress={onOpen}>
        {/* ZONE B — the headline, drawn only when it earns the card's loudest
            line. A title the CLOCK wrote is not a headline (core decides). */}
        {leadsWithHeadline && headline ? <Text style={{ ...headlineStyle, color: C.chalk, marginTop: 8 }}>{headline}</Text> : null}

        {/* ZONE C — figures. The hero first: a shared PR's own number, or the
            loudest record a session set. */}
        {lead ? <Figure lead={lead} units={units} /> : null}
        {/* …then the runner-up records, without the one the hero took. The tier
            chip goes with whichever of the two is drawing the loudest claim. */}
        {records.lines.length > 0 || records.rest > 0 ? (
          <PrLines records={records} units={units} />
        ) : null}
        {/* The lifts the records above already named are dropped from the top
            sets — the same lift twice in one card is noise (core cardSetLines). */}
        {setLines.length > 0 ? <TopSets sets={setLines} units={units} /> : null}
        {/* The footer draws for a tier alone, so a shared PR post with no
            aggregates can still say how its claim was corroborated. */}
        <FooterLine stats={d?.stats ?? []} tier={d?.tier} units={units} />

        {/* ZONE E — words */}
        {/* RN has no inherited font: a Text with no fontFamily draws in the
            PLATFORM face, not Archivo — which is what set the feed's prose apart
            from every other screen's. */}
        {item.body ? <Text style={{ fontFamily: F.reg, color: d?.archetype === "text" ? C.chalk : C.ash, fontSize: fs.body, lineHeight: leading(fs.body), marginTop: 8 }}>{item.body}</Text> : null}
      </Zones>

      {/* Legacy chips — only when core had no structured detail to give. */}
      {!d && (item.chips?.length ?? 0) > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {item.chips.map((c, i) => <Chip key={i}>{c}</Chip>)}
        </View>
      ) : null}

      <FeedActions item={item} headline={headline || item.title} onKudos={onKudos} onComments={onComments} />

      {children}
    </View>
  );

  return (
    <View style={{ marginHorizontal: -GUTTER, borderBottomWidth: 1, borderBottomColor: C.line }}>
      {/* LONG-PRESS PREVIEW (the context-menu-previews trial, feed card only):
          hold the row and it lifts off the receding screen with the same menu
          the ⋯ opens riding under it — the system's ContextMenu on iOS 26,
          plain content everywhere else. The ⋯ stays the accessible door on
          every platform; this is additive. */}
      <FeedContextMenu
        handle={item.author.handle}
        authorId={item.author.id}
        mine={item.mine}
        subjectType={item.subjectType}
        subjectId={item.subjectId}
        relation={item.relation}
        onDelete={onDelete}
        onAuthorChanged={onAuthorChanged}
      >
        {body}
      </FeedContextMenu>
    </View>
  );
}
