import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text, TextInput } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  LEVELS,
  SPORT_PAGE_WEEKS,
  ago,
  durationUnits, formatDuration,
  heroMetaLine,
  markerHistory,
  recordMarker,
  scrubPosition,
  sportDistance,
  sportPace,
  sportFromSlug,
  sportMarkPaths,
  sportPageModel,
  sportPaceReading,
  sportVolumeReading,
  zonePercents,
  type EffortSplit,
  type LoggedSession,
  type SportBest,
  type SportChartReading,
  type SportPageModel,
  type SportRecord,
  type SportSegmentBest,
  type SportStore,
  type SportWeek,

  ALPHA,} from "@hybrid/core";
import { fetchSessionBests, fetchSessions } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { leading, tracking, trackFigure, fs, space, F, PressScale as Pressable } from "../../lib/ui";
import { ChartReadout, readoutSide, useChartScrub, type ScrubBind } from "./chart-scrub";
import { AEffortBar, APanel, APill, ASection, AuroraScreen, RADIUS, Spark } from "./kit";
import { DeviceMark } from "./device-mark";
import { AuroraIcon } from "./icons";
import Sheet from "./sheet";
import SportRecordsSheet from "./sport-records-sheet";
import { DoorRow } from "./week-verdict";
import { withAlpha } from "./field";

const STORE_KEY = "hybrid.sport";

/**
 * THE SPORT PAGE (mobile). There is no web twin any more — the user-facing web
 * client was retired in Aug 2026 and apps/web keeps only the admin panel, so
 * this file is the sport page, singular.
 *
 * It renders `sportPageModel()` from @hybrid/core and nothing else, which is
 * still the load-bearing rule even with one client: the page cannot decide on
 * its own that a sport has a pace, a distance, a record ladder or a strength
 * pool. The catalog record decides, once, in core — which is what keeps 65
 * sports from becoming 65 layouts, or one layout padded with metrics most of
 * them do not have.
 *
 * THE SHAPE, top to bottom: the hero (the system’s, untouched), the record
 * ladder’s promoted rung as the one figure, the rest of the ladder, the two
 * charts — volume as bars and pace as a line, on the same eight buckets — the
 * bests, the recent efforts and their door into History, and a door to the
 * strength prescription. See design/sport-page-redesign.artifact.html for the
 * teardown this came out of, and the capabilities entries it names.
 */
