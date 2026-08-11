import { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import {
  HEAT_MINUTES_BOUNDS,
  HEAT_REF_C,
  HEAT_TEMP_BOUNDS,
  heatIntensity,
  fmtTemp,
  space,
  type WeightUnit,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { fs, F, leading } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { haptic } from "../../lib/haptics";
import { logHeat } from "../../lib/api";
import Sheet from "./sheet";
import { RADIUS } from "./kit";
import { GlassSegment, NativeDateField, NativeStepper, LIQUID_GLASS_SUPPORTED } from "./swiftui";

/**
 * LOG HEAT — the sauna sheet.
 *
 * THE INPUT IS TYPED, ALL OF IT. No watch knows you sat in a sauna and nothing
 * in the room reports to us, so unlike every other recovery surface in the app
 * there is no import path, no device match and nothing to wait for. Both halves
 * are the athlete's own: how long, and how hot.
 *
 * WHICH IS WHY THIS SHEET IS BUILT OUT OF SYSTEM CONTROLS. When a value is
 * always going to be nudged rather than typed — a round number near the last
 * round number — SwiftUI's own controls are simply better than anything we
 * would draw: `Stepper` brings repeat-on-hold, disabled ends at min/max and the
 * adjustable VoiceOver trait; the segmented `Picker` brings the platform's
 * selection behaviour and its focus ring; `DatePicker` brings the calendar
 * popover everybody already knows how to drive. A pair of hand-rolled ±
 * buttons gets none of it. Off-iOS every one of them returns null and the
 * plain RN rows below carry the sheet on their own — the presets are the floor,
 * the native layer is the refinement.
 *
 * TEMPERATURE IS NOT DECORATION. Twenty minutes at 90 °C and twenty minutes in
 * a 55 °C infrared cabin are not the same stimulus, so minutes are converted to
 * EQUIVALENT MINUTES before anything scores them (engines/heat.ts). The sheet
 * shows that conversion live, at the moment of entry, so the athlete can see
 * that hotter is worth more before the engine tells them so — a model you meet
 * as a result is a black box; a model you meet as you type is a claim you can
 * argue with.
 */

/** Duration presets, in minutes. Round numbers near the last round number. */
const MINUTE_PRESETS = [10, 15, 20, 30];

/** Temperature presets, °C. Chosen to span the real range an athlete meets:
 *  an infrared cabin, a cool public sauna, traditional, and hot. */
const TEMP_PRESETS = [55, 70, 80, 90, 100];

export function HeatSheet({
  visible,
  onClose,
  onLogged,
  weightUnit = "kg",
  /** Defaults the clock — the post-session entry passes the session's end, so
   *  the lag the decay reads is exact rather than "whenever you got round to
   *  opening the app". */
  initialAt,
}: {
  visible: boolean;
  onClose: () => void;
  onLogged?: () => void;
  weightUnit?: WeightUnit;
  initialAt?: Date;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [minutes, setMinutes] = useState(20);
  const [tempC, setTempC] = useState(HEAT_REF_C);
  const [when, setWhen] = useState<Date>(initialAt ?? new Date());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const equiv = useMemo(() => minutes * heatIntensity(tempC), [minutes, tempC]);
  // Zero equivalent minutes is a real answer, not an error: below the floor the
  // room is warm rather than thermally stressful, and the sheet says so instead
  // of letting the athlete save something that will silently score nothing.
  const worthless = equiv <= 0;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setMsg("");
    const ok = await logHeat(minutes, tempC, when.toISOString());
    setSaving(false);
    if (!ok) {
      setMsg(t("w.recovery.heat.failed"));
      return;
    }
    haptic.success();
    onLogged?.();
    onClose();
  };

  const label = { fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase" as const, letterSpacing: 0.9 };
  const rowBox = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: space.ms,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: RADIUS.field,
    paddingVertical: 11,
    paddingHorizontal: 14,
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t("w.recovery.heat.title")} sub={t("w.recovery.heat.sub")}>
      {/* ── HOW LONG ─────────────────────────────────────────────────────── */}
      <Text style={{ ...label, marginBottom: 8 }}>{t("w.recovery.heat.howLong")}</Text>
      {LIQUID_GLASS_SUPPORTED ? (
        <GlassSegment
          options={MINUTE_PRESETS.map((m) => ({ id: String(m), label: `${m}` }))}
          value={String(MINUTE_PRESETS.includes(minutes) ? minutes : MINUTE_PRESETS[0])}
          onPick={(v) => setMinutes(Number(v))}
          accent={C.amber}
        />
      ) : (
        <PresetRow C={C} values={MINUTE_PRESETS} value={minutes} onPick={setMinutes} suffix="" />
      )}
      <View style={{ ...rowBox, marginTop: 10 }}>
        {LIQUID_GLASS_SUPPORTED ? (
          <NativeStepper
            label={`${minutes} ${t("w.recovery.heat.min")}`}
            value={minutes}
            step={5}
            min={HEAT_MINUTES_BOUNDS[0]}
            max={HEAT_MINUTES_BOUNDS[1]}
            onChange={setMinutes}
            fontFamily={F.mono}
            fontSize={15}
            fg={C.chalk}
            tintColor={C.amber}
          />
        ) : (
          <Nudge C={C} label={`${minutes} ${t("w.recovery.heat.min")}`} step={5} value={minutes} onChange={setMinutes} bounds={HEAT_MINUTES_BOUNDS} />
        )}
      </View>

      {/* ── HOW HOT ──────────────────────────────────────────────────────── */}
      <Text style={{ ...label, marginTop: 18, marginBottom: 8 }}>{t("w.recovery.heat.howHot")}</Text>
      {LIQUID_GLASS_SUPPORTED ? (
        <GlassSegment
          options={TEMP_PRESETS.map((v) => ({ id: String(v), label: `${v}°` }))}
          value={String(TEMP_PRESETS.includes(tempC) ? tempC : HEAT_REF_C)}
          onPick={(v) => setTempC(Number(v))}
          accent={C.amber}
        />
      ) : (
        <PresetRow C={C} values={TEMP_PRESETS} value={tempC} onPick={setTempC} suffix="°" />
      )}
      <View style={{ ...rowBox, marginTop: 10 }}>
        {LIQUID_GLASS_SUPPORTED ? (
          <NativeStepper
            label={fmtTemp(tempC, weightUnit)}
            value={tempC}
            step={5}
            min={HEAT_TEMP_BOUNDS[0]}
            max={HEAT_TEMP_BOUNDS[1]}
            onChange={setTempC}
            fontFamily={F.mono}
            fontSize={15}
            fg={C.chalk}
            tintColor={C.amber}
          />
        ) : (
          <Nudge C={C} label={fmtTemp(tempC, weightUnit)} step={5} value={tempC} onChange={setTempC} bounds={HEAT_TEMP_BOUNDS} />
        )}
      </View>

      {/* ── THE MODEL, SHOWN AS IT IS ENTERED ────────────────────────────── */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.ms, marginTop: 12, paddingHorizontal: 4 }}>
        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash }}>
          {worthless ? t("w.recovery.heat.tooCool") : t("w.recovery.heat.thatIs")}
        </Text>
        {!worthless && (
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.amber) }}>
            {t("w.recovery.heat.equiv").replace("{n}", String(Math.round(equiv)))}
          </Text>
        )}
      </View>

      {/* ── WHEN ─────────────────────────────────────────────────────────── */}
      <Text style={{ ...label, marginTop: 18, marginBottom: 8 }}>{t("w.recovery.heat.when")}</Text>
      <View style={rowBox}>
        {LIQUID_GLASS_SUPPORTED ? (
          <NativeDateField
            value={when}
            onChange={setWhen}
            latest={new Date()}
            label={t("w.recovery.heat.when")}
            tintColor={C.amber}
          />
        ) : (
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>
            {when.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </Text>
        )}
      </View>

      <Pressable
        onPress={save}
        disabled={saving || worthless}
        accessibilityRole="button"
        accessibilityLabel={t("w.recovery.heat.save")}
        style={{
          backgroundColor: C.amber,
          borderRadius: RADIUS.pill,
          paddingVertical: 15,
          alignItems: "center",
          marginTop: 20,
          opacity: saving || worthless ? 0.45 : 1,
        }}
      >
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, fontWeight: "700", letterSpacing: 1.2, color: C.onAccent }}>
          {saving ? "…" : t("w.recovery.heat.save").toUpperCase()}
        </Text>
      </Pressable>

      {!!msg && (
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.red), marginTop: 10, lineHeight: leading(fs.caption) }}>
          {msg}
        </Text>
      )}
    </Sheet>
  );
}

