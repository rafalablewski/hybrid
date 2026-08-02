"use client";

import { useCallback, useEffect, useState } from "react";
import { fs, space, INK, LINE, LIME, CHALK, ASH, AMBER, RED, VIOLET, disp, mono, Mono, Card, Chip, txt } from "@/lib/ui";

type RunStep = { agent: string; role: string; task: string; output: string };
type RunRow = {
  id: string;
  agentName: string;
  agentRole: string;
  task: string;
  output: string;
  steps: RunStep[];
  inputTokens: number;
  outputTokens: number;
  status: string;
  runtime: string;
  ranByEmail: string | null;
  createdAt: string;
};

const FILTERS = ["all", "ok", "error"] as const;

export default function AdminAgentRuns() {
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  const load = useCallback(() => {
    const qs = filter === "all" ? "" : `?status=${filter}`;
    fetch(`/api/admin/agent-runs${qs}`)
      .then((r) => r.json())
      .then((d) => {
        setUnavailable(Boolean(d.unavailable));
        setRuns(d.runs ?? []);
      })
      .catch(() => setRuns([]));
  }, [filter]);

  useEffect(load, [load]);

  return (
    <div>
      {unavailable && (
        <Card style={{ borderLeft: `3px solid ${AMBER}`, marginBottom: 16 }}>
          <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block" }} c={CHALK}>
            Run history isn&apos;t persisted yet — run{" "}
            <span style={{ color: txt(AMBER) }}>reference/sql-agent-runs.sql</span> in Supabase.
          </Mono>
        </Card>
      )}

      <div style={{ display: "flex", gap: space.sm, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button className="pressable"
            key={f}
            onClick={() => setFilter(f)}
            style={{
              ...mono,
              fontSize: fs.body,
              padding: "7px 12px",
              borderRadius: 999,
              cursor: "pointer",
              border: `1px solid ${filter === f ? LIME : LINE}`,
              background: filter === f ? `color-mix(in srgb, var(--color-lime) 12%, transparent)` : "transparent",
              color: txt(filter === f ? LIME : ASH),
            }}
          >
            {f}
          </button>
        ))}
        <a
          href={`/api/admin/agent-runs/export${filter === "all" ? "" : `?status=${filter}`}`}
          style={{ ...mono, fontSize: fs.body, padding: "7px 12px", borderRadius: 999, cursor: "pointer", border: `1px solid ${LINE}`, background: "transparent", color: txt(ASH), marginLeft: "auto", textDecoration: "none" }}
        >
          ⬇ CSV
        </a>
        <button className="pressable" onClick={() => window.print()} style={{ ...mono, fontSize: fs.body, padding: "7px 12px", borderRadius: 999, cursor: "pointer", border: `1px solid ${LINE}`, background: "transparent", color: txt(ASH) }}>
          🖨 PDF
        </button>
        <button className="pressable" onClick={load} style={{ ...mono, fontSize: fs.body, padding: "7px 12px", borderRadius: 999, cursor: "pointer", border: `1px solid ${LINE}`, background: "transparent", color: txt(ASH) }}>
          ↻ refresh
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
        {runs?.map((r) => (
          <Card key={r.id} style={{ padding: 0, overflow: "hidden" }}>
            <details>
              <summary style={{ ...mono, fontSize: fs.body, color: CHALK, cursor: "pointer", listStyle: "none", padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: space.xs, flexWrap: "wrap" }}>
                  <Chip c={r.status === "ok" ? LIME : RED}>{r.status}</Chip>
                  <span style={{ ...disp, fontWeight: 800, fontSize: fs.note, color: CHALK }}>{r.agentName}</span>
                  <Chip c={ASH}>{r.agentRole}</Chip>
                  <Chip c={ASH}>{r.runtime}</Chip>
                  {r.steps.length > 0 && <Chip c={VIOLET}>{r.steps.length} delegated</Chip>}
                  <span style={{ color: txt(ASH), marginLeft: "auto" }}>{new Date(r.createdAt).toLocaleString()}</span>
                </div>
                <div style={{ marginTop: 6, color: CHALK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.task}
                </div>
              </summary>
              <div style={{ padding: "0 16px 14px", borderTop: `1px solid ${LINE}` }}>
                <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", display: "block", margin: "12px 0 4px" }} c={ASH}>
                  Task
                </Mono>
                <div style={{ ...mono, fontSize: fs.body, color: CHALK, whiteSpace: "pre-wrap", marginBottom: 10 }}>{r.task}</div>
                {r.steps.map((s, i) => (
                  <div key={i} style={{ marginBottom: 8, paddingLeft: 8, borderLeft: `2px solid ${VIOLET}` }}>
                    <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", display: "block" }} c={VIOLET}>↳ {s.role} — {s.agent}</Mono>
                    <div style={{ ...mono, fontSize: fs.caption, color: CHALK, whiteSpace: "pre-wrap" }}>{s.output}</div>
                  </div>
                ))}
                <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", display: "block", margin: "4px 0" }} c={ASH}>
                  Output
                </Mono>
                <div style={{ ...mono, fontSize: fs.bodyLg, lineHeight: 1.6, color: CHALK, background: INK, border: `1px solid ${LINE}`, borderRadius: "var(--r-card)", padding: 14, whiteSpace: "pre-wrap" }}>
                  {r.output || "(no output)"}
                </div>
                <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 8 }} c={ASH}>
                  {r.inputTokens.toLocaleString()} in – {r.outputTokens.toLocaleString()} out – {r.ranByEmail ?? "—"}
                </Mono>
              </div>
            </details>
          </Card>
        ))}

        {runs && runs.length === 0 && !unavailable && (
          <Card>
            <Mono s={{ fontSize: fs.bodyLg, textAlign: "center", display: "block", padding: 24 }} c={ASH}>
              No runs yet{filter !== "all" ? ` with status “${filter}”` : ""}.
            </Mono>
          </Card>
        )}
      </div>
    </div>
  );
}
