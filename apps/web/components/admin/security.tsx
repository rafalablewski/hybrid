"use client";

import { useEffect, useState } from "react";
import { LINE, LIME, CHALK, ASH, AMBER, RED, BLUE, disp, mono, Mono, Card, Chip } from "@/lib/ui";

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

const statusColor = (s: Control["status"]) => (s === "pass" ? LIME : s === "manual" ? AMBER : RED);
const statusLabel = (s: Control["status"]) => (s === "pass" ? "PASS" : s === "manual" ? "ACTION REQ" : "TODO");
const sevColor: Record<Control["severity"], string> = { critical: RED, high: AMBER, medium: BLUE, low: ASH };

export default function AdminSecurity() {
  const [d, setD] = useState<Resp | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch("/api/admin/security").then((r) => (r.ok ? r.json() : Promise.reject())).then(setD).catch(() => setErr(true));
  }, []);

  if (err) return <Card style={{ textAlign: "center", padding: 60 }}><Mono>Failed to load security posture.</Mono></Card>;
  if (!d) return <Card style={{ textAlign: "center", padding: 60 }}><Mono>Running checks…</Mono></Card>;

  const categories = [...new Set(d.controls.map((c) => c.category))];
  const scoreColor = d.posture.criticalOpen > 0 ? RED : d.posture.score >= 80 ? LIME : AMBER;

  return (
    <div>
      {/* posture summary */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card style={{ borderLeft: `3px solid ${scoreColor}` }}>
          <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em" }} c={ASH}>Posture score</Mono>
          <div style={{ ...disp, fontWeight: 800, fontSize: 40, color: scoreColor, lineHeight: 1.05, margin: "4px 0 2px" }}>
            {d.posture.score}<span style={{ fontSize: 20, color: ASH }}>/100</span>
          </div>
          <Mono s={{ fontSize: 11 }} c={ASH}>{d.posture.pass}/{d.posture.total} controls green</Mono>
        </Card>
        <CountCard label="Passing" value={d.posture.pass} c={LIME} />
        <CountCard label="Action required" value={d.posture.manual} c={AMBER} />
        <CountCard label="To do" value={d.posture.todo} c={RED} />
      </div>

      {d.posture.criticalOpen > 0 && (
        <Card style={{ borderLeft: `3px solid ${RED}`, marginBottom: 16 }}>
          <Mono s={{ fontSize: 13 }} c={RED}>
            ⚠ {d.posture.criticalOpen} critical control(s) not yet passing — address before launch.
          </Mono>
        </Card>
      )}

      {/* live runtime checks */}
      <Card style={{ marginBottom: 20 }}>
        <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 12 }} c={BLUE}>
          Live runtime checks · this deployment
        </Mono>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
          {d.runtime.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Dot c={r.ok === null ? ASH : r.ok ? LIME : RED} />
              <Mono s={{ fontSize: 13 }} c={CHALK}>{r.label}</Mono>
              <Mono s={{ fontSize: 11, marginLeft: "auto" }} c={r.ok === null ? ASH : r.ok ? LIME : RED}>
                {r.ok === null ? "n/a" : r.ok ? "ok" : "fail"}
              </Mono>
            </div>
          ))}
        </div>
      </Card>

      {/* control registry by category */}
      {categories.map((cat) => {
        const items = d.controls.filter((c) => c.category === cat);
        return (
          <div key={cat} style={{ marginBottom: 22 }}>
            <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 10 }} c={ASH}>
              {cat} · {items.filter((i) => i.status === "pass").length}/{items.length}
            </Mono>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((c) => (
                <Card key={c.id} style={{ borderLeft: `3px solid ${statusColor(c.status)}`, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <Dot c={statusColor(c.status)} />
                    <span style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{c.title}</span>
                    <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                      <Chip c={sevColor[c.severity]}>{c.severity}</Chip>
                      <Chip c={statusColor(c.status)}>{statusLabel(c.status)}</Chip>
                    </span>
                  </div>
                  <Mono s={{ fontSize: 12, lineHeight: 1.5, display: "block" }} c={ASH}>{c.detail}</Mono>
                  {c.evidence && (
                    <Mono s={{ fontSize: 11, display: "block", marginTop: 6 }} c={c.status === "pass" ? LIME : AMBER}>
                      {c.status === "pass" ? "✓ " : "→ "}{c.evidence}
                    </Mono>
                  )}
                </Card>
              ))}
            </div>
          </div>
        );
      })}

      <Mono s={{ fontSize: 11, display: "block", marginTop: 8 }} c={ASH}>
        Generated {new Date(d.generatedAt).toISOString().slice(0, 19).replace("T", " ")} · green controls are enforced
        by tests in CI.
      </Mono>
    </div>
  );
}

function CountCard({ label, value, c }: { label: string; value: number; c: string }) {
  return (
    <Card>
      <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em" }} c={ASH}>{label}</Mono>
      <div style={{ ...disp, fontWeight: 800, fontSize: 34, color: c, lineHeight: 1.1, margin: "6px 0 0" }}>{value}</div>
    </Card>
  );
}

function Dot({ c }: { c: string }) {
  return <span style={{ width: 9, height: 9, borderRadius: 5, background: c, flexShrink: 0, boxShadow: `0 0 8px ${c}66` }} />;
}