export default function AuroraSportPage() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  // The param carries EITHER the display name (an in-app push) or the slug (a
  // link shared from the web app, where the URL parser accepts only [A-Za-z0-9_-]).
  // One resolver takes both; anything else falls back to the raw string, which
  // still renders — a sport typed by hand is a page too.
  const { name: raw } = useLocalSearchParams<{ name?: string }>();
  const param = typeof raw === "string" ? raw.trim() : "";
  const name = sportFromSlug(param) ?? param;

  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  // The stored BEST EFFORTS — the fastest window covering each catalog distance,
  // found inside a recording. Fetched whole (every sport) and attributed by
  // session id inside the model, which is the only place that knows which
  // sessions are this sport's.
  const [bests, setBests] = useState<SportSegmentBest[]>([]);
  const [store, setStore] = useState<SportStore | null>(null);
  const [levelIdx, setLevelIdx] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  /** The explainer behind the ladder's ⓘ — what counts as a record. */
  const [rules, setRules] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchSessions().then((d) => { if (active) setSessions(d); }).catch(() => {});
      // Its own fetch, not part of the session payload: the ladder is the only
      // reader, and a page that never draws a rung should not pay for it in the
      // request every screen makes.
      fetchSessionBests().then((d) => { if (active) setBests(d); }).catch(() => {});
      return () => { active = false; };
    }, []),
  );

  // A link with no sport on it belongs on the index, never on an empty page.
  useEffect(() => {
    if (!name) router.replace("/sport");
  }, [name, router]);

  // ON FOCUS, not on mount. The strength screen writes the SAME store, so a
  // level picked there must be read back when the athlete returns — otherwise
  // this screen holds a stale copy and the next `recordMarker` write persists
  // the old level over the new one, silently reverting it.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      AsyncStorage.getItem(STORE_KEY)
        .then((rawStore) => {
          if (!active || !rawStore) return;
          const s = JSON.parse(rawStore) as SportStore | null;
          if (s && typeof s === "object") {
            setStore(s);
            if (typeof s.levelIdx === "number" && s.levelIdx >= 0 && s.levelIdx < LEVELS.length) setLevelIdx(s.levelIdx);
          }
        })
        .catch(() => {});
      return () => { active = false; };
    }, []),
  );

  const markers = useMemo(() => markerHistory(store, name), [store, name]);
  const m: SportPageModel = useMemo(
    () => sportPageModel(name, sessions, { levelIdx, markers, segmentBests: bests }),
    [name, sessions, levelIdx, markers, bests],
  );

  // The two held charts. Both hooks run every render — a sport with no pace
  // simply holds a series of zero points, which reads as "nothing held".
  const volumeScrub = useChartScrub(m.weeks.length, "band");
  const paceScrub = useChartScrub(m.pace?.trend.length ?? 0, "point", 10 / 326);
  const volumeRead = volumeScrub.index >= 0 ? sportVolumeReading(m, volumeScrub.index) : null;
  const paceRead = paceScrub.index >= 0 ? sportPaceReading(m, paceScrub.index) : null;

  const persist = (next: SportStore) => {
    setStore(next);
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(next)).catch(() => {});
  };
  const saveMarker = (value: string) => {
    persist(recordMarker(store, name, value, new Date().toISOString()));
    setDraft(null);
  };

  const mono = (size: number, color = C.ash) => ({ fontFamily: F.mono, fontSize: size, color });
  const label = (color = C.ash) => ({ ...mono(fs.micro, color), textTransform: "uppercase" as const, letterSpacing: tracking(fs.micro, "caps") });
  const fmtDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

  const u = durationUnits(t);
  /** The rung the page states large, or null for a sport with no ladder set. */
  const headline = m.records.find((r) => r.promoted) ?? null;
  /** A rung names itself: a figure with its unit, or the name it goes by. The
   *  model states WHICH distance; what to call it in the athlete's language is
   *  the client's job, which is why "half" arrives as a token and not as prose. */
  const rungLabel = (r: SportRecord) =>
    r.name ? t(`w.train.sportPage.${r.name}`) : `${r.value} ${r.unit}`;
  const bestLabel = (b: SportBest) =>
    b.id === "longest" ? t("w.train.sportPage.longest")
      : b.id === "longestSession" ? t("w.train.sportPage.longestSession")
      : t("w.train.sportPage.biggestWeek");
  const primaryLabel =
    m.primary.kind === "marker" ? (m.primary.label ?? "")
      : m.primary.kind === "pace" ? t("w.train.sportPage.bestPace")
      : m.primary.kind === "distance" ? t("w.train.sportPage.totalDistance")
      : t("w.train.sportPage.timeLogged");
  const weeksMeta = t("w.train.sportPage.weeksAvg")
    .replace("{weeks}", String(SPORT_PAGE_WEEKS))
    .replace("{avg}", m.hasDistance ? `${sportDistance(m.distanceUnit === "m" ? m.weekAvg / 1000 : m.weekAvg, m.distanceUnit)} ${m.distanceUnit}` : formatDuration(m.weekAvg, u));

  /**
   * THE SPORT'S CHANNEL — the colour this page's charts are drawn in, and it is
   * NOT the brand accent.
   *
   * Every chart here used to be chartreuse, which broke the app's colour
   * vocabulary twice over. Chartreuse is the "go" colour — the docked "Log
   * session" pill, a PR, an improving delta — so painting the volume bars, the
   * pace line, the effort split and the marker spark in it left the page with
   * one hue for everything and nothing that read as go. And it disagreed with
   * both surfaces that push into this page: the Endurance lanes draw the SAME
   * eight-week volume and the SAME pace trend in TEAL, and Today's Other-sports
   * tiles draw a sport's weeks in SAND ("teal already means cardio on the lanes
   * directly above this block"). A sport was tapped in one colour and its page
   * opened in another.
   *
   * `discipline` comes from the catalog (core sportPageModel), not from this
   * file — the page decides nothing about what kind of thing a sport is.
   */
  const channel = m.discipline === "sport" ? C.amber : C.blue;

  /** Provenance: the device's lockup (white — the device said so) or "typed". */
  const Provenance = ({ provider }: { provider: string | null }) =>
    provider
      ? <DeviceMark provider={provider} form="lockup" height={9} on="dark" />
      : <Text style={label()}>{t("w.train.sportPage.markerTyped")}</Text>;

  const dividerTop = { borderTopWidth: 1, borderTopColor: C.line } as const;

  /** The held figure, placed on the side of the plot the finger is not on. */
  const chartReadout = (read: SportChartReading | null, count: number) =>
    read ? (
      <ChartReadout
        read={read}
        C={C}
        side={readoutSide(read.index, count)}
        when={t("chart.weekOf").replace("{date}", fmtDate(read.weekStart))}
        note={read.efforts != null ? t("w.train.sportPage.effortsMeta").replace("{n}", String(read.efforts)) : undefined}
      />
    ) : null;

  return (
    <AuroraScreen
      hero={{
        rank: "cover",
        title: name,
        // THE COVER WEARS THE SPORT'S CHANNEL TOO. The hero defaults its accent
        // to the brand chartreuse, which meant every one of the 65 sports got
        // the same cover wash while the charts a scroll below spoke Lyons Blue
        // or Fleur De Lis — the top of the screen and the middle of it
        // disagreeing about what kind of thing the page is about. One fact,
        // used everywhere it applies.
        accent: channel,
        // Boxing is Combat / Combat, BJJ and Climbing the same shape — three
        // sports whose category and S&C family are the same word, so the
        // eyebrow read "Combat – Combat". Saying it twice is not a second fact.
        eyebrow: heroMetaLine([m.category, m.family === m.category ? null : m.family]),
        // The drawn mark for this KIND of sport. There is no longer a fallback
        // to a catalog glyph, because the catalog no longer stores one — a
        // hand-typed activity simply has no cover art, and the hero already
        // handles that (it never reserved room for something that isn't there).
        artPaths: sportMarkPaths(name),
        meta: [
          m.meta.efforts > 0 ? t("w.train.sportPage.effortsMeta").replace("{n}", String(m.meta.efforts)) : null,
          m.meta.distance ? `${m.meta.distance} ${m.meta.distanceUnit}` : null,
          m.meta.firstAt ? t("w.train.sportPage.since").replace("{date}", new Date(m.meta.firstAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })) : null,
        ],
      }}
      accessory={m.transfer ? <Text style={label(C.chalk)}>{LEVELS[levelIdx]}</Text> : undefined}
      dock={
        // The system's docked pill — the same shape the plan cover docks
        // (PlanDockPill); the container reserves the scroll clearance for it.
        <APill
          label={t("w.train.sport.logSession").replace("{sport}", name)}
          onPress={() => router.push(`/workout?source=sport&sport=${encodeURIComponent(name)}`)}
        />
      }
    >
      {/* ── THE HEADLINE FIGURE ──────────────────────────────────────────
          The record ladder's promoted rung when the sport has one, else the
          model's `primary`. The TOTALS ROW that used to sit under this is gone:
          it printed the efforts count and the total distance that the hero's
          own meta line states two hundred points above it, and on a timed sport
          its "Hours" cell was the headline figure again at a third of the size.
          The hero counts; the page states a performance. */}
      {headline ? (
        <View style={{ paddingTop: space.xxl, paddingBottom: space.lg }}>
          {/* THE LADDER'S ⓘ. A record has rules an athlete would otherwise
              discover by surprise (5.2 km counts as a 5 km; a 5 km taken from
              inside a long run counts too, and is marked), so the label row is
              a door to them. The whole row is the target — a nano label beside
              a 13pt glyph is not one — and the glyph IS a ring, so nothing is
              drawn around it. */}
          <Pressable
            onPress={() => setRules(true)}
            accessibilityRole="button"
            accessibilityLabel={t("w.train.sportPage.rulesTitle")}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Text style={label()}>{t("w.train.sportPage.bestAt").replace("{d}", rungLabel(headline))}</Text>
            <AuroraIcon name="info" size={12} color={C.ash} />
          </Pressable>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.ms, marginTop: space.ms }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: fs.stat, color: C.chalk, lineHeight: leading(fs.stat, "flush"), letterSpacing: trackFigure(fs.stat) }}>{headline.time}</Text>
            {!!headline.delta && (
              <Text style={{ ...mono(fs.caption, txt(C, C.lime)), fontFamily: F.monoBold, marginBottom: 8 }}>{headline.delta}</Text>
            )}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, marginTop: space.md }}>
            {!!headline.pace && <Text style={mono(fs.micro)}>{headline.pace} {m.paceUnit}</Text>}
            {!!headline.at && <Text style={mono(fs.micro)}>{fmtDate(headline.at)}</Text>}
            {headline.segment && <Text style={label()}>{t("w.train.sportPage.recordSegment")}</Text>}
            <Provenance provider={headline.provider} />
          </View>
        </View>
      ) : m.empty ? (
        // Nothing logged and no rung set: there is no performance to state, and
        // `primary` would fall through to a 46px "0min".
        <View style={{ alignItems: "center", paddingTop: space.huge, paddingBottom: space.xl }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("w.train.sportPage.emptyTitle")}</Text>
          <Text style={{ ...mono(fs.body), marginTop: space.sm, textAlign: "center", lineHeight: leading(fs.body) }}>
            {m.records.length > 0 ? t("w.train.sportPage.emptyRecords") : t("w.train.sportPage.emptyBody")}
          </Text>
        </View>
      ) : (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: space.lg, paddingTop: space.xxl, paddingBottom: space.xl }}>
          <View style={{ flex: 1 }}>
            <Text style={label()}>{primaryLabel}</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: space.ms }}>
              <Text style={{ fontFamily: F.monoBold, fontSize: fs.stat, color: C.chalk, lineHeight: leading(fs.stat, "flush"), letterSpacing: trackFigure(fs.stat) }}>{m.primary.value}</Text>
              {!!m.primary.unit && <Text style={{ ...mono(fs.bodyLg), marginBottom: 6 }}>{m.primary.unit}</Text>}
            </View>
            {!!m.primary.delta && (
              <Text style={{ ...mono(fs.caption, m.primary.improving ? txt(C, C.lime) : C.ash), fontFamily: F.monoBold, marginTop: space.ms }}>{m.primary.delta}</Text>
            )}
            {m.primary.kind === "marker" && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.xs }}>
                {!!m.primary.at && <Text style={mono(fs.micro)}>{fmtDate(m.primary.at)}</Text>}
                <Provenance provider={null} />
              </View>
            )}
            {m.primary.kind !== "marker" && !m.hasDistance && !m.hasPace && (
              <Text style={{ ...mono(fs.micro), marginTop: space.xs, lineHeight: leading(fs.micro) }}>{t("w.train.sportPage.timedOnly")}</Text>
            )}
          </View>
          {m.primary.trend.length >= 2 && <Spark series={m.primary.trend} color={channel} height={44} width={74} />}
        </View>
      )}

      {/* An FTP is watts, not a time at a distance, so it fills no rung and
          keeps its own line beside the ladder. Where the marker IS a rung, the
          rung above has already stated it. */}
      {m.markerAside && m.primary.kind === "marker" && (!!headline || m.empty) && (
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md, paddingVertical: space.md, ...dividerTop }}>
          <Text style={label()}>{m.primary.label}</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: fs.subtitle, color: C.chalk }}>{m.primary.value}</Text>
            <Provenance provider={null} />
          </View>
        </View>
      )}

      {/* ── THE REST OF THE LADDER — the rungs the headline is not ── */}
      {m.records.filter((r) => !r.promoted).map((r) => (
        <View key={r.km} style={{ flexDirection: "row", alignItems: "baseline", gap: space.md, paddingVertical: space.md, ...dividerTop }}>
          <Text numberOfLines={1} style={{ ...label(), width: 78 }}>{rungLabel(r)}</Text>
          {r.time ? (
            <>
              {/* The time leads and the pace gives way: on a narrow phone a
                  segment-marked rung asks for one more item on the row, and the
                  pace is the one figure here that is derivable from the two
                  beside it. */}
              <View style={{ flex: 1, flexShrink: 1, flexDirection: "row", alignItems: "baseline", gap: space.ms }}>
                <Text style={{ fontFamily: F.monoBold, fontSize: fs.subtitle, color: C.chalk }}>{r.time}</Text>
                {!!r.pace && <Text numberOfLines={1} style={{ ...mono(fs.nano), flexShrink: 1 }}>{r.pace} {m.paceUnit}</Text>}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {/* WHERE THE TIME CAME FROM. A segment rung was measured over
                    exactly this distance inside a recording rather than being a
                    whole logged effort's clock — the more precise of the two,
                    and a distinction an athlete draws themselves between a race
                    and a fast stretch of a long run. */}
                {r.segment && <Text numberOfLines={1} style={label()}>{t("w.train.sportPage.recordSegment")}</Text>}
                {!!r.at && <Text style={mono(fs.nano)}>{fmtDate(r.at)}</Text>}
                <Provenance provider={r.provider} />
              </View>
            </>
          ) : (
            // An unset rung is an invitation, not a dash: the page knows what
            // the athlete has not done yet, and saying so is worth more than
            // an em-dash in a column.
            <Text style={{ flex: 1, ...mono(fs.body) }}>{t("w.train.sportPage.recordUnset")}</Text>
          )}
        </View>
      ))}

      {/* Typing a time is a DOOR — it opens a sheet, so it earns its ring, and
          the reading page never raises a keyboard of its own. */}
      {!!m.markerPrompt && (
        <View style={dividerTop}>
          <DoorRow
            // "Add a time we haven't measured" is right for a 5 km and wrong
            // for four of the seven markers — a belt, a playing level and a
            // redpoint grade are not times. A rung-bearing marker gets the
            // record invitation; everything else is asked for by its own name.
            title={
              m.records.some((r) => r.promoted || r.time != null) || !m.markerAside
                ? t("w.train.sportPage.addRecord")
                : t("w.train.sportPage.setMarker").replace("{label}", m.markerPrompt.label)
            }
            sub={m.markerPrompt.label}
            glyph="→"
            onPress={() => setDraft(m.primary.kind === "marker" ? m.primary.value : "")}
          />
          <View style={{ height: space.md }} />
        </View>
      )}

      {m.empty ? null : (
        <>
          {/* ── VOLUME ── */}
          {/* The charts are the one thing on this page that is a PANEL rather
              than a row — the kit's APanel, the same surface the endurance
              lanes and the Other-sports tiles sit on. The ladder, the bests and
              the recent efforts stay lists on the ground. */}
          <ASection title={t("w.train.sportPage.volume")} meta={weeksMeta} />
          <APanel>
            <VolumeBars
              weeks={m.weeks}
              avg={m.weekAvg}
              C={C}
              accent={channel}
              held={volumeScrub.index}
              bind={volumeScrub.bind}
              readout={chartReadout(volumeRead, m.weeks.length)}
            />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space.sm }}>
              <Text style={mono(fs.nano)}>{fmtDate(m.weeks[0]?.weekStart ?? "")}</Text>
              <Text style={mono(fs.nano)}>{t("w.train.sportPage.thisWeek")}</Text>
            </View>
          </APanel>

          {/* ── PACE — only for a sport that records one ── */}
          {!!m.pace && (
            <>
              <ASection title={t("w.train.sportPage.pace")} meta={t("w.train.sportPage.paceMeta").replace("{weeks}", String(SPORT_PAGE_WEEKS)).replace("{unit}", m.paceUnit)} />
              <APanel>
                <View style={{ flexDirection: "row", gap: space.xxl, marginBottom: space.md }}>
                  {[
                    { v: sportPace(m.pace.avgSecPerKm, m.pacePer), k: t("w.train.sportPage.average") },
                    { v: sportPace(m.pace.bestSecPerKm, m.pacePer), k: t("w.train.sportPage.best") },
                  ].map((cell) => (
                    <View key={cell.k}>
                      <Text style={{ fontFamily: F.monoBold, fontSize: fs.headline, color: C.chalk }}>{cell.v}</Text>
                      <Text style={{ ...label(), fontSize: fs.nano, marginTop: 5 }}>{cell.k}</Text>
                    </View>
                  ))}
                </View>
                <PaceTrend
                  trend={m.pace.trend}
                  prIndex={m.pace.prIndex}
                  C={C}
                  accent={channel}
                  held={paceScrub.index}
                  bind={paceScrub.bind}
                  readout={chartReadout(paceRead, m.pace.trend.length)}
                />
                {/* The trend SKIPS the weeks with nothing paced in it, so its
                    first point is rarely the volume series' first week. Naming
                    it with `weeks[0]` captioned this chart with someone else's
                    date. */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space.sm }}>
                  <Text style={mono(fs.nano)}>{fmtDate(m.pace.weekStarts[0] ?? "")}</Text>
                  <Text style={mono(fs.nano)}>{t("w.train.sportPage.fasterHigher")}</Text>
                </View>
              </APanel>
            </>
          )}

          {/* ── EFFORT — one bar, the app's easy/steady/hard ramp ── */}
          {!!m.split && (
            <>
              <ASection title={t("w.train.sportPage.effort")} meta={t("w.train.sportPage.effortMeta").replace("{weeks}", String(SPORT_PAGE_WEEKS))} />
              <APanel>
                <EffortLegend split={m.split} labels={[t("w.train.sportPage.easy"), t("w.train.sportPage.steady"), t("w.train.sportPage.hard")]} />
              </APanel>
            </>
          )}

          {/* ── BESTS — on the page's own hairlines, like every other FIGURE.
              These were 176-wide bordered cards in a rail, and the fourth was
              off the screen edge; all of them are visible at once now. The
              page's one surface is the CHART PANEL above — a chart is a drawing
              that needs a ground to be read against, a figure is a line of text
              and gets the page's own. ── */}
          {m.bests.length > 0 && (
            <View>
              <ASection title={t("w.train.sportPage.bests")} meta={t("w.train.sportPage.allTime")} />
              {m.bests.map((b, i) => (
                <View key={b.id} style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md, paddingVertical: space.md, ...(i ? dividerTop : null) }}>
                  <Text style={label()}>{bestLabel(b)}</Text>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
                    <Text style={{ fontFamily: F.monoBold, fontSize: fs.subtitle, color: C.chalk }}>{b.value}</Text>
                    {!!b.unit && <Text style={mono(fs.micro)}>{b.unit}</Text>}
                    <Text style={mono(fs.nano)}>{fmtDate(b.at)}</Text>
                    {!!b.sessionId && <Provenance provider={b.provider} />}
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {/* ── STRENGTH THAT CARRIES — a DOOR, not two more sections ────────
          Level, demands, prescription and rationale used to run on from here,
          ending in a chartreuse pill that competed with the docked one. They
          are their own screen now (sport-strength.tsx), which leaves this page
          one action and lets the prescription own a dock of its own. The door
          renders whenever the sport HAS a pool — including on a page with
          nothing logged, because a prescription needs a level, not a history. */}
      {!!m.transfer && (
        <View style={{ marginTop: space.xxl, ...dividerTop }}>
          <DoorRow
            title={t("w.train.sportPage.transferTitle")}
            sub={t("w.train.sportPage.transferDoorSub")
              .replace("{n}", String(m.transfer.blocks.length))
              .replace("{sport}", name)
              .replace("{level}", LEVELS[levelIdx] ?? "")}
            glyph="→"
            onPress={() => router.push(`/sport-strength?name=${encodeURIComponent(name)}`)}
          />
        </View>
      )}

      {/* ── RECENT EFFORTS ── */}
      {m.recent.length > 0 && (
        <View style={{ marginBottom: space.huge }}>
          <ASection title={t("w.train.sportPage.recent")} meta={t("w.train.sportPage.recentMeta").replace("{n}", String(m.recent.length))} />
          {m.recent.map((e, i) => (
            <Pressable
              key={`${e.sessionId}-${i}`}
              onPress={() => router.push(`/session/${e.sessionId}`)}
              style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.md, paddingVertical: space.md, ...dividerTop }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{e.name}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginTop: 4 }}>
                  <Text style={mono(fs.micro)}>{ago(e.startedAt)}</Text>
                  <Provenance provider={e.provider} />
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontFamily: F.monoBold, fontSize: fs.bodyLg, color: C.chalk }}>
                  {m.hasDistance ? `${sportDistance(e.distanceKm, m.distanceUnit)} ${m.distanceUnit}` : formatDuration(e.minutes, u)}
                </Text>
                {e.secPerKm != null && <Text style={{ ...mono(fs.micro), marginTop: 4 }}>{sportPace(e.secPerKm, m.pacePer)} {m.paceUnit}</Text>}
              </View>
            </Pressable>
          ))}
          {/* A vertical list ends in a DOOR ROW of that list. This one stopped
              at three efforts and offered no way to the rest of them. */}
          <DoorRow
            // `meta.sessions`, not `meta.efforts`: efforts counts cardio BLOCKS,
            // and a brick session holds two of them, so the door would promise
            // a number one larger than the list behind it can show.
            title={t("w.train.sportPage.allEfforts").replace("{n}", String(m.meta.sessions))}
            sub={t("w.train.sportPage.inHistory")}
            glyph="→"
            onPress={() => router.push(`/history?sport=${encodeURIComponent(name)}`)}
          />
        </View>
      )}

      <SportRecordsSheet visible={rules} onClose={() => setRules(false)} />

      {/* THE RECORD SHEET — the page's one writable thing, off the page. */}
      <Sheet
        visible={draft !== null}
        onClose={() => setDraft(null)}
        title={m.markerPrompt?.label}
        sub={t("w.train.sportPage.markerHint")}
      >
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
          <TextInput
            autoFocus
            value={draft ?? ""}
            onChangeText={setDraft}
            onSubmitEditing={() => saveMarker(draft ?? "")}
            placeholder={m.markerPrompt?.ph}
            placeholderTextColor={C.ash}
            accessibilityLabel={m.markerPrompt?.label}
            style={{ flex: 1, fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 16, paddingVertical: 12 }}
          />
          {/* The app's one button. This was a hand-rolled chartreuse pill with
              its own padding and its own face — the exact drift the CTA ratchet
              exists to burn down; `compact` is the size for a button that sits
              in a row beside a field, and it still declares the 44dp floor. */}
          <APill label={t("w.train.sportPage.save")} onPress={() => saveMarker(draft ?? "")} size="compact" />
        </View>
      </Sheet>
    </AuroraScreen>
  );
}

