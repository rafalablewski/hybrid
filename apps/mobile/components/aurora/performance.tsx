import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { useRouter } from "expo-router";
import {
  computePerformanceState, computeInjuryRisk, performanceTrajectory, toTrainingLog, toBiometrics,
  hpiRole, riskRole, evaluateRtp, STAGE_LABEL,
  type LoggedSession,
} from "@hybrid/core";
import { fetchSessions, fetchSignals, fetchRtpProtocols, createRtpProtocol, mutateRtpProtocol, type CoreSignal, type RtpProtocol, type RtpAuditEntry } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { ABack, AuroraScreen, ACard, AHeading, RADIUS } from "./kit";

type Palette = ReturnType<typeof useTheme>["palette"];
const hpiColor = (b: string, C: Palette) => roleColor(C, hpiRole(b));
const riskColor = (b: string, C: Palette) => roleColor(C, riskRole(b));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** AURORA Performance — the Performance State (HPI cockpit, 14-day trajectory,
 *  tissue injury risk) reusing the exact engines as the classic. */
export default function AuroraPerformance() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [signals, setSignals] = useState<CoreSignal[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setRefreshing(true);
    Promise.all([fetchSessions(), fetchSignals()]).then(([s, sig]) => { setSessions(s); setSignals(sig); }).finally(() => setRefreshing(false));
  };
  useEffect(() => { load(); }, []);

  const bio = useMemo(() => toBiometrics(signals as unknown as Parameters<typeof toBiometrics>[0]), [signals]);
  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const risk = useMemo(() => computeInjuryRisk(log, bio), [log, bio]);
  const traj = useMemo(() => performanceTrajectory(log, 14), [log]);

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
      <ABack />
      <AHeading style={{ fontSize: fs.display }}>{t("w.analyze.perf.title")}</AHeading>
    </View>
  );

  if (sessions.length === 0) {
    return (
      <AuroraScreen refreshing={refreshing} onRefresh={load}>
        {header}
        <ACard style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, lineHeight: 20 }}>{t("w.analyze.perf.emptyBody")}</Text>
        </ACard>
      </AuroraScreen>
    );
  }

  const maxBar = 96;

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      {header}

      <ACard style={{ marginTop: 16 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.analyze.perf.twinHpi")}</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.md, marginTop: 4 }}>
          <Text style={{ fontFamily: F.black, fontSize: 52, color: txt(C, hpiColor(state.hpi.band, C)) }}>{state.hpi.score}</Text>
          <View>
            <View style={{ backgroundColor: `${hpiColor(state.hpi.band, C)}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 4, alignSelf: "flex-start" }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, hpiColor(state.hpi.band, C)) }}>{state.hpi.band}</Text>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 4 }}>{t("w.analyze.perf.limiter")} · {state.hpi.limiter}</Text>
          </View>
        </View>
        <View style={{ marginTop: 14, gap: space.ms }}>
          {([
            [t("w.analyze.perf.strength"), state.hpi.components.strength, C.lime] as const,
            [t("w.analyze.perf.endurance"), state.hpi.components.endurance, C.lime] as const,
            [t("w.analyze.perf.recovery"), Math.max(0, Math.min(100, Math.round(50 + state.hpi.components.recovery * (50 / 15)))), C.lime] as const,
          ]).map(([l, v, col]) => (
            <View key={l}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{l}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, col) }}>{v}</Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: C.ink, marginTop: 3, overflow: "hidden" }}>
                <View style={{ width: `${v}%`, height: "100%", backgroundColor: col }} />
              </View>
            </View>
          ))}
        </View>
        <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 12, lineHeight: 18 }}>{state.summary}</Text>
      </ACard>

      <ACard style={{ marginTop: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.analyze.perf.trajectory")}</Text>
          <View style={{ flexDirection: "row", gap: space.md }}>
            {([["HPI", C.lime], ["Readiness", C.blue]] as const).map(([l, col]) => (
              <View key={l} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: col }} />
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{l}</Text>
              </View>
            ))}
          </View>
        </View>
        {/* HPI as bars; Readiness as a per-day marker plotted on the same 0..100 scale
            → the same two series the web chart draws (Line HPI + Line Readiness), with
            native primitives instead of an SVG chart. */}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: maxBar, marginTop: 12 }}>
          {traj.map((p) => (
            <View key={p.daysAgo} style={{ flex: 1, height: maxBar, alignItems: "center", justifyContent: "flex-end" }}>
              <View style={{ width: "100%", height: Math.max(2, (p.hpi / 100) * maxBar), backgroundColor: p.daysAgo === 0 ? C.lime : `${C.lime}66`, borderRadius: 3 }} />
              <View pointerEvents="none" style={{ position: "absolute", left: 1, right: 1, bottom: Math.max(0, (p.readiness / 100) * maxBar - 1), height: 3, borderRadius: 2, backgroundColor: p.daysAgo === 0 ? C.blue : `${C.blue}99` }} />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>-13d</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t("w.analyze.perf.today")} · HPI {traj[traj.length - 1]?.hpi ?? "—"} · Readiness {traj[traj.length - 1]?.readiness ?? "—"}</Text>
        </View>
      </ACard>

      <ACard style={{ marginTop: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.red) }}>{t("w.analyze.perf.injuryRisk")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t("w.analyze.perf.model")} {risk.modelVersion}</Text>
        </View>
        <View style={{ marginTop: 10 }}>
          {/* Column header — Tissue · ACWR · P(injury) · Risk (the top driver rides
              under the tissue name, so the same 5 columns as the web table read on a
              phone-width row). */}
          <View style={{ flexDirection: "row", alignItems: "center", paddingBottom: 6 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.6, color: C.ash, flex: 1 }}>{t("w.analyze.perf.colTissue")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.6, color: C.ash, width: 46, textAlign: "right" }}>{t("w.analyze.perf.colAcwr")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.6, color: C.ash, width: 62, textAlign: "right" }}>{t("w.analyze.perf.colProb")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.6, color: C.ash, width: 46, textAlign: "right" }}>{t("w.analyze.perf.colRisk")}</Text>
          </View>
          {risk.tissues.map((t) => (
            <View key={t.tissue} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line }}>
              <View style={{ flex: 1, paddingRight: 6 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{cap(t.tissue)}</Text>
                <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 1 }}>{t.drivers[0]?.label ?? "—"}</Text>
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: t.enoughHistory ? C.chalk : C.ash, width: 46, textAlign: "right" }}>{t.enoughHistory ? t.acwr.toFixed(2) : "—"}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: t.risk > 0 ? C.chalk : C.ash, width: 62, textAlign: "right" }}>{(t.prob * 100).toFixed(1)}%</Text>
              <View style={{ width: 46, alignItems: "flex-end" }}>
                <View style={{ backgroundColor: `${(t.risk > 0 ? riskColor(t.band, C) : C.ash)}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, t.risk > 0 ? riskColor(t.band, C) : C.ash) }}>{t.risk}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </ACard>

      <RtpPanel />
    </AuroraScreen>
  );
}

