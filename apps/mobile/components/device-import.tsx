import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  DEVICE_IMPORT_DAYS,
  deviceImportCounts,
  deviceImportMeta,
  deviceSourceLabel,
  planDeviceImport,
  type DeviceImportItem,
  type LoggedSession,
} from "@hybrid/core";
import { healthKitAvailability, queryRecentDeviceWorkouts, requestWorkoutReadAuth } from "../lib/healthkit";
import { importDeviceWorkouts } from "../lib/api";
import { setLoggerPref, useLoggerPrefs } from "../lib/logger-prefs";
import { useLang } from "../lib/i18n";
import { DeviceMark } from "./aurora/device-mark";
import { ToggleRow } from "./toggle-row";
import { F, fs } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";

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
 *
 * Web parity: apps/web/components/device-import.tsx renders the same plan and
 * the same auto-import switch; only the READ is native (see capabilities.ts —
 * device-import).
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
  const insets = useSafeAreaInsets();
  const prefs = useLoggerPrefs();
  const [phase, setPhase] = useState<"loading" | "list" | "error" | "unavailable" | "importing">("loading");
  const [items, setItems] = useState<DeviceImportItem[]>([]);
  // Excluded by uuid — everything pending is in by default.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (healthKitAvailability() !== "ready") {
      setPhase("unavailable");
      return;
    }
    setPhase("loading");
    // The permission ask doubles as "connect" — iOS only sheets types it hasn't
    // asked about, so a returning athlete goes straight to the read.
    await requestWorkoutReadAuth();
    const workouts = await queryRecentDeviceWorkouts();
    if (workouts == null) {
      setPhase("error");
      return;
    }
    setItems(planDeviceImport(workouts, sessions));
    setExcluded(new Set());
    setPhase("list");
  }, [sessions]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const pending = useMemo(
    () => items.filter((i) => i.action !== "linked" && !excluded.has(i.workout.uuid)),
    [items, excluded],
  );
  const counts = deviceImportCounts(items);

  const run = async () => {
    if (pending.length === 0) return;
    setPhase("importing");
    const res = await importDeviceWorkouts(pending.map((i) => i.workout));
    if (!res) {
      setPhase("error");
      return;
    }
    onImported();
    onClose();
  };

  const when = (isoTs: string) =>
    new Date(isoTs).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(4,4,4,0.72)", justifyContent: "flex-end" }} onPress={onClose}>
        <Pressable
          style={{ backgroundColor: "#0e100d", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: C.line, padding: 20, paddingBottom: insets.bottom + 20, maxHeight: "88%" }}
          onPress={() => {}}
        >
          <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: "center", marginBottom: 14 }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            {/* A manufacturer's mark reproduces solid only — never the accent. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, paddingRight: 10 }}>
              <DeviceMark provider="apple" form="mark" height={14} on="dark" label="" />
              <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>{t("device.import.title")}</Text>
            </View>
            {phase === "list" && (
              <Pressable onPress={() => void load()} hitSlop={8}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("session.device.refresh")}</Text>
              </Pressable>
            )}
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, lineHeight: 17, color: C.ash, marginTop: 8 }}>
            {t("device.import.lead")}
          </Text>

          {phase === "unavailable" && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginVertical: 26 }}>{t("session.device.unavailable")}</Text>
          )}
          {(phase === "loading" || phase === "importing") && <ActivityIndicator color={C.lime} style={{ marginVertical: 34 }} />}
          {phase === "error" && (
            <Pressable onPress={() => void load()} style={{ marginVertical: 22 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.amber }}>{t("session.device.error")}</Text>
            </Pressable>
          )}
          {phase === "list" && items.length === 0 && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginVertical: 26 }}>
              {t("device.import.empty").replace("{days}", String(DEVICE_IMPORT_DAYS))}
            </Text>
          )}

          {phase === "list" && items.length > 0 && (
            <ScrollView style={{ marginTop: 14 }} showsVerticalScrollIndicator={false}>
              {items.map((item) => {
                const w = item.workout;
                const done = item.action === "linked";
                const off = done || excluded.has(w.uuid);
                return (
                  <Pressable
                    key={w.uuid}
                    onPress={() =>
                      !done &&
                      setExcluded((prev) => {
                        const next = new Set(prev);
                        if (next.has(w.uuid)) next.delete(w.uuid);
                        else next.add(w.uuid);
                        return next;
                      })
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
                      borderRadius: 16,
                      padding: 14,
                      marginBottom: 10,
                      backgroundColor: off ? "#0e0f0d" : `${C.lime}12`,
                      opacity: done ? 0.55 : 1,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                        <DeviceMark provider={w.provider} form="mark" height={11} on="dark" label={deviceSourceLabel(w) ?? undefined} />
                        <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk, flex: 1 }} numberOfLines={1}>
                          {item.title}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 5 }}>
                        {when(w.start)} – {deviceImportMeta(w).join(" – ")}
                      </Text>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: done ? C.ash : txt(C, C.lime), marginTop: 4 }}>
                        {item.action === "linked"
                          ? t("device.import.already")
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
                        {!off && <Text style={{ fontFamily: F.black, fontSize: 13, color: C.onAccent }}>✓</Text>}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {phase === "list" && counts.pending > 0 && (
            <Pressable
              onPress={() => void run()}
              disabled={pending.length === 0}
              style={{ marginTop: 6, backgroundColor: C.lime, borderRadius: 14, paddingVertical: 14, alignItems: "center", opacity: pending.length === 0 ? 0.4 : 1 }}
            >
              <Text style={{ fontFamily: F.black, fontSize: 15, color: C.onAccent }}>
                {t("device.import.cta").replace("{n}", String(pending.length))}
              </Text>
            </Pressable>
          )}

          {(phase === "list" || phase === "unavailable") && (
            <View style={{ marginTop: 14 }}>
              <ToggleRow
                C={C}
                title={t("device.import.autoTitle")}
                desc={t("device.import.autoDesc")}
                on={prefs.deviceAutoImport}
                onToggle={() => setLoggerPref("deviceAutoImport", !prefs.deviceAutoImport)}
                noBorder
              />
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