/* ── holding a chart ─────────────────────────────────────────────────────── */

/* ── the charts — the web twin's geometry, drawn with react-native-svg ────── */

function VolumeBars({ weeks, avg, C, accent, held, bind, readout }: { weeks: SportWeek[]; avg: number; C: Palette; accent: string; held: number; bind: ScrubBind; readout: ReactNode }) {
  const max = Math.max(...weeks.map((w) => w.value), 1);
  const pos = scrubPosition(held, { count: weeks.length, mode: "band" });
  return (
    <View {...bind} style={{ height: 110, flexDirection: "row", alignItems: "flex-end", gap: 6 }}>
      {weeks.map((w, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.max(3, (w.value / max) * 110),
            borderRadius: RADIUS.mark,
            // Held, the finger's week is the lit one — the "this week" accent
            // would otherwise compete with the answer the athlete asked for.
            // Full strength / ALPHA.line is the shared HistoryStrip's own pair,
            // so a sport's weeks read identically here and in the rail on Today
            // that opened this page. (The unlit rung was ALPHA.rim, a BORDER
            // rung, on a surface.)
            backgroundColor: (held >= 0 ? i === held : i === weeks.length - 1) ? accent : withAlpha(accent, ALPHA.line),
          }}
        />
      ))}
      {avg > 0 && (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: (avg / max) * 110, borderTopWidth: 1, borderTopColor: withAlpha(C.ash, 0.55), borderStyle: "dashed" }} />
      )}
      {held >= 0 && (
        <View pointerEvents="none" style={{ position: "absolute", left: `${pos * 100}%`, top: 0, bottom: 0, width: 1, backgroundColor: withAlpha(C.ash, 0.55) }} />
      )}
      {readout}
    </View>
  );
}

