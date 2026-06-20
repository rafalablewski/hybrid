import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Alert } from "react-native";
import { METRIC_LABEL, BENCHMARK_METRICS, type BenchmarkMetric } from "@hybrid/core";
import {
  fetchTalent, saveTalentProfile, searchTalent, reportProfile,
  type TalentProfile, type TalentReport, type TalentResult,
} from "../lib/api";
import { fs, space, Screen, Card, Kicker, Mono, H1, Chip, Button, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraTalent from "../components/aurora/talent";

type Palette = ReturnType<typeof useTheme>["palette"];
const SPORTS = ["Hyrox", "Triathlon", "Running", "Cycling", "Swimming", "Powerlifting", "Bodybuilding", "Hybrid"];
const pctColor = (p: number, C: Palette) => (p >= 90 ? C.lime : p >= 70 ? C.blue : p >= 40 ? C.amber : C.ash);
const numOrU = (s: string) => (s.trim() && Number.isFinite(parseFloat(s)) ? parseFloat(s) : undefined);

/** Talent — benchmark vs your cohort + opt-in discovery. Mobile port. */
export default function Talent() {
  if (useTemplate().template === "aurora") return <AuroraTalent />;
  return <ClassicTalent />;
}

function ClassicTalent() {
  const C = useTheme().palette;
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
    <Screen>
      <Kicker>Talent graph</Kicker>
      <H1>Benchmarks & discovery</H1>
      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.violet, marginTop: 14 }}>
        <Mono color={C.chalk} style={{ lineHeight: 18 }}>
          Benchmark against your age/sex/sport cohort. Maturation-adjusted projection separates real talent from early maturity. Opt in to be discoverable.
        </Mono>
        <Mono color={C.ash} style={{ marginTop: 6, fontSize: fs.micro }}>Live HPI from your Twin: {hpi ?? "—"}{report ? ` · model ${report.modelVersion}` : ""}</Mono>
      </Card>

      {/* profile */}
      <Card style={{ marginTop: 14 }}>
        <Kicker color={C.lime}>Your profile</Kicker>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
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
          <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: form.visibility === "discoverable" ? C.lime : C.line, backgroundColor: form.visibility === "discoverable" ? C.lime : "transparent" }} />
          <Mono color={form.visibility === "discoverable" ? txt(C, C.lime) : C.ash} style={{ fontSize: fs.caption }}>Discoverable by clubs & federations</Mono>
        </Pressable>
        {profile?.visibility === "discoverable" && profile?.moderationStatus === "pending" && (
          <Mono color={C.amber} style={{ marginTop: 8, fontSize: fs.caption }}>⏳ Pending review — appears in discovery once approved.</Mono>
        )}
        {profile?.moderationStatus === "rejected" && (
          <Mono color={C.ash} style={{ marginTop: 8, fontSize: fs.caption }}>Not approved for discovery. Edit and re-save to request another review.</Mono>
        )}
        <View style={{ marginTop: 14 }}><Button label={saving ? "Saving…" : "Save profile"} onPress={save} disabled={saving} /></View>
      </Card>

      {/* benchmarks */}
      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.blue, marginTop: 14 }}>
        <Kicker color={C.blue}>Your benchmarks</Kicker>
        {!report ? (
          <Mono color={C.chalk} style={{ marginTop: 8 }}>Save your profile to see percentiles.</Mono>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: space.sm, marginTop: 10, marginBottom: 12 }}>
              <Chip color={pctColor(report.overall, C)}>overall {report.overall}th</Chip>
              <Chip color={pctColor(report.potential, C)}>potential {report.potential}th</Chip>
            </View>
            {report.benchmarks.map((b) => (
              <View key={b.metric} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Mono color={C.chalk} style={{ fontSize: fs.caption }}>{METRIC_LABEL[b.metric as BenchmarkMetric] ?? b.metric}</Mono>
                  <Mono color={C.ash} style={{ fontSize: fs.micro }}>{b.value} · cohort {b.cohortMean}</Mono>
                </View>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: C.ink2, marginTop: 4, overflow: "hidden" }}>
                  <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${b.potentialPercentile}%`, backgroundColor: `${C.violet}55` }} />
                  <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${b.percentile}%`, backgroundColor: pctColor(b.percentile, C) }} />
                </View>
              </View>
            ))}
          </>
        )}
      </Card>

      {/* discovery */}
      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.lime, marginTop: 14 }}>
        <Kicker color={C.lime}>Discover talent</Kicker>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
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
          <View style={{ width: 96 }}><Button label="Search" onPress={search} /></View>
        </View>
        <View style={{ marginTop: 12 }}>
          {results.length === 0 ? (
            searched ? <Mono color={C.chalk}>No discoverable athletes match yet.</Mono> : null
          ) : (
            results.map((r) => (
              <View key={r.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
                <Mono color={C.chalk} style={{ flex: 1, fontSize: fs.body }}>{r.name} · {r.sport} · {r.sex}{r.age}</Mono>
                <View style={{ flexDirection: "row", gap: space.xs, alignItems: "center" }}>
                  <Chip color={pctColor(r.percentile, C)}>{r.percentile}th</Chip>
                  {r.potential > r.percentile && <Chip color={C.violet}>{r.potential}th</Chip>}
                  <Pressable onPress={() => flag(r.id)}><Text style={{ color: C.ash, fontSize: fs.note }}>⚑</Text></Pressable>
                </View>
              </View>
            ))
          )}
        </View>
      </Card>
      <View style={{ height: 16 }} />
    </Screen>
  );
}

const pill = (C: Palette, on: boolean) => ({ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? `${C.lime}1a` : "transparent" } as const);
const pillTxt = (C: Palette, on: boolean) => ({ fontFamily: F.semi, fontSize: fs.caption, color: on ? txt(C, C.lime) : C.ash } as const);

function Field({ C, label, value, onChange }: { C: Palette; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ width: "47%", flexGrow: 1 }}>
      <Mono color={C.ash} style={{ fontSize: fs.nano, marginBottom: 4 }}>{label}</Mono>
      <TextInput value={value} onChangeText={onChange} keyboardType="numeric" placeholderTextColor={C.ash}
        style={{ fontFamily: F.mono, fontSize: fs.note, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12 }} />
    </View>
  );
}
