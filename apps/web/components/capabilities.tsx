"use client";

import { useState } from "react";
import {
  CAPABILITIES,
  capabilitiesByStatus,
  type Capability,
  type CapabilityStatus,
} from "@hybrid/core";
import { fs, space, LINE, LIME, CHALK, ASH, AMBER, disp, mono, Mono, Card, Chip } from "@/lib/ui";

const STATUS_META: Record<CapabilityStatus, { label: string; color: string; blurb: string }> = {
  shipped: { label: "Shipped", color: LIME, blurb: "Built and working." },
  blocked: { label: "Blocked", color: AMBER, blurb: "Implemented, but stuck on missing data / access / credentials." },
  planned: { label: "Planned", color: ASH, blurb: "Not built yet." },
};

export default function CapabilitiesScreen() {
  const order: CapabilityStatus[] = ["shipped", "blocked", "planned"];

  return (
    <div>
      <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 16 }}>
        Living registry of every capability — kept current as features ship, block, or get planned.
      </Mono>

      {/* counts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: space.lg, marginBottom: 20 }}>
        {order.map((st) => {
          const m = STATUS_META[st];
          const n = capabilitiesByStatus(st).length;
          return (
            <Card key={st} style={{ borderTop: `2px solid ${m.color}` }}>
              <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={m.color}>
                {m.label}
              </Mono>
              <div style={{ ...disp, fontWeight: 800, fontSize: 32, color: CHALK, margin: "4px 0 2px" }}>{n}</div>
              <Mono s={{ fontSize: fs.micro }}>{m.blurb}</Mono>
            </Card>
          );
        })}
      </div>

      {order.map((st) => {
        const items = capabilitiesByStatus(st);
        if (items.length === 0) return null;
        const m = STATUS_META[st];
        return (
          <div key={st} style={{ marginBottom: 8 }}>
            <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", display: "block", margin: "10px 0" }} c={m.color}>
              {m.label} – {items.length}
            </Mono>
            <div style={{ display: "flex", flexDirection: "column", gap: space.ms }}>
              {items.map((c) => (
                <Row key={c.id} cap={c} color={m.color} />
              ))}
            </div>
          </div>
        );
      })}

      <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 18 }} c={ASH}>
        Source: packages/core/src/capabilities.ts – {CAPABILITIES.length} capabilities tracked.
      </Mono>
    </div>
  );
}

// Some `detail` records run to thousands of characters (a full ship log per
// capability). Keep every character in the DOM — the registry is the source of
// truth and stays searchable — but clamp it to a few lines by default so the
// screen reads as a scannable list of titles, not a wall of prose. Expand per row.
const LONG_DETAIL = 320;

function Row({ cap, color }: { cap: Capability; color: string }) {
  const [open, setOpen] = useState(false);
  const long = cap.detail.length > LONG_DETAIL;
  const clamp = long && !open;
  return (
    <Card style={{ borderLeft: `3px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.ms }}>
        <div style={{ ...disp, fontWeight: 700, fontSize: fs.note }}>{cap.title}</div>
        <Chip c={ASH}>{cap.area}</Chip>
      </div>
      <Mono
        s={{
          fontSize: fs.body,
          lineHeight: 1.5,
          display: clamp ? "-webkit-box" : "block",
          WebkitLineClamp: clamp ? 3 : "unset",
          WebkitBoxOrient: "vertical",
          overflow: clamp ? "hidden" : "visible",
          marginTop: 6,
        }}
        c={CHALK}
      >
        {cap.detail}
      </Mono>
      {long && (
        <button className="pressable"
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{ ...mono, fontSize: fs.micro, color: color, background: "none", border: "none", padding: 0, marginTop: 6, cursor: "pointer", textTransform: "uppercase", letterSpacing: ".08em" }}
        >
          {open ? "Show less" : "Show more"}
        </button>
      )}
      {cap.blockedBy && (
        <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: `${AMBER}12`, border: `1px solid ${AMBER}40` }}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".08em" }} c={AMBER}>
            Needs
          </Mono>
          <Mono s={{ fontSize: fs.caption, lineHeight: 1.45, display: "block", marginTop: 3 }} c={CHALK}>
            {cap.blockedBy}
          </Mono>
        </div>
      )}
    </Card>
  );
}
