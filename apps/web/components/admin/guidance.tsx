"use client";

import { useState } from "react";
import { GUIDES, type Guide, type GuideBlock } from "@hybrid/core";
import { LINE, LIME, CHALK, ASH, AMBER, disp, mono, Mono, Card, txt } from "@/lib/ui";

// Operator help surface (Governance → Guidance). Renders the plain-language
// runbooks that live in @hybrid/core (guidance.ts) so the copy stays the single
// source of truth and a future mobile admin can render the same words.
export default function AdminGuidance() {
  const [guideId, setGuideId] = useState(GUIDES[0]!.id);
  const guide: Guide = GUIDES.find((g) => g.id === guideId) ?? GUIDES[0]!;
  const [active, setActive] = useState(guide.sections[0]!.id);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "230px 1fr", gap: 20, alignItems: "start" }}>
      {/* sticky table of contents */}
      <Card style={{ position: "sticky", top: 16, padding: 14 }}>
        {/* guide switcher — only when there's more than one guide */}
        {GUIDES.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${LINE}` }}>
            {GUIDES.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  setGuideId(g.id);
                  setActive(g.sections[0]!.id);
                }}
                style={{
                  ...mono,
                  fontSize: 10,
                  textTransform: "uppercase",
                  letterSpacing: ".08em",
                  padding: "5px 9px",
                  borderRadius: 7,
                  cursor: "pointer",
                  border: `1px solid ${g.id === guideId ? `${AMBER}66` : LINE}`,
                  background: g.id === guideId ? `${AMBER}1c` : "transparent",
                  color: txt(g.id === guideId ? AMBER : ASH),
                }}
              >
                {g.id}
              </button>
            ))}
          </div>
        )}
        <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".14em", display: "block", marginBottom: 10 }} c={AMBER}>
          {guide.title}
        </Mono>
        <nav>
          {guide.sections.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setActive(s.id);
                document.getElementById(`guide-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              style={{
                width: "100%",
                display: "flex",
                gap: 9,
                alignItems: "center",
                padding: "8px 10px",
                marginBottom: 2,
                borderRadius: 8,
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                background: active === s.id ? `${LIME}1c` : "transparent",
                color: txt(active === s.id ? LIME : ASH),
                ...disp,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <span style={{ width: 16, textAlign: "center" }}>{s.icon}</span>
              {s.title}
            </button>
          ))}
        </nav>
        <Mono s={{ fontSize: 10, display: "block", marginTop: 12, paddingTop: 10, borderTop: `1px solid ${LINE}` }} c={ASH}>
          Last reviewed {guide.updated}
        </Mono>
      </Card>

      {/* sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {guide.sections.map((s) => (
          <Card key={s.id} style={{ scrollMarginTop: 16 }}>
            <div id={`guide-${s.id}`} style={{ scrollMarginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: s.summary ? 4 : 12 }}>
                <span style={{ fontSize: 18, color: txt(LIME) }}>{s.icon}</span>
                <h2 style={{ ...disp, fontWeight: 900, fontSize: 20, letterSpacing: "-.02em", color: CHALK, margin: 0 }}>
                  {s.title}
                </h2>
              </div>
              {s.summary && (
                <Mono s={{ fontSize: 12, display: "block", marginBottom: 14 }} c={ASH}>
                  {s.summary}
                </Mono>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {s.blocks.map((b, i) => (
                  <Block key={i} b={b} />
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Block({ b }: { b: GuideBlock }) {
  if (b.t === "p") {
    return <p style={{ ...disp, fontSize: 14, lineHeight: 1.65, color: CHALK, margin: 0 }}>{b.text}</p>;
  }
  if (b.t === "note") {
    return (
      <div
        style={{
          borderLeft: `3px solid ${AMBER}`,
          background: `${AMBER}12`,
          borderRadius: 8,
          padding: "10px 14px",
        }}
      >
        <Mono s={{ fontSize: 9, textTransform: "uppercase", letterSpacing: ".14em", display: "block", marginBottom: 4 }} c={AMBER}>
          Note
        </Mono>
        <span style={{ ...disp, fontSize: 13.5, lineHeight: 1.6, color: CHALK }}>{b.text}</span>
      </div>
    );
  }
  if (b.t === "term") {
    return (
      <div style={{ paddingLeft: 14, borderLeft: `2px solid ${LINE}` }}>
        <div style={{ ...disp, fontWeight: 800, fontSize: 14.5, color: txt(LIME), marginBottom: 3 }}>{b.term}</div>
        <span style={{ ...disp, fontSize: 13.5, lineHeight: 1.62, color: CHALK }}>{b.text}</span>
      </div>
    );
  }
  // steps
  return (
    <ol style={{ ...disp, margin: 0, paddingLeft: 0, listStyle: "none", counterReset: "g", display: "flex", flexDirection: "column", gap: 8 }}>
      {b.items.map((it, i) => (
        <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span
            style={{
              flexShrink: 0,
              width: 22,
              height: 22,
              borderRadius: 7,
              background: `${LIME}1f`,
              border: `1px solid ${LIME}55`,
              color: txt(LIME),
              ...mono,
              fontSize: 11,
              fontWeight: 700,
              display: "grid",
              placeItems: "center",
              marginTop: 1,
            }}
          >
            {i + 1}
          </span>
          <span style={{ fontSize: 13.5, lineHeight: 1.6, color: CHALK }}>{it}</span>
        </li>
      ))}
    </ol>
  );
}
