"use client";

import { useState } from "react";
import {
  HPI_REVIEW,
  layersBySeverity,
  planByPriority,
  roadmapByHorizon,
  weaknessesByRank,
  type EvidenceGrade,
  type MajorWeakness,
  type ReviewLayer,
  type ReviewPriority,
  type RoadmapItem,
} from "@hybrid/core";
import {
  fs,
  space,
  LINE,
  CARD,
  LIME,
  CHALK,
  ASH,
  AMBER,
  RED,
  BLUE,
  VIOLET,
  disp,
  mono,
  cond,
  Mono,
  Card,
  Chip,
  txt,
  ON_ACCENT,
} from "@/lib/ui";

// The review surfaced for operators: an at-a-glance verdict, the layer-by-layer
// findings, the missing-component gaps, the redesigned latent model, the
// 3/10-year roadmap and a prioritised build plan. All read from
// @hybrid/core/engines/hpi-review (the single source of truth) so this screen
// never drifts from the science doc.

type Tab =
  | "summary"
  | "layers"
  | "weaknesses"
  | "missing"
  | "redesign"
  | "model"
  | "roadmap"
  | "plan";

const SEVERITY_COLOR: Record<ReviewLayer["severity"], string> = {
  critical: RED,
  major: AMBER,
  minor: BLUE,
  ok: LIME,
};

const WEAKNESS_COLOR: Record<MajorWeakness["severity"], string> = {
  critical: RED,
  major: AMBER,
  minor: BLUE,
};

const GRADE_META: Record<EvidenceGrade, { label: string; color: string }> = {
  established: { label: "Established", color: LIME },
  emerging: { label: "Emerging", color: BLUE },
  contested: { label: "Contested", color: AMBER },
  speculative: { label: "Speculative", color: VIOLET },
};

const PRIORITY_META: Record<ReviewPriority, { label: string; color: string; blurb: string }> = {
  must: { label: "Must have", color: RED, blurb: "Foundations — decision-grade outputs depend on these." },
  should: { label: "Should have", color: AMBER, blurb: "Population scale & richer inputs." },
  nice: { label: "Nice to have", color: BLUE, blurb: "Explainability & operability polish." },
  experimental: { label: "Experimental", color: VIOLET, blurb: "Research-grade, label/data dependent." },
};

const HORIZON_META: Record<RoadmapItem["horizon"], { label: string }> = {
  now: { label: "Now" },
  year1: { label: "Year 1" },
  year3: { label: "3-year vision" },
  year10: { label: "10-year vision" },
};

export default function AdminPerformanceEngine() {
  const [tab, setTab] = useState<Tab>("summary");

  const tabs: [Tab, string][] = [
    ["summary", "Executive summary"],
    ["layers", "Layer review"],
    ["weaknesses", "Major weaknesses"],
    ["missing", "Missing"],
    ["redesign", "Recommended redesign"],
    ["model", "Redesigned model"],
    ["roadmap", "Roadmap"],
    ["plan", "Build plan"],
  ];

  return (
    <div>
      {/* verdict banner */}
      <Card style={{ borderLeft: `3px solid ${AMBER}`, marginBottom: 20 }}>
        <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".14em" }} c={AMBER}>
          Headline verdict · review v{HPI_REVIEW.version} · {HPI_REVIEW.reviewedOn}
        </Mono>
        <Mono s={{ fontSize: fs.bodyLg, lineHeight: 1.55, display: "block", marginTop: 8 }} c={CHALK}>
          {HPI_REVIEW.verdict}
        </Mono>
      </Card>

      {/* tabs */}
      <div style={{ display: "flex", gap: space.sm, marginBottom: 20, flexWrap: "wrap" }}>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              ...cond,
              fontSize: fs.bodyLg,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: ".05em",
              padding: "9px 14px",
              borderRadius: "var(--r-field)",
              cursor: "pointer",
              border: `1px solid ${tab === id ? LIME : LINE}`,
              background: tab === id ? LIME : "transparent",
              color: tab === id ? ON_ACCENT : txt(ASH),
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "summary" && <Summary />}
      {tab === "layers" && <Layers />}
      {tab === "weaknesses" && <Weaknesses />}
      {tab === "missing" && <Missing />}
      {tab === "redesign" && <Redesign />}
      {tab === "model" && <Model />}
      {tab === "roadmap" && <Roadmap />}
      {tab === "plan" && <Plan />}

      <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 18 }} c={ASH}>
        Source: packages/core/src/engines/hpi-review.ts · narrative: reference/performance-engine-review.md
      </Mono>
    </div>
  );
}

