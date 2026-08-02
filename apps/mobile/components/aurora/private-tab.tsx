import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  FUNNEL,
  BODY_METRIC_DEFS, metricTrends, sparkHeights, weeklyReport, BODY_VERDICT_KEY,
  fmtMetricValue, fmtMetricDelta, unitToKg, isDecimalInput,
  latestHeightCm, fmtHeight, displayHeight, storeHeightCm, heightUnitFor,
  type AuroraIconName, type BodyMetric, type MetricTrend, type WeeklyReport, type TrendDirection,
} from "@hybrid/core";
import { sapi } from "../../lib/social-api";
import { refreshBodyweight } from "../../lib/use-bodyweight";
import { useLang } from "../../lib/i18n";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { usePremiumAccent } from "../../lib/premium-accent";
import { track } from "../../lib/track";
import { fs, F, serifIf } from "../../lib/ui";
import { AuroraIcon } from "./icons";
import Sheet from "./sheet";

// The interactive Profile → Private tab. Owner-only self-tracking, now on the
// same Jony-Ive material vocabulary as Today: the Command center leads as a
// premium HERO card (the paid intelligence layer — glow + serif title + an
// Unlock/Open CTA, twin of Today's Go-Full Cockpit card), then Body & progress
// and Journal ride refined instrument cards with crafted icon tiles lifted off
// the darker ink, and Privacy & visibility closes as a quiet link out to
// Settings. Body & progress and Journal are FREE (never gated) — only the
// Command center carries the Full unlock. Everything reads/writes the owner-only
// /api routes. Mirrors the web PrivateTab.
export default function PrivateTab({
  isFull,
}: {
  isFull: boolean;
}) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const pa = usePremiumAccent();
  const units = useLoggerPrefs().units;

  return (
    <View style={{ marginTop: 16, gap: 12 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginHorizontal: 2, marginBottom: 2 }}>{t("w.account.profile.priv-intro")}</Text>

      {/* Command center — the paid intelligence layer, led as a premium hero
          (twin of Today's Go-Full Cockpit card). Full → open the Cockpit; free →
          the Unlock upsell (funnelled, not fulfilled). */}
      <CommandCenterCard
        C={C}
        scheme={scheme}
        pa={pa}
        locked={!isFull}
        onPress={() => {
          if (isFull) { router.push("/performance"); return; }
          track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "private-cockpit" });
          router.push("/upgrade");
        }}
      />

      {/* Body & progress — FREE. Measurements (this API) + the photo screen. */}
      <BodyBlock C={C} units={units} onPhotos={() => router.push("/progress")} />

      {/* Private training reflection now lives ON each workout (finish screen +
          history), not in a standalone journal — see the Session note. */}

      {/* Privacy & visibility lives in Settings — this is just the way in. */}
      <Row C={C} icon="lock" title={t("w.account.profile.priv-privacy-t")} sub={t("w.account.profile.priv-privacy-s")} onPress={() => router.push("/settings")} />
    </View>
  );
}

// ── Command center (premium hero) ─────────────────────────────────────────────
// The paid intelligence layer, presented like Today's "Go Full" Cockpit card: an
// admin-accent glow blooming from the top-right, a serif title, a crafted icon
// tile, and a CTA that reads "Open" when owned and "Unlock with Full" when not.
function CommandCenterCard({ C, scheme, pa, locked, onPress }: { C: Palette; scheme: "dark" | "light"; pa: ReturnType<typeof usePremiumAccent>; locked: boolean; onPress: () => void }) {
  const { t } = useLang();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={t("w.account.profile.priv-cockpit-t")} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 28, padding: 20, backgroundColor: C.ink2, overflow: "hidden" }}>
      {/* premium-accent glow (admin-set) blooming from the top-right corner */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `${pa.fill}0d` }]} />
      <LinearGradient pointerEvents="none" colors={[`${pa.fill}2b`, `${pa.fill}00`]} start={{ x: 1, y: 0 }} end={{ x: 0.25, y: 0.8 }} style={StyleSheet.absoluteFill} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: `${pa.fill}24`, borderWidth: 1, borderColor: `${pa.fill}59`, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="navigation" size={22} color={pa.text} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.heading, letterSpacing: -0.5, color: C.chalk }}>{t("w.account.profile.priv-cockpit-t")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 3 }}>{t("w.account.profile.priv-cockpit-s")}</Text>
        </View>
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: pa.text, marginTop: 18 }}>
        {locked ? `${t("w.home.today.cardUnlock")} →` : `${t("w.home.today.cardOpen")} →`}
      </Text>
    </Pressable>
  );
}

