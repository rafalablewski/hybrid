import { View, Text, Switch } from "react-native";
import { REST_SECONDS_CHOICES, type LoggerPrefs } from "@hybrid/core";
import { useLoggerPrefs, setLoggerPref } from "../../lib/logger-prefs";
import { useLang } from "../../lib/i18n";
import { fs, F } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { AuroraScreen, ACard, AHeading, ASub, ASegment } from "./kit";

type ToggleKey = Exclude<keyof LoggerPrefs, "restSeconds" | "landmarkOverrides" | "defaultStart" | "units" | "quickIncrement">;

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

/** AURORA Logger settings — the rounded, segmented-control take on the logger
 *  preferences (same useLoggerPrefs store, same options as classic). */
export default function AuroraLoggerSettings() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const prefs = useLoggerPrefs();

  // A labelled group of segmented pills (units / rest / increment / start view).
  const Group = <T extends string>({ title, options, value, onPick }: { title: string; options: { id: T; label: string }[]; value: T; onPick: (v: T) => void }) => (
    <ACard style={{ marginTop: 14 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginBottom: 12 }}>{title}</Text>
      <ASegment options={options} value={value} onPick={onPick} />
    </ACard>
  );

  return (
    <AuroraScreen>
      <AHeading style={{ fontSize: 28 }}>{t("loggerPrefs.title")}</AHeading>
      <ASub style={{ marginTop: 8 }}>{t("loggerPrefs.intro")}</ASub>

      {/* Behaviour toggles */}
      <ACard style={{ marginTop: 18 }}>
        {ROWS.map((r, i) => (
          <View
            key={r.key}
            style={{ flexDirection: "row", alignItems: "center", paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t(r.titleKey)}</Text>
              <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: 2, lineHeight: 16 }}>{t(r.descKey)}</Text>
            </View>
            <Switch
              value={prefs[r.key]}
              onValueChange={(v) => setLoggerPref(r.key, v)}
              trackColor={{ false: C.line, true: C.lime }}
              thumbColor={C.chalk}
            />
          </View>
        ))}
      </ACard>

      {prefs.restTimer && (
        <Group
          title={t("loggerPrefs.restDefault")}
          options={REST_SECONDS_CHOICES.map((sec) => ({ id: String(sec), label: `${sec}s` }))}
          value={String(prefs.restSeconds)}
          onPick={(v) => setLoggerPref("restSeconds", Number(v))}
        />
      )}

      <Group
        title={t("loggerPrefs.units")}
        options={[{ id: "kg", label: "KG" }, { id: "lb", label: "LB" }]}
        value={prefs.units}
        onPick={(v) => setLoggerPref("units", v as "kg" | "lb")}
      />

      <Group
        title={t("loggerPrefs.quickIncrement")}
        options={(prefs.units === "lb" ? [0, 5, 10] : [0, 2.5, 5]).map((inc) => ({ id: String(inc), label: inc === 0 ? t("common.off") : `±${inc}` }))}
        value={String(prefs.quickIncrement)}
        onPick={(v) => setLoggerPref("quickIncrement", Number(v))}
      />

      <Group
        title={t("loggerPrefs.defaultStart")}
        options={[{ id: "empty", label: "Empty" }, { id: "ai", label: "AI" }, { id: "last", label: "Repeat last" }]}
        value={prefs.defaultStart}
        onPick={(v) => setLoggerPref("defaultStart", v as "empty" | "ai" | "last")}
      />
    </AuroraScreen>
  );
}
