import { useCallback, useEffect, useState, type ReactNode } from "react";
import { View, Text, TextInput, ActivityIndicator } from "react-native";
import {
  BODY_METRIC_DEFS, metricTrends, sparkHeights, weeklyReport, BODY_VERDICT_KEY,
  fmtMetricValue, fmtMetricDelta, unitToKg, isDecimalInput,
  latestHeightCm, fmtHeight, displayHeight, storeHeightCm, heightUnitFor,
  type BodyMetric, type MetricTrend, type WeeklyReport, type TrendDirection,

  ALPHA,} from "@hybrid/core";
import { sapi } from "../../lib/social-api";
import { refreshBodyweight } from "../../lib/use-bodyweight";
import { useLang } from "../../lib/i18n";
import { APill, ACard , RADIUS} from "./kit";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { leading, tracking, trackFigure, fs, F, PressScale as Pressable } from "../../lib/ui";
import { DoorRow } from "./week-verdict";
import { withAlpha } from "./field";

/**
 * BODY & PROGRESS (mobile) — the athlete's own measurements: standing height,
 * the measurement log, the weekly body report, the per-metric trends grid and
 * the way through to the progress-photo timeline. Mirrors the web BodyProgress.
 *
 * WHY IT LIVES IN NUTRITION. It used to be one row inside Profile → Private, a
 * tab whose other two rows were links to screens reachable from elsewhere — so
 * the tab carried nothing of its own and was retired. Body & progress belongs
 * with Nutrition rather than with the public profile: a weigh-in is what the
 * intake targets are steered by (a bodyMass signal drives maintenance, the
 * trend and every kcal target), so the number and the thing it feeds now sit on
 * one screen. Nutrition's own EWMA weight chart rides in the `trend` slot, right
 * under the report that names the same figure.
 *
 * It renders INLINE, as the screen it now is — the old collapsed row + slide-up
 * sheet was an idiom for a list of tools, and this is no longer in one.
 */
export default function BodyProgress({
  units, onPhotos, onSaved, trend,
}: {
  units: "kg" | "lb";
  /** Open the progress-photo timeline. */
  onPhotos: () => void;
  /** Fired after a measurement lands, so the host screen can re-read anything
   *  derived from bodyweight (nutrition's maintenance + targets). */
  onSaved?: () => void;
  /** Optional chart rendered between the report and the log — the host's own
   *  view of the same weight series. */
  trend?: ReactNode;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [metrics, setMetrics] = useState<BodyMetric[] | undefined>(undefined);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    sapi<{ metrics?: BodyMetric[] }>("/api/body").then((d) => setMetrics(d.metrics ?? [])).catch(() => setMetrics([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // A landed measurement has to reach three places: this panel, the shared
  // bodyweight cache every tonnage figure reads, and whatever the host derives
  // from it. One helper so no save path can forget one of them.
  const settle = useCallback(() => { load(); refreshBodyweight(); onSaved?.(); }, [load, onSaved]);

  const save = async () => {
    const payload: Record<string, number> = {};
    for (const def of BODY_METRIC_DEFS) {
      const raw = form[def.key];
      if (!raw) continue;
      const n = parseFloat(raw.replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) continue;
      payload[def.key] = def.unit === "weight" ? unitToKg(n, units) : n;
    }
    if (Object.keys(payload).length === 0) return;
    setBusy(true);
    try {
      await sapi("/api/body", "POST", payload);
      setForm({}); settle();
    } catch { /* keep the typed values so the entry can be retried */ }
    finally { setBusy(false); }
  };

  const has = !!metrics && metrics.length > 0;
  const trends = has ? metricTrends(metrics!) : [];
  const report = has ? weeklyReport(metrics!, Date.now()) : null;
  const heightCm = metrics ? latestHeightCm(metrics) : null;

  const head = { fontFamily: F.black, fontSize: fs.title, color: C.chalk } as const;

  return (
    <>
      {report ? <ACard solid style={{ marginTop: 16 }}><ReportHero C={C} report={report} units={units} /></ACard> : null}

      {trend}

      {/* THE LOG — height first (a standing fact, saved on its own), then the
          measurement grid. */}
      <ACard solid style={{ marginTop: 16 }}>
        <Text style={head}>{t("w.account.profile.priv-body-t")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 3, marginBottom: 12 }}>{t("w.account.profile.priv-body-s")}</Text>
        <HeightRow C={C} units={units} heightCm={heightCm} onSaved={settle} />
        <LogForm C={C} units={units} form={form} setField={setField} onSave={save} busy={busy} />
        {/* With nothing logged yet there is no trends card below, so the way
            out to the photo timeline ends this block instead. */}
        {!has ? <DoorRow title={t("w.account.profile.priv-photos")} sub={t("w.account.profile.priv-photos-s")} glyph="▣" onPress={onPhotos} /> : null}
      </ACard>

      {has ? (
        <ACard solid style={{ marginTop: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 10 }}>
            <Text style={head}>{t("w.account.profile.priv-trends")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: C.ash }}>{t("w.account.profile.priv-trends-sub")}</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {trends.map((tr) => <MetricTile key={tr.def.key} C={C} tr={tr} units={units} />)}
          </View>
          <DoorRow title={t("w.account.profile.priv-photos")} sub={t("w.account.profile.priv-photos-s")} glyph="▣" onPress={onPhotos} />
        </ACard>
      ) : null}
    </>
  );
}

const dirColorM = (C: Palette, d: TrendDirection): string => (d === "up" ? (txt(C, C.lime) as string) : d === "down" ? (txt(C, C.red) as string) : C.ash);
const dirArrow = (d: TrendDirection) => (d === "up" ? "▲" : d === "down" ? "▼" : "–");

// The weekly body report: mono kicker, a narrative verdict headline, the latest
// weight with its ~7-day delta pill, and a 7-segment logging-cadence meter.
function ReportHero({ C, report, units }: { C: Palette; report: WeeklyReport; units: "kg" | "lb" }) {
  const { t } = useLang();
  const w = report.latestWeightKg;
  const wv = w != null ? fmtMetricValue(BODY_METRIC_DEFS[0], w, units) : null;
  const d = report.weightDeltaKg;
  const dir: TrendDirection = d == null || Math.abs(d) < 0.05 ? "flat" : d > 0 ? "up" : "down";
  const dstr = d != null ? fmtMetricDelta(BODY_METRIC_DEFS[0], d, units) : null;
  return (
    <View>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.caps, textTransform: "uppercase", color: C.ash }}>{t("w.account.profile.priv-report-kicker")}</Text>
      <Text style={{ fontFamily: F.black, fontSize: fs.headline, letterSpacing: tracking.display, lineHeight: 25, color: C.chalk, marginTop: 8, marginBottom: 16 }}>{t(BODY_VERDICT_KEY[report.verdict])}</Text>
      {wv && (
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
          <Text style={{ fontFamily: F.monoBold, fontSize: 40, letterSpacing: trackFigure(40), color: C.chalk }}>{wv.value}<Text style={{ fontSize: fs.note, color: C.ash }}> {wv.unit}</Text></Text>
          {dstr && dir !== "flat" && (
            <Text style={{ fontFamily: F.monoBold, fontSize: fs.body, overflow: "hidden", paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.inner, marginBottom: 4, color: dirColorM(C, dir), backgroundColor: withAlpha(dir === "down" ? C.red : C.lime, ALPHA.solid) }}>{dirArrow(dir)} {dstr} {units}</Text>
          )}
        </View>
      )}
      <View style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>{t("w.account.profile.priv-cadence")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>{report.cadence} / {report.cadenceOf} {t("w.account.profile.priv-days")}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 5 }}>
          {Array.from({ length: report.cadenceOf }).map((_, i) => (
            <View key={i} style={{ flex: 1, height: 7, borderRadius: 4, backgroundColor: i < report.cadence ? C.lime : withAlpha(C.ash, ALPHA.edge) }} />
          ))}
        </View>
      </View>
    </View>
  );
}

