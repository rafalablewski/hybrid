import { type ReactNode } from "react";
import { View, Text, type TextStyle } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import {
  FEED_STAT_LABEL_KEY,
  feedDeltaText,
  feedFigureText,
  cardPrLines,
  cardSetLines,
  feedHeadlineText,
  feedSharePayload,
  feedStatText,
  feedSubjectKey,
  feedTierChip,
  isFeedSaved,
  type FeedDetail,
  type FeedItemView,
  type FeedStat,
  type Relation,
  type WeightUnit,
} from "@hybrid/core";
import { colors } from "@hybrid/core";
import { F, fs, leading, serifIf, tracking, PressScale as Pressable } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { runShare, toggleSavedPost, useFeedSaved } from "../lib/feed-actions";
import { Avatar } from "./social-kit";
import { GUTTER, RADIUS } from "./aurora/kit";
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

function StatRow({ stats, units }: { stats: FeedStat[]; units: WeightUnit }) {
  const C = useTheme().palette;
  const { t } = useLang();
  if (!stats.length) return null;
  return (
    <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: C.line, marginTop: 8, paddingTop: 8 }}>
      {stats.map((s) => (
        <View key={s.key} style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            {s.device ? <WatchGlyph color={C.ash} /> : null}
            <Text style={{ fontFamily: F.mono, fontSize: fs.note, fontWeight: "600", color: s.key === "hr" ? txt(C, colors.blue) : C.chalk }}>{feedStatText(s, units)}</Text>
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, color: C.ash, marginTop: 2 }}>{t(FEED_STAT_LABEL_KEY[s.key]).toUpperCase()}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Zone C — THE RECORDS this workout set, listed one after another.
 *
 * A record used to be a card of its own that named the heaviest lift and
 * reduced the others to "3 PRs this session". They are lines on the workout
 * now: the first two carry their own figure and their delta, and anything past
 * that is a count that opens (the post has all of them). The tier chip sits on
 * the LOUDEST line, because provenance belongs to the claim.
 */
function PrLines({ prs, tier, units }: { prs: NonNullable<FeedDetail["prs"]>; tier?: FeedDetail["tier"]; units: WeightUnit }) {
  const C = useTheme().palette;
  const { t } = useLang();
  const chip = feedTierChip(tier);
  const shown = cardPrLines(prs);
  const rest = prs.length - shown.length;
  return (
    <View style={{ marginTop: 6 }}>
      {shown.map((pr, i) => {
        const fig = feedFigureText(pr.topLoadKg, units);
        return (
          <View key={`${pr.lift}-${i}`} style={{ flexDirection: "row", alignItems: "baseline", gap: 8, paddingVertical: 3 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{pr.lift}</Text>
            <Text style={{ fontFamily: F.monoBold, fontSize: fs.note, color: C.chalk }}>
              {fig.value}
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{` ${fig.unit}`}</Text>
            </Text>
            {pr.deltaPct != null ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, colors.lime) }}>{feedDeltaText(pr.deltaPct)}</Text> : null}
            {pr.firstEver ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{t("feed.firstEver")}</Text> : null}
            {i === 0 && chip ? (
              <View style={{ marginLeft: "auto" }}>
                <Chip tone={colors.lime}>{`${chip.short} ${t(chip.labelKey)}`}</Chip>
              </View>
            ) : null}
          </View>
        );
      })}
      {rest > 0 ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{t("feed.prCount").replace("{n}", String(prs.length))}</Text> : null}
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
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, fontWeight: "600", color: C.chalk }}>
              {l.sets} × {l.reps}
              {load ? <Text style={{ color: C.ash }}>{` — ${load.value} ${load.unit}`}</Text> : null}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function Figure({ detail, units }: { detail: FeedDetail; units: WeightUnit }) {
  const C = useTheme().palette;
  const { t } = useLang();
  const tier = feedTierChip(detail.tier);
  const fig = detail.figureKg != null && detail.figureKg > 0 ? feedFigureText(detail.figureKg, units) : null;
  const e1 = detail.e1rmKg != null ? feedFigureText(detail.e1rmKg, units) : null;
  const deltaLine = [
    e1 ? t("feed.e1rm").replace("{v}", `${e1.value} ${e1.unit}`) : null,
    detail.deltaPct != null ? feedDeltaText(detail.deltaPct) : null,
  ].filter(Boolean).join(" ");
  return (
    <>
      {fig || tier ? (
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 4 }}>
          {fig ? (
            <>
              <Text style={{ fontFamily: F.monoBold, fontSize: fs.stat, lineHeight: leading(fs.stat, "tight"), letterSpacing: tracking.display, color: C.chalk }}>{fig.value}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.title, color: C.ash }}>{fig.unit}</Text>
            </>
          ) : null}
          {/* Provenance sits on the FIGURE's line, never beside the name. */}
          {tier ? (
            <View style={{ marginLeft: "auto" }}>
              <Chip tone={colors.lime}>{`${tier.short} ${t(tier.labelKey)}`}</Chip>
            </View>
          ) : null}
        </View>
      ) : null}
      {deltaLine || detail.firstEver ? (
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: detail.deltaPct != null ? txt(C, colors.lime) : C.ash, marginTop: 4 }}>
          {deltaLine}
          {detail.firstEver ? <Text style={{ color: C.ash }}>{deltaLine ? " — " : ""}{t("feed.firstEver")}</Text> : null}
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
  <View style={{ flexDirection: "row", alignItems: "center", gap: 18, marginTop: 10 }}>
    <Pressable onPress={onKudos}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Bolt color={item.kudosedByMe ? txt(C, colors.lime) : C.ash} filled={item.kudosedByMe} />
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: item.kudosedByMe ? txt(C, colors.lime) : C.ash }}>
          {item.kudos > 0 ? String(item.kudos) : t("feed.kudos")}
        </Text>
      </View>
    </Pressable>
    <Pressable onPress={onComments}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Bubble color={C.ash} />
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{item.comments > 0 ? String(item.comments) : t("w.social.comment")}</Text>
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
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const d = item.detail;
  const moment = d?.moment ?? "p2";

  const headline = feedHeadlineText(item, t);
  const setLines = cardSetLines(d?.sets, cardPrLines(d?.prs));

  // The app's TITLE face (serifIf — the twin of web's --font-heading): Archivo
  // under Aurora, Shippori Mincho under Kyoto Hour. A post's headline is a
  // heading, so it swaps with every other heading in the product — otherwise
  // the feed is the one tab still in sans on the light theme, with its own
  // "Now training" head in serif directly above it.
  const headlineStyle: TextStyle =
    moment === "p0"
      ? { fontFamily: serifIf(scheme, F.black), fontSize: fs.headline, lineHeight: leading(fs.headline, "tight"), letterSpacing: tracking.display }
      : { fontFamily: serifIf(scheme, F.bold), fontSize: fs.title, lineHeight: leading(fs.title, "snug") };

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
  const body = (
    <View style={{ paddingHorizontal: GUTTER, paddingVertical: 12 }}>
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
        {/* ZONE B — headline */}
        {headline ? <Text style={{ ...headlineStyle, color: C.chalk, marginTop: 8 }}>{headline}</Text> : null}

        {/* ZONE C — figures */}
        {d?.archetype === "stat" ? <Figure detail={d} units={units} /> : null}
        {d?.prs && d.prs.length > 0 ? <PrLines prs={d.prs} tier={d.tier} units={units} /> : null}
        {/* The lifts the records above already named are dropped from the top
            sets — the same lift twice in one card is noise (core cardSetLines). */}
        {setLines.length > 0 ? <TopSets sets={setLines} units={units} /> : null}
        {d?.stats && d.stats.length > 0 ? <StatRow stats={d.stats} units={units} /> : null}

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