// ── Body & progress ─────────────────────────────────────────────────────────
// Now a COMPACT card (the same nutrition-row idiom as Today's "Nutrition" /
// "Follow a coach" rows): a crafted icon tile, the title, a live subline (latest
// weight + how many metrics are tracked), and a chevron. Tapping anywhere opens
// the slide-up sheet, which LEADS with the log-measurement form — exactly like
// "Add a meal" opens from the Nutrition row — then unfolds the weekly body report
// (narrative verdict + weight delta + logging cadence), the per-metric trends
// grid, and the progress-photos link beneath it. Empty until the first log; all
// trend maths lives in @hybrid/core (body-progress.ts). Mirrors the web BodyBlock.
function BodyBlock({ C, units, onPhotos }: { C: Palette; units: "kg" | "lb"; onPhotos: () => void }) {
  const { t } = useLang();
  const [metrics, setMetrics] = useState<BodyMetric[] | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const lime = txt(C, C.lime) as string;

  const load = useCallback(() => {
    sapi<{ metrics?: BodyMetric[] }>("/api/body").then((d) => setMetrics(d.metrics ?? [])).catch(() => setMetrics([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

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
      setForm({}); setOpen(false); load();
    } catch { /* keep the form open so the entry can be retried */ }
    finally { setBusy(false); }
  };

  const has = !!metrics && metrics.length > 0;
  const trends = has ? metricTrends(metrics!) : [];
  const report = has ? weeklyReport(metrics!, Date.now()) : null;
  const heightCm = metrics ? latestHeightCm(metrics) : null;
  // Collapsed subline — lead with the latest weight when we have one (the big
  // number the expanded card used to show), then the height (it is set once and
  // otherwise invisible), then how many metrics are tracked; otherwise the
  // "what this is" descriptor. A spaced en dash joins them, never a middot.
  const wv = report?.latestWeightKg != null ? fmtMetricValue(BODY_METRIC_DEFS[0], report.latestWeightKg, units) : null;
  const subline =
    metrics === undefined ? "…"
    : has ? [wv ? `${wv.value} ${wv.unit}` : null, heightCm != null ? fmtHeight(heightCm, units) : null, `${trends.length} ${t("w.account.profile.priv-metrics")}`].filter(Boolean).join(" – ")
    : t("w.account.profile.priv-body-s");

  return (
    <>
      {/* Collapsed card — whole surface tappable, opens the log sheet. */}
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={t("w.account.profile.priv-body-t")} style={{ flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderColor: C.line, borderRadius: 28, padding: 16, backgroundColor: C.ink2 }}>
        <IconTile C={C} icon="user-square" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{t("w.account.profile.priv-body-t")}</Text>
          <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.caption, color: has ? lime : C.ash, marginTop: 3 }}>{subline}</Text>
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: `${C.ash}8c` }}>›</Text>
      </Pressable>

      {/* The sheet — leads with "all the log measurements" (the same shared Sheet
          Today uses for "Add a meal"), then the weekly report, the trends grid
          and the progress-photos link. */}
      <Sheet visible={open} onClose={() => setOpen(false)} title={t("w.account.profile.priv-body-t")} sub={t("w.account.profile.priv-body-s")}>
        {/* Height leads, and saves on its OWN — it is a standing fact rather
            than a weigh-in, so it must not have to ride along with one. */}
        <HeightRow C={C} units={units} heightCm={heightCm} onSaved={() => { load(); refreshBodyweight(); }} />
        <LogForm C={C} units={units} form={form} setField={setField} onSave={save} busy={busy} />

        {metrics !== undefined && has && (
          <>
            <ReportHero C={C} report={report!} units={units} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 18, marginBottom: 10 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{t("w.account.profile.priv-trends")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash }}>{t("w.account.profile.priv-trends-sub")}</Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {trends.map((tr) => <MetricTile key={tr.def.key} C={C} tr={tr} units={units} />)}
            </View>
          </>
        )}

        <Pressable onPress={onPhotos} hitSlop={6} style={{ marginTop: 18, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <AuroraIcon name="eye" size={14} color={lime} />
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: lime }}>{t("w.account.profile.priv-photos")} →</Text>
        </Pressable>
      </Sheet>
    </>
  );
}

const dirColorM = (C: Palette, d: TrendDirection): string => (d === "up" ? (txt(C, C.lime) as string) : d === "down" ? (txt(C, C.red) as string) : C.ash);
const dirArrow = (d: TrendDirection) => (d === "up" ? "▲" : d === "down" ? "▼" : "–");

