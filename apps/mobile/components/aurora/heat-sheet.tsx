import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import {
  HEAT_MINUTES_BOUNDS,
  HEAT_PROTOCOLS,
  HEAT_PROTOCOL_LIST,
  HEAT_TEMP_BOUNDS,
  heatAlreadyLogged,
  heatIntensity,
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
import { logHeat } from "../../lib/api";
import { useHeatSignalsQuery } from "../../lib/queries";
import Sheet from "./sheet";
import { APill, ASegment, AScrubField } from "./kit";
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
 * AND IT REFUSES TO WRITE THE SAME SAUNA TWICE. Nothing in this app is logged
 * in the order it happened — a watch recording gets imported that evening while
 * the sauna after it was typed on the spot — so the invitation to log a sitting
 * routinely arrives HOURS after the sitting was already logged. The summary of
 * a just-imported session opens this sheet defaulted to that session's end, and
 * before this guard a second press wrote a second sitting an hour off the
 * first, which `heatAdjustment` sums inside one 48 h window and
 * `heatWeeklyFrequency` counts as two. The check is `heatAlreadyLogged` and it
 * WARNS rather than blocks: it names the sitting already on the record — the
 * day, the minutes and the temperature, so it can be recognised rather than
 * guessed at — and lets a second press through. An athlete who really did sit
 * twice before supper is not wrong, and this sheet does not get to tell them
 * they are.
 *
 * THERE IS NO HISTORY IN HERE, and there was, for exactly as long as this was
 * the only surface that had ever heard of a sitting. RECENT listed the last
 * three and carried the delete. Both jobs moved the day the sauna joined the
 * day's log (aurora/heat-accent.tsx): the READING belongs on Today's done
 * floor, where it sits under the session it followed and in the day it
 * happened — which is more than a three-row list behind an expander ever said
 * — and the DELETE belongs on that row, behind the same swipe that removes a
 * session, because the place you notice a wrong entry is the place you are
 * reading it. A log sheet that also lists the log is two screens wearing one
 * title, and the expander was the tell: a surface you have to open to see is
 * not the surface anyone checks.
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
  // The sitting already on the record that this save would duplicate, once the
  // athlete has been told about it. Set by the first press, cleared whenever
  // `when` moves — a different time is a different sitting, and a warning that
  // outlived the value it was about would be describing nothing.
  const [dupe, setDupe] = useState<{ ts: string; minutes: number; tempC: number } | null>(null);

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
    setDupe(null);
    setFailed(false);
    setMsg("");
  }, [visible, initialAt]);

  // Read ONLY for the duplicate guard now — the rows themselves are read on
  // Today's done floor, which is where they happened.
  const { data: heatRows = [] } = useHeatSignalsQuery();

  const intensity = useMemo(() => heatIntensity(tempC, protocol), [tempC, protocol]);
  const equiv = minutes * intensity;
  // Zero equivalent minutes is a real answer, not an error: below the floor the
  // room is warm rather than thermally stressful, and the sheet says so instead
  // of letting the athlete save something that will silently score nothing.
  const worthless = equiv <= 0;
  // At the modality's own reference the multiplier IS 1, and a line saying so
  // explains nothing. Silence when there is nothing to explain.
  const plain = Math.abs(intensity - 1) < 0.005;

  // Moving the clock retires any duplicate warning: it was about the old
  // instant, and leaving it up would let a second press through unchecked.
  const pickWhenAt = (d: Date) => {
    setWhen(d);
    setDupe(null);
  };

  const save = async () => {
    if (saving) return;
    // THE OUT-OF-ORDER GUARD. First press with a sitting already on the record
    // near this instant names it and stops; a second press goes through.
    if (!dupe) {
      const clash = heatAlreadyLogged(heatRows, when.getTime());
      if (clash) {
        haptic.warning();
        setDupe({ ts: clash.ts, minutes: clash.minutes, tempC: clash.tempC });
        return;
      }
    }
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
    letterSpacing: tracking(fs.micro, "label"),
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
        {/* `surface="card"` — a Sheet's panel is ink2, the same fill the track
            defaults to, so this one drew an invisible track too. A sheet is a
            raised surface like a card; the prop reads the ground, not the
            container's name. */}
        <ASegment
          options={HEAT_PROTOCOL_LIST.map((p) => ({ id: p, label: t(`w.recovery.heat.protocol.${p}`) }))}
          value={protocol}
          onPick={pickProtocol}
          surface="card"
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
              letterSpacing: tracking(fs.display),
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
            onChange={pickWhenAt}
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
      {/* ── ALREADY LOGGED? ──────────────────────────────────────────────
          It quotes the sitting rather than warning in the abstract: "you may
          already have logged this" is a hedge, and the athlete cannot check it
          without leaving. Day, minutes and temperature are all named, so the
          athlete recognises the entry instead of taking the app's word for it —
          and the entry itself is on Today, under the session it followed. */}
      {dupe && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.amber), marginTop: space.lg, lineHeight: leading(fs.caption) }}
        >
          {t("w.recovery.heat.dupe")
            .replace("{n}", String(dupe.minutes))
            .replace("{t}", fmtTemp(dupe.tempC, weightUnit))
            .replace("{at}", new Date(dupe.ts).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }))}
        </Text>
      )}

      <View style={{ marginTop: dupe ? space.ms : space.xl }}>
        <APill
          label={t(dupe ? "w.recovery.heat.saveAnyway" : "w.recovery.heat.save")}
          onPress={save}
          disabled={worthless}
          state={saving ? "saving" : failed ? "error" : "idle"}
        />
      </View>

      {!!msg && (
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.red), marginTop: space.ms, lineHeight: leading(fs.caption) }}>
          {msg}
        </Text>
      )}
    </Sheet>
  );
}