function Summary() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.md }}>
      {HPI_REVIEW.executiveSummary.map((p, i) => (
        <Card key={i} style={{ display: "flex", gap: space.md, alignItems: "flex-start" }}>
          <div
            style={{
              ...disp,
              fontWeight: 800,
              fontSize: fs.subtitle,
              color: txt(AMBER),
              minWidth: 22,
            }}
          >
            {i + 1}
          </div>
          <Mono s={{ fontSize: fs.body, lineHeight: 1.55 }} c={CHALK}>
            {p}
          </Mono>
        </Card>
      ))}
    </div>
  );
}

function Grade({ grade }: { grade: EvidenceGrade }) {
  const m = GRADE_META[grade];
  return <Chip c={m.color}>{m.label}</Chip>;
}

function Layers() {
  const layers = layersBySeverity();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.md }}>
      {layers.map((l) => (
        <Card key={l.id} style={{ borderLeft: `3px solid ${SEVERITY_COLOR[l.severity]}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.ms, flexWrap: "wrap" }}>
            <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle }}>{l.title}</div>
            <div style={{ display: "flex", gap: space.xs, alignItems: "center" }}>
              <Chip c={SEVERITY_COLOR[l.severity]}>{l.severity}</Chip>
              <Grade grade={l.evidence} />
            </div>
          </div>

          {l.sourceRef && (
            <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 4 }} c={ASH}>
              {l.sourceRef}
            </Mono>
          )}

          <Mono s={{ fontSize: fs.body, lineHeight: 1.5, display: "block", marginTop: 8 }} c={CHALK}>
            <span style={{ ...mono, color: txt(ASH) }}>Today — </span>
            {l.current}
          </Mono>

          <List title="Sound" color={LIME} items={l.correct} />
          <List title="Flaws" color={RED} items={l.flaws} />

          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: `${LIME}10`, border: `1px solid ${LIME}33` }}>
            <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
              Redesign
            </Mono>
            <Mono s={{ fontSize: fs.body, lineHeight: 1.5, display: "block", marginTop: 4 }} c={CHALK}>
              {l.recommendation}
            </Mono>
          </div>
        </Card>
      ))}
    </div>
  );
}

function List({ title, color, items }: { title: string; color: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 4 }} c={color}>
        {title}
      </Mono>
      <ul style={{ margin: 0, paddingLeft: 16, listStyle: "none" }}>
        {items.map((it, i) => (
          <li key={i} style={{ marginBottom: 4, position: "relative" }}>
            <span style={{ position: "absolute", left: -14, color: txt(color) }}>›</span>
            <Mono s={{ fontSize: fs.body, lineHeight: 1.5 }} c={CHALK}>
              {it}
            </Mono>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Weaknesses() {
  const items = weaknessesByRank();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.md }}>
      <Mono s={{ fontSize: fs.body, lineHeight: 1.55, display: "block" }} c={ASH}>
        The top-level failings, ranked worst first. Each traces to a layer in the review and to a build-plan item that fixes it.
      </Mono>
      {items.map((w) => {
        const color = WEAKNESS_COLOR[w.severity];
        return (
          <Card key={w.rank} style={{ borderLeft: `3px solid ${color}`, display: "flex", gap: space.md, alignItems: "flex-start" }}>
            <div
              style={{
                ...disp,
                fontWeight: 800,
                fontSize: fs.heading,
                color: txt(color),
                minWidth: 28,
                lineHeight: 1.1,
              }}
            >
              {w.rank}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.ms, flexWrap: "wrap" }}>
                <div style={{ ...disp, fontWeight: 700, fontSize: fs.note }}>{w.title}</div>
                <Chip c={color}>{w.severity}</Chip>
              </div>
              <Mono s={{ fontSize: fs.body, lineHeight: 1.5, display: "block", marginTop: 6 }} c={CHALK}>
                {w.detail}
              </Mono>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function Redesign() {
  return (
    <div>
      <Mono s={{ fontSize: fs.body, lineHeight: 1.55, display: "block", marginBottom: 14 }} c={CHALK}>
        The blueprint, not the backlog: keep the clean pure core, but re-architect it around four pillars. The phased,
        effort-tagged version lives under Roadmap and Build plan.
      </Mono>
      <div style={{ display: "flex", flexDirection: "column", gap: space.md }}>
        {HPI_REVIEW.redesign.map((p, i) => (
          <Card key={p.id} style={{ borderLeft: `3px solid ${LIME}` }}>
            <div style={{ display: "flex", gap: space.md, alignItems: "baseline" }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle, color: txt(LIME), minWidth: 22 }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...disp, fontWeight: 700, fontSize: fs.note }}>{p.title}</div>
                <Mono s={{ fontSize: fs.body, lineHeight: 1.5, display: "block", marginTop: 4 }} c={CHALK}>
                  {p.summary}
                </Mono>
                <List title="Specifics" color={LIME} items={p.points} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Missing() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.ms }}>
      {HPI_REVIEW.missing.map((m) => (
        <Card key={m.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.ms }}>
            <div style={{ ...disp, fontWeight: 700, fontSize: fs.note }}>{m.title}</div>
            <Grade grade={m.evidence} />
          </div>
          <Mono s={{ fontSize: fs.body, lineHeight: 1.5, display: "block", marginTop: 6 }} c={CHALK}>
            {m.rationale}
          </Mono>
        </Card>
      ))}
    </div>
  );
}

function Model() {
  const HZ: Record<"core" | "extended" | "research", { label: string; color: string }> = {
    core: { label: "Core", color: LIME },
    extended: { label: "Extended", color: BLUE },
    research: { label: "Research", color: VIOLET },
  };
  return (
    <div>
      <Mono s={{ fontSize: fs.body, lineHeight: 1.55, display: "block", marginBottom: 14 }} c={CHALK}>
        Capacity becomes a latent-variable measurement model: observed tests load onto these constructs rather than
        being averaged into one opaque number. Readiness (daily state) stays separate from Capacity (slow-moving trait).
      </Mono>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: space.md }}>
        {HPI_REVIEW.latentModel.map((c) => (
          <Card key={c.id} style={{ borderTop: `2px solid ${HZ[c.horizon].color}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.xs }}>
              <div style={{ ...disp, fontWeight: 700, fontSize: fs.bodyLg }}>{c.title}</div>
              <Chip c={HZ[c.horizon].color}>{HZ[c.horizon].label}</Chip>
            </div>
            <Mono s={{ fontSize: fs.caption, lineHeight: 1.45, display: "block", marginTop: 6 }} c={ASH}>
              Indicators: {c.indicators}
            </Mono>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Roadmap() {
  const horizons: RoadmapItem["horizon"][] = ["now", "year1", "year3", "year10"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.lg }}>
      {horizons.map((h) => {
        const items = roadmapByHorizon(h);
        if (items.length === 0) return null;
        return (
          <div key={h}>
            <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 8 }} c={AMBER}>
              {HORIZON_META[h].label} · {items.length}
            </Mono>
            <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
              {items.map((it) => (
                <Card key={it.id}>
                  <div style={{ ...disp, fontWeight: 700, fontSize: fs.note }}>{it.title}</div>
                  <Mono s={{ fontSize: fs.body, lineHeight: 1.5, display: "block", marginTop: 5 }} c={CHALK}>
                    {it.detail}
                  </Mono>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Plan() {
  const buckets: ReviewPriority[] = ["must", "should", "nice", "experimental"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.lg }}>
      {buckets.map((p) => {
        const items = planByPriority(p);
        if (items.length === 0) return null;
        const m = PRIORITY_META[p];
        return (
          <div key={p}>
            <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 2 }} c={m.color}>
              {m.label} · {items.length}
            </Mono>
            <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 8 }} c={ASH}>
              {m.blurb}
            </Mono>
            <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
              {items.map((it) => (
                <Card key={it.id} style={{ borderLeft: `3px solid ${m.color}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space.ms }}>
                    <div style={{ ...disp, fontWeight: 700, fontSize: fs.bodyLg }}>{it.title}</div>
                    <span
                      style={{
                        ...mono,
                        fontSize: fs.micro,
                        color: txt(m.color),
                        border: `1px solid ${m.color}55`,
                        borderRadius: 6,
                        padding: "2px 7px",
                      }}
                    >
                      {it.effort}
                    </span>
                  </div>
                  <Mono s={{ fontSize: fs.body, lineHeight: 1.5, display: "block", marginTop: 5 }} c={CHALK}>
                    {it.detail}
                  </Mono>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
