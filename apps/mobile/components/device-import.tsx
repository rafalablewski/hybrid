import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APill , RADIUS} from "./aurora/kit";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import {
  DEVICE_IMPORT_DAYS,
  DEVICE_IMPORT_MIN_MIN,
  DEVICE_IMPORT_PROVIDERS,
  deviceImportMeta,
  deviceSourceLabel,
  feelSamples,
  loadBaseline,
  planDeviceImport,
  type DeviceImportItem,
  type LoggedSession,

  ALPHA, STATE_OPACITY } from "@hybrid/core";
import {
  healthKitAvailability,
  queryRecentDeviceWorkouts,
  requestDeviceReadAuth,
  requestStreamReadAuth,
  streamReadGranted,
  streamReadState,
  streamsProven,
  uploadLandedStreams,
} from "../lib/healthkit";
import {
  forgetHealthFaults,
  readHealthFaults,
  STREAM_HEALTH_STEPS,
  type HealthStep,
} from "../lib/healthkit-watchdog";
import { importDeviceWorkouts, type DeviceImportLanded } from "../lib/api";
import { FeelPrompt } from "./feel-prompt";
import { setLoggerPref, useLoggerPrefs } from "../lib/logger-prefs";
import { useLang } from "../lib/i18n";
import { haptic } from "../lib/haptics";
import { DeviceMark } from "./aurora/device-mark";
import { ToggleRow } from "./toggle-row";
import { F, FIXED_FONT_SCALE, Loading, PressScale as Pressable, fs, leading, tracking, ty} from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import Sheet from "./aurora/sheet";
import { withAlpha } from "./aurora/field";

/** Under the unattended floor — shown, but not switched on for you. */
const brief = (i: DeviceImportItem): boolean => i.workout.durationMin < DEVICE_IMPORT_MIN_MIN;

/**
 * DEVICE IMPORT — "I trained on my watch; put it in the app."
 *
 * The sheet behind every log surface's "Import from your watch": read the last
 * fortnight off the device, plan it against what's already logged (the shared
 * core/device-import.ts — nothing here decides anything), and show the athlete
 * exactly what a tap will do BEFORE it does it. New recordings become sessions;
 * one that IS a session they typed joins that row instead of duplicating it;
 * ones already in the log sit at the bottom, greyed, as proof of what synced.
 *
 * Rows are individually excludable — the watch catches a 6-minute walk to the
 * shop and calls it a workout, and the athlete gets the final word on that.
 * Which is why the sheet plans with NO duration floor (`minMinutes: 0`) and
 * switches the brief ones off instead of hiding them: DEVICE_IMPORT_MIN_MIN is
 * the floor for what an unattended sync WRITES, and using it to filter the list
 * as well meant a short recording — a warm-up swim, a sprint session, a walk
 * the athlete actually counts — simply wasn't there, indistinguishable from the
 * watch having recorded nothing, while the summary's match picker offered that
 * same recording without complaint.
 *
 * AND IT ENDS IN THE ONE QUESTION THE WATCH CANNOT ANSWER. A recording carries
 * every figure of the session except how hard it felt — the value session load,
 * ACWR and every risk read are built from (core/session-feel.ts). Importing
 * used to close the sheet on success, which left that answer reachable only by
 * finding the session and scrolling its summary to the Wrapped's panel. Nobody
 * does that, so in practice every imported session stayed weightless in the
 * models. The import now finishes ON the question instead, with the athlete
 * still in front of it and the session still the thing they are thinking about.
 *
 * renders the same plan and the same auto-import switch; only the READ is
 * native (see capabilities.ts — device-import).
 */
