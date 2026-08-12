import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import {
  HEAT_MINUTES_BOUNDS,
  HEAT_PROTOCOLS,
  HEAT_PROTOCOL_LIST,
  HEAT_TEMP_BOUNDS,
  heatIntensity,
  heatSittings,
  fmtTemp,
  leading,
  space,
  tracking,
  type HeatProtocol,
  type WeightUnit,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { fs, F, HIT_SLOP } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { haptic } from "../../lib/haptics";
import { deleteHeat, logHeat } from "../../lib/api";
import { useHeatSignalsQuery } from "../../lib/queries";
import Sheet from "./sheet";
import { ADrawer, APill, ASegment, AScrubField } from "./kit";
import { AuroraIcon } from "./icons";
import { RollingNumber } from "./rolling-number";
import { NativeDateField, LIQUID_GLASS_SUPPORTED } from "./swiftui";

/**
 * LOG HEAT — the sauna sheet.
 *
 * THE INPUT IS TYPED, ALL OF IT. No watch knows you sat in a sauna and nothing
 * in the room reports to us, so unlike every other recovery surface in the app
 * there is no import path, no device match and nothing to wait for. Both halves
 * are the athlete's own: how long, and how hot.
 *
 * WHICH IS WHY IT IS BUILT OUT OF THE KIT AND NOTHING ELSE. It used to be built
 * out of native SwiftUI leaves called directly — three `GlassSegment`s, two
 * `NativeStepper`s, a `NativeDateField`, and private off-iOS copies of two kit
 * components — which cost it three separate defects. A `Host matchContents`
 * lays out at its own intrinsic size, so each stepper wrapped in a bordered
 * `space-between` row ESCAPED that row: the ± capsule floated clear of the
 * field and the value fell to the bottom-left of an empty 108dp rectangle
 * (twice, plus the date field). The segments were tinted `C.amber` where the
 * kit's one segmented control does not, and their off-iOS fallback was a
 * static pill row where every other screen gets `LiquidSeg` — which is now
 * what `ASegment` draws on every platform, so going through the kit is also
 * how this sheet stopped speaking SF Pro eight dp above type set in Archivo.
 * And each value carried TWO controls — a preset segment and a stepper, both
 * writing the same number, with the segment holding NO selection at all the
 * moment the stepper moved the value off the preset grid.
 *
 * SO THE SHEET ASKS FOR EACH VALUE ONCE. `AScrubField` is the figure itself:
 * drag across it for the long moves, nudge with the bare −/＋ for the exact
 * one. That deleted the preset rows, and with them the five uppercase kickers
 * that were naming what the values already said — "HOW LONG" above "20 min" is
 * the interface talking about itself. The sheet went from ~790dp of scroll to a
 * panel that rests without scrolling at all, which is the only measurement that
 * matters for a log you open in a towel.
 *
 * TEMPERATURE IS NOT DECORATION. Twenty minutes at 90 °C and twenty minutes in
 * a 55 °C infrared cabin are not the same stimulus, so minutes are converted to
 * EQUIVALENT MINUTES before anything scores them (engines/heat.ts). The sheet
 * shows that conversion live, at the moment of entry, so the athlete can see
 * that hotter is worth more before the engine tells them so — a model you meet
 * as a result is a black box; a model you meet as you type is a claim you can
 * argue with. The derivation line beneath it speaks ONLY when it has something
 * to say: at the modality's own reference a minute is a minute, and printing
 * "counts 1.00×" there is noise wearing the voice of an explanation.
 */

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
  const [protocol, setProtocol] = useState<HeatProtocol>("sauna");
  const [tempC, setTempC] = useState(HEAT_PROTOCOLS.sauna.refC);

  // Switching modality re-seats the temperature at that modality's reference.
  // Carrying 90 °C across from the sauna tab into steam would offer a room
  // nobody has, and the equivalent-minutes line would quote a dose off a
  // temperature the athlete never sat in.
  const pickProtocol = (p: HeatProtocol) => {
    setProtocol(p);
    setTempC(HEAT_PROTOCOLS[p].refC);
  };
  const [when, setWhen] = useState<Date>(initialAt ?? new Date());
  // The clock reads "Now" until it is opened. A compact DatePicker always draws
  // its own two tokens, so the reduction has to be ours: the word at rest, the
  // platform's control the moment you say you want a different time.
  const [pickWhen, setPickWhen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [msg, setMsg] = useState("");
  const [showRecent, setShowRecent] = useState(false);

  // The clock is re-read every time the sheet OPENS, not once when it mounts.
  // This component stays alive behind Today for as long as the app is open, so
  // a `useState(new Date())` default silently ages: open the sheet after supper
  // and it would offer to record the sitting at whenever Today first rendered.
  // That is the one field the decay in engines/heat.ts and the phase-4 pair
  // matching both read, so a stale default is not cosmetic. Minutes and °C are
  // deliberately NOT reset — a sauna habit is the same sauna, and re-offering
  // last night's numbers is right.
  useEffect(() => {
    if (!visible) return;
    setWhen(initialAt ?? new Date());
    setPickWhen(!!initialAt);
    setShowRecent(false);
    setFailed(false);
    setMsg("");
  }, [visible, initialAt]);

  const { data: heatRows = [] } = useHeatSignalsQuery();
  const [removing, setRemoving] = useState<string | null>(null);
  // The three most recent sittings, so a mis-tap is correctable here rather
  // than nowhere. More than three would turn a log sheet into a history screen
  // — and even three do, if they are always on screen, which is why they are
  // behind an expander now. A bare ＋ with an ash count: it GROWS the sheet in
  // place, it does not go anywhere (the exit-affordance rule).
  const recent = useMemo(() => heatSittings(heatRows).slice(0, 3), [heatRows]);

  const remove = async (ids: string[]) => {
    if (!ids.length) return;
    setRemoving(ids[0]!);
    const ok = await deleteHeat(ids);
    setRemoving(null);
    if (ok) onLogged?.();
    else setMsg(t("w.recovery.heat.failed"));
  };

  const intensity = useMemo(() => heatIntensity(tempC, protocol), [tempC, protocol]);
  const equiv = minutes * intensity;
  // Zero equivalent minutes is a real answer, not an error: below the floor the
  // room is warm rather than thermally stressful, and the sheet says so instead
  // of letting the athlete save something that will silently score nothing.
  const worthless = equiv <= 0;
  // At the modality's own reference the multiplier IS 1, and a line saying so
  // explains nothing. Silence when there is nothing to explain.
  const plain = Math.abs(intensity - 1) < 0.005;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    setMsg("");
    const ok = await logHeat(minutes, tempC, protocol, when.toISOString());
    setSaving(false);
    if (!ok) {
      setFailed(true);
      return;
    }
    haptic.success();
    onLogged?.();
    onClose();
  };

  // The failure REPORTS, then clears. APill's error state shakes and knocks
  // once; leaving it red forever would turn an event into a description.
  useEffect(() => {
    if (!failed) return undefined;
    const id = setTimeout(() => setFailed(false), 2400);
    return () => clearTimeout(id);
  }, [failed]);

  const isNow = !initialAt && Math.abs(Date.now() - when.getTime()) < 60_000;
  const label = {
    fontFamily: F.mono,
    fontSize: fs.micro,
    color: C.ash,
    textTransform: "uppercase" as const,
    letterSpacing: tracking.label,
  };
  const rule = { borderBottomWidth: 1, borderBottomColor: C.line };

  return (
    <Sheet visible={visible} onClose={onClose} title={t("w.recovery.heat.title")}>
      {/* ── WHICH KIND ───────────────────────────────────────────────────
          First, because it decides what the temperature below it MEANS: 45 °C
          is nothing in a dry sauna and a full dose in a steam room. The kit's
          one segmented control, so it tints with the app accent and falls back
          to the gesture-tracked lens off iOS — and it needs no kicker, because
          three modality names say what they are. */}
      <View style={{ marginTop: space.xl }}>
        <ASegment
          options={HEAT_PROTOCOL_LIST.map((p) => ({ id: p, label: t(`w.recovery.heat.protocol.${p}`) }))}
          value={protocol}
          onPick={pickProtocol}
        />
      </View>

      {/* ── THE TWO VALUES ───────────────────────────────────────────────
          The figure is the control. The unit beside it is the label. */}
      <View style={{ marginTop: space.lg }}>
        <View style={rule}>
          <AScrubField
            value={minutes}
            onChange={setMinutes}
            min={HEAT_MINUTES_BOUNDS[0]}
            max={HEAT_MINUTES_BOUNDS[1]}
            step={5}
            suffix={t("w.recovery.heat.min")}
            a11y={t("w.recovery.heat.howLong")}
          />
        </View>
        <View style={rule}>
          <AScrubField
            value={tempC}
            onChange={setTempC}
            min={HEAT_TEMP_BOUNDS[0]}
            max={HEAT_TEMP_BOUNDS[1]}
            step={5}
            format={(v) => fmtTemp(v, weightUnit)}
            a11y={t("w.recovery.heat.howHot")}
          />
        </View>
      </View>

      {/* ── THE MODEL, SHOWN AS IT IS ENTERED ────────────────────────────
          No card around it. A border and a fill do not make a number
          important; scale does, and this is the largest thing on the sheet
          after the two values it is derived from. */}
      <View style={{ marginTop: space.lg }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
          <RollingNumber
            value={String(Math.round(equiv))}
            style={{
              fontFamily: F.black,
              fontSize: fs.display,
              color: worthless ? C.ash : txt(C, C.amber),
              lineHeight: leading(fs.display, "tight"),
              letterSpacing: tracking.display,
            }}
          />
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>
            {t("w.recovery.heat.equivWord")}
          </Text>
        </View>
        {(worthless || !plain) && (
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: space.xs, lineHeight: leading(fs.caption) }}>
            {worthless
              ? t("w.recovery.heat.tooCool").replace("{n}", String(HEAT_PROTOCOLS[protocol].floorC))
              : t("w.recovery.heat.counts")
                  .replace("{x}", intensity.toFixed(2))
                  .replace("{t}", fmtTemp(HEAT_PROTOCOLS[protocol].refC, weightUnit))}
          </Text>
        )}
      </View>

      {/* ── WHEN ─────────────────────────────────────────────────────────
          One word for the case that is almost every case. The exception —
          a back-dated sitting — costs one tap and then it is the system's own
          calendar, which everybody already knows how to drive. */}
      <View style={{ marginTop: space.lg, minHeight: 34, justifyContent: "center" }}>
        {LIQUID_GLASS_SUPPORTED && pickWhen ? (
          <NativeDateField
            value={when}
            onChange={setWhen}
            latest={new Date()}
            label={t("w.recovery.heat.when")}
            tintColor={C.lime}
          />
        ) : LIQUID_GLASS_SUPPORTED ? (
          <Pressable
            onPress={() => setPickWhen(true)}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={t("w.recovery.heat.when")}
            style={{ flexDirection: "row", alignItems: "center", gap: space.xs, alignSelf: "flex-start" }}
          >
            <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>
              {isNow
                ? t("w.recovery.heat.now")
                : when.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </Text>
            <AuroraIcon name="chevron-down" size={14} color={C.ash} />
          </Pressable>
        ) : (
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>
            {when.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </Text>
        )}
      </View>

      {/* The shared pill, not a hand-rolled one: it holds its width through the
          commit (the idle label is laid out invisibly under the state), gates a
          second press while in flight, announces `busy`, and reports a failure
          in the button that failed rather than in a line underneath it. */}
      <View style={{ marginTop: space.xl }}>
        <APill
          label={t("w.recovery.heat.save")}
          onPress={save}
          disabled={worthless}
          state={saving ? "saving" : failed ? "error" : "idle"}
        />
      </View>

      {/* ── UNDO A MIS-TAP ───────────────────────────────────────────────
          Both rows a sitting wrote, removed together. Without this the only
          way to correct a fat-fingered 90-minute entry would be to log a
          second one on top of it, and the engine would happily sum them.
          Behind an expander: it is a correction path, not a third of the
          resting sheet. */}
      {recent.length > 0 && (
        <View style={{ marginTop: space.xl }}>
          <Pressable
            onPress={() => setShowRecent((v) => !v)}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityState={{ expanded: showRecent }}
            accessibilityLabel={t("w.recovery.heat.recent")}
            style={{ flexDirection: "row", alignItems: "center", gap: space.sm, alignSelf: "flex-start" }}
          >
            <Text style={label}>{t("w.recovery.heat.recent")}</Text>
            {/* Bare ＋/− in ash, no ring — it grows the sheet in place. */}
            <Text style={{ fontFamily: F.mono, fontSize: fs.note, color: C.ash }}>
              {showRecent ? "−" : `＋ ${recent.length}`}
            </Text>
          </Pressable>
          <ADrawer open={showRecent}>
            <View style={{ marginTop: space.sm }}>
              {recent.map((x) => (
                <View
                  key={x.ts}
                  style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.line }}
                >
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>
                    {new Date(x.ts).toLocaleDateString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                  </Text>
                  <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>
                    {t(`w.recovery.heat.protocol.${x.protocol}`)}
                  </Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>
                    {x.minutes} {t("w.recovery.heat.min")}   {fmtTemp(x.tempC, weightUnit)}
                  </Text>
                  <Pressable
                    onPress={() => remove(x.ids)}
                    disabled={!x.ids.length || removing === x.ts}
                    hitSlop={HIT_SLOP}
                    accessibilityRole="button"
                    accessibilityLabel={t("w.recovery.heat.remove")}
                  >
                    <Text style={{ fontFamily: F.mono, fontSize: fs.note, color: txt(C, C.red), opacity: x.ids.length ? 1 : 0.35 }}>
                      {removing === x.ts ? "…" : "×"}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </ADrawer>
        </View>
      )}

      {!!msg && (
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.red), marginTop: space.ms, lineHeight: leading(fs.caption) }}>
          {msg}
        </Text>
      )}
    </Sheet>
  );
}
