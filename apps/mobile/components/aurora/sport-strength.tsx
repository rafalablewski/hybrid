import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SPORT_STORE_KEY } from "@hybrid/core";
import { getPref, setPref } from "../../lib/synced-prefs";
import {
  LEVELS,
  heroMetaLine,
  markerHistory,
  sportFromSlug,
  sportPageModel,
  transferSessionBlocks,
  type LoggedSession,
  type SportPageModel,
  type SportStore,

  ALPHA,} from "@hybrid/core";
import { fetchSessions } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { leading, tracking, fs, space, F, PressScale as Pressable } from "../../lib/ui";
import { APill, AuroraScreen, RADIUS } from "./kit";
import { withAlpha } from "./field";

/** The handoff the live logger reads when the transfer session is started. */
const PENDING_KEY = "hybrid.pendingSportSession";

/**
 * STRENGTH THAT CARRIES — the S&C prescription for one sport, as its own screen.
 *
 * WHY IT IS A SCREEN AND NOT A SECTION
 * This was the ninth and tenth sections of the sport page, and it did not
 * belong there. The sport page answers "where am I?" in the past tense — a
 * record, a chart, a log. A prescription is the other tense, and putting the
 * two in one scroll cost three things, all of which this screen fixes:
 *
 *  1. TWO PRIMARY ACTIONS. The sport page's dock logs a run; this prescription's
 *     button starts a gym session. Both were chartreuse pills at the same rank,
 *     one docked and one inline, which is exactly the ambiguity the docked slot
 *     exists to prevent. Here the prescription owns the dock, and the sport page
 *     is left with one verb.
 *  2. AN EMPTY PAGE THAT WAS NOT EMPTY. A sport with nothing logged printed
 *     "Nothing logged yet" and then ~1200dp of level picker, demands, blocks and
 *     rationale. The prescription needs a sport and a level, NOT a history — so
 *     it should be reachable from an empty record, not buried under it. It is
 *     now a door that works on day one.
 *  3. A SECOND LIST OF THE SAME SIX LIFTS. "Why these lifts" repeated the pool
 *     with a sentence each. The sentence rides its own block here, so the
 *     rationale is read where the lift is prescribed and the section is gone.
 *
 * The level lives in the SAME store the sport page reads (`hybrid.sport`), so
 * picking Advanced here is picking it everywhere — the two screens are one
 * setting, not two.
 */
