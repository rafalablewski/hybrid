"use client";

import { useCallback, useEffect, useState } from "react";
import { fs, space, INK2, LINE, LIME, CHALK, ASH, AMBER, RED, BLUE, ON_ACCENT, disp, mono, txt, Mono } from "@/lib/ui";
import { evaluateRtp, STAGE_LABEL, ALL_MUSCLES, type RtpStage } from "@hybrid/core";
import { useLang } from "@/lib/i18n";

type AuditEntry = { action: string; by: string; role: string; ts: string; from?: string; to?: string; gate?: string; reason?: string };
export type Protocol = { id: string; tissue: string; injuryDate: string; stage: RtpStage; completed: string[]; status: string; audit?: AuditEntry[] };

/**
 * RETURN-TO-PLAY — the gated protocol rails, as PIECES rather than a card.
 *
 * RTP is not a neighbour of injury risk, it is its deep end: an open protocol
 * is what the Tissue card looks like once something is actually hurt. So this
 * module no longer renders a card of its own — it hands the Tissue card a
 * hook, a protocol block and an injury picker, and that card owns the layout.
 * Mirrors the same split on mobile (apps/mobile/components/aurora/performance).
 */
export function useRtpProtocols() {
  const [protocols, setProtocols] = useState<Protocol[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/rtp");
    if (res.ok) {
      const d = (await res.json()) as { protocols: Protocol[] };
      setProtocols(d.protocols.map((p) => ({ ...p, completed: (p.completed as string[]) ?? [], audit: (p.audit as AuditEntry[]) ?? [] })));
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async (tissue: string) => {
    const res = await fetch("/api/rtp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tissue }) });
    if (res.ok) refresh();
  }, [refresh]);

  const mutate = useCallback(async (id: string, body: object) => {
    const res = await fetch(`/api/rtp/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) refresh();
  }, [refresh]);

  return { active: protocols.filter((p) => p.status !== "abandoned"), create, mutate };
}

/** The tissue chips — shown only AFTER the athlete says something is hurt, so
 *  an always-open form never sits on the screen for a twice-a-year event. */
export function InjuryPicker({ onPick, onCancel }: { onPick: (tissue: string) => void; onCancel: () => void }) {
  const { t } = useLang();
  const [tissue, setTissue] = useState<string>(ALL_MUSCLES[0] ?? "quads");
  return (
    <div style={{ marginTop: 12, padding: 14, borderRadius: 14, border: `1px solid ${LINE}`, background: INK2 }}>
      <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 9 }} c={ASH}>
        {t("w.injury.pickArea")}
      </Mono>
      <div role="radiogroup" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {ALL_MUSCLES.map((tt) => {
          const on = tt === tissue;
          return (
            <button
              key={tt}
              type="button"
              role="radio"
              aria-checked={on}
              className="pressable"
              onClick={() => setTissue(tt)}
              style={{
                ...mono, fontSize: fs.micro, textTransform: "capitalize", cursor: "pointer",
                borderRadius: 999, padding: "6px 12px",
                border: `1px solid ${on ? LIME : LINE}`,
                background: on ? `color-mix(in srgb, ${LIME} 12%, transparent)` : "transparent",
                color: on ? txt(LIME) : ASH,
              }}
            >
              {tt}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: space.sm, marginTop: 12, alignItems: "center" }}>
        <button type="button" className="pressable" onClick={() => onPick(tissue)} style={btn}>{t("w.injury.openProtocol")}</button>
        <button type="button" className="pressable" onClick={onCancel} style={{ ...btn, background: "transparent", color: ASH, border: `1px solid ${LINE}` }}>{t("w.injury.cancel")}</button>
      </div>
    </div>
  );
}

/** One open protocol. The gates, the audit trail and the override-reason field
 *  are unchanged — they simply live inside the Tissue card now. */
export function RtpProtocol({ p, mutate }: { p: Protocol; mutate: (id: string, body: object) => void }) {
  const { t } = useLang();
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reason, setReason] = useState("");
  const ev = evaluateRtp({ stage: p.stage, completed: p.completed });
  const cleared = p.stage === "cleared";
  const accent = cleared ? LIME : BLUE;

  const doOverride = () => {
    if (!reason.trim()) return;
    mutate(p.id, { action: "override", reason });
    setOverrideOpen(false);
    setReason("");
  };

  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 14, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span style={{ ...disp, fontWeight: 800, fontSize: fs.bodyLg, color: CHALK, textTransform: "capitalize" }}>{p.tissue}</span>
        <Mono s={{ fontSize: fs.nano, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", border: `1px solid color-mix(in srgb, ${accent} 55%, transparent)`, borderRadius: 999, padding: "3px 10px" }} c={txt(accent)}>
          {STAGE_LABEL[p.stage]}
        </Mono>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: INK2, margin: "11px 0", overflow: "hidden" }}>
        <div style={{ width: `${Math.round(ev.progress * 100)}%`, height: "100%", background: accent }} />
      </div>
      {!cleared && (
        <>
          {ev.gates.map((g) => (
            <label key={g.key} style={{ display: "flex", gap: space.sm, alignItems: "center", padding: "4px 0", cursor: "pointer" }}>
              <input type="checkbox" checked={g.done} onChange={() => mutate(p.id, { action: "toggleGate", gate: g.key })} />
              <Mono s={{ fontSize: fs.body }} c={g.done ? txt(LIME) : ASH}>{g.label}</Mono>
            </label>
          ))}
          <div style={{ display: "flex", gap: space.sm, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="pressable" onClick={() => mutate(p.id, { action: "advance" })} disabled={!ev.canAdvance} style={{ ...btn, opacity: ev.canAdvance ? 1 : 0.4 }}>
              {t("w.rtp.advance")} → {ev.nextStage ? STAGE_LABEL[ev.nextStage] : ""}
            </button>
            {!ev.canAdvance && (
              <>
                <Mono s={{ fontSize: fs.micro }} c={txt(AMBER)}>{ev.blockedBy.length} {t("w.rtp.gatesLeft")}</Mono>
                <button type="button" className="pressable" onClick={() => setOverrideOpen((v) => !v)} style={{ ...btn, background: "transparent", color: txt(RED), border: `1px solid ${RED}` }}>
                  {t("w.rtp.override")}
                </button>
              </>
            )}
          </div>
          {overrideOpen && (
            <div style={{ display: "flex", gap: space.sm, marginTop: 8, alignItems: "center" }}>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("w.rtp.reason")} style={{ ...input, flex: 1, textTransform: "none" }} />
              <button type="button" className="pressable" onClick={doOverride} style={{ ...btn, background: RED, color: "#0c0d0c" }}>{t("w.rtp.force")}</button>
            </div>
          )}
        </>
      )}
      {p.audit && p.audit.length > 0 && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${LINE}`, paddingTop: 10 }}>
          <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em" }} c={ASH}>{t("w.rtp.audit")}</Mono>
          {p.audit.slice(-5).reverse().map((a, i) => (
            <Mono key={i} s={{ fontSize: fs.micro, display: "block", marginTop: 4 }} c={a.action === "override" ? txt(RED) : ASH}>
              {new Date(a.ts).toLocaleDateString()} – {a.by} ({a.role.toLowerCase()}) – {auditText(a)}
            </Mono>
          ))}
        </div>
      )}
    </div>
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
