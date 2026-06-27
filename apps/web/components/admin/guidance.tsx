"use client";

import { useState, useEffect } from "react";
import { GUIDES, type Guide, type GuideBlock } from "@hybrid/core";
import { fs, space, INK, INK2, LINE, LIME, CHALK, ASH, AMBER, disp, mono, Mono, Card, txt } from "@/lib/ui";

// Operator help surface (Governance → Guidance). Renders the plain-language
// runbooks that live in @hybrid/core (guidance.ts) so the copy stays the single
// source of truth and a future mobile admin can render the same words.
export default function AdminGuidance() {
  const [guideId, setGuideId] = useState(GUIDES[0]!.id);
  const guide: Guide = GUIDES.find((g) => g.id === guideId) ?? GUIDES[0]!;
  const [active, setActive] = useState(guide.sections[0]!.id);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] gap-5 items-start">
      {/* sticky table of contents */}
      <Card style={{ position: "sticky", top: 16, padding: 14 }}>
        {/* guide switcher — only when there's more than one guide */}
        {GUIDES.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs, marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${LINE}` }}>
            {GUIDES.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  setGuideId(g.id);
                  setActive(g.sections[0]!.id);
                }}
                style={{
                  ...mono,
                  fontSize: fs.micro,
                  textTransform: "uppercase",
                  letterSpacing: ".08em",
                  padding: "7px 9px",
                  borderRadius: "var(--r-field)",
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
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".14em", display: "block", marginBottom: 10 }} c={AMBER}>
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
                padding: "10px 10px",
                marginBottom: 2,
                borderRadius: "var(--r-field)",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                background: active === s.id ? `color-mix(in srgb, var(--color-lime) 11%, transparent)` : "transparent",
                color: txt(active === s.id ? LIME : ASH),
                ...disp,
                fontSize: fs.bodyLg,
                fontWeight: 600,
              }}
            >
              <span style={{ width: 16, textAlign: "center" }}>{s.icon}</span>
              {s.title}
            </button>
          ))}
        </nav>
        <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 12, paddingTop: 10, borderTop: `1px solid ${LINE}` }} c={ASH}>
          Last reviewed {guide.updated}
        </Mono>
      </Card>

      {/* sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: space.lg }}>
        {guide.sections.map((s) => (
          // id + scrollMarginTop on the WRAPPER so the whole card (border +
          // padding) clears the viewport top when jumped to from the TOC.
          <div key={s.id} id={`guide-${s.id}`} style={{ scrollMarginTop: 16 }}>
            <Card>
              <div style={{ display: "flex", alignItems: "center", gap: space.ms, marginBottom: s.summary ? 4 : 12 }}>
                <span style={{ fontSize: fs.title, color: txt(LIME) }}>{s.icon}</span>
                <h2 style={{ ...disp, fontWeight: 900, fontSize: fs.heading, letterSpacing: "-.02em", color: CHALK, margin: 0 }}>
                  {s.title}
                </h2>
              </div>
              {s.summary && (
                <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 14 }} c={ASH}>
                  {s.summary}
                </Mono>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: space.md }}>
                {s.blocks.map((b, i) => (
                  <Block key={i} b={b} />
                ))}
              </div>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}

function Block({ b }: { b: GuideBlock }) {
  if (b.t === "p") {
    return <p style={{ ...disp, fontSize: fs.bodyLg, lineHeight: 1.65, color: CHALK, margin: 0 }}>{b.text}</p>;
  }
  if (b.t === "note") {
    return (
      <div
        style={{
          borderLeft: `3px solid ${AMBER}`,
          background: `${AMBER}12`,
          borderRadius: "var(--r-field)",
          padding: "10px 14px",
        }}
      >
        <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".14em", display: "block", marginBottom: 4 }} c={AMBER}>
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
  if (b.t === "cmd") {
    return <Cmd lines={b.lines} />;
  }
  if (b.t === "matrix") {
    return (
      <div style={{ display: "grid", gap: 0 }}>
        {b.rows.map((r, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: space.md,
              padding: "9px 0",
              borderBottom: i < b.rows.length - 1 ? `1px solid ${LINE}` : "none",
            }}
          >
            <span style={{ ...disp, fontSize: 13.5, color: CHALK }}>{r.goal}</span>
            <Mono s={{ fontSize: fs.body, textAlign: "right", flexShrink: 0 }} c={LIME}>
              {r.path}
            </Mono>
          </div>
        ))}
      </div>
    );
  }
  // steps
  return (
    <ol style={{ ...disp, margin: 0, paddingLeft: 0, listStyle: "none", counterReset: "g", display: "flex", flexDirection: "column", gap: space.sm }}>
      {b.items.map((it, i) => (
        <li key={i} style={{ display: "flex", gap: space.md, alignItems: "flex-start" }}>
          <span
            style={{
              flexShrink: 0,
              width: 22,
              height: 22,
              borderRadius: "var(--r-field)",
              background: `color-mix(in srgb, var(--color-lime) 12%, transparent)`,
              border: `1px solid color-mix(in srgb, var(--color-lime) 33%, transparent)`,
              color: txt(LIME),
              ...mono,
              fontSize: fs.caption,
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

// A copy-able terminal command box. Mirrors the affordance the old standalone
// iOS-simulator page had, now that that runbook lives in @hybrid/core as a guide.
function Cmd({ lines }: { lines: string }) {
  const [copied, setCopied] = useState(false);
  // Reset the "copied" label after a moment, clearing the timer on unmount so we
  // never set state on an unmounted component.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = () => {
    // navigator.clipboard is undefined on non-HTTPS / older browsers — guard it.
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(lines).then(
      () => setCopied(true),
      () => {},
    );
  };
  return (
    <div style={{ position: "relative" }}>
      <pre
        style={{
          ...mono,
          fontSize: 13.5,
          lineHeight: 1.7,
          color: CHALK,
          background: INK,
          border: `1px solid ${LINE}`,
          borderRadius: "var(--r-field)",
          padding: "12px 14px",
          margin: 0,
          overflowX: "auto",
          whiteSpace: "pre",
        }}
      >
        {lines}
      </pre>
      <button
        onClick={copy}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          ...mono,
          fontSize: fs.micro,
          textTransform: "uppercase",
          letterSpacing: ".08em",
          color: txt(copied ? INK : ASH),
          background: copied ? LIME : INK2,
          border: `1px solid ${LINE}`,
          borderRadius: "var(--r-field)",
          padding: "5px 8px",
          cursor: "pointer",
        }}
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
