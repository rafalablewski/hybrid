"use client";

import { useEffect, useState } from "react";
import { INK2, LINE, LIME, CHALK, ASH, AMBER, RED, BLUE, disp, mono, Mono, Card, Chip } from "@/lib/ui";
import { evaluateRtp, STAGE_LABEL, type RtpStage } from "@hybrid/core";

type Protocol = { id: string; tissue: string; injuryDate: string; stage: RtpStage; completed: string[]; status: string };

const TISSUES = ["quads", "glutes", "posterior", "back", "chest", "shoulders", "triceps"];

// Return-to-play rails. Each protocol shows its gated stage; an athlete can't
// advance until every gate is met (the core engine enforces it).
export default function RtpPanel() {
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [tissue, setTissue] = useState("posterior");

  const refresh = async () => {
    const res = await fetch("/api/rtp");
    if (res.ok) {
      const d = (await res.json()) as { protocols: Protocol[] };
      setProtocols(d.protocols.map((p) => ({ ...p, completed: (p.completed as string[]) ?? [] })));
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

  const active = protocols.filter((p) => p.status !== "abandoned");

  return (
    <Card style={{ borderLeft: `3px solid ${RED}` }}>
      <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={RED}>
        Return-to-play · gated protocols
      </Mono>

      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
        <select value={tissue} onChange={(e) => setTissue(e.target.value)} style={input}>
          {TISSUES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={create} style={btn}>Open protocol</button>
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
        {active.length === 0 && <Mono s={{ fontSize: 13 }}>No active protocols. Open one when an athlete is injured.</Mono>}
        {active.map((p) => {
          const ev = evaluateRtp({ stage: p.stage, completed: p.completed });
          const cleared = p.stage === "cleared";
          return (
            <div key={p.id} style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <Mono s={{ fontSize: 14, textTransform: "capitalize" }} c={CHALK}>{p.tissue}</Mono>
                <Chip c={cleared ? LIME : BLUE}>{STAGE_LABEL[p.stage]}</Chip>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: INK2, margin: "10px 0", overflow: "hidden" }}>
                <div style={{ width: `${Math.round(ev.progress * 100)}%`, height: "100%", background: cleared ? LIME : BLUE }} />
              </div>
              {!cleared && (
                <>
                  {ev.gates.map((g) => (
                    <label key={g.key} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", cursor: "pointer" }}>
                      <input type="checkbox" checked={g.done} onChange={() => mutate(p.id, { action: "toggleGate", gate: g.key })} />
                      <Mono s={{ fontSize: 13 }} c={g.done ? LIME : ASH}>{g.label}</Mono>
                    </label>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                    <button onClick={() => mutate(p.id, { action: "advance" })} disabled={!ev.canAdvance} style={{ ...btn, opacity: ev.canAdvance ? 1 : 0.4 }}>
                      Advance → {ev.nextStage ? STAGE_LABEL[ev.nextStage] : ""}
                    </button>
                    {!ev.canAdvance && <Mono s={{ fontSize: 11 }} c={AMBER}>{ev.blockedBy.length} gate(s) remaining</Mono>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const input: React.CSSProperties = { ...mono, fontSize: 13, padding: "8px 10px", borderRadius: 9, background: INK2, color: CHALK, border: `1px solid ${LINE}`, textTransform: "capitalize" };
const btn: React.CSSProperties = { ...disp, fontWeight: 800, fontSize: 13, background: LIME, color: "#0c0d0c", border: "none", borderRadius: 9, padding: "8px 14px", cursor: "pointer" };