function ReportHero({ C, report, units }: { C: Palette; report: WeeklyReport; units: "kg" | "lb" }) {
  const { t } = useLang();
  const w = report.latestWeightKg;
  const wv = w != null ? fmtMetricValue(BODY_METRIC_DEFS[0], w, units) : null;
  const d = report.weightDeltaKg;
  const dir: TrendDirection = d == null || Math.abs(d) < 0.05 ? "flat" : d > 0 ? "up" : "down";
  const dstr = d != null ? fmtMetricDelta(BODY_METRIC_DEFS[0], d, units) : null;
  return (
    <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line }}>
      <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{t("w.account.profile.priv-report-kicker")}</Text>
      <Text style={{ fontFamily: F.black, fontSize: 22, letterSpacing: -0.5, lineHeight: 25, color: C.chalk, marginTop: 8, marginBottom: 14 }}>{t(BODY_VERDICT_KEY[report.verdict])}</Text>
      {wv && (
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 40, fontWeight: "600", letterSpacing: -1, color: C.chalk }}>{wv.value}<Text style={{ fontSize: 15, color: C.ash }}> {wv.unit}</Text></Text>
          {dstr && dir !== "flat" && (
            <Text style={{ fontFamily: F.mono, fontSize: 13, fontWeight: "600", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginBottom: 4, color: dirColorM(C, dir), backgroundColor: `${dir === "down" ? C.red : C.lime}28` }}>{dirArrow(dir)} {dstr} {units}</Text>
          )}
        </View>
      )}
      <View style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{t("w.account.profile.priv-cadence")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{report.cadence} / {report.cadenceOf} {t("w.account.profile.priv-days")}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 5 }}>
          {Array.from({ length: report.cadenceOf }).map((_, i) => (
            <View key={i} style={{ flex: 1, height: 7, borderRadius: 4, backgroundColor: i < report.cadence ? C.lime : `${C.ash}38` }} />
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
    <View style={{ width: "48%", flexGrow: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{t(tr.def.labelKey)}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 11, fontWeight: "600", color: dirColorM(C, tr.direction) }}>{dstr != null ? `${dirArrow(tr.direction)} ${dstr}` : dirArrow(tr.direction)}</Text>
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: 22, fontWeight: "600", letterSpacing: -0.5, color: C.chalk }}>{value}<Text style={{ fontSize: 11, color: C.ash }}> {unit}</Text></Text>
      <Bars C={C} heights={sparkHeights(tr.series)} />
    </View>
  );
}

// Dependency-free column sparkline (Views) — mirrors the web Bars. Latest bar
// bright, the rest muted; a flat muted row when `muted` (placeholder tiles).
function Bars({ C, heights, muted }: { C: Palette; heights: number[]; muted?: boolean }) {
  const H = 28;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, height: H, marginTop: 2 }}>
      {heights.map((h, i) => {
        const last = i === heights.length - 1;
        const bg = muted ? C.line : last ? C.lime : `${C.lime}44`;
        return <View key={i} style={{ flex: 1, height: Math.max(3, h * H), borderRadius: 2, backgroundColor: bg }} />;
      })}
    </View>
  );
}

// The expanded logger — every field the trends grid can surface, all optional;
// weight in the athlete's display unit, tape in cm, body-fat in %. Each metric
// is a labelled big-number tile, the same quick-add anatomy as Today's "Add a
// meal" quadrant (dot + mono label, borderless display number, unit suffix).
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
      <Pressable onPress={onSave} disabled={busy} style={{ backgroundColor: C.lime, borderRadius: 999, paddingVertical: 16, alignItems: "center", opacity: busy ? 0.6 : 1, marginTop: 2 }}>
        {busy ? <ActivityIndicator color={C.onAccent} /> : <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.onAccent }}>{t("common.save")}</Text>}
      </Pressable>
    </View>
  );
}

// ── shared bits ───────────────────────────────────────────────────────────────
// A crafted icon tile drawn on the darker ink so it lifts off the card — the same
// material anatomy as Today's deferred rows, so the owner surfaces read as one
// system.
function IconTile({ C, icon }: { C: Palette; icon: AuroraIconName }) {
  return (
    <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
      <AuroraIcon name={icon} size={20} color={C.ash} />
    </View>
  );
}

function Row({ C, icon, title, sub, onPress }: { C: Palette; icon: AuroraIconName; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderColor: C.line, borderRadius: 28, padding: 16, backgroundColor: C.ink2 }}>
      <IconTile C={C} icon={icon} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{title}</Text>
        <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 3 }}>{sub}</Text>
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: `${C.ash}8c` }}>›</Text>
    </Pressable>
  );
}

// One measurement tile — mirrors Today's "Add a meal" quadrant: a lime dot +
// mono label up top, a big borderless display-number input, and the unit as a
// quiet mono suffix. Empty reads as a muted "0" placeholder.
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
    <View style={{ backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
        <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{t("w.account.profile.priv-height-t")}</Text>
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
          style={{ flex: 1, fontFamily: F.black, fontSize: 24, letterSpacing: -1, color: C.chalk, paddingVertical: 2 }}
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
            style={{ borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: parsed == null ? "transparent" : C.lime, borderWidth: parsed == null ? 1 : 0, borderColor: C.line, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? <ActivityIndicator color={parsed == null ? C.ash : C.onAccent} /> : <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: parsed == null ? C.ash : C.onAccent }}>{t("common.save")}</Text>}
          </Pressable>
        ) : null}
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, lineHeight: 17, color: C.ash, marginTop: 8 }}>
        {t("w.account.profile.priv-height-why")}
      </Text>
    </View>
  );
}

function MetricInput({ C, label, unit, value, onChange }: { C: Palette; label: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ width: "48%", backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: C.lime }} />
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{label}</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 5, marginTop: 2 }}>
        <TextInput value={value} onChangeText={(v) => { if (isDecimalInput(v)) onChange(v); }} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.ash} accessibilityLabel={`${label} (${unit})`} style={{ flex: 1, fontFamily: F.black, fontSize: 24, letterSpacing: -1, color: C.chalk, paddingVertical: 2 }} />
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginBottom: 6 }}>{unit}</Text>
      </View>
    </View>
  );
}