export function DeviceImportSheet({
  sessions,
  visible,
  onClose,
  onImported,
}: {
  /** The athlete's recent log — what the plan dedupes against. */
  sessions: LoggedSession[];
  visible: boolean;
  onClose: () => void;
  /** Fired after the server wrote anything, so the caller can refetch. */
  onImported: () => void;
}) {
  const C = useTheme().palette;
  const { t } = useLang();
  const prefs = useLoggerPrefs();
  const [phase, setPhase] = useState<"loading" | "list" | "error" | "unavailable" | "importing" | "rate">("loading");
  const [items, setItems] = useState<DeviceImportItem[]>([]);
  // Excluded by uuid — everything pending is in by default.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  // What the import just put in the log, waiting on its effort rating.
  const [landed, setLanded] = useState<DeviceImportLanded[]>([]);
  const [answered, setAnswered] = useState(false);
  /**
   * THE TRACE UNDER THE SUMMARY — and why it is a row rather than a side effect.
   *
   * The import used to fire the recording read on its own tail, unawaited: the
   * sessions landed, this sheet moved to the rating question, and the read
   * started behind it. That read is native, and on a real phone the process went
   * with it — twice. An athlete tapped import, the app closed, and the only way
   * to find out that the sessions HAD landed was to open the app again.
   *
   * So the summaries are the import, full stop, and the trace is a second thing
   * with its own row: it says what it fetches, it asks for the series types when
   * tapped, and if reading them is what takes the app then it takes it under a
   * control the athlete chose, with a name on it. Once one read has come back on
   * this phone (`streamsProven`) the row stops being a gate and the traces ride
   * along with every import from then on.
   */
  const [trace, setTrace] = useState<{ granted: boolean; proven: boolean }>({ granted: false, proven: false });
  const [tracing, setTracing] = useState(false);
  const [traced, setTraced] = useState<number | null>(null);
  // Everything the import wrote, rated or not — the rows a trace fetch covers.
  const [allLanded, setAllLanded] = useState<DeviceImportLanded[]>([]);
  // A native read that never came back (lib/healthkit-watchdog.ts). Said out
  // loud HERE because a native abort leaves nothing else behind: no exception,
  // no error screen, no log the phone still has — just an athlete who watched
  // the app close. This line is the only thing that can turn that into a report
  // anybody can act on, so it names the span rather than apologising vaguely.
  const [faults, setFaults] = useState<HealthStep[]>([]);
  /** Has one of the trace spans been implicated in a process that vanished?
   *  Then the row is a "try anyway" — the read is skipped until asked for by
   *  name, and a control that silently does nothing is worse than the crash it
   *  is avoiding. Covers the previous build's single "streams" name too. */
  const streamFaulted = faults.some((f) => (f as string).startsWith("stream"));
  // "vs your usual" is the athlete against THEMSELVES over the last month.
  // Bodyweight is not passed because it cannot move this number: a felt load is
  // effort × minutes, and neither term is bodyweight-dependent.
  const baseline = useMemo(() => loadBaseline(feelSamples(sessions)), [sessions]);

  // THE READ IS AN EVENT, NOT A SUBSCRIPTION. `load` is deliberately stable and
  // takes the log from a ref: the effect below runs it when the sheet OPENS,
  // and a `load` that changed identity every time `sessions` did would re-run it
  // on every refetch behind the sheet — re-reading the health store, discarding
  // the rows the athlete had excluded, and (since the import itself refetches)
  // throwing away the rate step the moment it appeared.
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const load = useCallback(async () => {
    setFaults(Object.keys(await readHealthFaults()) as HealthStep[]);
    if (healthKitAvailability() !== "ready") {
      setPhase("unavailable");
      return;
    }
    // The STATE, not the grant — see `streamReadState`. Asking the store about
    // the route + cycling types here was a native call against the series types
    // on the import tap itself, which is the one thing this flow will not spend
    // before an athlete has asked for a recording by name.
    setTrace(await streamReadState());
    setPhase("loading");
    // The permission ask doubles as "connect" — iOS only sheets types it hasn't
    // asked about, so a returning athlete goes straight to the read. It asks for
    // the WORKOUT types and nothing else: the trace read that follows an import
    // carries its own ask, at the point of use, where it is skippable (see
    // requestDeviceReadAuth — the second ask on this line is what the build that
    // started closing the app had added).
    await requestDeviceReadAuth();
    const workouts = await queryRecentDeviceWorkouts();
    if (workouts == null) {
      setPhase("error");
      return;
    }
    // No floor on what is SHOWN (see the header) — the brief recordings arrive
    // in the plan and start switched off, so the athlete decides.
    const planned = planDeviceImport(workouts, sessionsRef.current, { minMinutes: 0 });
    setItems(planned);
    setExcluded(
      new Set(planned.filter((i) => i.action !== "linked" && brief(i)).map((i) => i.workout.uuid)),
    );
    setLanded([]);
    setAllLanded([]);
    setTraced(null);
    setAnswered(false);
    setPhase("list");
  }, []);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const pending = useMemo(
    () => items.filter((i) => i.action !== "linked" && !excluded.has(i.workout.uuid)),
    [items, excluded],
  );

  /**
   * THE REFETCH IS TOLD ON THE WAY OUT, not the moment the write lands.
   *
   * `onImported` is the host's "something changed, reload" — and on Home that
   * host is the quick-log sheet, whose reload handler also CLOSES itself. This
   * sheet renders inside it, so announcing the import mid-flow would unmount the
   * rating step the instant it appeared. Firing on dismissal instead costs
   * nothing (the sheet covers the screen it would be refreshing) and keeps the
   * announcement to exactly one, however the athlete leaves — the button, a
   * swipe, or the scrim.
   */
  const wrote = useRef(false);
  const close = () => {
    if (wrote.current) {
      wrote.current = false;
      onImported();
    }
    onClose();
  };

  const run = async () => {
    if (pending.length === 0) return;
    setPhase("importing");
    const res = await importDeviceWorkouts(pending.map((i) => i.workout));
    if (!res) {
      setPhase("error");
      return;
    }
    wrote.current = true;
    setAllLanded(res.landed);
    // The import wrote SUMMARIES, and that is the import finished. The trace
    // under each row is still only on this device — but reading it is the span
    // that has twice taken the process, so it rides along ONLY where that read
    // has already been seen to return on this phone. Everywhere else it waits
    // for the row below, which says what it does before it does it.
    if (res.landed.length && trace.granted && trace.proven)
      void uploadLandedStreams(res.landed).catch(() => 0);
    // A row that came back already rated (an attach onto a session the athlete
    // finished in the app) has nothing to ask. Nothing to ask about at all → the
    // import is simply done, exactly as before.
    const ask = res.landed.filter((l) => !l.rated);
    if (ask.length === 0) {
      close();
      return;
    }
    setLanded(ask);
    setPhase("rate");
  };

  /**
   * THE ONE PLACE THE SERIES TYPES ARE ASKED FOR, and the one place a trace is
   * fetched before the read has proved itself on this phone.
   *
   * Both halves are deliberate taps because both halves are what the app has
   * been closed inside: the permission sheet for the route and cycling types,
   * and the route query behind it. Neither now happens to an athlete who did not
   * ask; if one of them still takes the process, the watchdog's marker names
   * which (lib/healthkit-watchdog.ts), the sessions are already in the log, and
   * the span never runs unattended again.
   */
  const fetchTraces = async () => {
    if (tracing) return;
    haptic.selection();
    setTracing(true);
    // AN IMPLICATED SPAN IS SKIPPED UNTIL SOMEBODY ASKS FOR IT BY NAME, and this
    // tap is that ask. A phone that met the crash under an earlier build is
    // carrying a marker for it right now, so without this the row would sit
    // there doing nothing at all — quarantine turning into a dead control, with
    // no way back and nothing said. The fault line above the row is what makes
    // it an informed tap rather than a mystery.
    if (streamFaulted) await forgetHealthFaults(STREAM_HEALTH_STEPS).catch(() => {});
    const granted = trace.granted || (await requestStreamReadAuth());
    const done = granted && allLanded.length ? await uploadLandedStreams(allLanded).catch(() => 0) : 0;
    setTrace({ granted: await streamReadGranted(), proven: await streamsProven() });
    setTraced(granted && allLanded.length ? done : null);
    // Whatever the read did, the record is what it is now — including a marker
    // this very tap may have just left behind and come back from.
    setFaults(Object.keys(await readHealthFaults()) as HealthStep[]);
    setTracing(false);
  };

  /** Present in both the list and the rating step: before an import it is the
   *  grant, after one it is the fetch for what just landed. Hidden once the
   *  read has proved itself — from then on the traces simply come with the
   *  import and a row saying so would be a switch for something already on. */
  const traceRow =
    trace.granted && trace.proven ? null : (
      <Pressable
        onPress={() => void fetchTraces()}
        // A faulted span makes this row an offer again even with nothing landed:
        // the tap is what lifts the quarantine, and refusing it would leave the
        // athlete looking at a control that cannot be operated.
        disabled={tracing || (trace.granted && allLanded.length === 0 && !streamFaulted)}
        accessibilityRole="button"
        accessibilityLabel={t("device.import.traceTitle")}
        accessibilityHint={t("device.import.traceDesc")}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.line }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{t("device.import.traceTitle")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2, lineHeight: leading(fs.micro, "snug") }}>
            {t("device.import.traceDesc")}
          </Text>
        </View>
        {tracing ? (
          <ActivityIndicator color={C.lime} />
        ) : (
          <Text
            style={{
              fontFamily: F.mono,
              fontSize: fs.caption,
              color: traced != null || (trace.granted && allLanded.length === 0) ? C.ash : txt(C, C.lime),
            }}
          >
            {traced != null
              ? t("device.import.traceDone").replace("{n}", String(traced))
              : streamFaulted
                ? // The span this row runs has been implicated in a vanished
                  // process. The word has to carry that, or the tap is a trap.
                  t("device.import.traceRetry")
                : !trace.granted
                  ? t("device.import.traceCta")
                  : // Granted, with nothing landed to fetch for: the row is a
                    // state rather than an action, and says so in ash.
                    t(allLanded.length ? "device.import.traceFetch" : "device.import.traceOn")}
          </Text>
        )}
      </Pressable>
    );

  const when = (isoTs: string) =>
    new Date(isoTs).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <Sheet visible={visible} onClose={close} scroll={false}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            {/* A manufacturer's mark reproduces solid only — never the accent. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, paddingRight: 10 }}>
              <DeviceMark provider="apple" form="mark" height={14} on="dark" label="" />
              <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>
                {t(phase === "rate" ? "device.import.ratedTitle" : "device.import.title")}
              </Text>
            </View>
            {phase === "list" && (
              <Pressable onPress={() => void load()} hitSlop={8}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("session.device.refresh")}</Text>
              </Pressable>
            )}
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, lineHeight: leading(fs.caption), color: C.ash, marginTop: 8 }}>
            {t(phase === "rate" ? "device.import.rateLead" : "device.import.lead")}
          </Text>
          {phase !== "rate" && faults.length > 0 && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, lineHeight: leading(fs.micro), color: txt(C, C.amber), marginTop: 8 }}>
              {t("device.import.fault").replace("{step}", faults.join(", "))}
            </Text>
          )}

          {phase === "unavailable" && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginVertical: 24 }}>{t("session.device.unavailable")}</Text>
          )}
          {/* The LIST arriving is content, so it hands over as a skeleton; the
              import itself is an action in flight, which is what a spinner is
              for. One condition drew both and so drew the wrong one half the
              time. */}
          {phase === "loading" && <Loading />}
          {phase === "importing" && <ActivityIndicator color={C.lime} style={{ marginVertical: 34 }} />}
          {phase === "error" && (
            <Pressable onPress={() => void load()} style={{ marginVertical: 24 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.amber) }}>{t("session.device.error")}</Text>
            </Pressable>
          )}
          {phase === "list" && items.length === 0 && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginVertical: 24 }}>
              {t("device.import.empty").replace("{days}", String(DEVICE_IMPORT_DAYS))}
            </Text>
          )}

          {phase === "list" && items.length > 0 && (
            <ScrollView style={{ marginTop: 16 }} showsVerticalScrollIndicator={false}>
              {items.map((item) => {
                const w = item.workout;
                const done = item.action === "linked";
                const off = done || excluded.has(w.uuid);
                return (
                  <Pressable
                    key={w.uuid}
                    onPress={() =>
                      !done &&
                      (haptic.selection(),
                      setExcluded((prev) => {
                        const next = new Set(prev);
                        if (next.has(w.uuid)) next.delete(w.uuid);
                        else next.add(w.uuid);
                        return next;
                      }))
                    }
                    disabled={done}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: !off, disabled: done }}
                    accessibilityLabel={`${item.title} – ${deviceImportMeta(w).join(" – ")}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      borderWidth: 1,
                      borderColor: off ? C.line : C.lime,
                      borderRadius: RADIUS.field,
                      padding: 16,
                      marginBottom: 10,
                      backgroundColor: off ? C.ink2 : withAlpha(C.lime, ALPHA.wash),
                      opacity: done ? STATE_OPACITY.disabled : 1,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                        <DeviceMark provider={w.provider} form="mark" height={11} on="dark" label={deviceSourceLabel(w) ?? undefined} />
                        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk, flex: 1 }} numberOfLines={1}>
                          {item.title}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 5 }}>
                        {when(w.start)} – {deviceImportMeta(w).join(" – ")}
                      </Text>
                      {/* A brief recording says WHY it is off rather than what
                          it would do — tapping it on switches the line back to
                          the action, so the athlete reads a consequence only
                          once they've asked for one. */}
                      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: off ? C.ash : txt(C, C.lime), marginTop: 4 }}>
                        {item.action === "linked"
                          ? t("device.import.already")
                          : off && brief(item)
                            ? t("device.import.brief")
                            : item.action === "attach"
                              ? t("device.import.joins").replace("{title}", item.sessionTitle ?? "")
                              : t("device.import.adds")}
                      </Text>
                    </View>
                    {!done && (
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: off ? C.line : C.lime,
                          backgroundColor: off ? "transparent" : C.lime,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {!off && <Text style={{ fontFamily: F.black, fontSize: fs.body, color: C.onAccent }}>✓</Text>}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* Driven by what is actually SWITCHED ON, not by what the plan holds:
              with every row excluded there is nothing to import, and a disabled
              "Import 0" is a button pretending to be an option. */}
          {phase === "list" && pending.length > 0 && (
            <APill
              label={t("device.import.cta").replace("{n}", String(pending.length))}
              onPress={() => void run()}
              style={{ marginTop: 6 }}
            />
          )}

          {/* THE ASK — one prompt per session that just landed, seeded blank
              because a row nobody typed is a row nobody was asked about. Each
              tap saves on its own (FeelPrompt is optimistic), so the athlete can
              answer one, both, or none and leave whenever they like. The eyebrow
              carries the SESSION's name rather than the generic question: with
              two runs imported at once, "How did that feel?" twice is not a
              question anyone can answer. */}
          {phase === "rate" && (
            <>
              <ScrollView style={{ marginTop: 4 }} showsVerticalScrollIndicator={false}>
                {landed.map((l) => (
                  <FeelPrompt
                    key={l.id}
                    compact
                    sessionId={l.id}
                    minutes={l.minutes}
                    sessionEnd={l.completedAt}
                    baseline={baseline}
                    onAnswered={() => setAnswered(true)}
                    eyebrow={() => (
                      <Text
                        maxFontSizeMultiplier={FIXED_FONT_SCALE}
                        numberOfLines={1}
                        style={ty(C, "overline")}
                      >
                        {l.title}
                      </Text>
                    )}
                  />
                ))}
              </ScrollView>
              {/* The way out says what leaving MEANS. Before an answer it is a
                  deferral, after one it is a finish — the same button either
                  way, because the sheet never holds anybody hostage to a
                  question about their own training. */}
              <Pressable
                onPress={close}
                style={{ marginTop: 14, backgroundColor: answered ? C.lime : "transparent", borderWidth: answered ? 0 : 1, borderColor: C.line, borderRadius: 14, paddingVertical: 16, alignItems: "center" }}
              >
                <Text style={{ fontFamily: answered ? F.black : F.mono, fontSize: answered ? 15 : fs.caption, color: answered ? C.onAccent : C.ash }}>
                  {t(answered ? "common.done" : "device.import.rateSkip")}
                </Text>
              </Pressable>
              {/* The sessions are in the log by now, which is exactly why the
                  trace offer belongs here: whatever this read does, it can no
                  longer cost the import. */}
              {traceRow}
            </>
          )}

          {/* WHERE IT READS FROM — every provider the import shape supports,
              each saying where it stands. Garmin is wired end to end but has no
              reader yet, and says so rather than being hidden: an athlete
              looking for their Garmin should find the answer here. */}
          {(phase === "list" || phase === "unavailable") && (
            <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line }}>
              <Text style={{ ...ty(C, "overline"), marginBottom: 10  }}>
                {t("device.import.sources")}
              </Text>
              {DEVICE_IMPORT_PROVIDERS.map((p) => (
                <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 }}>
                  <DeviceMark provider={p.id} form="lockup" height={16} on="dark" label={deviceSourceLabel({ provider: p.id }) ?? undefined} />
                  <View style={{ flex: 1 }} />
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: p.status === "live" ? txt(C, C.lime) : C.ash }}>
                    {t(p.status === "live" ? "device.import.live" : "device.import.placeholder")}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {(phase === "list" || phase === "unavailable") && (
            <View style={{ marginTop: 16 }}>
              <ToggleRow
                C={C}
                title={t("device.import.autoTitle")}
                desc={t("device.import.autoDesc")}
                on={prefs.deviceAutoImport}
                onToggle={() => setLoggerPref("deviceAutoImport", !prefs.deviceAutoImport)}
                noBorder
              />
              {phase === "list" && traceRow}
            </View>
          )}
    </Sheet>
  );
}
