import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { adminGet } from "../../lib/admin-api";
import { Card, Mono, Kicker, Chip, Loading, F } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { Stat, ErrorNote } from "./_kit";

// Mobile Security — parity with apps/web/components/admin/security.tsx, fed by
// GET /api/admin/security. Posture score header, live runtime check chips, and
// the control registry grouped by category (severity + pass/todo/manual chip +
// evidence). Same canonical control data the web tab renders.

type Control = {
  id: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "pass" | "todo" | "manual";
  title: string;
  detail: string;
  evidence?: string;
};
type Runtime = { id: string; label: string; ok: boolean | null };
type Resp = {
  posture: { total: number; pass: number; todo: number; manual: number; criticalOpen: number; score: number };
  controls: Control[];
  runtime: Runtime[];
  generatedAt: string;
};

export default function AdminSecurity() {
  const { palette } = useTheme();
  const [d, setD] = useState<Resp | null>(null);
  const [err, setErr] = useState(false);

  const statusColor = (s: Control["status"]) => (s === "pass" ? palette.lime : s === "manual" ? palette.amber : palette.red);
  const statusLabel = (s: Control["status"]) => (s === "pass" ? "PASS" : s === "manual" ? "ACTION REQ" : "TODO");
  const sevColor: Record<Control["severity"], string> = { critical: palette.red, high: palette.amber, medium: palette.blue, low: palette.ash };

  useEffect(() => {
    adminGet<Resp>("/api/admin/security").then((r) => {
      if (r.ok && r.data) setD(r.data);
      else setErr(true);
    });
  }, []);

  if (err) return <ErrorNote error="Failed to load security posture." />;
  if (!d) return <Loading />;

  const categories = [...new Set(d.controls.map((c) => c.category))];
  const scoreColor = d.posture.criticalOpen > 0 ? palette.red : d.posture.score >= 80 ? palette.lime : palette.amber;

  return (
    <View>
      {/* Posture summary */}
      <Card accent={scoreColor}>
        <Kicker>Posture score</Kicker>
        <Text style={{ fontFamily: F.black, fontSize: 40, color: txt(palette, scoreColor), lineHeight: 44, marginTop: 4 }}>
          {d.posture.score}
          <Text style={{ fontFamily: F.bold, fontSize: 20, color: palette.ash }}>/100</Text>
        </Text>
        <Mono color={palette.ash} style={{ fontSize: 11, marginTop: 2 }}>{d.posture.pass}/{d.posture.total} controls green</Mono>
      </Card>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}><Stat label="Passing" value={d.posture.pass} color={palette.lime} /></View>
        <View style={{ flex: 1 }}><Stat label="Action req" value={d.posture.manual} color={palette.amber} /></View>
        <View style={{ flex: 1 }}><Stat label="To do" value={d.posture.todo} color={palette.red} /></View>
      </View>

      {d.posture.criticalOpen > 0 && (
        <Card accent={palette.red}>
          <Mono color={palette.red} style={{ fontSize: 13, lineHeight: 18 }}>
            ⚠ {d.posture.criticalOpen} critical control(s) not yet passing — address before launch.
          </Mono>
        </Card>
      )}

      {/* Live runtime checks */}
      <Card>
        <Kicker color={palette.blue}>Live runtime checks · this deployment</Kicker>
        <View style={{ marginTop: 10, gap: 8 }}>
          {d.runtime.map((r) => {
            const c = r.ok === null ? palette.ash : r.ok ? palette.lime : palette.red;
            return (
              <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c }} />
                <Mono color={palette.chalk} style={{ fontSize: 13, flex: 1 }}>{r.label}</Mono>
                <Mono color={c} style={{ fontSize: 11 }}>{r.ok === null ? "n/a" : r.ok ? "ok" : "fail"}</Mono>
              </View>
            );
          })}
        </View>
      </Card>

      {/* Control registry, grouped by category */}
      {categories.map((cat) => {
        const items = d.controls.filter((c) => c.category === cat);
        return (
          <View key={cat} style={{ marginTop: 8 }}>
            <Kicker>{cat} · {items.filter((i) => i.status === "pass").length}/{items.length}</Kicker>
            <View style={{ marginTop: 8 }}>
              {items.map((c) => (
                <Card key={c.id} accent={statusColor(c.status)}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: statusColor(c.status) }} />
                    <Text style={{ fontFamily: F.bold, fontSize: 15, color: palette.chalk, flex: 1 }}>{c.title}</Text>
                    <Chip color={sevColor[c.severity]}>{c.severity}</Chip>
                    <Chip color={statusColor(c.status)}>{statusLabel(c.status)}</Chip>
                  </View>
                  <Mono color={palette.ash} style={{ fontSize: 12, lineHeight: 18 }}>{c.detail}</Mono>
                  {c.evidence ? (
                    <Mono color={c.status === "pass" ? palette.lime : palette.amber} style={{ fontSize: 11, marginTop: 6 }}>
                      {c.status === "pass" ? "✓ " : "→ "}{c.evidence}
                    </Mono>
                  ) : null}
                </Card>
              ))}
            </View>
          </View>
        );
      })}

      <Mono color={palette.ash} style={{ fontSize: 11, marginTop: 8 }}>
        Generated {new Date(d.generatedAt).toISOString().slice(0, 19).replace("T", " ")} · green controls are enforced by tests in CI.
      </Mono>
    </View>
  );
}