function MetricTile({ C, tr, units }: { C: Palette; tr: MetricTrend; units: "kg" | "lb" }) {
  const { t } = useLang();
  const { value, unit } = fmtMetricValue(tr.def, tr.latest, units);
  const dstr = tr.delta != null ? fmtMetricDelta(tr.def, tr.delta, units) : null;
  // Two columns with a 9px gutter inside a 16px-padded card.
  return (
    <View style={{ width: "48%", flexGrow: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>{t(tr.def.labelKey)}</Text>
        <Text style={{ fontFamily: F.monoBold, fontSize: fs.micro, color: dirColorM(C, tr.direction) }}>{dstr != null ? `${dirArrow(tr.direction)} ${dstr}` : dirArrow(tr.direction)}</Text>
      </View>
      <Text style={{ fontFamily: F.monoBold, fontSize: fs.headline, letterSpacing: tracking.display, color: C.chalk }}>{value}<Text style={{ fontSize: fs.micro, color: C.ash }}> {unit}</Text></Text>
      <Bars C={C} heights={sparkHeights(tr.series)} />
    </View>
  );
}

// Dependency-free column sparkline (Views) — mirrors the web Bars. Latest bar
// bright, the rest muted.
function Bars({ C, heights }: { C: Palette; heights: number[] }) {
  const H = 28;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, height: H, marginTop: 2 }}>
      {heights.map((h, i) => {
        const last = i === heights.length - 1;
        return <View key={i} style={{ flex: 1, height: Math.max(3, h * H), borderRadius: 2, backgroundColor: last ? C.lime : withAlpha(C.lime, ALPHA.edge) }} />;
      })}
    </View>
  );
}

