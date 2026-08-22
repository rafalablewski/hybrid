import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, ScrollView, StyleSheet, Text, View, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BAND_HOLD, BAND_WASH, DISCIPLINE_META, FOLD, FOLD_RISE, bandHue, bandText,
  blendOver, fs, inkHold, leading, space, tracking,
  type DayBand, type TrainingKind,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { accentColor, useTheme } from "../../lib/theme";
import { F, PressScale as Pressable, ty } from "../../lib/ui";
import { withAlpha } from "./field";
import { GUTTER, RADIUS } from "./geometry";
import { AuroraIcon, Glyph, SportMark } from "./icons";

/**
 * THE DAY BAND — the field at the head of Today.
 *
 * It replaces the readiness DAY CARD, and the difference is not decoration: the
 * card stated a diagnosis ("Shoulders is the limiter today") and drew a bar of
 * its own runs under it, which is a report. This states what to do. The ladder
 * that decides is `dayBand()` in @hybrid/core — this file renders and decides
 * nothing, which is the same contract the ring's own components hold.
 *
 * THREE OBJECTS, AND THAT IS THE WHOLE ANATOMY. A numeral, an instruction, one
 * sentence. What it deliberately does NOT have is the mono STAMP above and the
 * mono META line below that the first cut wore: three text objects in three
 * faces, each smaller and quieter than the last, where the top one labelled a
 * number nobody asked to have labelled ("READINESS 64") and the bottom one
 * repeated the headline in figures. The score is a numeral for the same reason
 * a clock has no label, and the sentence under the instruction has to add a
 * fact the instruction does not carry — the engine's own copy test holds that.
 *
 * ── ONE MATERIAL, WHICH IS WHY THERE IS NOTHING TO JOIN ──────────────────
 * The band is a WASH of the day's hue over the page ground, ramping to a fully
 * transparent last stop. Every rung, one strength. It is not a panel resting on
 * the screen — it IS the top of the screen, tinted.
 *
 * THAT ARRIVED LAST, after three attempts at the wrong problem. The band began
 * as a flat wash with a 1px rule across its bottom; the rule went, because a
 * hairline separates two surfaces that BOTH continue and here one of them
 * stopped. Then the ACTING rungs were a solid slab of accent, and a slab on a
 * near-black page has an edge — so the edge was faded over 26dp, which read as
 * a stripe of mud; then eased over 46dp in OKLab, which read as a better-shaped
 * stripe; then measured, which is where it ended: Wild Lime to the page ground
 * is most of the lightness range and its midpoint is a dark olive in EVERY
 * colour space. No finish makes that transition invisible.
 *
 * The seam was never a finish problem. It was two materials. Take the second
 * one away and the question does not need an answer — which is also why the
 * panel could get shorter (see PAD): a coloured slab has to earn its height by
 * being a colour, and a tint does not.
 *
 * ── THE ACCENT MOVED TO THE READING ──────────────────────────────────────
 * The slab was carrying a real fact — that this rung is ASKING for something,
 * as against reporting — and losing it would have cost the rule the fill was
 * there to state: a band that tells you not to train shows no colour of action.
 * So the fact moved onto the object it is about. An acting rung lights the
 * NUMERAL in the day's own hue at full strength; a reporting rung has no accent
 * on it anywhere. One numeral's worth of ink instead of a third of the screen.
 *
 * ── ONE INK, HELD BACK BY MEASUREMENT ────────────────────────────────────
 * Type is `chalk` everywhere now — there is only one ground, and it is dark.
 * `inkHold` still picks how far that ink may be held back, by measurement
 * rather than by a constant. The band's secondary lines used a fixed 0.78 and a
 * separate cool `ash` for the numeral: the second is what made a warm band read
 * as dirty (a cool grey on a warm ground at low chroma), and the first put the
 * sentence at 3.46:1 on Lyons Blue — the fill every score from 60 to 79 used to
 * resolve to. `inkOn` is not needed at all any more: choosing between two inks
 * was only ever a question a bright slab could ask.
 *
 * THE NUMERAL AND THE SENTENCE TAKE THE SAME HOLD, on purpose. Their rank comes
 * from TYPE — 34pt black against 14pt regular — not from tone, because the
 * alternative is a numeral dimmed until it stops being a figure, or a sentence
 * lifted until it argues with the instruction. One ink, one hold, two sizes.
 *
 * ── THE DECK ─────────────────────────────────────────────────────────────
 * `deck[0]` is the answer and at rest the band is exactly what it always was.
 * Pages 2–3 are the engine's next candidates, and they exist because the engine
 * has never had one answer — it has a ranked list, and printing only the top of
 * it is why an athlete watching it change its mind read it as arbitrary. Only
 * `dayBandDeck()` decides whether there IS a deck; this file draws what it is
 * given. Page 1 carries no commit control (it is already the answer); every
 * other page carries exactly one.
 *
 * FULL-BLEED, by the house idiom: the field spans the screen and each BLOCK
 * carries the horizontal inset, rather than the field carrying it and the pager
 * fighting it back with negative margins. It also takes the status-bar inset
 * for itself (`marginTop: -insets.top`) — the field is the TOP of the screen,
 * not a stripe below a black header, so the day's colour is the first thing on
 * it. The other two hub tabs still get the shell's inset.
 */

