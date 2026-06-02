"use client";

import { useEffect, useState } from "react";
import { INK2, LINE, LIME, CHALK, ASH, BLUE, AMBER, RED, disp, mono, Mono, Card, Chip } from "@/lib/ui";
import { deploymentReadiness, unitReadiness, type DutyStatus, type UnitMember } from "@hybrid/core";

type State = { hpi: number; injuryRisk: number; readiness: number };

const statusColor: Record<DutyStatus, string> = {
  ready: LIME,
  qualified: BLUE,
  limited: AMBER,
  "non-deployable": RED,
};

export default function Tactical() {
  const [state, setState] = useState<State | null>(null);
  const [load, setLoad] = useState("78");
  const [work, setWork] = useState("80");

  useEffect(() => {
    fetch("/api/state").then(async (r) => {
      if (r.ok) setState((await r.json()) as State);
    });
  }, []);

  const num = (s: string) => (s.trim() && Number.isFinite(parseFloat(s)) ? parseFloat(s) : undefined);
  const dr = state
    ? deploymentReadiness({ hpi: state.hpi, injuryRisk: state.injuryRisk, loadCarriage: num(load), workCapacity: num(work) })
    : null;

  // illustrative squad: you + synthetic teammates, to show the unit rollup
  const squad: UnitMember[] = dr
    ? [
        { name: "You", dri: dr.dri, status: dr.status },
        { name: "Operator 2", dri: 86, status: "ready" },
        { name: "Operator 3", dri: 72, status: "qualified" },
        { name: "Operator 4", dri: 58, status: "limited" },
        { name: "Operator 5", dri: 44, status: "non-deployable" },
      ]
    : [];
  const unit = squad.length ? unitReadiness(squad) : null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card style={{ borderLeft: `3px solid ${AMBER}` }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={AMBER}>
          Tactical / SOF · deployment readiness
        </Mono>
        <Mono s={{ fontSize: 13, display: "block", marginTop: 6, lineHeight: 1.5 }} c={CHALK}>
          Not &ldquo;are you fit?&rdquo; but &ldquo;are you deployable?&rdquo; — the same Twin signals (HPI, injury risk)
          fused with occupational capacity into a Deployment Readiness Index and a unit go/no-go.
        </Mono>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
        <Card style={{ borderLeft: `3px solid ${dr ? statusColor[dr.status] : LINE}` }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>Deployment readiness</Mono>
          <div style={{ ...disp, fontWeight: 900, fontSize: 54, color: dr ? statusColor[dr.status] : ASH, lineHeight: 1.1, margin: "6px 0" }}>
            {dr ? dr.dri : "—"}
          </div>
          {dr && <Chip c={statusColor[dr.status]}>{dr.status.replace("-", " ")}</Chip>}
          {dr && dr.limiters.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {dr.limiters.map((l) => <Mono key={l} s={{ fontSize: 11, display: "block" }} c={AMBER}>⚠ {l}</Mono>)}
            </div>
          )}
          {state && <Mono s={{ fontSize: 11, display: "block", marginTop: 10 }} c={ASH}>HPI {state.hpi} · injury risk {state.injuryRisk}/100</Mono>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <label style={{ flex: 1 }}>
              <Mono s={{ fontSize: 10, textTransform: "uppercase", display: "block", marginBottom: 4 }} c={ASH}>Load carriage</Mono>
              <input value={load} onChange={(e) => setLoad(e.target.value)} inputMode="numeric" style={input} />
            </label>
            <label style={{ flex: 1 }}>
              <Mono s={{ fontSize: 10, textTransform: "uppercase", display: "block", marginBottom: 4 }} c={ASH}>Work capacity</Mono>
              <input value={work} onChange={(e) => setWork(e.target.value)} inputMode="numeric" style={input} />
            </label>
          </div>
        </Card>

        <Card style={{ borderLeft: `3px solid ${unit?.go ? LIME : RED}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }}>Unit readiness</Mono>
            {unit && <Chip c={unit.go ? LIME : RED}>{unit.go ? "MISSION GO" : "NO-GO"} · {unit.pctReady}% deployable</Chip>}
          </div>
          <div style={{ marginTop: 12 }}>
            {unit?.members.map((m) => (
              <div key={m.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
                <Mono s={{ fontSize: 14 }} c={m.name === "You" ? LIME : CHALK}>{m.name}</Mono>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Mono s={{ fontSize: 12 }} c={ASH}>DRI {m.dri}</Mono>
                  <Chip c={statusColor[m.status]}>{m.status.replace("-", " ")}</Chip>
                </div>
              </div>
            ))}
          </div>
          <Mono s={{ fontSize: 10, display: "block", marginTop: 10 }} c={ASH}>Teammates illustrative · plug a real unit through the Org Graph.</Mono>
        </Card>
      </div>
    </div>
  );
}

const input: React.CSSProperties = { ...mono, fontSize: 14, padding: "8px 10px", borderRadius: 9, background: INK2, color: CHALK, border: `1px solid ${LINE}`, width: "100%" };
