import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text, TextInput, ScrollView } from "react-native";
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
  transferSessionBlocks,
  type LoggedSession,
  type SportBest,
  type SportChartReading,
  type SportPageModel,
  type SportStore,
  type SportWeek,
} from "@hybrid/core";
import { fetchSessions } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { leading, tracking, trackFigure, fs, space, F, PressScale as Pressable } from "../../lib/ui";
import { ChartReadout, readoutSide, useChartScrub, type ScrubBind } from "./chart-scrub";
import { APill, AuroraScreen, GUTTER, RADIUS } from "./kit";
import { DeviceMark } from "./device-mark";

const STORE_KEY = "hybrid.sport";
/** The handoff the live logger reads when the transfer session is started. */
const PENDING_KEY = "hybrid.pendingSportSession";

/**
 * THE SPORT PAGE (mobile) — the exact twin of
 * apps/web/components/aurora/sport-page.tsx.
 *
 * Both clients render `sportPageModel()` from @hybrid/core and nothing else, so
 * neither can decide on its own that a sport has a pace, a distance or a
 * strength block: the catalog record decides, once, for both. The charts are
 * drawn by hand at the SAME geometry the web twin uses.
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
  const [store, setStore] = useState<SportStore | null>(null);
  const [levelIdx, setLevelIdx] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchSessions().then((d) => { if (active) setSessions(d); }).catch(() => {});
      return () => { active = false; };
    }, []),
  );

  // A link with no sport on it belongs on the index, never on an empty page.
  useEffect(() => {
    if (!name) router.replace("/sport");
  }, [name, router]);

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((rawStore) => {
        if (!rawStore) return;
        const s = JSON.parse(rawStore) as SportStore | null;
        if (s && typeof s === "object") {
          setStore(s);
          if (typeof s.levelIdx === "number" && s.levelIdx >= 0 && s.levelIdx < LEVELS.length) setLevelIdx(s.levelIdx);
        }
      })
      .catch(() => {});
  }, []);

  const markers = useMemo(() => markerHistory(store, name), [store, name]);
  const m: SportPageModel = useMemo(
    () => sportPageModel(name, sessions, { levelIdx, markers }),
    [name, sessions, levelIdx, markers],
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
  const pickLevel = (i: number) => {
    setLevelIdx(i);
    persist({ ...(store ?? {}), sport: name, levelIdx: i });
  };
  const saveMarker = (value: string) => {
    persist(recordMarker(store, name, value, new Date().toISOString()));
    setDraft(null);
  };
  const startTransfer = async () => {
    if (!m.transfer) return;
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({ title: `${name} – ${LEVELS[levelIdx]}`, blocks: transferSessionBlocks(m.transfer) }));
    router.push("/workout?source=sport-transfer");
  };

  const mono = (size: number, color = C.ash) => ({ fontFamily: F.mono, fontSize: size, color });
  const label = (color = C.ash) => ({ ...mono(fs.micro, color), textTransform: "uppercase" as const, letterSpacing: tracking.caps });
  const fmtDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

  const u = durationUnits(t);
  const unitLabel = m.distanceUnit === "m" ? t("w.train.sportPage.metres") : t("w.train.sportPage.kilometres");
  // The week cell reads "This week" whatever the sport measures: a timed
  // sport's figure now carries its own units ("1h 15min"), so the label that
  // used to name them ("Min this week") would be naming them twice.
  const totalLabel = (id: string) =>
    id === "efforts" ? t("w.train.sportPage.efforts")
      : id === "distance" ? unitLabel
      : id === "hours" ? t("w.train.sportPage.hours")
      : t("w.train.sportPage.thisWeek");
  const bestLabel = (b: SportBest) =>
    b.id === "fastest" ? t("w.train.sportPage.fastest")
      : b.id === "longest" ? t("w.train.sportPage.longest")
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

  /** The Explore SectionHead: display-face title left, mono meta right. */
  const SectionHead = ({ title, meta }: { title: string; meta?: string }) => (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.md, marginBottom: space.md }}>
      <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{title}</Text>
      {!!meta && <Text style={label()}>{meta}</Text>}
    </View>
  );

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
        eyebrow: heroMetaLine([m.category, m.family]),
        // The drawn mark for this KIND of sport; the catalog emoji only when
        // the name is not in the catalog at all (a hand-typed activity).
        artPaths: sportMarkPaths(name),
        glyph: m.icon,
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
      {/* ── THE ONE FIGURE ── */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: space.lg, paddingTop: space.xxl, paddingBottom: space.xl, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <View style={{ flex: 1 }}>
          <Text style={label()}>{primaryLabel}</Text>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: space.ms }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: fs.stat, color: C.chalk, letterSpacing: trackFigure(fs.stat) }}>{m.primary.value}</Text>
            {!!m.primary.unit && <Text style={{ ...mono(fs.note), marginBottom: 6 }}>{m.primary.unit}</Text>}
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
        {m.primary.trend.length >= 2 && <MarkerSpark trend={m.primary.trend} color={C.lime} />}
      </View>

      {/* The marker slot — a sport that has one, and the athlete's own figure. */}
      {!!m.markerPrompt && (
        <View style={{ paddingVertical: space.lg, borderBottomWidth: 1, borderBottomColor: C.line }}>
          {draft === null ? (
            <Pressable onPress={() => setDraft(m.primary.kind === "marker" ? m.primary.value : "")}>
              <Text style={{ ...mono(fs.body, txt(C, C.lime)), fontFamily: F.monoBold }}>
                {t("w.train.sportPage.addMarker").replace("{label}", m.markerPrompt.label)} →
              </Text>
            </Pressable>
          ) : (
            <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
              <TextInput
                autoFocus
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={() => saveMarker(draft)}
                placeholder={m.markerPrompt.ph}
                placeholderTextColor={C.ash}
                accessibilityLabel={m.markerPrompt.label}
                style={{ flex: 1, fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 16, paddingVertical: 12 }}
              />
              <Pressable onPress={() => saveMarker(draft)} style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 18, paddingVertical: 12 }}>
                <Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: C.onAccent }}>{t("w.train.sportPage.save")}</Text>
              </Pressable>
            </View>
          )}
          <Text style={{ ...mono(fs.micro), marginTop: space.sm }}>{t("w.train.sportPage.markerHint")}</Text>
        </View>
      )}

      {/* ── TOTALS — facts on hairlines, no cards ── */}
      <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line }}>
        {m.totals.map((cell, i) => (
          <View key={cell.id} style={{ flex: 1, alignItems: "center", paddingVertical: space.lg, borderLeftWidth: i ? 1 : 0, borderLeftColor: C.line }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: fs.heading, color: C.chalk }}>{cell.value}</Text>
            <Text style={{ ...label(), fontSize: fs.nano, marginTop: 6, textAlign: "center" }}>{totalLabel(cell.id)}</Text>
          </View>
        ))}
      </View>

      {m.empty ? (
        <View style={{ alignItems: "center", paddingVertical: space.huge }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("w.train.sportPage.emptyTitle")}</Text>
          <Text style={{ ...mono(fs.body), marginTop: space.sm, textAlign: "center" }}>{t("w.train.sportPage.emptyBody")}</Text>
        </View>
      ) : (
        <>
          {/* ── VOLUME ── */}
          <View style={{ marginTop: space.xxl }}>
            <SectionHead title={t("w.train.sportPage.volume")} meta={weeksMeta} />
            <VolumeBars
              weeks={m.weeks}
              avg={m.weekAvg}
              C={C}
              held={volumeScrub.index}
              bind={volumeScrub.bind}
              readout={chartReadout(volumeRead, m.weeks.length)}
            />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space.sm }}>
              <Text style={mono(fs.nano)}>{fmtDate(m.weeks[0]?.weekStart ?? "")}</Text>
              <Text style={mono(fs.nano)}>{t("w.train.sportPage.thisWeek")}</Text>
            </View>
          </View>

          {/* ── PACE — only for a sport that records one ── */}
          {!!m.pace && (
            <View style={{ marginTop: space.xxl }}>
              <SectionHead title={t("w.train.sportPage.pace")} meta={t("w.train.sportPage.paceMeta").replace("{weeks}", String(SPORT_PAGE_WEEKS)).replace("{unit}", m.paceUnit)} />
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
                held={paceScrub.index}
                bind={paceScrub.bind}
                readout={chartReadout(paceRead, m.pace.trend.length)}
              />
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space.sm }}>
                <Text style={mono(fs.nano)}>{fmtDate(m.weeks[0]?.weekStart ?? "")}</Text>
                <Text style={mono(fs.nano)}>{t("w.train.sportPage.fasterHigher")}</Text>
              </View>
            </View>
          )}

          {/* ── EFFORT — one bar, three densities of the one accent ── */}
          {!!m.split && (
            <View style={{ marginTop: space.xxl }}>
              <SectionHead title={t("w.train.sportPage.effort")} meta={t("w.train.sportPage.effortMeta").replace("{weeks}", String(SPORT_PAGE_WEEKS))} />
              <EffortSplitBar split={m.split} C={C} labels={[t("w.train.sportPage.easy"), t("w.train.sportPage.steady"), t("w.train.sportPage.hard")]} />
            </View>
          )}

          {/* ── BESTS — a full-bleed rail: cards run under the screen edge ── */}
          {m.bests.length > 0 && (
            <View style={{ marginTop: space.xxl }}>
              <SectionHead title={t("w.train.sportPage.bests")} meta={t("w.train.sportPage.allTime")} />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -GUTTER }}
                contentContainerStyle={{ paddingHorizontal: GUTTER, gap: space.md }}
              >
                {m.bests.map((b) => (
                  <View key={b.id} style={{ width: 176, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, padding: space.lg }}>
                    <Text style={{ ...label(), fontSize: fs.nano }}>{bestLabel(b)}</Text>
                    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: space.ms }}>
                      <Text style={{ fontFamily: F.monoBold, fontSize: fs.heading, color: C.chalk }}>{b.value}</Text>
                      {!!b.unit && <Text style={{ ...mono(fs.micro), marginBottom: 2 }}>{b.unit}</Text>}
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: space.sm }}>
                      <Text style={mono(fs.nano)}>{fmtDate(b.at)}</Text>
                      {!!b.sessionId && <Provenance provider={b.provider} />}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </>
      )}

      {/* ── TRANSFER — only the sports that carry a pool ── */}
      {!!m.transfer && (
        <>
          <View style={{ marginTop: space.xxl }}>
            <SectionHead title={t("w.train.sportPage.transfer")} meta={t("w.train.sportPage.transferMeta")} />
            <View style={{ flexDirection: "row", gap: space.xs, marginBottom: space.lg }}>
              {LEVELS.map((l, i) => {
                const on = i === levelIdx;
                return (
                  <Pressable
                    key={l}
                    onPress={() => pickLevel(i)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? C.lime : C.ink2 }}
                  >
                    <Text style={{ fontFamily: F.monoBold, fontSize: fs.micro, letterSpacing: tracking.label, color: on ? C.onAccent : C.ash }}>{l.toUpperCase()}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* The demands, ranked as the data ranks them — the numbering IS the
                priority order, not decoration. */}
            <View style={{ marginBottom: space.lg }}>
              {m.transfer.sport.demands.map((d, i) => (
                <View key={d} style={{ flexDirection: "row", alignItems: "center", gap: space.ms, paddingVertical: 9, ...(i ? dividerTop : null) }}>
                  <Text style={{ ...mono(fs.micro), width: 16 }}>{i + 1}</Text>
                  <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>{d}</Text>
                  <View style={{ width: Math.max(12, 56 - i * 11), height: 3, borderRadius: 2, backgroundColor: C.lime, opacity: 1 - i * 0.2 }} />
                </View>
              ))}
            </View>

            {m.transfer.blocks.map((b) => (
              <View key={b.name} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.md, paddingVertical: space.md, ...dividerTop }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{b.name}</Text>
                  <Text style={{ ...mono(fs.micro), marginTop: 4 }}>{b.demand}</Text>
                </View>
                <View style={{ alignItems: "flex-end", maxWidth: 170 }}>
                  <View style={{ backgroundColor: `${C.lime}29`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: F.monoBold, fontSize: fs.caption, color: txt(C, C.lime) }}>{b.scheme}</Text>
                  </View>
                  <Text style={{ ...mono(fs.nano), marginTop: 6, textAlign: "right", lineHeight: leading(fs.nano) }}>
                    {b.loadBasis ?? (b.bodyweight && b.measure === "reps" ? t("w.train.sport.bodyweightTempo") : "")}
                  </Text>
                </View>
              </View>
            ))}

            <APill label={t("w.train.sportPage.startSession")} onPress={startTransfer} style={{ marginTop: space.lg }} />
          </View>

          {/* ── WHY THESE LIFTS ── */}
          <View style={{ marginTop: space.xxl }}>
            <SectionHead title={t("w.train.sportPage.whyTheseLifts")} meta={t("w.train.sportPage.poolMeta").replace("{n}", String(m.pool.length))} />
            {m.pool.map((e, i) => (
              <View key={e.name} style={{ paddingVertical: space.md, ...(i ? dividerTop : null), opacity: e.locked ? 0.45 : 1 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: space.md }}>
                  <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{e.name}</Text>
                  {e.locked ? (
                    <Text style={{ ...label(), fontSize: fs.nano, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 3, overflow: "hidden" }}>{e.unlocksAt}</Text>
                  ) : (
                    <Text style={{ ...label(), fontSize: fs.nano }}>{e.demand}</Text>
                  )}
                </View>
                <Text style={{ ...mono(fs.body), marginTop: 5, lineHeight: leading(fs.body) }}>{e.why}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* ── RECENT EFFORTS ── */}
      {m.recent.length > 0 && (
        <View style={{ marginTop: space.xxl, marginBottom: space.huge }}>
          <SectionHead title={t("w.train.sportPage.recent")} meta={t("w.train.sportPage.recentMeta").replace("{n}", String(m.recent.length))} />
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
        </View>
      )}
    </AuroraScreen>
  );
}

/* ── holding a chart ─────────────────────────────────────────────────────── */

/* ── the charts — the web twin's geometry, drawn with react-native-svg ────── */

function VolumeBars({ weeks, avg, C, held, bind, readout }: { weeks: SportWeek[]; avg: number; C: Palette; held: number; bind: ScrubBind; readout: ReactNode }) {
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
            backgroundColor: (held >= 0 ? i === held : i === weeks.length - 1) ? C.lime : `${C.lime}6b`,
          }}
        />
      ))}
      {avg > 0 && (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: (avg / max) * 110, borderTopWidth: 1, borderTopColor: `${C.ash}8c`, borderStyle: "dashed" }} />
      )}
      {held >= 0 && (
        <View pointerEvents="none" style={{ position: "absolute", left: `${pos * 100}%`, top: 0, bottom: 0, width: 1, backgroundColor: `${C.ash}8c` }} />
      )}
      {readout}
    </View>
  );
}