/** Reversed, so FASTER sits higher. Same viewBox, padding and stroke as web. */
function PaceTrend({ trend, prIndex, C, accent, held, bind, readout }: { trend: number[]; prIndex: number; C: Palette; accent: string; held: number; bind: ScrubBind; readout: ReactNode }) {
  const W = 326, H = 118, PAD = 10;
  const min = Math.min(...trend), max = Math.max(...trend);
  const span = Math.max(1, max - min);
  const pts = trend.map((v, i) => [PAD + i * ((W - PAD * 2) / Math.max(1, trend.length - 1)), PAD + ((v - min) / span) * (H - PAD * 2.6)] as const);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${d} L${pts[pts.length - 1]![0].toFixed(1)} ${H} L${pts[0]![0].toFixed(1)} ${H} Z`;
  const pr = pts[Math.min(Math.max(prIndex, 0), pts.length - 1)]!;
  const hit = held >= 0 ? pts[held] : null;
  return (
    <View {...bind} style={{ height: H }}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="sportPaceFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={accent} stopOpacity={0.22} />
            <Stop offset="1" stopColor={accent} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={area} fill="url(#sportPaceFill)" />
        <Path d={d} fill="none" stroke={accent} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </Svg>
      {!!hit && (
        <View pointerEvents="none" style={{ position: "absolute", left: `${(hit[0] / W) * 100}%`, top: 0, bottom: 0, width: 1, backgroundColor: withAlpha(C.ash, 0.55) }} />
      )}
      {/* The PR dot is a View, not a circle: the path is stretched to the
          column's width and a circle inside a stretched viewBox is an ellipse.
          It is the ONE chartreuse mark on this chart, and that is the point —
          the line is the sport's channel and the accent means "best". Both dots
          ring in `ink2`, the panel they now sit on rather than the page. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: `${(pr[0] / W) * 100}%`,
          top: `${(pr[1] / H) * 100}%`,
          width: 9, height: 9, marginLeft: -4.5, marginTop: -4.5,
          borderRadius: RADIUS.pill, backgroundColor: C.lime, borderWidth: 2, borderColor: C.ink2,
        }}
      />
      {!!hit && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: `${(hit[0] / W) * 100}%`,
            top: `${(hit[1] / H) * 100}%`,
            width: 13, height: 13, marginLeft: -6.5, marginTop: -6.5,
            borderRadius: RADIUS.pill, backgroundColor: C.chalk, borderWidth: 2, borderColor: C.ink2,
          }}
        />
      )}
      {readout}
    </View>
  );
}

/**
 * The effort split's LEGEND — and the name is the point. This was
 * `EffortSplitBar`, a name it had stopped deserving: the bar itself is the
 * kit's `AEffortBar` now and what is left here draws no bar at all. The
 * band order, the three hues and the zero-band rule are the app's vocabulary
 * and belong in one place (the endurance lanes' ZoneTile draws the same track).
 * What stays here is the legend, and only because its orientation is a real
 * function of width: this section is full-bleed so its cells run ACROSS, while
 * a 152dp rail tile has to stack them or lose to the first long translation.
 */
function EffortLegend({ split, labels }: {
  split: EffortSplit;
  labels: [string, string, string] | string[];
}) {
  const { palette: C } = useTheme();
  // Core's percentages, not a local round(): `zonePercents` settles the
  // remainder so the three integers sum to exactly 100. Rounding each band on
  // its own — which this did — can print 64 / 24 / 13.
  const z = zonePercents(split);
  const bands = [
    { v: z.easy, k: labels[0]! },
    { v: z.moderate, k: labels[1]! },
    { v: z.hard, k: labels[2]! },
  ];
  // A zero band has no label to place, and a thin one must not collide with its
  // neighbour — so the legend shows only the bands that exist, with a floor.
  const shown = bands.filter((b) => b.v > 0);
  return (
    <View>
      <AEffortBar zones={z} />
      <View style={{ flexDirection: "row", gap: 2, marginTop: space.md }}>
        {shown.map((b, i) => (
          <View key={b.k} style={{ flexBasis: `${b.v}%`, flexGrow: 0, flexShrink: 1, minWidth: 58, alignItems: i === shown.length - 1 ? "flex-end" : "flex-start" }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: C.chalk }}>{b.v}%</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: tracking(fs.nano, "label"), marginTop: 4 }}>{b.k}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
