import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import {
  learnedFigure,
  learnedIntervalLabel,
  learnedIntervalKey,
  learnedDeltaLabel,
  learnedSense,
  learnedIsEmpty,
  LEARNED_SENSE_ROLE,
  sourceLabelKey,
  ALPHA,
  type LearnedChapterView,
  type LearnedFinding,
  type LearnedMonth,
  type LoggedSession,
} from "@hybrid/core";
import { useSessionsQuery } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { fs, F, leading, space, tracking, trackFigure, TABULAR } from "../../lib/ui";
import { useLearnedMonth } from "../../lib/use-learned";
import { AuroraScreen, ACard, APressCard, ASection, AMeter, RADIUS, Empty } from "./kit";
import { DoorRow } from "./week-verdict";
import { ArrowGlyph } from "./cta-label";
import { withAlpha } from "./field";

/**
 * WHAT WE LEARNED ABOUT YOU — the monthly story, and the visible face of the
 * model.
 *
 * Every figure on this screen was already being computed and every one of them
 * was buried: the adaptive ceilings sat behind a disclosure inside a sheet on a
 * card on the Performance screen, the measured clearance rate was a factor row
 * inside that same disclosure, and the readiness deficit was a ring that only
 * ever spoke about today. An athlete could use the app for three months and
 * never once be told what it had learned about them — which is the one thing
 * that makes logging worth doing, because it is the only thing here that no
 * competitor can copy: it needs THEIR data, over time.
 *
 * So this screen states the claims. Its whole discipline is that it must never
 * overstate one:
 *
 *   THE PROVENANCE IS PRINTED ON EVERY ROW, in the four-layer vocabulary the
 *     Volume screen's ladder already teaches (population → profile → observed →
 *     manual). A population constant is labelled as one, on the same row as the
 *     figure, at the same size as the confidence.
 *
 *   THE INTERVAL SHIPS WITH THE FIGURE. Never a bare number, and never a
 *     spread dressed up as a confidence band — the engine hands over which kind
 *     it is (see core engines/learned.ts) and the caption says it in words.
 *
 *   "NOT ENOUGH EVIDENCE YET" IS A ROW, not an omission. It carries what would
 *     settle it, which is also the retention loop: the empty state of this
 *     screen is a list of things to do next.
 *
 * Free for everyone, deliberately. This is the reason to keep logging; putting
 * it behind the upgrade would gate the argument for the product.
 */
export default function AuroraLearned() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  // The SHARED session cache, the same one the Volume screen reads — the story
  // and the numbers it is a story about must never be two different fetches of
  // the log.
  const { data: sessions = [], refetch, isFetching } = useSessionsQuery();
  useRefreshOnFocus(refetch);

  const month = useLearnedMonth(sessions);
  const empty = learnedIsEmpty(month);

  return (
    <AuroraScreen
      refreshing={isFetching}
      onRefresh={refetch}
      hero={{
        rank: "title",
        title: t("w.learned.title"),
        meta: [t("w.learned.window").replace("{n}", String(month.days))],
      }}
    >
      {/* HOW MUCH OF YOU HAS ACTUALLY BEEN MEASURED — the screen's one figure,
          and the honest headline for a model that is mostly still a prior. It
          rises as the log answers questions the population table can only
          guess at, which is exactly the loop this screen exists to make
          visible. */}
      <View style={{ marginBottom: space.xl }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.ms }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.stat, letterSpacing: trackFigure(fs.stat), lineHeight: leading(fs.stat, "tight"), color: C.chalk, ...TABULAR }}>
            {`${Math.round(month.known * 100)}%`}
          </Text>
          <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.caps, textTransform: "uppercase", color: C.ash }}>
            {t("w.learned.known")}
          </Text>
        </View>
        <AMeter pct={month.known * 100} />
        <Text style={{ marginTop: space.md, fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash }}>
          {t("w.learned.lead")}
        </Text>
      </View>

      {/* WHAT MOVED — the one claim to lead with. It restates a row that appears
          again in full below, which is the only licence a summary above the fold
          ever has (the same rule engines/performance-state.ts states for the
          Performance masthead): it says nothing the chapter does not also say. */}
      {month.headline && (
        <ACard solid style={{ marginBottom: space.lg }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: C.ash, marginBottom: space.ms }}>
            {t("w.learned.moved")}
          </Text>
          <Claim f={month.headline} lead />
        </ACard>
      )}

      {empty && (
        <Empty title={t("w.learned.emptyTitle")} sub={t("w.learned.empty")} />
      )}

      {month.chapters.map((c) => (
        <Chapter key={c.chapter} c={c} />
      ))}

      {/* THE WORKING, and the switches that decide what may be learned at all —
          it LEAVES, so it takes the door's ring and wears no card. */}
      <DoorRow
        glyph="◫"
        title={t("w.analyze.model.open")}
        sub={t("w.learned.knownWhy")}
        onPress={() => router.push("/questionnaire")}
      />
    </AuroraScreen>
  );
}

