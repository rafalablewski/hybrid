import { useState, type ReactNode } from "react";
import { View, Text } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  FEELS,
  FATIGUES,
  feltSessionLoad,
  loadBand,
  LOAD_BAND_KEY,
  relativeEffort,
  feelReading,
  hoursAfterSession,
  readNoteKey,
  FEEL_READ_KEY,

  ALPHA,} from "@hybrid/core";
import { patchSessionFeel } from "../lib/api";
import { qk } from "../lib/queries";
import { useLang } from "../lib/i18n";
import { F, MAX_FONT_SCALE, PressScale as Pressable, fs, leading, tracking, ty} from "../lib/ui";
import { RADIUS } from "./aurora/geometry";
import { useTheme, txt } from "../lib/theme";
import { withAlpha } from "./aurora/field";
import { Mark } from "./aurora/mark";
import type { Mark as MarkValue } from "@hybrid/core";

/**
 * "How did that feel?" — THE IMMEDIATE READ.
 *
 * The app asks about a session twice, on purpose. This is the first ask, taken
 * at the end of the session while the athlete is still standing next to the bar,
 * and it is the only one of the two that cannot be taken later:
 *
 *   EFFORT (`feel`) — how hard that was. Effort × duration is the session's
 *     internal load (sRPE), which is what lets the app tell two athletes apart
 *     who ran the same 10 km. See core/session-feel.ts.
 *   SPENTNESS (`fatigue`) — how wrecked you are RIGHT NOW. This is the acute
 *     disturbance at its peak, and it is the anchor the recovery read is
 *     measured against hours later: how far the answer falls between the two is
 *     this athlete's own recovery rate. See core/feel-timing.ts (recoveryCurve)
 *     and core/feel-schedule.ts for which read is due when.
 *
 * Ask it tomorrow instead and you get a memory of a feeling, filtered through a
 * night's sleep — which is why the second ask is a different question ("how are
 * you NOW") on the daily card rather than this one, repeated.
 *
 * ONE component, two homes:
 *  • `compact` — the FINISH screen, straight after the last set. The moment the
 *    schedule calls the immediate read.
 *  • panel — the Wrapped, for a session opened later that was never rated. The
 *    answer is still worth having (effort feeds every load model) and the card
 *    says plainly what a late answer is worth rather than scoring it in silence.
 * Both are seeded from the stored value, so nobody is asked twice.
 */
