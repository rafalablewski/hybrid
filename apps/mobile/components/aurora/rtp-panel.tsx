import { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView } from "react-native";
import { evaluateRtp, STAGE_LABEL, type RtpStage } from "@hybrid/core";
import { fetchRtp, createRtp, mutateRtp, type RtpProtocol, type RtpAuditEntry } from "../../lib/api";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { ACard } from "./kit";

/**
 * Return-to-play rails (mobile) — parity with apps/web/components/rtp-panel.tsx.
 * Same /api/rtp flow + the core evaluateRtp engine: each protocol shows its
 * gated stage and an athlete can't advance until every gate is met (the engine
 * enforces it; an override is logged to the audit trail). Embedded on the
 * Performance screen, exactly like web.
 */

const TISSUES = ["quads", "glutes", "posterior", "back", "chest", "shoulders", "triceps"];

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

export default function RtpPanel() {
  const { palette: C } = useTheme();
  const [protocols, setProtocols] = useState<RtpProtocol[]>([]);
  const [tissue, setTissue] = useState("posterior");
  const [overrideFor, setOverrideFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const refresh = () => { fetchRtp().then(setProtocols); };
  useEffect(() => { refresh(); }, []);

  const create = async () => { if (await createRtp(tissue)) refresh(); };
  const mutate = async (id: string, body: object) => { if (await mutateRtp(id, body)) refresh(); };
  const doOverride = async (id: string) => {
    if (!reason.trim()) return;
    await mutate(id, { action: "override", reason });
    setOverrideFor(null);
    setReason("");
  };

  const active = protocols.filter((p) => p.status !== "abandoned");

  return (
    <ACard style={{ borderLeftWidth: 3, borderLeftColor: C.red, marginTop: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.red) }}>
        Return-to-play · gated protocols
      </Text>

      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1, color: C.ash, marginTop: 12, marginBottom: 6 }}>Open a protocol</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingRight: 8 }}>
        {TISSUES.map((tg) => {
          const on = tissue === tg;
          return (
            <Pressable key={tg} onPress={() => setTissue(tg)} style={{ borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? `${C.lime}24` : "transparent", borderRadius: 999, paddingVertical: 6, paddingHorizontal: 13 }}>
              <Text style={{ fontFamily: F.semi, fontSize: fs.caption, textTransform: "capitalize", color: on ? txt(C, C.lime) : C.ash }}>{tg}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable onPress={create} style={{ alignSelf: "flex-start", marginTop: 10, backgroundColor: C.lime, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>Open protocol</Text>
      </Pressable>

      <View style={{ marginTop: 16, gap: space.md }}>
        {active.length === 0 && (
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>No active protocols. Open one when an athlete is injured.</Text>
        )}
        {active.map((p) => {
          const ev = evaluateRtp({ stage: p.stage as RtpStage, completed: p.completed });
          const cleared = p.stage === "cleared";
          return (
            <View key={p.id} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 14 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk, textTransform: "capitalize" }}>{p.tissue}</Text>
                <View style={{ backgroundColor: `${cleared ? C.lime : C.blue}24`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, cleared ? C.lime : C.blue) }}>{STAGE_LABEL[p.stage as RtpStage]}</Text>
                </View>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: C.ink, marginVertical: 10, overflow: "hidden" }}>
                <View style={{ width: `${Math.round(ev.progress * 100)}%`, height: "100%", backgroundColor: cleared ? C.lime : C.blue }} />
              </View>
              {!cleared && (
                <>
                  {ev.gates.map((g) => (
                    <Pressable key={g.key} onPress={() => mutate(p.id, { action: "toggleGate", gate: g.key })} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 5 }}>
                      <Text style={{ color: txt(C, g.done ? C.lime : C.ash), fontFamily: F.mono, fontSize: fs.bodyLg }}>{g.done ? "☑" : "☐"}</Text>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: g.done ? txt(C, C.lime) : C.ash, flex: 1 }}>{g.label}</Text>
                    </Pressable>
                  ))}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: 10, alignItems: "center" }}>
                    <Pressable onPress={() => ev.canAdvance && mutate(p.id, { action: "advance" })} disabled={!ev.canAdvance} style={{ backgroundColor: C.lime, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 14, opacity: ev.canAdvance ? 1 : 0.4 }}>
                      <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>Advance → {ev.nextStage ? STAGE_LABEL[ev.nextStage] : ""}</Text>
                    </Pressable>
                    {!ev.canAdvance && (
                      <>
                        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.amber) }}>{ev.blockedBy.length} gate(s) remaining</Text>
                        <Pressable onPress={() => setOverrideFor(overrideFor === p.id ? null : p.id)} style={{ borderWidth: 1, borderColor: C.red, borderRadius: 9, paddingVertical: 8, paddingHorizontal: 14 }}>
                          <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: txt(C, C.red) }}>Override</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                  {overrideFor === p.id && (
                    <View style={{ flexDirection: "row", gap: space.sm, marginTop: 8, alignItems: "center" }}>
                      <TextInput
                        value={reason}
                        onChangeText={setReason}
                        placeholder="Reason (logged to audit)"
                        placeholderTextColor={C.ash}
                        style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 9 }}
                      />
                      <Pressable onPress={() => doOverride(p.id)} style={{ backgroundColor: C.red, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 14 }}>
                        <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: "#0c0d0c" }}>Force advance</Text>
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
