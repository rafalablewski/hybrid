import { View, Text } from "react-native";
import { REST_SECONDS_CHOICES, type LoggerPrefs } from "@hybrid/core";
import { useLoggerPrefs, setLoggerPref } from "../../lib/logger-prefs";
import { useLang } from "../../lib/i18n";
import { fs, space, F } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { GlassToggle } from "../glass-toggle";
import { ABack, AuroraScreen, ACard, AHeading, ASub, ASegment } from "./kit";

/** Every pref that is a plain on/off — derived from the type rather than listed
 *  by exclusion, so adding a non-boolean pref can never break this screen. */
type ToggleKey = { [K in keyof LoggerPrefs]: LoggerPrefs[K] extends boolean ? K : never }[keyof LoggerPrefs];

const ROWS: { key: ToggleKey; titleKey: string; descKey: string }[] = [
  { key: "countWarmupsInVolume", titleKey: "loggerPrefs.countWarmups", descKey: "loggerPrefs.countWarmupsDesc" },
  { key: "fractionalVolume", titleKey: "loggerPrefs.fractionalVolume", descKey: "loggerPrefs.fractionalVolumeDesc" },
  { key: "plateCalc", titleKey: "loggerPrefs.plateCalc", descKey: "loggerPrefs.plateCalcDesc" },
  { key: "autoAdvance", titleKey: "loggerPrefs.autoAdvance", descKey: "loggerPrefs.autoAdvanceDesc" },
  { key: "rpeAsRir", titleKey: "loggerPrefs.rpeAsRir", descKey: "loggerPrefs.rpeAsRirDesc" },
  { key: "detailed", titleKey: "loggerPrefs.detailed", descKey: "loggerPrefs.detailedDesc" },
  { key: "velocity", titleKey: "loggerPrefs.velocity", descKey: "loggerPrefs.velocityDesc" },
  { key: "countIn", titleKey: "loggerPrefs.countIn", descKey: "loggerPrefs.countInDesc" },
  { key: "restTimer", titleKey: "loggerPrefs.restTimer", descKey: "loggerPrefs.restTimerDesc" },
  { key: "restNotify", titleKey: "loggerPrefs.restNotify", descKey: "loggerPrefs.restNotifyDesc" },
  { key: "restSound", titleKey: "loggerPrefs.restSound", descKey: "loggerPrefs.restSoundDesc" },
  { key: "carryOver", titleKey: "loggerPrefs.carryOver", descKey: "loggerPrefs.carryOverDesc" },
  { key: "keepAwake", titleKey: "loggerPrefs.keepAwake", descKey: "loggerPrefs.keepAwakeDesc" },
  { key: "haptics", titleKey: "loggerPrefs.haptics", descKey: "loggerPrefs.hapticsDesc" },
  // Pull workouts off the watch on open — the read is native, the switch is
  // shared with web (see components/device-import.tsx on both clients).
  { key: "deviceAutoImport", titleKey: "device.import.autoTitle", descKey: "device.import.autoDesc" },
];

/** AURORA Logger settings — the rounded, segmented-control take on the logger
 *  preferences (same useLoggerPrefs store, same options as classic). */
export default function AuroraLoggerSettings() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const prefs = useLoggerPrefs();

  // A section label — an uppercase header above its own card (the app-wide
  // Settings grouping treatment).
  const SLabel = ({ children }: { children: string }) => (
    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginLeft: 4, marginTop: 18, marginBottom: 10 }}>{children}</Text>
  );

  // A labelled section of segmented pills (units / rest / increment / start view).
  const Group = <T extends string>({ title, options, value, onPick }: { title: string; options: { id: T; label: string }[]; value: T; onPick: (v: T) => void }) => (
    <>
      <SLabel>{title}</SLabel>
      <ACard><ASegment options={options} value={value} onPick={onPick} /></ACard>
    </>
  );

  return (
    <AuroraScreen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, marginBottom: 8 }}>
        <ABack />
        <AHeading style={{ fontSize: 28 }}>{t("loggerPrefs.title")}</AHeading>
      </View>
      <ASub style={{ marginTop: 8 }}>{t("loggerPrefs.intro")}</ASub>

      {/* Behaviour toggles */}
      <SLabel>{t("loggerPrefs.behaviour")}</SLabel>
      <ACard>
        {ROWS.map((r, i) => (
          <View
            key={r.key}
            style={{ flexDirection: "row", alignItems: "center", paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t(r.titleKey)}</Text>
              <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: 2, lineHeight: 16 }}>{t(r.descKey)}</Text>
            </View>
            <GlassToggle
              value={prefs[r.key]}
              onValueChange={(v) => setLoggerPref(r.key, v)}
              accessibilityLabel={t(r.titleKey)}
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
        title={t("w.account.settings.units")}
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
