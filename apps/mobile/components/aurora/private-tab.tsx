import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  relativeTime, FUNNEL,
  BODY_METRIC_DEFS, metricTrends, sparkHeights, weeklyReport, BODY_VERDICT_KEY,
  fmtMetricValue, fmtMetricDelta, unitToKg,
  type AuroraIconName, type BodyMetric, type MetricTrend, type WeeklyReport, type TrendDirection,
} from "@hybrid/core";
import { sapi } from "../../lib/social-api";
import { useLang } from "../../lib/i18n";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { usePremiumAccent } from "../../lib/premium-accent";
import { track } from "../../lib/track";
import { fs, F, serifIf } from "../../lib/ui";
import { AuroraIcon } from "./icons";

type Entry = { id: string; body: string; createdAt: string };

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
          if (isFull) { router.push("/(tabs)/cockpit"); return; }
          track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "private-cockpit" });
          router.push("/upgrade");
        }}
      />

      {/* Body & progress — FREE. Measurements (this API) + the photo screen. */}
      <BodyBlock C={C} units={units} onPhotos={() => router.push("/progress")} />

      {/* Journal — FREE. Private notes. */}
      <JournalBlock C={C} />

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
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={t("w.account.profile.priv-cockpit-t")} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 24, padding: 20, backgroundColor: C.ink2, overflow: "hidden" }}>
      {/* premium-accent glow (admin-set) blooming from the top-right corner */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `${pa.fill}0d` }]} />
      <LinearGradient pointerEvents="none" colors={[`${pa.fill}2b`, `${pa.fill}00`]} start={{ x: 1, y: 0 }} end={{ x: 0.25, y: 0.8 }} style={StyleSheet.absoluteFill} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: `${pa.fill}24`, borderWidth: 1, borderColor: `${pa.fill}59`, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="navigation" size={22} color={pa.text} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.heading, letterSpacing: -0.4, color: C.chalk }}>{t("w.account.profile.priv-cockpit-t")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 3 }}>{t("w.account.profile.priv-cockpit-s")}</Text>
        </View>
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.3, textTransform: "uppercase", color: pa.text, marginTop: 18 }}>
        {locked ? `${t("w.home.today.cardUnlock")} →` : `${t("w.home.today.cardOpen")} →`}
      </Text>
    </Pressable>
  );
}