const RTP_TISSUES = ["quads", "glutes", "posterior", "back", "chest", "shoulders", "triceps"];

function auditText(a: RtpAuditEntry): string {
  switch (a.action) {
    case "attest": return `attested "${a.gate}"`;
    case "retract": return `retracted "${a.gate}"`;
    case "advance": return `advanced ${a.from} → ${a.to}`;
    case "override": return `OVERRODE ${a.from} → ${a.to}: ${a.reason}`;
    case "abandon": return "abandoned protocol";
    default: return a.action;
  }
}

/** Return-to-play rails (mobile parity with web's RtpPanel). Each protocol shows
 *  its gated stage; the athlete can't advance until every gate is met — the core
 *  engine (evaluateRtp) enforces it and the backend logs an audit trail. */
function RtpPanel() {
  const { palette: C } = useTheme();
  const [protocols, setProtocols] = useState<RtpProtocol[]>([]);
  const [tissue, setTissue] = useState("posterior");
  const [overrideFor, setOverrideFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const refresh = () => { fetchRtpProtocols().then(setProtocols); };
  useEffect(() => { refresh(); }, []);

  const create = async () => { if (await createRtpProtocol(tissue)) refresh(); };
  const mutate = async (id: string, body: object) => { if (await mutateRtpProtocol(id, body)) refresh(); };
  const doOverride = async (id: string) => {
    if (!reason.trim()) return;
    await mutate(id, { action: "override", reason });
    setOverrideFor(null);
    setReason("");
  };

  const active = protocols.filter((p) => p.status !== "abandoned");

  return (
    <ACard style={{ marginTop: 14 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.red) }}>Return-to-play · gated protocols</Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
        {RTP_TISSUES.map((tt) => {
          const on = tt === tissue;
          return (
            <Pressable key={tt} onPress={() => setTissue(tt)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={{ borderRadius: RADIUS.pill, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? `${C.lime}1f` : "transparent", paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: on ? txt(C, C.lime) : C.ash, textTransform: "capitalize" }}>{tt}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable onPress={create} accessibilityRole="button" style={{ alignSelf: "flex-start", marginTop: 10, backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 16, paddingVertical: 9 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>Open protocol</Text>
      </Pressable>

      <View style={{ marginTop: 14, gap: space.md }}>
        {active.length === 0 && (
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>No active protocols. Open one when an athlete is injured.</Text>
        )}
        {active.map((p) => {
          const ev = evaluateRtp({ stage: p.stage, completed: p.completed });
          const cleared = p.stage === "cleared";
          const accent = cleared ? C.lime : C.blue;
          return (
            <View key={p.id} style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 14 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, textTransform: "capitalize" }}>{p.tissue}</Text>
                <View style={{ backgroundColor: `${accent}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, accent) }}>{STAGE_LABEL[p.stage]}</Text>
                </View>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: C.ink, marginVertical: 10, overflow: "hidden" }}>
                <View style={{ width: `${Math.round(ev.progress * 100)}%`, height: "100%", backgroundColor: accent }} />
              </View>
              {!cleared && (
                <>
                  {ev.gates.map((g) => (
                    <Pressable key={g.key} onPress={() => mutate(p.id, { action: "toggleGate", gate: g.key })} accessibilityRole="checkbox" accessibilityState={{ checked: g.done }} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 5 }}>
                      {g.done
                        ? <AuroraIcon name="check-circle" size={18} color={C.lime} />
                        : <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: C.ash }} />}
                      <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: g.done ? txt(C, C.lime) : C.ash }}>{g.label}</Text>
                    </Pressable>
                  ))}
                  <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm, marginTop: 10 }}>
                    <Pressable onPress={() => mutate(p.id, { action: "advance" })} disabled={!ev.canAdvance} accessibilityRole="button" style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 8, opacity: ev.canAdvance ? 1 : 0.4 }}>
                      <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>Advance → {ev.nextStage ? STAGE_LABEL[ev.nextStage] : ""}</Text>
                    </Pressable>
                    {!ev.canAdvance && (
                      <>
                        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.amber) }}>{ev.blockedBy.length} gate(s) remaining</Text>
                        <Pressable onPress={() => setOverrideFor(overrideFor === p.id ? null : p.id)} accessibilityRole="button" style={{ borderWidth: 1, borderColor: C.red, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
                          <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: txt(C, C.red) }}>Override</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                  {overrideFor === p.id && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 10 }}>
                      <TextInput
                        value={reason}
                        onChangeText={setReason}
                        placeholder="Reason (logged to audit)"
                        placeholderTextColor={C.ash}
                        accessibilityLabel="Override reason"
                        style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 9 }}
                      />
                      <Pressable onPress={() => doOverride(p.id)} accessibilityRole="button" style={{ backgroundColor: C.red, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 9 }}>
                        <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>Force advance</Text>
                      </Pressable>
                    </View>
                  )}
                </>
              )}
              {p.audit && p.audit.length > 0 && (
                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>Audit trail</Text>
                  {p.audit.slice(-5).reverse().map((a, i) => (
                    <Text key={i} style={{ fontFamily: F.mono, fontSize: fs.micro, color: a.action === "override" ? txt(C, C.red) : C.ash, marginTop: 4 }}>
                      {new Date(a.ts).toLocaleDateString()} · {a.by} ({a.role.toLowerCase()}) · {auditText(a)}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </ACard>
  );
}
