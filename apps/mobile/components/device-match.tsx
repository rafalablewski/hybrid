import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import {
  deviceDistanceLabel,
  deviceMarkFor,
  deviceSourceLabel,
  rankDeviceWorkouts,
  type DeviceWorkout,
  type LoggedSession,
  type RankedDeviceWorkout,
} from "@hybrid/core";
import { healthKitAvailability, queryDeviceWorkouts, requestWorkoutReadAuth } from "../lib/healthkit";
import { patchSessionDevice } from "../lib/api";
import { useLang } from "../lib/i18n";
import { DeviceMark } from "./aurora/device-mark";
import { leading, F, fs, PressScale as Pressable, FIXED_FONT_SCALE } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { CtaLabel } from "./aurora/cta-label";
import Sheet from "./aurora/sheet";

/**
 * DEVICE MATCH — the sheet behind the summary's "Match the workout from your
 * watch": read the workouts HealthKit recorded around this session, rank them
 * (core rankDeviceWorkouts — time proximity + duration similarity), let the
 * athlete pick the one that IS this session, and PATCH it onto the row. Opening
 * the sheet IS the re-sync — every open queries the store live, and iOS sheets
 * the extra read permissions exactly once. Web parity: the web summary renders
 * the matched result (and can unlink) but only the phone can read HealthKit —
 * see core/session-device.ts.
 */