/** The off-iOS floor for a preset row — the same choices, drawn by us. */
function PresetRow({
  C, values, value, onPick, suffix,
}: {
  C: ReturnType<typeof useTheme>["palette"];
  values: number[];
  value: number;
  onPick: (v: number) => void;
  suffix: string;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 7 }}>
      {values.map((v) => {
        const on = v === value;
        return (
          <Pressable
            key={v}
            onPress={() => onPick(v)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 9,
              borderRadius: RADIUS.pill,
              backgroundColor: on ? C.amber : "transparent",
              borderWidth: on ? 0 : 1,
              borderColor: C.line,
            }}
          >
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, fontWeight: "700", color: on ? C.onAccent : C.ash }}>
              {v}{suffix}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The off-iOS floor for a stepper. Deliberately plain: on iOS nobody sees it,
 *  and everywhere else it only has to work. */
function Nudge({
  C, label, value, step, onChange, bounds,
}: {
  C: ReturnType<typeof useTheme>["palette"];
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
  bounds: readonly [number, number];
}) {
  const set = (v: number) => onChange(Math.max(bounds[0], Math.min(bounds[1], v)));
  return (
    <>
      <Text style={{ fontFamily: F.mono, fontSize: fs.note, color: C.chalk }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
        <Pressable onPress={() => set(value - step)} hitSlop={12} accessibilityRole="button" accessibilityLabel="−">
          <Text style={{ fontFamily: F.mono, fontSize: fs.title, color: value <= bounds[0] ? C.line : C.ash }}>−</Text>
        </Pressable>
        <Pressable onPress={() => set(value + step)} hitSlop={12} accessibilityRole="button" accessibilityLabel="+">
          <Text style={{ fontFamily: F.mono, fontSize: fs.title, color: value >= bounds[1] ? C.line : txt(C, C.amber) }}>+</Text>
        </Pressable>
      </View>
    </>
  );
}