/**
 * THE BAND'S SPACING, in one place and on the shared scale.
 *
 * Every number here was a literal at its call site (18, 20, 9, 10, 8), which is
 * how a field ends up with five spacings that are each nearly one of the six
 * the app already has. `x` is the one derived value and it is not arbitrary:
 * the field's type is heavier than a card's, so it sits three points inside the
 * screen gutter to stay optically flush with the content column below it.
 *
 * SHORTENED, once the field stopped being a slab. A coloured panel has to earn
 * its height by being a colour; a tint does not, so every gap came down one
 * rung of the scale — about 24dp off the top of the screen, which is 24dp the
 * day’s first card gets back.
 */
const PAD = {
  x: GUTTER + 3,
  /** Above the chrome, under the status inset. */
  top: space.ms,
  /** Under the last row. */
  bottom: space.lg,
  /** Between the mark and the numeral. */
  markGap: space.sm,
  /** Numeral → instruction. */
  headTop: space.sm,
  /** Instruction → sentence. */
  sayTop: space.xs,
  /** Sentence → whatever control the page carries. */
  controlTop: space.md,
  /** Between the deck's dots. */
  dotGap: space.xs,
} as const;

/** The tap target every bare control in the app declares, whatever it draws. */
const HIT = 44;

/** The deck's page dot. `RADIUS.mark` is the app's dot radius, so the diameter
 *  it belongs to is twice it — stated once rather than as two literals that can
 *  drift apart. */
const DOT = RADIUS.mark * 2;

/**
 * THE MARK'S SLOT — a fixed box, drawn or not.
 *
 * The discipline mark is the one thing on the reading row that CHANGES with the
 * rung and with the deck's page: a swim on page one, a barbell on page two,
 * nothing at all on the rungs that name no discipline. Laid out as an ordinary
 * flex child it took its own glyph's width each time, so the numeral beside it
 * shifted — the day's reading, the most fixed fact on the screen, moving a few
 * points sideways every time the athlete swiped.
 *
 * So the slot is reserved whether or not anything is in it, and the glyph is
 * centred inside it. The number never moves.
 */
const MARK = { size: 18, slot: 22 } as const;

/** A discipline's own drawing, at the head of the band. Resolved through the
 *  endurance hub's `DISCIPLINE_META` so the mark on the band and the mark on
 *  that sport's lane are the same object. Gym has no discipline mark. */
function KindMark({ kind, color }: { kind: TrainingKind | null; color: string }) {
  const mark = kind && kind !== "gym" ? DISCIPLINE_META[kind]?.mark : null;
  return (
    <View
      // Decoration for a screen reader: whatever the mark names, the
      // instruction under it already says in words.
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: MARK.slot, height: MARK.slot, alignItems: "center", justifyContent: "center" }}
    >
      {kind === "gym" ? <Glyph name="barbell" size={MARK.size} color={color} />
        : !mark ? null
        : mark.kind === "sport" ? <SportMark sport={mark.sport} size={MARK.size} color={color} />
        : <Glyph name={mark.name} size={MARK.size} color={color} />}
    </View>
  );
}

