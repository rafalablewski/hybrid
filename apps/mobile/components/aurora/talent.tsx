import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert } from "react-native";
import { METRIC_LABEL, BENCHMARK_METRICS, type BenchmarkMetric } from "@hybrid/core";
import {
  fetchTalent, saveTalentProfile, searchTalent, reportProfile,
  type TalentProfile, type TalentReport, type TalentResult,
} from "../../lib/api";
import { fs, space, F } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { AuroraScreen, ACard, APill, AHeading, RADIUS } from "./kit";

type Palette = ReturnType<typeof useTheme>["palette"];
const SPORTS = ["Hyrox", "Triathlon", "Running", "Cycling", "Swimming", "Powerlifting", "Bodybuilding", "Hybrid"];
const pctColor = (p: number, C: Palette) => (p >= 90 ? C.lime : p >= 70 ? C.blue : p >= 40 ? C.amber : C.ash);
const numOrU = (s: string) => (s.trim() && Number.isFinite(parseFloat(s)) ? parseFloat(s) : undefined);

/** AURORA Talent — benchmark vs your cohort + opt-in discovery, reusing the
 *  talent API verbatim in the rounded Aurora style. */
export default function AuroraTalent() {
  const { palette: C } = useTheme();
  const [profile, setProfile] = useState<TalentProfile | null>(null);
  const [report, setReport] = useState<TalentReport | null>(null);
  const [hpi, setHpi] = useState<number | null>(null);
  const [form, setForm] = useState({ sport: "Hybrid", sex: "M", age: "", relStrength: "", vo2: "", durability: "", visibility: "private" });
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState({ sport: "", metric: "hpi" as BenchmarkMetric, minPct: "80", byPotential: false });
  const [results, setResults] = useState<TalentResult[]>([]);
  const [searched, setSearched] = useState(false);

  const load = async () => {
    const d = await fetchTalent();
    setProfile(d.profile); setReport(d.report); setHpi(d.computedHpi);
    if (d.profile) {
      const m = d.profile.metrics;
      setForm((f) => ({ ...f, sport: d.profile!.sport, sex: d.profile!.sex, age: String(d.profile!.age),
        relStrength: m.relStrength != null ? String(m.relStrength) : "", vo2: m.vo2 != null ? String(m.vo2) : "",
        durability: m.durability != null ? String(m.durability) : "", visibility: d.profile!.visibility }));
    }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    await saveTalentProfile({ sport: form.sport, sex: form.sex, age: parseInt(form.age, 10) || 0, visibility: form.visibility,
      metrics: { relStrength: numOrU(form.relStrength), vo2: numOrU(form.vo2), durability: numOrU(form.durability) } });
    setSaving(false);
    load();
  };

  const search = async () => {
    setSearched(true);
    setResults(await searchTalent(q.metric, q.minPct, q.sport || undefined, q.byPotential));
  };

  const flag = (id: string) =>
    Alert.alert("Report profile", "Flag this profile for review?", [
      { text: "Cancel", style: "cancel" },
      { text: "Report", style: "destructive", onPress: () => reportProfile(id, "inappropriate") },
    ]);

  return (
    <AuroraScreen>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>Talent graph</Text>
      <AHeading style={{ fontSize: fs.display, marginTop: 4 }}>Benchmarks &amp; discovery</AHeading>

      <ACard style={{ marginTop: 16 }}>
        <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, lineHeight: 20 }}>
          Benchmark against your age/sex/sport cohort. Maturation-adjusted projection separates real talent from early maturity. Opt in to be discoverable.
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 8 }}>Live HPI from your Twin: {hpi ?? "—"}{report ? ` · model ${report.modelVersion}` : ""}</Text>
      </ACard>

      {/* profile */}
      <ACard style={{ marginTop: 14 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>Your profile</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
          <View style={{ flexDirection: "row", gap: space.xs }}>
            {SPORTS.map((s) => (
              <Pressable key={s} onPress={() => setForm({ ...form, sport: s })} style={pill(C, form.sport === s)}>
                <Text style={pillTxt(C, form.sport === s)}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        <View style={{ flexDirection: "row", gap: space.xs, marginTop: 10 }}>
          {(["M", "F"] as const).map((sx) => (
            <Pressable key={sx} onPress={() => setForm({ ...form, sex: sx })} style={pill(C, form.sex === sx)}>
              <Text style={pillTxt(C, form.sex === sx)}>{sx === "M" ? "Male" : "Female"}</Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.ms, marginTop: 10 }}>
          <Field C={C} label="Age" value={form.age} onChange={(v) => setForm({ ...form, age: v })} />
          <Field C={C} label="Rel. strength (×BW)" value={form.relStrength} onChange={(v) => setForm({ ...form, relStrength: v })} />
          <Field C={C} label="VO₂ proxy" value={form.vo2} onChange={(v) => setForm({ ...form, vo2: v })} />
          <Field C={C} label="Durability" value={form.durability} onChange={(v) => setForm({ ...form, durability: v })} />
        </View>
        <Pressable onPress={() => setForm({ ...form, visibility: form.visibility === "discoverable" ? "private" : "discoverable" })} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 12 }}>
          <View style={{ width: 18, height: 18, borderRadius: 6, borderWidth: 1, borderColor: form.visibility === "discoverable" ? C.lime : C.line, backgroundColor: form.visibility === "discoverable" ? C.lime : "transparent" }} />
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: form.visibility === "discoverable" ? txt(C, C.lime) : C.ash }}>Discoverable by clubs &amp; federations</Text>
        </Pressable>
        {profile?.visibility === "discoverable" && profile?.moderationStatus === "pending" && (
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.amber), marginTop: 8 }}>⏳ Pending review — appears in discovery once approved.</Text>
        )}
        {profile?.moderationStatus === "rejected" && (
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 8 }}>Not approved for discovery. Edit and re-save to request another review.</Text>
        )}
        <APill label={saving ? "Saving…" : "Save profile"} onPress={save} disabled={saving} style={{ marginTop: 14 }} />
      </ACard>

      {/* benchmarks */}
      <ACard style={{ marginTop: 14 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.blue) }}>Your benchmarks</Text>
        {!report ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, marginTop: 8 }}>Save your profile to see percentiles.</Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: space.sm, marginTop: 12, marginBottom: 12 }}>
              <View style={{ backgroundColor: `${pctColor(report.overall, C)}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, pctColor(report.overall, C)) }}>overall {report.overall}th</Text>
              </View>
              <View style={{ backgroundColor: `${pctColor(report.potential, C)}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, pctColor(report.potential, C)) }}>potential {report.potential}th</Text>
              </View>
            </View>
            {report.benchmarks.map((b) => (
              <View key={b.metric} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{METRIC_LABEL[b.metric as BenchmarkMetric] ?? b.metric}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{b.value} · cohort {b.cohortMean}</Text>
                </View>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: C.ink, marginTop: 6, overflow: "hidden" }}>
                  <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${b.potentialPercentile}%`, backgroundColor: `${C.violet}55` }} />
                  <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${b.percentile}%`, backgroundColor: pctColor(b.percentile, C) }} />
                </View>
              </View>
            ))}
          </>
        )}
      </ACard>

      {/* discovery */}
      <ACard style={{ marginTop: 14 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>Discover talent</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
          <View style={{ flexDirection: "row", gap: space.xs }}>
            {BENCHMARK_METRICS.map((m) => (
              <Pressable key={m} onPress={() => setQ({ ...q, metric: m })} style={pill(C, q.metric === m)}>
                <Text style={pillTxt(C, q.metric === m)}>{METRIC_LABEL[m]}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        <View style={{ flexDirection: "row", gap: space.ms, marginTop: 10, alignItems: "flex-end" }}>
          <Field C={C} label="Min percentile" value={q.minPct} onChange={(v) => setQ({ ...q, minPct: v })} />
          <Pressable onPress={() => setQ({ ...q, byPotential: !q.byPotential })} style={[pill(C, q.byPotential), { alignSelf: "flex-end" }]}>
            <Text style={pillTxt(C, q.byPotential)}>by potential</Text>
          </Pressable>
          <View style={{ width: 96 }}><APill label="Search" onPress={search} style={{ paddingVertical: 14 }} /></View>
        </View>
        <View style={{ marginTop: 12 }}>
          {results.length === 0 ? (
            searched ? <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>No discoverable athletes match yet.</Text> : null
          ) : (
            results.map((r) => (
              <View key={r.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, flex: 1 }}>{r.name} · {r.sport} · {r.sex}{r.age}</Text>
                <View style={{ flexDirection: "row", gap: space.xs, alignItems: "center" }}>
                  <View style={{ backgroundColor: `${pctColor(r.percentile, C)}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, pctColor(r.percentile, C)) }}>{r.percentile}th</Text>
                  </View>
                  {r.potential > r.percentile && (
                    <View style={{ backgroundColor: `${C.violet}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.violet) }}>{r.potential}th</Text>
                    </View>
                  )}
                  <Pressable onPress={() => flag(r.id)}><Text style={{ color: C.ash, fontSize: fs.note }}>⚑</Text></Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      </ACard>
      <View style={{ height: 16 }} />
    </AuroraScreen>
  );
}

const pill = (C: Palette, on: boolean) => ({ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? `${C.lime}1f` : C.ink } as const);
const pillTxt = (C: Palette, on: boolean) => ({ fontFamily: F.semi, fontSize: fs.caption, color: on ? txt(C, C.lime) : C.ash } as const);

function Field({ C, label, value, onChange }: { C: Palette; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ width: "47%", flexGrow: 1 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginBottom: 4 }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType="numeric" placeholderTextColor={C.ash}
        style={{ fontFamily: F.mono, fontSize: fs.note, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 14 }} />
    </View>
  );
}