export function FeelPrompt({
  sessionId,
  minutes,
  initialFeel = null,
  initialFatigue = null,
  baseline = null,
  sessionEnd = null,
  compact = false,
  eyebrow,
  onAnswered,
}: {
  /** null for a guest / unsaved session — the taps are then read-only local. */
  sessionId: string | null;
  /** trusted training minutes; without them there is no load to compute. */
  minutes: number | null;
  initialFeel?: number | null;
  initialFatigue?: number | null;
  /** the athlete's own recent load baseline, for the "vs your usual" line. */
  baseline?: number | null;
  /** when the session ENDED — the lag from here to the tap is what makes two
   *  identical fatigue answers comparable (feel-timing.ts). */
  sessionEnd?: string | null;
  /** card chrome for the finish screen instead of the Wrapped's panel chrome. */
  compact?: boolean;
  eyebrow?: (label: string) => ReactNode;
  /** Fired after a tap is SAVED, so a host that is waiting on the answer (the
   *  import sheet's rate step) can stop offering to skip it. */
  onAnswered?: () => void;
}) {
  const C = useTheme().palette;
  const { t } = useLang();
  const qc = useQueryClient();
  const [feel, setFeel] = useState<number | null>(initialFeel);
  const [fatigue, setFatigue] = useState<number | null>(initialFatigue);
  const [failed, setFailed] = useState(false);

  // Optimistic: the taps land instantly and the write follows. A failed save
  // says so rather than silently pretending the answer was recorded.
  const save = async (patch: { feel?: number; fatigue?: number }) => {
    if (!sessionId) return;
    const ok = await patchSessionFeel(sessionId, patch);
    setFailed(!ok);
    if (ok) {
      void qc.invalidateQueries({ queryKey: qk.sessions });
      onAnswered?.();
    }
  };

  // The lag is measured at the moment of the tap, which is exactly what the
  // server stamps into `feelLoggedAt` — so what the athlete is shown here and
  // what the recovery model later reads are the same number.
  const reading = fatigue != null ? feelReading(fatigue, hoursAfterSession(sessionEnd, Date.now())) : null;
  const load = feltSessionLoad(feel, minutes);
  const rel = load != null ? relativeEffort(load, baseline) : null;

  const row = (
    levels: readonly { value: number; labelKey: string; mark: MarkValue }[],
    picked: number | null,
    onPick: (v: number) => void,
  ) => (
    <View style={{ flexDirection: "row", gap: 6, marginTop: 10 }}>
      {levels.map((l) => {
        const on = picked === l.value;
        return (
          <Pressable
            key={l.value}
            onPress={() => onPick(l.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t(l.labelKey)}
            style={{
              flex: 1, alignItems: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 2,
              borderRadius: 14, borderWidth: 1,
              borderColor: on ? C.lime : C.line,
              backgroundColor: on ? withAlpha(C.lime, ALPHA.solid) : compact ? C.ink2 : C.ink,
            }}
          >
            <Mark mark={l.mark} size={21} color={on ? txt(C, C.lime) as string : C.ash} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), textTransform: "uppercase", color: on ? txt(C, C.lime) : C.ash }}>{t(l.labelKey)}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  // Deliberately compact: on the Wrapped this sits in a fixed screen-height box,
  // so every row is sized to still fit BOTH questions plus the load read-out on
  // a small phone (prose is line-capped rather than pushing content out).
  return (
    <View
      style={
        compact
          ? { backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 16, marginTop: 16 }
          : undefined
      }
    >
      {eyebrow ? (
        eyebrow(t("session.feel.q"))
      ) : (
        <Text style={ty(C, "overline")}>{t("session.feel.q")}</Text>
      )}
      <Text numberOfLines={2} style={{ fontFamily: F.black, fontSize: compact ? 18 : 21, color: C.chalk, letterSpacing: tracking(compact ? 18 : 21), lineHeight: compact ? 22 : 25, marginTop: 10 }}>{t("session.feel.lead")}</Text>
      {row(FEELS, feel, (v) => { setFeel(v); void save({ feel: v }); })}

      {feel != null && (
        <View style={{ marginTop: 16 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={ty(C, "kicker")}>{t("session.fatigue.q")}</Text>
          {row(FATIGUES, fatigue, (v) => { setFatigue(v); void save({ fatigue: v }); })}
          {/* WHAT THIS ANSWER IS WORTH. "Wrecked" ten minutes after a hard
              session describes the session; the same tap ten hours later
              describes a recovery problem. The app now reads them differently,
              so it says which one this is rather than scoring in silence. */}
          {reading && (
            <View style={{ marginTop: 12, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), textTransform: "uppercase", color: reading.read === "nextDay" || reading.read === "sameDay" ? txt(C, C.lime) : C.ash }}>
                {t(FEEL_READ_KEY[reading.read])}
              </Text>
              <Text numberOfLines={3} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.nano, lineHeight: leading(fs.nano), color: C.ash }}>{t(readNoteKey(reading.read, reading.fatigue))}</Text>
            </View>
          )}
          {/* WHY THERE IS A SECOND ASK. An athlete who is told nothing assumes
              the app forgot they already answered. Say what the second read is
              for, once, at the moment the first one lands. */}
          {reading?.read === "immediate" && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, lineHeight: leading(fs.nano), color: C.ash, marginTop: 10 }}>{t("session.feel.nextRead")}</Text>
          )}
        </View>
      )}

      {load != null && (
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line }}>
          <Text style={{ fontFamily: F.takeover, fontSize: 30, color: txt(C, C.lime) }}>{load}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), color: C.ash, textTransform: "uppercase" }}>{t("session.feel.load")}</Text>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{t(LOAD_BAND_KEY[loadBand(load)])}</Text>
            {rel && (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, color: rel.pct >= 0 ? txt(C, C.lime) : C.ash, marginTop: 3 }}>
                {rel.pct >= 0 ? "+" : "−"}{Math.abs(rel.pct)}% {t("session.feel.vsUsual")}
              </Text>
            )}
          </View>
        </View>
      )}

      {(failed || feel != null) && (
        <Text numberOfLines={3} style={{ fontFamily: F.mono, fontSize: fs.nano, lineHeight: leading(fs.nano), color: C.ash, marginTop: 12 }}>
          {failed ? t("session.feel.retry") : t("session.feel.why")}
        </Text>
      )}
    </View>
  );
}