export function DeviceMatchSheet({
  session,
  sessionDurationMin,
  visible,
  onClose,
  onMatched,
}: {
  session: LoggedSession;
  /** the app-side duration (doneReceipt), for candidate ranking */
  sessionDurationMin: number | null;
  visible: boolean;
  onClose: () => void;
  /** fired after the server accepted the match (or the unlink) */
  onMatched: (device: DeviceWorkout | null) => void;
}) {
  const C = useTheme().palette;
  const { t } = useLang();
  const [phase, setPhase] = useState<"loading" | "list" | "error" | "unavailable">("loading");
  const [ranked, setRanked] = useState<RankedDeviceWorkout[]>([]);
  const [busyUuid, setBusyUuid] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (healthKitAvailability() !== "ready") {
      setPhase("unavailable");
      return;
    }
    setPhase("loading");
    // The permission ask doubles as "connect": iOS only shows the sheet for
    // types it hasn't asked about, so a returning athlete goes straight to the
    // query. A denial is invisible by design (Apple) — it surfaces as an empty
    // list, same as a watch that recorded nothing.
    await requestWorkoutReadAuth();
    const workouts = await queryDeviceWorkouts(session.startedAt);
    if (workouts == null) {
      setPhase("error");
      return;
    }
    setRanked(rankDeviceWorkouts({ ...session, durationMin: sessionDurationMin }, workouts));
    setPhase("list");
  }, [session, sessionDurationMin]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const pick = async (w: DeviceWorkout) => {
    if (busyUuid) return;
    setBusyUuid(w.uuid);
    const ok = await patchSessionDevice(session.id, w);
    setBusyUuid(null);
    if (!ok) {
      setPhase("error");
      return;
    }
    onMatched({ ...w, matchedAt: new Date().toISOString() });
    onClose();
  };

  const day = (isoTs: string) =>
    new Date(isoTs).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const meta = (w: DeviceWorkout) =>
    [
      `${w.durationMin} min`,
      ...(w.kcal != null ? [`${w.kcal} kcal`] : []),
      ...(w.avgHr != null ? [`♥ ${w.avgHr}`] : []),
      // The device's name only when it has no artwork — a card that carries the
      // mark is already saying which device this came off.
      ...(!deviceMarkFor(w.provider) && deviceSourceLabel(w) ? [deviceSourceLabel(w)!] : []),
    ].join(" – ");
  // The best card earns a richer second line — everything the recording holds.
  const metaFull = (w: DeviceWorkout) =>
    [
      ...(w.avgHr != null ? [`♥ ${w.avgHr}${w.maxHr != null ? `–${w.maxHr}` : ""} bpm`] : []),
      // Through core, never raw: the stored figure is the device's exact
      // measurement, so `${w.distanceKm} km` would print "10.234567 km".
      ...(w.distanceKm != null ? [deviceDistanceLabel(w.distanceKm, w.activityLabel)] : []),
      ...(w.steps != null ? [`${w.steps.toLocaleString()} steps`] : []),
      ...(w.elevationM != null ? [`↗ ${w.elevationM} m`] : []),
      ...(w.avgMets != null ? [`${w.avgMets} METs`] : []),
    ].join(" – ");

  return (
    <Sheet visible={visible} onClose={onClose} scroll={false}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            {/* The lockup, never the accent — a manufacturer's mark reproduces
                solid only (core/device-marks.ts). Only Apple's store can be read
                here today, so the sheet is titled with Apple's own artwork. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, paddingRight: 10 }}>
              <DeviceMark provider="apple" form="mark" height={14} on="dark" label="" />
              <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.chalk }}>{t("session.device.pickTitle")}</Text>
            </View>
            {phase === "list" && (
              <Pressable onPress={() => void load()}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("session.device.refresh")}</Text>
              </Pressable>
            )}
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, lineHeight: leading(fs.caption), color: C.ash, marginTop: 8 }}>{t("session.device.pickLead")}</Text>

          {phase === "unavailable" && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginVertical: 24 }}>{t("session.device.unavailable")}</Text>
          )}
          {phase === "loading" && <ActivityIndicator color={C.lime} style={{ marginVertical: 30 }} />}
          {phase === "error" && (
            <Pressable onPress={() => void load()} style={{ marginVertical: 24 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.amber }}>{t("session.device.error")}</Text>
            </Pressable>
          )}
          {phase === "list" && ranked.length === 0 && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginVertical: 24 }}>{t("session.device.none")}</Text>
          )}

          {phase === "list" && ranked.length > 0 && (
            <ScrollView style={{ marginTop: 16 }} showsVerticalScrollIndicator={false}>
              {ranked.map((r, i) => {
                const linked = session.device?.uuid === r.workout.uuid;
                const best = i === 0;
                // The best candidate is THE card — lime-washed, tagged, with its
                // own match affordance — the rest read as quiet alternatives.
                return (
                  <Pressable
                    key={r.workout.uuid}
                    onPress={() => void pick(r.workout)}
                    disabled={busyUuid != null}
                    style={{
                      borderWidth: 1,
                      borderColor: best || linked ? C.lime : C.line,
                      borderRadius: best ? 20 : 16,
                      padding: best ? 18 : 13,
                      marginBottom: best ? 14 : 10,
                      backgroundColor: best ? `${C.lime}14` : C.ink2,
                      opacity: busyUuid && busyUuid !== r.workout.uuid ? 0.5 : 1,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flex: 1 }}>
                        <DeviceMark provider={r.workout.provider} form="mark" height={best ? 15 : 11} on="dark" label={deviceSourceLabel(r.workout) ?? undefined} />
                        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: best ? F.black : F.bold, fontSize: best ? 19 : 14, color: C.chalk, flex: 1 }} numberOfLines={1}>
                          {r.workout.activityLabel}
                        </Text>
                      </View>
                      {best && (
                        <View style={{ backgroundColor: C.lime, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, marginLeft: 8 }}>
                          <Text style={{ fontFamily: F.black, fontSize: fs.nano, letterSpacing: 0.9, color: C.onAccent, textTransform: "uppercase" }}>
                            ✓ {t("session.device.best")}
                          </Text>
                        </View>
                      )}
                      {!best && linked && (
                        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, color: txt(C, C.lime), textTransform: "uppercase" }}>
                          {t("session.device.matchedChip")}
                        </Text>
                      )}
                    </View>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: best ? C.chalk : C.ash, marginTop: best ? 8 : 5 }}>
                      {day(r.workout.start)} – {meta(r.workout)}
                    </Text>
                    {best && metaFull(r.workout) !== "" && (
                      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 4 }}>{metaFull(r.workout)}</Text>
                    )}
                    {best && busyUuid == null && (
                      <View style={{ marginTop: 12, backgroundColor: C.lime, borderRadius: 12, paddingVertical: 11, alignItems: "center" }}>
                        <CtaLabel label={`${t("session.device.matchCta")} →`} color={C.onAccent} fontSize={13} font={F.black} />
                      </View>
                    )}
                    {busyUuid === r.workout.uuid && <ActivityIndicator color={C.lime} size="small" style={{ marginTop: 10 }} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
    </Sheet>
  );
}
