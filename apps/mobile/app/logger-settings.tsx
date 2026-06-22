import { View, Text, Switch, Pressable } from "react-native";
import { REST_SECONDS_CHOICES, type LoggerPrefs } from "@hybrid/core";
import { useLoggerPrefs, setLoggerPref } from "../lib/logger-prefs";
import { useLang } from "../lib/i18n";
import { fs, space, Screen, Card, Kicker, H1, Mono, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraLoggerSettings from "../components/aurora/logger-settings";

type ToggleKey = Exclude<keyof LoggerPrefs, "restSeconds" | "landmarkOverrides" | "defaultStart" | "units" | "quickIncrement" | "shareThemeId">;

export default function LoggerSettings() {
  if (useTemplate().template === "aurora") return <AuroraLoggerSettings />;
  return <ClassicLoggerSettings />;
}

const ROWS: { key: ToggleKey; titleKey: string; descKey: string }[] = [
  { key: "countWarmupsInVolume", titleKey: "loggerPrefs.countWarmups", descKey: "loggerPrefs.countWarmupsDesc" },
  { key: "fractionalVolume", titleKey: "loggerPrefs.fractionalVolume", descKey: "loggerPrefs.fractionalVolumeDesc" },
  { key: "plateCalc", titleKey: "loggerPrefs.plateCalc", descKey: "loggerPrefs.plateCalcDesc" },
  { key: "autoAdvance", titleKey: "loggerPrefs.autoAdvance", descKey: "loggerPrefs.autoAdvanceDesc" },
  { key: "rpeAsRir", titleKey: "loggerPrefs.rpeAsRir", descKey: "loggerPrefs.rpeAsRirDesc" },
  { key: "detailed", titleKey: "loggerPrefs.detailed", descKey: "loggerPrefs.detailedDesc" },
  { key: "countIn", titleKey: "loggerPrefs.countIn", descKey: "loggerPrefs.countInDesc" },
  { key: "restTimer", titleKey: "loggerPrefs.restTimer", descKey: "loggerPrefs.restTimerDesc" },
  { key: "restNotify", titleKey: "loggerPrefs.restNotify", descKey: "loggerPrefs.restNotifyDesc" },
  { key: "restSound", titleKey: "loggerPrefs.restSound", descKey: "loggerPrefs.restSoundDesc" },
  { key: "carryOver", titleKey: "loggerPrefs.carryOver", descKey: "loggerPrefs.carryOverDesc" },
  { key: "keepAwake", titleKey: "loggerPrefs.keepAwake", descKey: "loggerPrefs.keepAwakeDesc" },
  { key: "haptics", titleKey: "loggerPrefs.haptics", descKey: "loggerPrefs.hapticsDesc" },
];

/** Logger settings — make the live workout's hardcoded behavior configurable. */
function ClassicLoggerSettings() {
  const C = useTheme().palette;
  const { t } = useLang();
  const prefs = useLoggerPrefs();
  // Aurora rounds choice chips into pills, matching the segmented controls used
  // across the rest of the Aurora UI; Classic keeps the tighter radius.
  const rChip = useTemplate().template === "aurora" ? 999 : 10;

  return (
    <Screen>
      <Kicker>{t("loggerPrefs.title")}</Kicker>
      <H1>{t("loggerPrefs.title")}</H1>
      <Mono style={{ marginTop: 6, lineHeight: 18 }}>{t("loggerPrefs.intro")}</Mono>

      <Card style={{ marginTop: 16 }}>
        {ROWS.map((r, i) => (
          <View
            key={r.key}
            style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t(r.titleKey)}</Text>
              <Mono style={{ fontSize: fs.micro, marginTop: 2, lineHeight: 16 }}>{t(r.descKey)}</Mono>
            </View>
            <Switch
              value={prefs[r.key]}
              onValueChange={(v) => setLoggerPref(r.key, v)}
              trackColor={{ false: C.line, true: C.lime }}
              thumbColor={C.chalk}
            />
          </View>
        ))}
      </Card>

      {/* Default rest duration — only meaningful when the auto rest timer is on */}
      {prefs.restTimer && (
        <Card style={{ marginTop: 14 }}>
          <Kicker color={C.lime}>{t("loggerPrefs.restDefault")}</Kicker>
          <View style={{ flexDirection: "row", gap: space.sm, marginTop: 12 }}>
            {REST_SECONDS_CHOICES.map((sec) => {
              const on = prefs.restSeconds === sec;
              return (
                <Pressable
                  key={sec}
                  onPress={() => setLoggerPref("restSeconds", sec)}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: rChip, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? `${C.lime}1a` : "transparent", alignItems: "center" }}
                >
                  <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: on ? txt(C, C.lime) : C.ash }}>{sec}s</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      )}

      {/* Units — kg / lb (storage stays kg). */}
      <Card style={{ marginTop: 14 }}>
        <Kicker color={C.lime}>{t("loggerPrefs.units")}</Kicker>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: 12 }}>
          {(["kg", "lb"] as const).map((u) => {
            const on = prefs.units === u;
            return (
              <Pressable key={u} onPress={() => setLoggerPref("units", u)} style={{ flex: 1, paddingVertical: 10, borderRadius: rChip, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? `${C.lime}1a` : "transparent", alignItems: "center" }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, textTransform: "uppercase", color: on ? txt(C, C.lime) : C.ash }}>{u}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Quick-increment — +/- load stepper step, in the chosen unit. */}
      <Card style={{ marginTop: 14 }}>
        <Kicker color={C.lime}>{t("loggerPrefs.quickIncrement")}</Kicker>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: 12 }}>
          {(prefs.units === "lb" ? [0, 5, 10] : [0, 2.5, 5]).map((inc) => {
            const on = prefs.quickIncrement === inc;
            return (
              <Pressable key={inc} onPress={() => setLoggerPref("quickIncrement", inc)} style={{ flex: 1, paddingVertical: 10, borderRadius: rChip, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? `${C.lime}1a` : "transparent", alignItems: "center" }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: on ? txt(C, C.lime) : C.ash }}>{inc === 0 ? t("common.off") : `±${inc}`}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Default start view — what the "Start workout" hero opens with. */}
      <Card style={{ marginTop: 14 }}>
        <Kicker color={C.lime}>{t("loggerPrefs.defaultStart")}</Kicker>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: 12 }}>
          {([["empty", "Empty"], ["ai", "AI"], ["last", "Repeat last"]] as const).map(([id, label]) => {
            const on = prefs.defaultStart === id;
            return (
              <Pressable
                key={id}
                onPress={() => setLoggerPref("defaultStart", id)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: rChip, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? `${C.lime}1a` : "transparent", alignItems: "center" }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: on ? txt(C, C.lime) : C.ash }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>
    </Screen>
  );
}