/** One chapter: its head, the sentence that says where its numbers come from,
 *  and its claims stacked in one card — separated by whitespace, never a rule. */
function Chapter({ c }: { c: LearnedChapterView }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <View>
      <ASection title={t(c.titleKey)} meta={`${c.learned}/${c.findings.length}`} />
      <Text style={{ marginBottom: space.md, fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash }}>
        {t(c.whyKey)}
      </Text>
      <ACard solid>
        <View style={{ gap: space.xl }}>
          {c.findings.map((f) => (
            <Claim key={f.id} f={f} />
          ))}
        </View>
      </ACard>
    </View>
  );
}

/**
 * ONE CLAIM.
 *
 * Four lines, always in this order, because a card whose shape moves with its
 * values cannot be learned: what it is about, the figure with its movement, the
 * interval in words, and where it came from. A claim still WAITING replaces the
 * figure line with what would settle it — it does not lose its provenance row,
 * because "this is still the population table" is the most useful thing the row
 * can say at that point.
 */
function Claim({ f, lead = false }: { f: LearnedFinding; lead?: boolean }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const figure = learnedFigure(f);
  const interval = learnedIntervalLabel(f);
  const intervalKey = learnedIntervalKey(f);
  const delta = learnedDeltaLabel(f);
  const sense = learnedSense(f);
  const deltaInk = txt(C, roleColor(C, LEARNED_SENSE_ROLE[sense]));
  const waiting = f.state === "waiting";
  // The lead states its figure a rung up; every other claim reads at the app's
  // figure size for a row. Nothing else about the shape changes.
  const figureSize = lead ? fs.hero : fs.display;

  /**
   * ONE CLAIM IS ONE THING TO READ. Left as separate Texts, a screen reader
   * walks a column of orphans — "25", "weekly sets", "+2", "vs the month
   * before" — and the qualification a sighted reader gets from the layout is
   * the part that drops out. The label is the claim as a sentence, in the order
   * the rows are drawn, so the interval and the provenance arrive WITH the
   * figure rather than four swipes later.
   */
  const a11y = [
    t(f.titleKey),
    f.labelKey ? t(f.labelKey) : null,
    waiting
      ? t("w.learned.waitingLabel")
      : [figure, t(f.unitKey)].filter(Boolean).join(" "),
    !waiting && delta ? `${delta} ${t("w.learned.since")}` : null,
    !waiting && interval && intervalKey ? `${t(intervalKey)} ${interval}` : null,
    t(sourceLabelKey(f.source)),
    f.confidence > 0 ? `${Math.round(f.confidence * 100)}% ${t("w.learned.confidence")}` : null,
    f.evidence > 0 ? t(f.evidenceKey).replace("{n}", String(f.evidence)) : null,
    waiting && f.needKey ? t(f.needKey) : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <View accessible accessibilityLabel={a11y}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
        <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>
          {t(f.titleKey)}
        </Text>
        {f.labelKey ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>
            {t(f.labelKey)}
          </Text>
        ) : null}
      </View>

      {waiting ? (
        <>
          {/* The waiting state is a STATE, not a smaller version of the figure:
              it sits in a wash so the row cannot be misread as a measurement
              that happens to be missing its number. */}
          <View style={{ marginTop: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: RADIUS.inner, backgroundColor: withAlpha(C.ash, ALPHA.wash) }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>
              {t("w.learned.waitingLabel")}
              {f.evidence > 0 ? `  ${t(f.evidenceKey).replace("{n}", String(f.evidence))}` : ""}
            </Text>
          </View>
          {f.needKey ? (
            <Text style={{ marginTop: space.sm, fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: C.chalk }}>
              {t(f.needKey)}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: space.xs, flexWrap: "wrap" }}>
            <Text style={{ fontFamily: F.black, fontSize: figureSize, letterSpacing: trackFigure(figureSize), lineHeight: leading(figureSize, "tight"), color: C.chalk, ...TABULAR }}>
              {figure}
            </Text>
            {/* The unit only. The muscle is already named — by the row's own
                title on a ceiling, by the qualifier on the limiter — and
                repeating it here printed "23 Glutes weekly sets" under a
                heading that said Glutes. */}
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>
              {t(f.unitKey)}
            </Text>
            <View style={{ flex: 1 }} />
            {delta ? (
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontFamily: F.monoBold, fontSize: fs.bodyLg, color: deltaInk, ...TABULAR }}>{delta}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>
                  {t("w.learned.since")}
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={{ marginTop: space.xs, fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>
            {interval && intervalKey ? `${t(intervalKey)} ${interval}` : t("w.learned.censusNote")}
          </Text>
        </>
      )}

      {/* WHERE IT COMES FROM. The layer, then how sure of it we are, then how
          much evidence is behind it — the same three facts the provenance
          ladder carries, on one line, because here they qualify a single claim
          rather than the whole model. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: space.sm }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: f.source === "observed" || f.source === "manual" ? txt(C, C.lime) : C.ash }}>
          {t(sourceLabelKey(f.source))}
        </Text>
        {f.confidence > 0 ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash, ...TABULAR }}>
            {`${Math.round(f.confidence * 100)}% ${t("w.learned.confidence")}`}
          </Text>
        ) : null}
        <View style={{ flex: 1 }} />
        {!waiting && f.evidence > 0 ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash }}>
            {t(f.evidenceKey).replace("{n}", String(f.evidence))}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * THE YOU TAB'S LEAD — the same story, compressed to the claim that moved.
 *
 * It carries a THING (a claim, its figure and its provenance), so it is a card:
 * the no-chrome rule governs EXITS, which carry nothing, and a lead that showed
 * only "See what we learned ›" would be exactly that. Tapping it opens the full
 * month.
 *
 * It renders even when nothing has been measured yet, because "your model fills
 * in as you log" is the promise the tab is there to make — a lead that appears
 * only once the app has something to boast about teaches nobody that the loop
 * exists, and the athletes who most need to see it are the ones in their first
 * fortnight.
 */
export function LearnedLead({ sessions, onOpen, inline }: { sessions: LoggedSession[]; onOpen: () => void;
  /** Rendered inside the You tab's LeadRail — the rail owns the width, the
      gap and the bottom margin, so the card only fills what it is given. */
  inline?: boolean }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const month = useLearnedMonth(sessions);
  const f = month.headline;
  const figure = f ? learnedFigure(f) : null;
  const delta = f ? learnedDeltaLabel(f) : null;
  const deltaInk = f ? txt(C, roleColor(C, LEARNED_SENSE_ROLE[learnedSense(f)])) : C.ash;
  const meta = month.learned
    ? t("w.learned.leadMeta").replace("{n}", String(month.learned)).replace("{m}", String(month.waiting))
    : t("w.learned.leadEmpty");
  // The claim, spoken: subject, then the figure in its own unit, then the move.
  const spoken = f ? [t(f.titleKey), figure, t(f.unitKey), delta && delta !== "—" ? delta : null].filter(Boolean).join(" ") : null;

  return (
    <APressCard
      solid
      onPress={onOpen}
      a11yLabel={[t("w.learned.leadKicker"), spoken, meta].filter(Boolean).join(" – ")}
      style={inline ? { flex: 1 } : { marginBottom: space.lg }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: C.ash }}>
            {t("w.learned.leadKicker")}
          </Text>
          {/* THE CLAIM'S OWN SHAPE, KEPT: subject on one line, figure on the
              next. A first cut joined them — `${title} ${figure}` — which reads
              fine on a ceiling ("Quads 20") and is gibberish on the two claims
              whose subject is a question: "What took the most off you 83". The
              figure also lost its unit that way, so 83 could have been sets. */}
          {f ? (
            <>
              <Text numberOfLines={2} style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk, marginTop: space.xxs }}>
                {t(f.titleKey)}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: 2, flexWrap: "wrap" }}>
                <Text style={{ fontFamily: F.black, fontSize: fs.title, letterSpacing: tracking.display, color: C.chalk, ...TABULAR }}>
                  {figure}
                </Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t(f.unitKey)}</Text>
                {delta && delta !== "—" ? (
                  <Text style={{ fontFamily: F.monoBold, fontSize: fs.caption, color: deltaInk, ...TABULAR }}>{delta}</Text>
                ) : null}
              </View>
            </>
          ) : null}
          <Text style={{ marginTop: space.xxs, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash }}>
            {meta}
          </Text>
        </View>
        <ArrowGlyph size={16} color={txt(C, C.lime)} />
      </View>
    </APressCard>
  );
}
