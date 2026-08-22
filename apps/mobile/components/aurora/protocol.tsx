import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, type LayoutChangeEvent } from "react-native";
import Svg, { Polygon, Circle, Rect, G } from "react-native-svg";
import {
  INJURY_FIGURES, INJURY_VIEWBOX, INJURY_AREA_KEY, INJURY_AREA_HINT_KEY,
  INJURY_WHEN, INJURY_WHEN_KEY, nearestInjuryArea, injuryTouchPoint, injuryDateFor,
  rtpView, riskRole, type InjuryWhen, type InjuryFigure, type MuscleGroup, type TissueRisk,
  ALPHA,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, roleColor, type Palette } from "../../lib/theme";
import { fs, space, leading, F, PressScale as Pressable, FIXED_FONT_SCALE, MAX_FONT_SCALE , tracking} from "../../lib/ui";
import { ACard, ACheckMark, RADIUS } from "./kit";
import { haptic } from "../../lib/haptics";
import { AuroraIcon } from "./icons";
import Sheet from "./sheet";
import { createRtpProtocol, mutateRtpProtocol, fetchRtpProtocols, type RtpProtocol as RtpProtocolRow } from "../../lib/api";
import { withAlpha } from "./field";

/**
 * THE PROTOCOL (mobile) — declaring an injury, and living with one. The
 * mannequin geometry, the touch resolution and the whole stage ladder come from
 * @hybrid/core, so what this file owns is the drawing, never the reckoning.
 *
 * The question is asked by SHOWING A BODY, not by a wrap of word-chips with one
 * pre-selected; the answer is confirmed in words under the figure; and one more
 * real question — when it started — replaces the old silent assumption that
 * every injury happened at the moment the protocol was opened.
 *
 * An open protocol is a PATH: six stages on one spine, the rail through the
 * marks doing the job the separate progress bar used to. Only the rung you are
 * standing on has anything to do, and the action to leave it is drawn only when
 * it can actually be taken.
 */

const poly = (pts: { x: number; y: number }[]) => pts.map((q) => `${q.x},${q.y}`).join(" ");

export type AreaTone = { fill: string; stroke: string; fillOpacity: number };

/* ── the body ────────────────────────────────────────────────────────────── */