// ── Body & progress ─────────────────────────────────────────────────────────
// The dated /api/body history, redesigned as a weekly body report (narrative
// verdict + weight delta + logging cadence) over a trends grid of every metric
// the athlete tracks. Empty until the first log. Mirrors the web BodyBlock; all
// trend maths lives in @hybrid/core (body-progress.ts).
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
    await sapi("/api/body", "POST", payload);
    setBusy(false); setForm({}); setOpen(false); load();
  };

  const has = !!metrics && metrics.length > 0;
  const trends = has ? metricTrends(metrics!) : [];
  const report = has ? weeklyReport(metrics!, Date.now()) : null;
  const subline = has ? `${trends.length} ${t("w.account.profile.priv-metrics")}` : t("w.account.profile.priv-body-s");

  return (
    <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 20, backgroundColor: C.ink2, padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <IconTile C={C} icon="user-square" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{t("w.account.profile.priv-body-t")}</Text>
          <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.caption, color: has ? lime : C.ash, marginTop: 3 }}>{metrics === undefined ? "…" : subline}</Text>
        </View>
        <Pressable onPress={() => setOpen((v) => !v)} hitSlop={8} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: C.line }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.chalk }}>{open ? t("common.cancel") : t("w.account.profile.priv-log")}</Text>
        </Pressable>
      </View>

      {open && <LogForm C={C} units={units} form={form} setField={setField} onSave={save} busy={busy} />}

      {metrics !== undefined && (has ? (
        <>
          <ReportHero C={C} report={report!} units={units} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 18, marginBottom: 10 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.6, textTransform: "uppercase", color: C.ash }}>{t("w.account.profile.priv-trends")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash }}>{t("w.account.profile.priv-trends-sub")}</Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
            {trends.map((tr) => <MetricTile key={tr.def.key} C={C} tr={tr} units={units} />)}
          </View>
        </>
      ) : (!open && <EmptyBody C={C} onLog={() => setOpen(true)} />))}

      <Pressable onPress={onPhotos} hitSlop={6} style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 6 }}>
        <AuroraIcon name="eye" size={14} color={lime} />
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: lime }}>{t("w.account.profile.priv-photos")} →</Text>
      </Pressable>
    </View>
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
      <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 2, textTransform: "uppercase", color: C.ash }}>{t("w.account.profile.priv-report-kicker")}</Text>
      <Text style={{ fontFamily: F.black, fontSize: 22, letterSpacing: -0.4, lineHeight: 25, color: C.chalk, marginTop: 9, marginBottom: 14 }}>{t(BODY_VERDICT_KEY[report.verdict])}</Text>
      {wv && (
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 40, fontWeight: "600", letterSpacing: -1, color: C.chalk }}>{wv.value}<Text style={{ fontSize: 15, color: C.ash }}> {wv.unit}</Text></Text>
          {dstr && dir !== "flat" && (
            <Text style={{ fontFamily: F.mono, fontSize: 13, fontWeight: "600", overflow: "hidden", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginBottom: 4, color: dirColorM(C, dir), backgroundColor: `${dir === "down" ? C.red : C.lime}28` }}>{dirArrow(dir)} {dstr} {units}</Text>
          )}
        </View>
      )}
      <View style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 7 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>{t("w.account.profile.priv-cadence")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>{report.cadence} / {report.cadenceOf} {t("w.account.profile.priv-days")}</Text>
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
    <View style={{ width: "48%", flexGrow: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 15, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 9, gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>{t(tr.def.labelKey)}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 10.5, fontWeight: "600", color: dirColorM(C, tr.direction) }}>{dstr != null ? `${dirArrow(tr.direction)} ${dstr}` : dirArrow(tr.direction)}</Text>
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: 22, fontWeight: "600", letterSpacing: -0.4, color: C.chalk }}>{value}<Text style={{ fontSize: 11, color: C.ash }}> {unit}</Text></Text>
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

function EmptyBody({ C, onLog }: { C: Palette; onLog: () => void }) {
  const { t } = useLang();
  return (
    <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line }}>
      <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 2, textTransform: "uppercase", color: C.ash }}>{t("w.account.profile.priv-report-kicker")}</Text>
      <Text style={{ fontFamily: F.black, fontSize: 20, letterSpacing: -0.4, color: C.chalk, marginTop: 8, marginBottom: 6 }}>{t("w.account.profile.priv-first-t")}</Text>
      <Text style={{ fontFamily: F.reg, fontSize: 13, lineHeight: 19, color: C.ash }}>{t("w.account.profile.priv-first-s")}</Text>
      <Pressable onPress={onLog} style={{ marginTop: 14, backgroundColor: C.lime, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}>
        <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.onAccent }}>＋ {t("w.account.profile.priv-first-cta")}</Text>
      </Pressable>
      <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.6, textTransform: "uppercase", color: C.ash, marginTop: 18, marginBottom: 10 }}>{t("w.account.profile.priv-first-track")}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
        {BODY_METRIC_DEFS.slice(0, 4).map((def) => (
          <View key={def.key} style={{ width: "48%", flexGrow: 1, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 15, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 9, gap: 6, opacity: 0.6 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>{t(def.labelKey)}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 22, fontWeight: "600", color: C.ash }}>—</Text>
            <Bars C={C} heights={[0.4, 0.4, 0.4, 0.4, 0.4]} muted />
          </View>
        ))}
      </View>
    </View>
  );
}