/** A bare mono control — the grammar every word-in-a-field in this app uses
 *  (the done floor's RATE, the band's own correction). No chrome: it opens a
 *  sheet or commits a choice, but it is a WORD in a field rather than the end
 *  of a list of things, so neither half of the exit grammar applies to it. */
function BareControl({
  label, onPress, color, opacity = 1, hint,
}: {
  label: string;
  onPress: () => void;
  color: string;
  opacity?: number;
  hint?: string;
}) {
  const { palette: C } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={hint}
      hitSlop={12}
      style={{ minHeight: HIT, justifyContent: "flex-end", alignSelf: "flex-start", marginTop: PAD.controlTop }}
    >
      {/* The app's standard eyebrow, by name — `ty(C, "kicker")` rather than
          the five properties it is assembled from. The one thing this control
          does NOT take from the token is its INK: a bare control is lit in the
          day's own hue on the rung that asks for something, which is exactly
          what the token's colour override is for. */}
      <Text style={{ ...ty(C, "kicker", color), opacity }}>{label}</Text>
    </Pressable>
  );
}

export default function AuroraDayBand({
  deck,
  top,
  fold,
  onExplain,
  onNotToday,
  onRate,
  onPick,
}: {
  /** The day's answer, then the engine's next candidates. `deck[0]` is what the
   *  band says; a one-page deck draws no pager and no dots. */
  deck: DayBand[];
  /** THE APP'S OWN CHROME, rendered INSIDE the field: the header row, the hub
   *  pills and the masthead. The field is the whole top of Today, not a stripe
   *  under a black header — so the wordmark, the date and the title sit on the
   *  day's colour rather than above it, and the colour of the day is the first
   *  thing on screen. Passed in rather than imported so the other two hub tabs
   *  keep rendering the identical chrome on the page instead. */
  top?: ReactNode;
  /** 0 at rest, 1 folded — `foldProgress()` in core, published by the screen's
   *  scroller. Absent — a host that does not scroll — the field never folds. */
  fold?: Animated.Value;
  /** Opens the readiness sheet — the same door the ring has always had. */
  onExplain: () => void;
  /** Opens the rating sheet, on the ONE rung that asks for something back
   *  (`band.ask === "rate"`). Omitted where the host cannot present a sheet —
   *  the band then simply states the day and asks nothing, which is better than
   *  a question with no way to answer it. */
  onRate?: () => void;
  /** The correction on a PROTECTED day, where the app has guessed at something
   *  on tomorrow. Never offered on a rung that carries a deck: there the
   *  correction is to swipe and pick, which is the same act with a gesture
   *  instead of a word. */
  onNotToday?: () => void;
  /** Commit a candidate the athlete swiped to. Called with the page's index,
   *  never 0 — page 1 is already the answer and carries no control. */
  onPick?: (index: number) => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const insets = useSafeAreaInsets();
  // Measured rather than assumed: the field's height moves with the head's
  // step-down and with the locale, so the collapse has to read it. The WIDTH is
  // measured for the same reason the height is — the pager's page width is the
  // field's own width, and the field is full-bleed rather than a known column.
  const [size, setSize] = useState({ h: 0, w: 0 });
  const [page, setPage] = useState(0);
  const pager = useRef<ScrollView>(null);

  // A NEW DECK OPENS AT ITS OWN FIRST PAGE. Committing to a candidate re-ranks
  // the rotation, so the deck rebuilds with that candidate leading — and a
  // pager still parked on index 1 would then be showing the SECOND choice of a
  // list the athlete just reordered. The signature is the pages' own kinds, so
  // a deck that merely re-rendered does not scroll itself back under a finger.
  const signature = deck.map((b) => `${b.rung}:${b.kinds.join("+")}`).join("|");
  useEffect(() => {
    setPage(0);
    pager.current?.scrollTo({ x: 0, animated: false });
  }, [signature]);

  const band = deck[0];
  if (!band || band.rung === "none" || !band.head) return null;

  const pages = deck.length > 1 ? deck : [band];
  const shown = pages[Math.min(page, pages.length - 1)] ?? band;

  // ── ONE MATERIAL ────────────────────────────────────────────────────────
  //
  // Every band is a WASH of the day's hue over the page ground — the same
  // material at the same strength, whatever the rung. There is no second
  // substance and therefore no join anywhere on this screen.
  //
  // `bandHue` still says WHICH hue (amber for a calendar fact, blue for
  // recovery, lime for a day already trained, the reading's own role when it
  // is asking for something), and `band.fill` still says whether the rung is
  // ACTING or REPORTING. What changed is where that second fact is carried:
  // it used to be the ground, and it is now the READING.
  const hue = bandHue(band);
  const accent = hue ? accentColor(C, hue) : C.ink;
  // The ground the type is measured against is the ramp's top stop: most tint
  // means the lightest ground, which is the least contrast a light ink meets
  // anywhere on it.
  const ground = blendOver(accent, BAND_WASH[0]!.alpha, C.ink);
  const ink = C.chalk;
  // How far that ink may be held back HERE — a measurement, not a constant.
  const hold = inkHold(ink, ground, BAND_HOLD);
  // THE ACCENT IS THE NUMERAL, NOT THE SLAB. An acting rung lights the day's
  // reading in its own hue at full strength; a reporting rung has no accent
  // anywhere on it. That keeps the rule the solid field was there to state —
  // a band that tells you NOT to train shows no colour of action — while
  // costing the screen nothing but a numeral's worth of ink. Measured: the
  // accent-text on the wash's top stop runs 5.96–7.73:1 across all four hues,
  // clear of AA for body text, let alone a 34pt black figure.
  const acting = band.fill !== null;
  const lit = acting && hue && hue !== "ash" ? C.accentText[hue] : null;

  // THE FIELD COLLAPSES, it does not merely fade. Fading the rows while the box
  // kept its height left a dead slab of colour between the bar and the first
  // card — the field had gone and the hole it left had not. The pull is applied
  // to the MARGIN so the field never reflows its own layout, and it is
  // monotonic in `fold`, so a shrinking content height cannot feed back into
  // the scroll offset that produced it.
  const pull = Math.max(0, size.h - FOLD.end - COLLAPSE_REST);
  const at = (from: number, to: number, out: [number, number]) =>
    fold ? fold.interpolate({ inputRange: [from, to], outputRange: out, extrapolate: "clamp" }) : out[0];

  const onSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const w = e.nativeEvent.layoutMeasurement.width || 1;
    const next = Math.round(e.nativeEvent.contentOffset.x / w);
    if (next !== page) setPage(Math.max(0, Math.min(pages.length - 1, next)));
  };

  /** One page's own body. Every page is a whole band, so each carries its own
   *  instruction, its own evidence and its own mark — a page is not the one
   *  before it relabelled, which is the only thing that makes swiping worth
   *  the gesture. */
  const renderPage = (b: DayBand, i: number) => {
    const h = bandText(t, b.head ?? band.head!);
    const s = b.say.map((l) => bandText(t, l)).join(" ");
    // THE STEP-DOWN. A head over one line's worth of characters takes the next
    // rung down rather than wrapping to a third line or ellipsizing — an
    // instruction with its verb cut off is worse than a smaller instruction.
    // The engine holds every locale under two lines at `display`; this is what
    // makes the long end of that range sit properly.
    const headSize = h.length > 24 ? fs.headline : fs.display;
    return (
      <View
        key={`${b.rung}:${b.kinds.join("+")}:${i}`}
        style={{ width: size.w || undefined, paddingHorizontal: PAD.x }}
      >
        {/* THE WORDS ARE GROUPED, THE CONTROL IS NOT. `accessible` collapses a
            view and everything under it into one element, so wrapping the whole
            page would have taken the commit button out of the tree with it —
            the same trap the container had. This groups exactly the two lines
            that should be read as one thought, and states which page they are:
            a swipeable band read as one undifferentiated blob is a band with a
            hidden ranking. */}
        <View
          accessible
          accessibilityLabel={[
            pages.length > 1 ? t("w.home.band.deckPage").replace("{n}", String(i + 1)).replace("{total}", String(pages.length)) : null,
            h,
            s,
          ].filter(Boolean).join(" – ")}
        >
        <Text
          style={{
            fontFamily: F.black,
            fontSize: headSize,
            lineHeight: leading(headSize),
            letterSpacing: tracking(headSize),
            color: ink,
            marginTop: PAD.headTop,
          }}
        >
          {h}
        </Text>

        {s ? (
          <Text
            style={{
              fontFamily: F.reg,
              fontSize: fs.bodyLg,
              lineHeight: leading(fs.bodyLg),
              color: ink,
              opacity: hold,
              marginTop: PAD.sayTop,
            }}
          >
            {s}
          </Text>
        ) : null}
        </View>

        {/* THE COMMIT, and it is the only one the deck asks for. Swiping is
            free — you may read the whole ranking and swipe back — because a
            gesture that silently rewrote the day would make the ranking
            unreadable. One page, one tap, and the app learns what it got
            wrong. Page 1 carries none: it is already the answer. */}
        {i > 0 && onPick ? (
          <BareControl
            label={t("w.home.band.trainThis")}
            onPress={() => onPick(i)}
            color={ink}
            opacity={hold}
          />
        ) : null}
      </View>
    );
  };

  return (
    <Animated.View
      // NO `accessible` ON THE CONTAINER, and this is a fix rather than an
      // omission. `accessible` collapses a view and everything under it into
      // ONE element, so with it set the band read as a single label and its
      // controls — the ⓘ, the deck's dots, RATE, "Not today?" — stopped being
      // reachable at all. On the one screen an athlete opens every morning,
      // every affordance was invisible to VoiceOver.
      //
      // The tree does the work instead: each PAGE is its own grouped element
      // (head + sentence + its position in the deck), the figure carries its
      // own spoken form below, and every control is a button in its own right.
      onLayout={(e) => {
        const { height: h, width: w } = e.nativeEvent.layout;
        // Guarded: onLayout can fire with the values it already reported, and
        // this state feeds the fold's `pull`.
        setSize((prev) => (prev.h === h && prev.w === w ? prev : { h, w }));
      }}
      style={{
        marginHorizontal: -GUTTER,
        // The field runs under the status bar: it is the top of the screen, not
        // a stripe below it. The shell still owns the inset for the other two
        // hub tabs, so the field takes it back for itself here rather than
        // every hub screen having to own one.
        marginTop: -insets.top,
        marginBottom: fold ? at(0, 1, [0, -pull]) : 0,
        paddingTop: insets.top + PAD.top,
        paddingBottom: PAD.bottom,
      }}
    >
      {/* THE GROUND, and there is only one. A wash of the day's hue whose last
          stop is fully transparent, so the band resolves into whatever the
          screen's own ground is rather than meeting it. Nothing is drawn on
          top of the page here — the band IS the top of the page, tinted. That
          is why there is no edge to soften and no rule to draw: the seam
          problem was never a finish problem, it was two materials. */}
      <LinearGradient
        colors={BAND_WASH.map((s) => withAlpha(accent, s.alpha)) as unknown as readonly [string, string, ...string[]]}
        locations={BAND_WASH.map((s) => s.at) as unknown as readonly [number, number, ...number[]]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* THE CHROME leaves first and travels furthest — the field's own head is
          the part the bar is about to take over, so peeling it off before the
          instruction keeps the day's answer on screen longest. */}
      {top ? (
        <Animated.View
          style={{
            paddingHorizontal: PAD.x,
            opacity: at(0, 0.74, [1, 0]),
            transform: [{ translateY: at(0, 1, [0, FOLD_RISE.date]) }],
          }}
        >
          {top}
        </Animated.View>
      ) : null}

      <Animated.View style={{ opacity: at(0.35, 0.85, [1, 0]), transform: [{ translateY: at(0, 1, [0, FOLD_RISE.title]) }] }}>
        {/* THE READING, and it does not travel with the deck. The score is a
            fact about the body; the pages are candidates for the day. Only the
            MARK moves, because that names the discipline being offered. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: PAD.markGap, paddingHorizontal: PAD.x }}>
          {/* The slot is reserved whether or not there is a mark for it — see
              MARK. A reading that slides sideways as the deck is swiped is a
              reading that looks less like a fact than it is. */}
          <KindMark kind={shown.mark} color={lit ?? ink} />
          <Text
            // "69/100" is notation, and a screen reader saying "sixty-nine
            // slash one hundred" is not what the numeral means.
            accessibilityLabel={t("w.home.band.scale").replace("{n}", String(band.figure))}
            style={{
              flex: 1,
              fontFamily: F.black,
              fontSize: fs.hero,
              letterSpacing: tracking(fs.hero),
              // LIT when the rung is asking for something, held back when it is
              // reporting. The one signal, on the one object it is about.
              color: lit ?? ink,
              opacity: lit ? 1 : hold,
            }}
          >
            {band.figure}
            {/* THE SCALE, and it is why the numeral can stay unlabelled. "69"
                alone is a figure whose range the reader has to already know;
                "69/100" is a reading. It is NESTED so it takes the numeral's
                own baseline rather than a second row's guess at one, and it is
                held back to the band's measured ink — the accent belongs to the
                figure, and a lit denominator would divide the one signal in
                two. Notation, not copy: /100 is the same in every locale. */}
            <Text
              style={{
                fontFamily: F.mono,
                fontSize: fs.title,
                letterSpacing: tracking(fs.title),
                color: withAlpha(ink, hold),
              }}
            >
              /100
            </Text>
          </Text>
          {/* The ⓘ, and it stays the affordance: what this opens is an
              EXPLANATION of the figure beside it, which is the same grammar the
              ring, the freshness columns and the reading already use. The glyph
              is already a ring, so nothing draws a second one around it. */}
          <Pressable
            onPress={onExplain}
            accessibilityRole="button"
            accessibilityLabel={t("w.home.readiness.sheetTitle")}
            hitSlop={14}
            style={{ minWidth: HIT, minHeight: HIT, alignItems: "flex-end", justifyContent: "center" }}
          >
            <AuroraIcon name="info" size={17} color={ink} style={{ opacity: hold }} />
          </Pressable>
        </View>

        {pages.length > 1 ? (
          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onSettle}
            scrollEventThrottle={16}
          >
            {pages.map(renderPage)}
          </ScrollView>
        ) : (
          renderPage(band, 0)
        )}

        {/* THE DOTS, and they are the deck's only chrome. Drawn only when there
            is more than one page — an indicator that always shows a single dot
            is decoration that means nothing. */}
        {pages.length > 1 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: PAD.dotGap, marginTop: PAD.controlTop, paddingHorizontal: PAD.x }}>
            {pages.map((b, i) => (
              <View
                key={`dot-${i}`}
                style={{
                  width: DOT,
                  height: DOT,
                  borderRadius: RADIUS.mark,
                  backgroundColor: ink,
                  opacity: i === page ? hold : hold * 0.4,
                }}
              />
            ))}
          </View>
        ) : null}

        {/* THE ASK, and it is the only one the band makes. The done rung leads
            with "How did that feel?" because that answer is the single value
            the app cannot derive from anything it already holds — and a
            question printed in the largest type on the screen with no way to
            answer it would be worse than not asking. */}
        {onRate && band.ask === "rate" ? (
          <View style={{ paddingHorizontal: PAD.x }}>
            <BareControl
              label={t("session.feel.rate")}
              hint={t("session.feel.rateUnrated")}
              onPress={onRate}
              color={lit ?? C.accentText.lime}
            />
          </View>
        ) : null}

        {/* THE CORRECTION on a PROTECTED day. It survives the deck because a
            protected day has no candidates to swipe between: the app has
            guessed at something on TOMORROW, and the only useful answer is
            that it is not happening. Everywhere the deck exists, the deck IS
            this control. */}
        {onNotToday ? (
          <View style={{ paddingHorizontal: PAD.x }}>
            <BareControl
              label={t("w.home.band.notToday")}
              onPress={onNotToday}
              color={ink}
              opacity={hold}
            />
          </View>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

/** What is left of the field once it has folded — the gap the first card lands
 *  in, under the bar. Not zero: a card butted against the bar's lower edge
 *  reads as one object in two materials rather than a card under a header. */
const COLLAPSE_REST = 64;
