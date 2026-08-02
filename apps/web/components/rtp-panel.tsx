"use client";

import { useEffect, useState } from "react";
import { fs, space, INK2, LINE, LIME, CHALK, ASH, AMBER, RED, BLUE, ON_ACCENT, disp, mono, txt, Mono, Card, Chip, Select } from "@/lib/ui";
import { evaluateRtp, STAGE_LABEL, type RtpStage } from "@hybrid/core";

type AuditEntry = { action: string; by: string; role: string; ts: string; from?: string; to?: string; gate?: string; reason?: string };
type Protocol = { id: string; tissue: string; injuryDate: string; stage: RtpStage; completed: string[]; status: string; audit?: AuditEntry[] };

const TISSUES = ["quads", "glutes", "posterior", "back", "chest", "shoulders", "triceps"];

// Return-to-play rails. Each protocol shows its gated stage; an athlete can't
// advance until every gate is met (the core engine enforces it).
export default function RtpPanel() {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [tissue, setTissue] = useState("posterior");
  const [overrideFor, setOverrideFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const refresh = async () => {
    const res = await fetch("/api/rtp");
    if (res.ok) {
      const d = (await res.json()) as { protocols: Protocol[] };
      setProtocols(d.protocols.map((p) => ({ ...p, completed: (p.completed as string[]) ?? [], audit: (p.audit as AuditEntry[]) ?? [] })));
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const create = async () => {
    const res = await fetch("/api/rtp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tissue }),
    });
    if (res.ok) refresh();
  };
  const mutate = async (id: string, body: object) => {
    const res = await fetch(`/api/rtp/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) refresh();
  };
  const doOverride = async (id: string) => {
    if (!reason.trim()) return;
    await mutate(id, { action: "override", reason });
    setOverrideFor(null);
    setReason("");
  };

  const active = protocols.filter((p) => p.status !== "abandoned");

  return (
    <Card style={{ borderLeft: `3px solid ${RED}` }}>
      <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={RED}>
        Return-to-play – gated protocols
      </Mono>

      <div style={{ display: "flex", gap: space.sm, marginTop: 10, alignItems: "center" }}>
        <Select value={tissue} onChange={(e) => setTissue(e.target.value)} style={{ textTransform: "capitalize" }}>
          {TISSUES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <button onClick={create} style={btn}>Open protocol</button>
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: space.md }}>
        {active.length === 0 && <Mono s={{ fontSize: fs.body }}>No active protocols. Open one when an athlete is injured.</Mono>}
        {active.map((p) => {
          const ev = evaluateRtp({ stage: p.stage, completed: p.completed });
          const cleared = p.stage === "cleared";
          return (
            <div key={p.id} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <Mono s={{ fontSize: fs.bodyLg, textTransform: "capitalize" }} c={CHALK}>{p.tissue}</Mono>
                <Chip c={cleared ? LIME : BLUE}>{STAGE_LABEL[p.stage]}</Chip>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: INK2, margin: "10px 0", overflow: "hidden" }}>
                <div style={{ width: `${Math.round(ev.progress * 100)}%`, height: "100%", background: cleared ? LIME : BLUE }} />
              </div>
              {!cleared && (
                <>
                  {ev.gates.map((g) => (
                    <label key={g.key} style={{ display: "flex", gap: space.sm, alignItems: "center", padding: "4px 0", cursor: "pointer" }}>
                      <input type="checkbox" checked={g.done} onChange={() => mutate(p.id, { action: "toggleGate", gate: g.key })} />
                      <Mono s={{ fontSize: fs.body }} c={g.done ? LIME : ASH}>{g.label}</Mono>
                    </label>
                  ))}
                  <div style={{ display: "flex", gap: space.sm, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <button onClick={() => mutate(p.id, { action: "advance" })} disabled={!ev.canAdvance} style={{ ...btn, opacity: ev.canAdvance ? 1 : 0.4 }}>
                      Advance → {ev.nextStage ? STAGE_LABEL[ev.nextStage] : ""}
                    </button>
                    {!ev.canAdvance && (
                      <>
                        <Mono s={{ fontSize: fs.micro }} c={AMBER}>{ev.blockedBy.length} gate(s) remaining</Mono>
                        <button onClick={() => setOverrideFor(overrideFor === p.id ? null : p.id)} style={{ ...btn, background: "transparent", color: txt(RED), border: `1px solid ${RED}` }}>
                          Override
                        </button>
                      </>
                    )}
                  </div>
                  {overrideFor === p.id && (
                    <div style={{ display: "flex", gap: space.sm, marginTop: 8, alignItems: "center" }}>
                      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (logged to audit)" style={{ ...input, flex: 1, textTransform: "none" }} />
                      <button onClick={() => doOverride(p.id)} style={{ ...btn, background: RED, color: "#0c0d0c" }}>Force advance</button>
                    </div>
                  )}
                </>
              )}
              {p.audit && p.audit.length > 0 && (
                <div style={{ marginTop: 12, borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
                  <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em" }} c={ASH}>Audit trail</Mono>
                  {p.audit.slice(-5).reverse().map((a, i) => (
                    <Mono key={i} s={{ fontSize: fs.micro, display: "block", marginTop: 4 }} c={a.action === "override" ? RED : ASH}>
                      {new Date(a.ts).toLocaleDateString()} – {a.by} ({a.role.toLowerCase()}) – {auditText(a)}
                    </Mono>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function auditText(a: AuditEntry): string {
  switch (a.action) {
    case "attest": return `attested "${a.gate}"`;
    case "retract": return `retracted "${a.gate}"`;
    case "advance": return `advanced ${a.from} → ${a.to}`;
    case "override": return `OVERRODE ${a.from} → ${a.to}: ${a.reason}`;
    case "abandon": return "abandoned protocol";
    default: return a.action;
  }
}

const input: React.CSSProperties = { ...mono, fontSize: fs.body, padding: "8px 10px", borderRadius: 9, background: INK2, color: CHALK, border: `1px solid ${LINE}`, textTransform: "capitalize" };
const btn: React.CSSProperties = { ...disp, fontWeight: 800, fontSize: fs.body, background: LIME, color: ON_ACCENT, border: "none", borderRadius: 9, padding: "8px 14px", cursor: "pointer" };