/** Reversed, so FASTER sits higher. Same viewBox, padding and stroke as web. */
function PaceTrend({ trend, prIndex, C, held, bind, readout }: { trend: number[]; prIndex: number; C: Palette; held: number; bind: ScrubBind; readout: ReactNode }) {
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
            <Stop offset="0" stopColor={C.lime} stopOpacity={0.22} />
            <Stop offset="1" stopColor={C.lime} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={area} fill="url(#sportPaceFill)" />
        <Path d={d} fill="none" stroke={C.lime} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </Svg>
      {!!hit && (
        <View pointerEvents="none" style={{ position: "absolute", left: `${(hit[0] / W) * 100}%`, top: 0, bottom: 0, width: 1, backgroundColor: `${C.ash}8c` }} />
      )}
      {/* The PR dot is a View, not a circle: the path is stretched to the
          column's width and a circle inside a stretched viewBox is an ellipse. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: `${(pr[0] / W) * 100}%`,
          top: `${(pr[1] / H) * 100}%`,
          width: 9, height: 9, marginLeft: -4.5, marginTop: -4.5,
          borderRadius: RADIUS.pill, backgroundColor: C.lime, borderWidth: 2, borderColor: C.ink,
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
            borderRadius: RADIUS.pill, backgroundColor: C.chalk, borderWidth: 2, borderColor: C.ink,
          }}
        />
      )}
      {readout}
    </View>
  );
}

function MarkerSpark({ trend, color }: { trend: number[]; color: string }) {
  const W = 74, H = 44;
  const min = Math.min(...trend), max = Math.max(...trend);
  const span = Math.max(0.0001, max - min);
  const pts = trend.map((v, i) => [i * (W / Math.max(1, trend.length - 1)), 4 + ((v - min) / span) * (H - 10)] as const);
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Path d={pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ")} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function EffortSplitBar({
  split,
  C,
  labels,
}: {
  split: { easy: number; moderate: number; hard: number };
  C: Palette;
  labels: [string, string, string] | string[];
}) {
  const total = Math.max(1, split.easy + split.moderate + split.hard);
  const pct = (v: number) => Math.round((v / total) * 100);
  // One hue at three densities — three HUES would imply three meanings; this is
  // one meaning (intensity) at three levels.
  const bands = [
    { v: pct(split.easy), k: labels[0]!, bg: `${C.lime}61` },
    { v: pct(split.moderate), k: labels[1]!, bg: `${C.lime}ad` },
    { v: pct(split.hard), k: labels[2]!, bg: C.lime },
  ];
  // A zero band has no label to place, and a thin one must not collide with its
  // neighbour — so the legend shows only the bands that exist, with a floor.
  const shown = bands.filter((b) => b.v > 0);
  return (
    <View>
      <View style={{ flexDirection: "row", gap: 2, height: 12, borderRadius: RADIUS.pill, overflow: "hidden" }}>
        {bands.map((b) => <View key={b.k} style={{ width: `${b.v}%`, backgroundColor: b.bg }} />)}
      </View>
      <View style={{ flexDirection: "row", gap: 2, marginTop: space.md }}>
        {shown.map((b, i) => (
          <View key={b.k} style={{ flexBasis: `${b.v}%`, flexGrow: 0, flexShrink: 1, minWidth: 58, alignItems: i === shown.length - 1 ? "flex-end" : "flex-start" }}>
            <Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: C.chalk }}>{b.v}%</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: tracking.label, marginTop: 4 }}>{b.k}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