// The expanded logger — every field the trends grid can surface, all optional;
// weight in the athlete's display unit, tape in cm, body-fat in %.
function LogForm({ C, units, form, setField, onSave, busy }: { C: Palette; units: "kg" | "lb"; form: Record<string, string>; setField: (k: string, v: string) => void; onSave: () => void; busy: boolean }) {
  const { t } = useLang();
  const unitLabel = (u: string) => (u === "weight" ? units : u === "pct" ? "%" : "cm");
  return (
    <View style={{ marginTop: 14, gap: 8 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {BODY_METRIC_DEFS.map((def) => (
          <View key={def.key} style={{ width: "48%", flexGrow: 1 }}>
            <Field C={C} value={form[def.key] ?? ""} onChange={(v) => setField(def.key, v)} placeholder={`${t(def.labelKey)} (${unitLabel(def.unit)})`} />
          </View>
        ))}
      </View>
      <Pressable onPress={onSave} disabled={busy} style={{ backgroundColor: C.lime, borderRadius: 999, paddingVertical: 11, alignItems: "center", opacity: busy ? 0.6 : 1 }}>
        {busy ? <ActivityIndicator color={C.onAccent} /> : <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>{t("common.save")}</Text>}
      </Pressable>
    </View>
  );
}

// ── Journal ─────────────────────────────────────────────────────────────────
function JournalBlock({ C }: { C: Palette }) {
  const { t } = useLang();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    sapi<{ entries?: Entry[] }>("/api/journal").then((d) => setEntries(d.entries ?? [])).catch(() => setEntries([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    await sapi("/api/journal", "POST", { body });
    setBusy(false); setDraft(""); load();
  };
  const del = async (id: string) => { await sapi(`/api/journal?id=${encodeURIComponent(id)}`, "DELETE"); load(); };

  return (
    <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 20, backgroundColor: C.ink2, padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 }}>
        <IconTile C={C} icon="edit" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{t("w.account.profile.priv-journal-t")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 3 }}>{t("w.account.profile.priv-journal-s")}</Text>
        </View>
      </View>

      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder={t("w.account.profile.priv-journal-ph")}
        placeholderTextColor={C.ash}
        multiline
        style={{ minHeight: 44, fontFamily: F.reg, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: "top" }}
      />
      {draft.trim().length > 0 && (
        <Pressable onPress={save} disabled={busy} style={{ alignSelf: "flex-start", marginTop: 8, backgroundColor: C.lime, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, opacity: busy ? 0.6 : 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.onAccent }}>{t("w.account.profile.priv-journal-add")}</Text>
        </Pressable>
      )}

      {entries && entries.length > 0 && (
        <View style={{ marginTop: 14, gap: 10 }}>
          {entries.slice(0, 4).map((e) => (
            <View key={e.id} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
              <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: 19 }}>{e.body}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 5 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 8.5, color: C.ash }}>{relativeTime(Date.parse(e.createdAt))}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 8.5, color: C.ash, opacity: 0.7 }}>{t("w.account.profile.priv-vis-only")}</Text>
                </View>
                <Pressable onPress={() => del(e.id)} hitSlop={8}><Text style={{ fontFamily: F.mono, fontSize: 8.5, color: C.ash }}>{t("common.delete")}</Text></Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── shared bits ───────────────────────────────────────────────────────────────
// A crafted icon tile drawn on the darker ink so it lifts off the card — the same
// material anatomy as Today's deferred rows, so the owner surfaces read as one
// system.
function IconTile({ C, icon }: { C: Palette; icon: AuroraIconName }) {
  return (
    <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
      <AuroraIcon name={icon} size={20} color={C.ash} />
    </View>
  );
}

function Row({ C, icon, title, sub, onPress }: { C: Palette; icon: AuroraIconName; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={{ flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 16, backgroundColor: C.ink2 }}>
      <IconTile C={C} icon={icon} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{title}</Text>
        <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 3 }}>{sub}</Text>
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: `${C.ash}8c` }}>›</Text>
    </Pressable>
  );
}

function Field({ C, value, onChange, placeholder }: { C: Palette; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={C.ash}
      keyboardType="decimal-pad"
      style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
    />
  );
}