export function InjuryBody({
  toneOf,
  selected,
  onSelect,
  labelOf,
  height = 260,
}: {
  toneOf?: (group: MuscleGroup) => AreaTone;
  selected?: MuscleGroup | null;
  /** present ⇒ the figure is a control; absent ⇒ it is a read-out. */
  onSelect?: (group: MuscleGroup) => void;
  labelOf: (group: MuscleGroup) => string;
  height?: number;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <View style={{ flexDirection: "row", gap: space.md }}>
      {INJURY_FIGURES.map((fig) => (
        <View key={fig.side} style={{ flex: 1, alignItems: "center" }}>
          <Figure fig={fig} C={C} toneOf={toneOf} selected={selected} onSelect={onSelect} labelOf={labelOf} height={height} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking(fs.nano, "caps"), color: C.ash, marginTop: 2 }}>
            {t(`w.analyze.exp.anatomy.map.${fig.side}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}

// A pickable area has to read as MORE than silhouette or the affordance is
// invisible — the first render of this figure had both at a whisper of ash and
// the seven live regions disappeared into the body. The tracked areas carry a
// real stroke and roughly three times the fill of the outline beneath them.
const PICK_TONE = (C: Palette): AreaTone => ({ fill: C.ash, stroke: withAlpha(C.ash, 0.62), fillOpacity: 0.3 });
const PICKED_TONE = (C: Palette): AreaTone => ({ fill: C.chalk, stroke: C.chalk, fillOpacity: 0.9 });

function Figure({
  fig, C, toneOf, selected, onSelect, labelOf, height,
}: {
  fig: InjuryFigure;
  C: Palette;
  toneOf?: (g: MuscleGroup) => AreaTone;
  selected?: MuscleGroup | null;
  onSelect?: (g: MuscleGroup) => void;
  labelOf: (g: MuscleGroup) => string;
  height: number;
}) {
  const { x, y, w, h } = INJURY_VIEWBOX;
  const [box, setBox] = useState({ w: 0, h: 0 });
  const live = !!onSelect;
  const onLayout = (e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  // A touch anywhere on the figure resolves to the NEAREST tracked area, so a
  // thumb never has to find a 5-unit-wide triceps. A touch near nothing
  // tracked resolves to nothing, and the selection simply stands.
  const onPress = (px: number, py: number) => {
    if (!onSelect) return;
    const p = injuryTouchPoint(box.w, box.h, px, py);
    const hit = p && nearestInjuryArea(fig.side, p.x, p.y);
    if (hit) onSelect(hit);
  };

  const body = (
    <Svg viewBox={`${x} ${y} ${w} ${h}`} width="100%" height={height}>
      {/* THE CANVAS CATCHES WHAT THE SHAPES MISS. A transparent rect over the
          whole viewBox takes any touch that didn't land on an area, and
          resolves it to the nearest one — the fallback that makes the whole
          limb live. It is a hit SURFACE, not a button: the answer to a touch
          is the region lighting up, so it must not scale or dim the figure,
          which is why this is not a Pressable. */}
      {live && (
        <Rect
          x={x} y={y} width={w} height={h} fill="transparent"
          onPress={(e) => onPress(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        />
      )}
      {/* the untracked body: faint, and therefore honestly unavailable */}
      {fig.outline.map((part, i) => (
        <Polygon key={`o${i}`} points={poly(part)} fill={C.ash} fillOpacity={0.1} stroke={C.line} strokeWidth={0.5} />
      ))}
      <Circle cx={fig.head.cx} cy={fig.head.cy} r={fig.head.r} fill={C.ash} fillOpacity={0.12} stroke={C.line} strokeWidth={0.5} />
      {fig.areas.map((area) => {
        const on = selected === area.group;
        const tone = on ? PICKED_TONE(C) : toneOf?.(area.group) ?? PICK_TONE(C);
        return (
          <G
            key={area.group}
            accessible={live}
            accessibilityRole={live ? "radio" : undefined}
            accessibilityLabel={live ? labelOf(area.group) : undefined}
            accessibilityState={live ? { selected: on } : undefined}
            onPress={live ? () => onSelect?.(area.group) : undefined}
          >
            {area.shapes.map((shape, j) => (
              <Polygon
                key={j}
                points={poly(shape)}
                fill={tone.fill}
                fillOpacity={tone.fillOpacity}
                stroke={tone.stroke}
                strokeWidth={on ? 1.1 : 0.8}
              />
            ))}
          </G>
        );
      })}
    </Svg>
  );

  // The layout is measured, not assumed: the box→viewBox conversion needs the
  // rendered size to undo the letterbox.
  return <View style={{ width: "100%" }} onLayout={live ? onLayout : undefined}>{body}</View>;
}

/** The Tissue card's read-out: the same body, each area carrying its own band. */
export function RiskBody({ byTissue, onPick }: { byTissue: Record<string, TissueRisk>; onPick?: (group: MuscleGroup) => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const toneOf = (g: MuscleGroup): AreaTone => {
    const ti = byTissue[g];
    if (!ti || ti.risk <= 0) return { fill: C.ash, stroke: withAlpha(C.ash, ALPHA.rim), fillOpacity: 0.2 };
    const hex = roleColor(C, riskRole(ti.band));
    return { fill: hex, stroke: hex, fillOpacity: 0.22 + 0.5 * Math.min(1, ti.risk / 100) };
  };
  const labelOf = (g: MuscleGroup) => {
    const ti = byTissue[g];
    return `${t(INJURY_AREA_KEY[g])} ${ti ? `${ti.risk} of 100` : ""}`.trim();
  };
  return <InjuryBody toneOf={toneOf} labelOf={labelOf} onSelect={onPick} height={220} />;
}

/* ── the question ──────────────────────────────────────────────────────── */

export function InjurySheet({
  visible,
  onClose,
  onOpened,
  initial = null,
}: {
  visible: boolean;
  onClose: () => void;
  /** fired after the protocol is created, so the card can refresh. */
  onOpened: () => void;
  /** the area the athlete already pointed at to get here (touching it on the
   *  card's own figure), or null when they came in through the footer rail. */
  initial?: MuscleGroup | null;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  // Nothing is pre-selected unless the athlete already answered by touching
  // the card's body. A pre-answered question is not a question.
  const [area, setArea] = useState<MuscleGroup | null>(initial);
  const [when, setWhen] = useState<InjuryWhen>("today");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) { setArea(initial); setWhen("today"); setBusy(false); }
  }, [visible, initial]);

  const open = async () => {
    if (!area || busy) return;
    setBusy(true);
    const ok = await createRtpProtocol(area, injuryDateFor(when));
    setBusy(false);
    if (ok) onOpened();
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t("w.injury.pickArea")} sub={t("w.injury.pickSub")}>
      <InjuryBody selected={area} onSelect={setArea} labelOf={(g) => t(INJURY_AREA_KEY[g])} />

      {/* THE READBACK — the choice said in words, so a highlight is never the
          only confirmation. It holds its height so nothing jumps. */}
      <View accessibilityLiveRegion="polite" style={{ minHeight: 54, marginTop: 14, alignItems: "center" }}>
        <Text style={{ fontFamily: F.black, fontSize: fs.headline, letterSpacing: tracking(fs.headline), color: area ? C.chalk : C.ash }}>
          {area ? t(INJURY_AREA_KEY[area]) : t("w.injury.pickNone")}
        </Text>
        {area ? <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: 2 }}>{t(INJURY_AREA_HINT_KEY[area])}</Text> : null}
      </View>

      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking(fs.nano, "caps"), color: C.ash, marginTop: 18, marginBottom: 8 }}>
        {t("w.injury.whenTitle")}
      </Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {INJURY_WHEN.map((wk) => {
          const on = wk === when;
          return (
            <Pressable
              key={wk}
              onPress={() => setWhen(wk)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={{
                flex: 1, alignItems: "center", borderRadius: RADIUS.pill, paddingVertical: 10,
                borderWidth: 1, borderColor: on ? C.chalk : C.line,
                backgroundColor: on ? withAlpha(C.chalk, ALPHA.fill) : "transparent",
              }}
            >
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: on ? C.chalk : C.ash }}>{t(INJURY_WHEN_KEY[wk])}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* THE COMMITMENT — one primary, full width, inert until the question
          above it has an answer. Never the accent fill: opening a protocol is
          bad news, not a "go". */}
      <Pressable
        onPress={open}
        disabled={!area || busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: !area || busy }}
        style={{
          marginTop: 20, borderRadius: RADIUS.pill, paddingVertical: 15, alignItems: "center",
          backgroundColor: area ? C.chalk : withAlpha(C.ash, ALPHA.edge),
        }}
      >
        <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: area ? C.ink : C.ash }}>{t("w.injury.openProtocol")}</Text>
      </Pressable>
      <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, textAlign: "center", marginTop: 10, lineHeight: leading(fs.caption) }}>
        {t("w.injury.protocolNote")}
      </Text>
      <Pressable onPress={onClose} accessibilityRole="button" style={{ alignSelf: "center", marginTop: 14, paddingVertical: 6, paddingHorizontal: 10 }}>
        <Text style={{ fontFamily: F.monoBold, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking(fs.micro, "label"), color: C.ash }}>{t("w.injury.cancel")}</Text>
      </Pressable>
    </Sheet>
  );
}

/* ── the path ──────────────────────────────────────────────────────────── */

/**
 * THE RUNNING PROTOCOL, WHERE IT IS ACTUALLY USED.
 *
 * A return-to-play protocol is a DAILY object — stages, gates, dates, an action
 * you take this morning. It used to render only inside the Performance tab's
 * Tissue card, several screens from where an injured athlete decides what to do
 * today. It now renders in Today's RECOVER cluster, beside the check-in; the
 * Tissue card keeps the status line and the door, so the flag and the protocol
 * remain one object seen from two places. Mirrors web.
 *
 * Renders nothing at all when no protocol is open — an athlete with nothing to
 * rehab should never be shown a rehab surface.
 */
export function RtpPanel() {
  const { t } = useLang();
  const { palette: C } = useTheme();
  const [protocols, setProtocols] = useState<RtpProtocolRow[]>([]);
  const refresh = useCallback(() => { fetchRtpProtocols().then(setProtocols).catch(() => {}); }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const active = protocols.filter((p) => p.status !== "abandoned");
  if (active.length === 0) return null;
  return (
    <View style={{ gap: 12, marginTop: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking(fs.nano, "caps"), color: txt(C, C.red) }}>{t("w.rtp.protocol")}</Text>
      {active.map((p) => <Protocol key={p.id} p={p} onChange={refresh} />)}
    </View>
  );
}

export function Protocol({ p, onChange }: { p: RtpProtocolRow; onChange: () => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [logOpen, setLogOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const v = useMemo(() => rtpView({ stage: p.stage, completed: p.completed, injuryDate: p.injuryDate, audit: p.audit }), [p]);
  const accent = v.cleared ? C.lime : C.blue;
  const mutate = async (body: object) => { if (await mutateRtpProtocol(p.id, body)) onChange(); };

  const doOverride = () => {
    if (!reason.trim()) return;
    mutate({ action: "override", reason });
    setOverrideOpen(false);
    setReason("");
  };

  return (
    /* ACard, wearing the protocol's own colour as its accent rail.
     *
     * This was the LAST geometry left in Today's Recover cluster: an unfilled
     * hairline box at radius 20 with 16/16/12 padding, sitting between the
     * check-in card and the Heat row, both of which are ACard at radius 28 and
     * a flat 20 pad. Three boxes, three shapes, one cluster — and on iOS 26 it
     * was also the only one with no material at all, since it never carried a
     * fill to begin with.
     *
     * THE COLOUR IS THE REASON IT STAYED HAND-DRAWN, and it is the reason it
     * can stop: `accent` draws exactly the left rail this card wanted — lime
     * once the athlete is cleared, blue while the ladder is still running —
     * so the protocol keeps the one thing that made it look different from a
     * panel of the day's figures, and gives up the four values that were only
     * different because nobody had asked. The stage spine below already
     * carries the same `accent`, so the rail and the ladder now agree by
     * construction rather than by coincidence. */
    <ACard accent={accent}>
      {/* WHAT AND HOW LONG — the two facts a protocol is about. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <Text style={{ fontFamily: F.black, fontSize: fs.headline, letterSpacing: tracking(fs.headline), color: C.chalk }}>
          {t(INJURY_AREA_KEY[p.tissue as MuscleGroup] ?? p.tissue)}
        </Text>
        {v.days != null ? (
          <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>
            {t("w.rtp.day")} {v.days}
          </Text>
        ) : null}
      </View>

      {v.cleared ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 }}>
          <AuroraIcon name="check-circle" size={20} color={C.lime} />
          <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: txt(C, C.lime), lineHeight: leading(fs.body) }}>{t("w.rtp.clearedNote")}</Text>
        </View>
      ) : (
        <View style={{ marginTop: 14 }}>
          {v.steps.map((s, i) => {
            const first = i === 0;
            const last = i === v.steps.length - 1;
            const passed = s.state === "done";
            const now = s.state === "now";
            return (
              <View key={s.stage} style={{ flexDirection: "row", gap: 10 }}>
                {/* THE SPINE — the rail through the marks IS the progress bar. */}
                <View style={{ width: 22 }}>
                  {!first && <View style={{ position: "absolute", left: 10, top: 0, height: 11, width: 2, backgroundColor: passed || now ? accent : C.line }} />}
                  {!last && <View style={{ position: "absolute", left: 10, top: 11, bottom: 0, width: 2, backgroundColor: passed ? accent : C.line }} />}
                  <View
                    style={{
                      position: "absolute", left: now ? 4 : 6, top: now ? 5 : 7,
                      width: now ? 14 : 10, height: now ? 14 : 10, borderRadius: RADIUS.pill,
                      backgroundColor: passed ? accent : now ? C.ink2 : C.line,
                      borderWidth: now ? 3 : 0, borderColor: accent,
                    }}
                  />
                </View>
                <View style={{ flex: 1, paddingBottom: now ? 12 : 14 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                    <Text style={{
                      flex: 1,
                      fontFamily: now ? F.black : F.reg,
                      fontSize: now ? fs.bodyLg : fs.body,
                      color: now ? C.chalk : passed ? C.ash : withAlpha(C.ash, 0.55),
                    }}>
                      {t(s.labelKey)}
                    </Text>
                    <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.nano, color: s.forced ? txt(C, C.red) : C.ash }}>
                      {now ? `${v.stageNumber}/${v.stageCount}` : s.onISO ? `${s.forced ? `${t("w.rtp.forced")} ` : ""}${fmtDay(s.onISO)}` : ""}
                    </Text>
                  </View>

                  {now ? (
                    <>
                      <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption), marginTop: 3 }}>{t(s.subKey)}</Text>
                      <View style={{ marginTop: 8 }}>
                        {v.gates.map((g) => (
                          <Pressable
                            key={g.key}
                            onPress={() => { haptic.selection(); mutate({ action: "toggleGate", gate: g.key }); }}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: g.done }}
                            style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 }}
                          >
                            <ACheckMark on={g.done} size={19} accent={accent} />
                            <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body), color: g.done ? C.chalk : C.ash }}>{t(g.labelKey)}</Text>
                          </Pressable>
                        ))}
                      </View>

                      {/* THE ONE ACTION — drawn only when it can actually be
                          taken. A disabled primary teaches nothing. */}
                      {v.canAdvance ? (
                        <Pressable
                          onPress={() => mutate({ action: "advance" })}
                          accessibilityRole="button"
                          style={{ marginTop: 10, borderRadius: RADIUS.pill, paddingVertical: 12, alignItems: "center", backgroundColor: C.lime }}
                        >
                          <Text style={{ fontFamily: F.black, fontSize: fs.body, color: C.onAccent }}>
                            {t("w.rtp.advanceTo")} {v.nextStageKey ? t(v.nextStageKey) : ""}
                          </Text>
                        </Pressable>
                      ) : (
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
                          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.amber) }}>
                            {v.blockedCount === 1 ? t("w.rtp.gateToGo") : `${v.blockedCount} ${t("w.rtp.gatesToGo")}`}
                          </Text>
                          <Pressable onPress={() => setOverrideOpen((o) => !o)} hitSlop={8} accessibilityRole="button" accessibilityState={{ expanded: overrideOpen }}>
                            <Text style={{ fontFamily: F.monoBold, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking(fs.micro, "label"), color: C.ash }}>{t("w.rtp.override")}</Text>
                          </Pressable>
                        </View>
                      )}

                      {overrideOpen && !v.canAdvance ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 10 }}>
                          <TextInput
                            value={reason}
                            onChangeText={setReason}
                            placeholder={t("w.rtp.reason")}
                            placeholderTextColor={C.ash}
                            accessibilityLabel={t("w.rtp.reason")}
                            style={{ flex: 1, fontFamily: F.mono, fontSize: fs.micro, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9 }}
                          />
                          <Pressable
                            onPress={doOverride}
                            disabled={!reason.trim()}
                            accessibilityRole="button"
                            style={{ borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.red, paddingHorizontal: 13, paddingVertical: 9, opacity: reason.trim() ? 1 : 0.4 }}
                          >
                            <Text style={{ fontFamily: F.monoBold, fontSize: fs.micro, color: txt(C, C.red) }}>{t("w.rtp.force")}</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* THE RECORD, and the way out — both quiet, both always reachable. */}
      <View style={{ borderTopWidth: 1, borderTopColor: C.line, marginTop: 4, paddingTop: 10 }}>
        {closing ? (
          <View style={{ gap: 8 }}>
            <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption) }}>{t("w.rtp.discardAsk")}</Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 18 }}>
              <Pressable onPress={() => setClosing(false)} hitSlop={8} accessibilityRole="button">
                <Text style={{ ...quiet, color: C.chalk }}>{t("w.rtp.keep")}</Text>
              </Pressable>
              <Pressable onPress={() => { setClosing(false); mutate({ action: "abandon" }); }} hitSlop={8} accessibilityRole="button">
                <Text style={{ ...quiet, color: txt(C, C.red) }}>{t("w.rtp.discardYes")}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            {v.log.length > 0 ? (
              <Pressable onPress={() => setLogOpen((o) => !o)} hitSlop={8} accessibilityRole="button" accessibilityState={{ expanded: logOpen }} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Text style={{ ...quiet, color: C.ash }}>{t("w.rtp.audit")} ({v.log.length})</Text>
                <AuroraIcon name="chevron-down" size={11} color={C.ash} style={logOpen ? { transform: [{ rotate: "180deg" }] } : undefined} />
              </Pressable>
            ) : <View />}
            <Pressable onPress={() => setClosing(true)} hitSlop={8} accessibilityRole="button">
              <Text style={{ ...quiet, color: C.ash }}>{t("w.rtp.discard")}</Text>
            </Pressable>
          </View>
        )}

        {logOpen && !closing ? (
          <View style={{ marginTop: 10, gap: 8 }}>
            {v.log.slice().reverse().map((a, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 10 }}>
                <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ width: 52, fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{fmtDay(a.ts)}</Text>
                <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.caption, lineHeight: leading(fs.caption), color: a.override ? txt(C, C.red) : C.ash }}>
                  <Text style={{ fontFamily: F.bold, color: a.override ? txt(C, C.red) : C.chalk }}>{a.by}</Text>
                  {` ${t(a.verbKey)}`}
                  {a.gateKey ? ` ${t(a.gateKey)}` : ""}
                  {a.toKey ? ` ${t(a.toKey)}` : ""}
                  {a.reason ? ` — ${a.reason}` : ""}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </ACard>
  );
}

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

const quiet = { fontFamily: F.monoBold, fontSize: fs.micro, textTransform: "uppercase" as const, letterSpacing: tracking(fs.micro, "label") };