// The logger — every field the trends grid can surface, all optional; weight in
// the athlete's display unit, tape in cm, body-fat in %. Each metric is a
// labelled big-number tile, the same quick-add anatomy as Today's "Add a meal"
// quadrant (dot + mono label, borderless display number, unit suffix).
function LogForm({ C, units, form, setField, onSave, busy }: { C: Palette; units: "kg" | "lb"; form: Record<string, string>; setField: (k: string, v: string) => void; onSave: () => void; busy: boolean }) {
  const { t } = useLang();
  const unitLabel = (u: string) => (u === "weight" ? units : u === "pct" ? "%" : "cm");
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {BODY_METRIC_DEFS.map((def) => (
          <MetricInput key={def.key} C={C} label={t(def.labelKey)} unit={unitLabel(def.unit)} value={form[def.key] ?? ""} onChange={(v) => setField(def.key, v)} />
        ))}
      </View>
      {/* APill's commit state, not a spinner swap: the idle label is laid out
          invisibly to hold the width, so the button cannot resize while it
          saves — and VoiceOver gets `busy` rather than an unannounced
          ActivityIndicator. */}
      <APill label={t("common.save")} onPress={onSave} state={busy ? "saving" : "idle"} style={{ marginTop: 2 }} />
    </View>
  );
}

/**
 * STANDING HEIGHT — one field, its own save. Mirrors the web HeightRow.
 *
 * It sits apart from the measurement grid on purpose. The grid is things that
 * MOVE: you log a weight, a waist, a body-fat reading, and the point is the
 * trend. Height is a fact you state once, and burying it among the tape lines
 * would both hide it and imply you should re-enter it every session. So it
 * saves independently: nothing else on the form has to be filled in.
 *
 * WHY THE APP ASKS. Bodyweight alone can't tell a 160 cm athlete from a 200 cm
 * one, and they are not carrying the same frame at the same 80 kg — the volume
 * model's recovery factor compares mass to what the height predicts rather than
 * docking raw kilos (core frameAdjustedMassKg).
 */
function HeightRow({ C, units, heightCm, onSaved }: { C: Palette; units: "kg" | "lb"; heightCm: number | null; onSaved: () => void }) {
  const { t } = useLang();
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lime = txt(C, C.lime) as string;
  const unit = heightUnitFor(units);
  // Null draft = "showing what's stored". Typing takes over; a successful save
  // hands control back so a unit switch or a fresh load is reflected.
  const value = draft ?? (heightCm != null ? displayHeight(heightCm, units) : "");
  const parsed = storeHeightCm(value, units);
  const dirty = value.trim() !== "" && parsed !== heightCm;

  const save = async () => {
    if (parsed == null) return;
    setBusy(true);
    try {
      await sapi("/api/body", "POST", { heightCm: parsed });
      setDraft(null);
      onSaved();
    } catch { /* keep the typed value so it can be retried */ }
    finally { setBusy(false); }
  };

  return (
    <View style={{ backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
        <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>{t("w.account.profile.priv-height-t")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: heightCm != null ? lime : C.ash }}>
          {heightCm != null ? fmtHeight(heightCm, units) : t("w.account.profile.priv-height-none")}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
        <TextInput
          value={value}
          onChangeText={(v) => { if (isDecimalInput(v)) setDraft(v); }}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={C.ash}
          accessibilityLabel={`${t("w.account.profile.priv-height-t")} (${unit})`}
          style={{ flex: 1, fontFamily: F.black, fontSize: 24, letterSpacing: tracking.display, color: C.chalk, paddingVertical: 2 }}
        />
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{unit}</Text>
        {/* The save appears only when there is a CHANGE to save — a stored
            height shouldn't sit under a button implying unfinished business. */}
        {dirty ? (
          <Pressable
            onPress={save}
            disabled={busy || parsed == null}
            accessibilityRole="button"
            accessibilityLabel={t("common.save")}
            style={{ borderRadius: RADIUS.pill, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: parsed == null ? "transparent" : C.lime, borderWidth: parsed == null ? 1 : 0, borderColor: C.line, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? <ActivityIndicator color={parsed == null ? C.ash : C.onAccent} /> : <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: parsed == null ? C.ash : C.onAccent }}>{t("common.save")}</Text>}
          </Pressable>
        ) : null}
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, lineHeight: leading(fs.micro), color: C.ash, marginTop: 8 }}>
        {t("w.account.profile.priv-height-why")}
      </Text>
    </View>
  );
}

// One measurement tile — mirrors Today's "Add a meal" quadrant: a lime dot +
// mono label up top, a big borderless display-number input, and the unit as a
// quiet mono suffix. Empty reads as a muted "0" placeholder.
function MetricInput({ C, label, unit, value, onChange }: { C: Palette; label: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ width: "48%", backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 9, height: 9, borderRadius: RADIUS.mark, backgroundColor: C.lime }} />
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>{label}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 5, marginTop: 2 }}>
        <TextInput value={value} onChangeText={(v) => { if (isDecimalInput(v)) onChange(v); }} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.ash} accessibilityLabel={`${label} (${unit})`} style={{ flex: 1, fontFamily: F.black, fontSize: 24, letterSpacing: tracking.display, color: C.chalk, paddingVertical: 2 }} />
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginBottom: 6 }}>{unit}</Text>
      </View>
    </View>
  );
}