export default function AuroraSportStrength() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { name: raw } = useLocalSearchParams<{ name?: string }>();
  const param = typeof raw === "string" ? raw.trim() : "";
  const name = sportFromSlug(param) ?? param;

  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [store, setStore] = useState<SportStore | null>(null);
  const [levelIdx, setLevelIdx] = useState(0);
  /** The locked lifts, folded away until asked for. */
  const [showLocked, setShowLocked] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchSessions().then((d) => { if (active) setSessions(d); }).catch(() => {});
      return () => { active = false; };
    }, []),
  );

  useEffect(() => {
    if (!name) router.replace("/sport");
  }, [name, router]);

  // ON FOCUS, for the same reason the sport page reads it on focus: both
  // screens write the WHOLE `hybrid.sport` object, so a marker recorded on the
  // page while this screen held a stale copy would be dropped the next time a
  // level is picked here. One store, read by whichever screen is in front.
  useFocusEffect(
    useCallback(() => {
      // Reads the SYNCED store, like the sport page — the two screens write
      // one object, so they must also read one. Leaving this on raw storage
      // while the page moved would have let them drift apart silently.
      const s = getPref<SportStore | null>(SPORT_STORE_KEY, null);
      if (s && typeof s === "object") {
        setStore(s);
        if (typeof s.levelIdx === "number" && s.levelIdx >= 0 && s.levelIdx < LEVELS.length) setLevelIdx(s.levelIdx);
      }
    }, []),
  );

  const markers = useMemo(() => markerHistory(store, name), [store, name]);
  const m: SportPageModel = useMemo(
    // No `segmentBests` here on purpose: this screen renders the TRANSFER
    // prescription and never draws the record ladder, so fetching the stored
    // bests would be a request whose result nothing reads.
    () => sportPageModel(name, sessions, { levelIdx, markers }),
    [name, sessions, levelIdx, markers],
  );

  const pickLevel = (i: number) => {
    setLevelIdx(i);
    const next: SportStore = { ...(store ?? {}), sport: name, levelIdx: i };
    setStore(next);
    setPref(SPORT_STORE_KEY, next);
  };

  const startTransfer = async () => {
    if (!m.transfer) return;
    await AsyncStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ title: `${name} – ${LEVELS[levelIdx]}`, blocks: transferSessionBlocks(m.transfer) }),
    );
    router.push("/workout?source=sport-transfer");
  };

  const mono = (size: number, color = C.ash) => ({ fontFamily: F.mono, fontSize: size, color });
  const label = (color = C.ash) => ({ ...mono(fs.micro, color), textTransform: "uppercase" as const, letterSpacing: tracking(fs.micro, "caps") });
  const dividerTop = { borderTopWidth: 1, borderTopColor: C.line } as const;

  const SectionHead = ({ title, meta }: { title: string; meta?: string }) => (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.md, marginBottom: space.md }}>
      <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{title}</Text>
      {!!meta && <Text style={label()}>{meta}</Text>}
    </View>
  );

  const unlocked = m.pool.filter((e) => !e.locked);
  const locked = m.pool.filter((e) => e.locked);
  /** The rationale for a prescribed block, read off the pool it came from. */
  const whyFor = (blockName: string) => m.pool.find((e) => e.name === blockName)?.why ?? null;

  return (
    <AuroraScreen
      hero={{
        rank: "title",
        title: t("w.train.sportPage.transferTitle"),
        eyebrow: heroMetaLine([
          m.family,
          t("w.train.sportPage.poolMeta").replace("{n}", String(m.pool.length)),
        ]),
      }}
      accessory={<Text style={label(C.chalk)}>{name}</Text>}
      dock={m.transfer ? <APill label={t("w.train.sportPage.startSession")} onPress={startTransfer} /> : undefined}
    >
      {/* THE LEVEL — the one setting this screen owns, and the sport page reads
          the same store, so it is one choice rather than two. */}
      <View style={{ flexDirection: "row", gap: space.xs, marginTop: space.xl, marginBottom: space.xxl }}>
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
              <Text style={{ fontFamily: F.monoBold, fontSize: fs.micro, letterSpacing: tracking(fs.micro, "label"), color: on ? C.onAccent : C.ash }}>{l.toUpperCase()}</Text>
            </Pressable>
          );
        })}
      </View>

      {!!m.transfer && (
        <>
          {/* WHAT THE SPORT ASKS FOR — ranked, and the ordinal is the ONLY
              encoding of that rank. There used to be a bar beside each row whose
              width stepped 56 − 11i and whose opacity stepped 1 − 0.2i: it read
              as a measurement, and there was no number behind it. */}
          <View style={{ marginBottom: space.xxl }}>
            <SectionHead
              title={t("w.train.sportPage.demandsTitle").replace("{sport}", name)}
              meta={t("w.train.sportPage.ranked")}
            />
            {m.transfer.sport.demands.map((d, i) => (
              <View key={d} style={{ flexDirection: "row", alignItems: "center", gap: space.ms, paddingVertical: 9, ...(i ? dividerTop : null) }}>
                <Text style={{ ...mono(fs.micro), width: 16 }}>{i + 1}</Text>
                <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>{d}</Text>
              </View>
            ))}
          </View>

          {/* TODAY'S SESSION — each block carries its own reason. */}
          <View style={{ marginBottom: space.xxl }}>
            <SectionHead
              title={t("w.train.sportPage.todaysSession")}
              meta={m.transfer.personalized ? t("w.train.sportPage.fromYourLifts") : m.transfer.setScheme}
            />
            {m.transfer.blocks.map((b, i) => {
              const why = whyFor(b.name);
              return (
                <View key={b.name} style={{ paddingVertical: space.md, ...(i ? dividerTop : null) }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.md }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{b.name}</Text>
                      <Text style={{ ...mono(fs.micro), marginTop: 4 }}>{b.demand}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end", maxWidth: 170 }}>
                      <View style={{ backgroundColor: withAlpha(C.lime, ALPHA.solid), borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4 }}>
                        <Text style={{ fontFamily: F.monoBold, fontSize: fs.caption, color: txt(C, C.lime) }}>{b.scheme}</Text>
                      </View>
                      <Text style={{ ...mono(fs.nano), marginTop: 6, textAlign: "right", lineHeight: leading(fs.nano) }}>
                        {b.loadBasis ?? (b.bodyweight && b.measure === "reps" ? t("w.train.sport.bodyweightTempo") : "")}
                      </Text>
                    </View>
                  </View>
                  {!!why && (
                    <Text style={{ ...mono(fs.body), marginTop: space.sm, lineHeight: leading(fs.body) }}>{why}</Text>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* THE REST OF THE POOL. The lifts this level has not reached used to be
          full rows at 45% opacity — unreadable and still the full height. They
          fold behind ONE control, and per the exit grammar it is a bare ＋ with
          no ring in ash, never chartreuse: it grows in place, it goes nowhere. */}
      {locked.length > 0 && (
        <View style={{ marginBottom: space.huge }}>
          {showLocked && (
            <View style={{ marginBottom: space.sm }}>
              <SectionHead title={t("w.train.sportPage.laterLifts")} meta={t("w.train.sportPage.poolMeta").replace("{n}", String(m.pool.length))} />
              {locked.map((e, i) => (
                <View key={e.name} style={{ paddingVertical: space.md, ...(i ? dividerTop : null) }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: space.md }}>
                    <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{e.name}</Text>
                    <Text style={{ ...label(), fontSize: fs.nano }}>{e.unlocksAt}</Text>
                  </View>
                  <Text style={{ ...mono(fs.body), marginTop: 5, lineHeight: leading(fs.body) }}>{e.why}</Text>
                </View>
              ))}
            </View>
          )}
          <Pressable
            onPress={() => setShowLocked((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showLocked }}
            style={{ flexDirection: "row", alignItems: "center", gap: space.ms, paddingVertical: space.md, ...dividerTop }}
          >
            <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: C.ash }}>{showLocked ? "−" : "＋"}</Text>
            <Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: C.ash }}>
              {showLocked
                ? t("w.train.sportPage.hideLater")
                : t("w.train.sportPage.moreAtLevel")
                    .replace("{n}", String(locked.length))
                    .replace("{level}", locked[0]!.unlocksAt)}
            </Text>
          </Pressable>
        </View>
      )}

      {/* A sport with no pool cannot get here from the sport page (the door only
          renders when there is one), but a deep link can. */}
      {!m.transfer && unlocked.length === 0 && (
        <View style={{ alignItems: "center", paddingVertical: space.huge }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("w.train.sportPage.noTransferTitle")}</Text>
          <Text style={{ ...mono(fs.body), marginTop: space.sm, textAlign: "center", lineHeight: leading(fs.body) }}>
            {t("w.train.sportPage.noTransferBody").replace("{sport}", name)}
          </Text>
        </View>
      )}
    </AuroraScreen>
  );
}
