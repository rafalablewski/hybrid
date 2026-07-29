import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  rankDeviceWorkouts,
  type DeviceWorkout,
  type LoggedSession,
  type RankedDeviceWorkout,
} from "@hybrid/core";
import { healthKitAvailability, queryDeviceWorkouts, requestWorkoutReadAuth } from "../lib/healthkit";
import { patchSessionDevice } from "../lib/api";
import { useLang } from "../lib/i18n";
import { F, fs } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";

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
  const insets = useSafeAreaInsets();
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
      ...(w.source ? [w.source] : []),
    ].join(" – ");

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(4,4,4,0.72)", justifyContent: "flex-end" }} onPress={onClose}>
        <Pressable
          style={{ backgroundColor: "#0e100d", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: C.line, padding: 20, paddingBottom: insets.bottom + 24, maxHeight: "80%" }}
          onPress={() => {}}
        >
          <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: "center", marginBottom: 14 }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.chalk }}>⌚ {t("session.device.pickTitle")}</Text>
            {phase === "list" && (
              <Pressable onPress={() => void load()}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("session.device.refresh")}</Text>
              </Pressable>
            )}
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, lineHeight: 17, color: C.ash, marginTop: 8 }}>{t("session.device.pickLead")}</Text>

          {phase === "unavailable" && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginVertical: 26 }}>{t("session.device.unavailable")}</Text>
          )}
          {phase === "loading" && <ActivityIndicator color={C.lime} style={{ marginVertical: 30 }} />}
          {phase === "error" && (
            <Pressable onPress={() => void load()} style={{ marginVertical: 22 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.amber }}>{t("session.device.error")}</Text>
            </Pressable>
          )}
          {phase === "list" && ranked.length === 0 && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginVertical: 26 }}>{t("session.device.none")}</Text>
          )}

          {phase === "list" && ranked.length > 0 && (
            <ScrollView style={{ marginTop: 16 }} showsVerticalScrollIndicator={false}>
              {ranked.map((r, i) => {
                const linked = session.device?.uuid === r.workout.uuid;
                return (
                  <Pressable
                    key={r.workout.uuid}
                    onPress={() => void pick(r.workout)}
                    disabled={busyUuid != null}
                    style={{ borderWidth: 1, borderColor: i === 0 || linked ? C.lime : C.line, borderRadius: 16, padding: 14, marginBottom: 10, backgroundColor: "#0e0f0d", opacity: busyUuid && busyUuid !== r.workout.uuid ? 0.5 : 1 }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                      <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{r.workout.activityLabel}</Text>
                      {(i === 0 || linked) && (
                        <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1, color: txt(C, C.lime), textTransform: "uppercase" }}>
                          {linked ? t("session.device.matchedChip") : t("session.device.best")}
                        </Text>
                      )}
                    </View>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 5 }}>
                      {day(r.workout.start)} – {meta(r.workout)}
                    </Text>
                    {busyUuid === r.workout.uuid && <ActivityIndicator color={C.lime} size="small" style={{ marginTop: 8 }} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
