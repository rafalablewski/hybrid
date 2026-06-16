import { View, Text, Switch, Pressable } from "react-native";
import { REST_SECONDS_CHOICES, type LoggerPrefs } from "@hybrid/core";
import { useLoggerPrefs, setLoggerPref } from "../lib/logger-prefs";
import { useLang } from "../lib/i18n";
import { Screen, Card, Kicker, H1, Mono, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";

type ToggleKey = Exclude<keyof LoggerPrefs, "restSeconds">;

const ROWS: { key: ToggleKey; titleKey: string; descKey: string }[] = [
  { key: "countWarmupsInVolume", titleKey: "loggerPrefs.countWarmups", descKey: "loggerPrefs.countWarmupsDesc" },
  { key: "detailed", titleKey: "loggerPrefs.detailed", descKey: "loggerPrefs.detailedDesc" },
  { key: "countIn", titleKey: "loggerPrefs.countIn", descKey: "loggerPrefs.countInDesc" },
  { key: "restTimer", titleKey: "loggerPrefs.restTimer", descKey: "loggerPrefs.restTimerDesc" },
  { key: "carryOver", titleKey: "loggerPrefs.carryOver", descKey: "loggerPrefs.carryOverDesc" },
  { key: "keepAwake", titleKey: "loggerPrefs.keepAwake", descKey: "loggerPrefs.keepAwakeDesc" },
  { key: "haptics", titleKey: "loggerPrefs.haptics", descKey: "loggerPrefs.hapticsDesc" },
];

/** Logger settings — make the live workout's hardcoded behavior configurable. */
export default function LoggerSettings() {
  const C = useTheme().palette;
  const { t } = useLang();
  const prefs = useLoggerPrefs();

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
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{t(r.titleKey)}</Text>
              <Mono style={{ fontSize: 11, marginTop: 2, lineHeight: 16 }}>{t(r.descKey)}</Mono>
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
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            {REST_SECONDS_CHOICES.map((sec) => {
              const on = prefs.restSeconds === sec;
              return (
                <Pressable
                  key={sec}
                  onPress={() => setLoggerPref("restSeconds", sec)}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? `${C.lime}1a` : "transparent", alignItems: "center" }}
                >
                  <Text style={{ fontFamily: F.mono, fontSize: 13, color: on ? txt(C, C.lime) : C.ash }}>{sec}s</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      )}
    </Screen>
  );
}
