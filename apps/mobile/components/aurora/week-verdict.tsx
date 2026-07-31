import { useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import {
  weekVerdict, verdictLeadKey, verdictWhyKey, verdictMetricKey, verdictLabelKey,
  fmtTonnage, type BodyweightInput, type LoggedSession, type WeightUnit, type WeekVerdict,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, F, serifIf } from "../../lib/ui";

/**
 * THIS WEEK — the verdict card, the TWIN of components/aurora/week-verdict.tsx
 * on web.
 *
 * Statistics and Analytics were two destinations answering the same question at
 * different depths. This is what replaced them on Today: a SENTENCE naming the
 * metric that moved, the four-week baseline as its working-out, and — under a
 * hairline — the three figures the sentence was drawn from. Verdict on top,
 * receipts beneath, the same shape the Fuel card uses.
 *
 * The named metric leads the figure row and carries the delta's colour, so the
 * claim and the number are visibly the same thing rather than two assertions
 * sharing a card.
 *
 * The card NEVER disappears. A block that comes and goes is worse than one that
 * is sometimes quiet, so a flat week keeps its place and says so — see the
 * `flat` / `cold` states in @hybrid/core week-verdict.ts, which is also where
 * every number and the choice of metric come from, so web can't drift.
 *
 * Colour is the SEMANTIC channel here (terracotta down, chartreuse up, ash
 * flat), not the brand accent — a bad week must not read as a highlight.
 */

/** Render a "{m}"-templated sentence with the metric name in bold. */
function Lead({ template, word, color }: { template: string; word: string | null; color: string }) {
  const [before, after] = template.split("{m}");
  if (after === undefined || !word) {
    return <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, lineHeight: 20, color }}>{template}</Text>;
  }
  return (
    <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, lineHeight: 20, color }}>
      {before}
      <Text style={{ fontFamily: F.bold }}>{word}</Text>
      {after}
    </Text>
  );
}

/** One destination row — the doors to everything past this week. */
function DoorRow({ title, sub, glyph, onPress }: { title: string; sub: string; glyph: string; onPress: () => void }) {
  const { palette: C } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title} – ${sub}`}
      style={{
        flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10,
        backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16,
        paddingHorizontal: 14, paddingVertical: 12,
      }}
    >
      <View style={{
        width: 32, height: 32, borderRadius: 10, backgroundColor: C.ink,
        borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center",
      }}>
        <Text style={{ fontSize: 13, color: C.ash }}>{glyph}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{title}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{sub}</Text>
      </View>
      <Text style={{ fontSize: fs.note, color: C.ash }}>›</Text>
    </Pressable>
  );
}

export default function AuroraWeekVerdict({
  sessions,
  units,
  bw,
  showDeep,
  onArchive,
  onDeep,
}: {
  sessions: LoggedSession[];
  units: WeightUnit;
  bw?: BodyweightInput;
  /** The per-lift dashboard is athlete-gated — hide its door when it isn't reachable. */
  showDeep?: boolean;
  onArchive: () => void;
  onDeep: () => void;
}) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const v: WeekVerdict = useMemo(() => weekVerdict(sessions, Date.now(), bw), [sessions, bw]);

  // Canonical → display. Tonnage honours the athlete's unit; minutes read as
  // hours to one decimal, the same figure the endurance totals show.
  const fmt = (metric: string, value: number) =>
    metric === "tonnage" ? fmtTonnage(value, units)
      : metric === "hours" ? String(Math.round(value / 6) / 10)
        : String(Math.round(value));

  const tone = v.direction === "down" ? C.red : v.direction === "up" ? C.lime : C.ash;
  const named = v.figures.find((f) => f.metric === v.metric) ?? null;

  const why = v.metric && named
    ? t(verdictWhyKey(v))
        .replace("{v}", fmt(named.metric, named.value))
        .replace("{b}", fmt(named.metric, named.baseline))
    : t(verdictWhyKey(v));

  // Named metric first — the sentence's subject shouldn't be the third column.
  const ordered = v.metric
    ? [...v.figures].sort((a, b) => (a.metric === v.metric ? -1 : b.metric === v.metric ? 1 : 0))
    : v.figures;

  return (
    <View style={{ marginTop: 20 }}>
      {/* Explore-standard head: display-face title left, mono meta right. The
          head names the window so no figure below it needs a qualifier. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginHorizontal: 2, marginBottom: 8 }}>
        <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.title, color: C.chalk }}>{t("w.home.week.title")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.6, textTransform: "uppercase", color: C.ash }}>
          {t("w.analyze.stats.week")}
        </Text>
      </View>

      <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 22, paddingHorizontal: 17, paddingVertical: 16 }}>
        {/* THE VERDICT — sentence, its working-out, and the signed delta. */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 14 }}>
          <View style={{ flex: 1 }}>
            <Lead
              template={t(verdictLeadKey(v))}
              word={v.metric ? t(verdictMetricKey(v.metric)) : null}
              color={C.chalk}
            />
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, lineHeight: 16, color: C.ash, marginTop: 5 }}>{why}</Text>
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: 23, letterSpacing: -0.4, color: txt(C, tone) }}>
            {v.metric ? `${v.deltaPct > 0 ? "+" : "−"}${Math.abs(v.deltaPct)}%` : "—"}
          </Text>
        </View>

        {/* THE RECEIPTS — the figures the sentence was drawn from. */}
        <View style={{ flexDirection: "row", marginTop: 14, paddingTop: 13, borderTopWidth: 1, borderTopColor: C.line }}>
          {ordered.map((f, i) => {
            const isNamed = f.metric === v.metric;
            return (
              <View
                key={f.metric}
                style={{ flex: 1, paddingLeft: i === 0 ? 0 : 12, borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: C.line }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: isNamed ? txt(C, tone) : C.ash }}>
                  {t(verdictLabelKey(f.metric))}
                </Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.heading, letterSpacing: -0.4, marginTop: 3, color: isNamed ? txt(C, tone) : C.chalk }}>
                  {fmt(f.metric, f.value)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* The doors. Today holds this week; everything longer lives behind one
          tap, which is what keeps the block from becoming a second screen. */}
      <DoorRow glyph="▤" title={t("w.home.week.archive")} sub={t("w.home.week.archiveSub")} onPress={onArchive} />
      {showDeep && <DoorRow glyph="◫" title={t("w.home.week.deep")} sub={t("w.home.week.deepSub")} onPress={onDeep} />}
    </View>
  );
}
