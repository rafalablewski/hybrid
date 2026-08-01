import type { Metadata } from "next";
import Link from "next/link";
import { computeEfficacyIndex } from "@/lib/efficacy";

// The public Program Efficacy Index — programs ranked by MEASURED outcome.
// The one page in fitness a competitor cannot write, because it requires the
// data: median 12-week e1RM change per program, with n, adherence and dropout,
// recomputed from the live database on every visit. No account needed; every
// number is a k-anonymous aggregate (cohorts under 5 athletes are suppressed).

export const metadata: Metadata = {
  title: "Programs ranked by measured outcome – HYBRID",
  description:
    "The Program Efficacy Index: training programs ranked by the strength they actually produced — median 12-week e1RM change, adherence and dropout, measured from real training logs.",
};

const wrap: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "48px 22px 96px",
  color: "#eae3d4",
  background: "#0c0d0c",
  minHeight: "100vh",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  lineHeight: 1.65,
  fontSize: 16,
};
const h1: React.CSSProperties = { fontSize: 30, fontWeight: 800, margin: "0 0 6px" };
const muted: React.CSSProperties = { color: "#8b8f86", fontSize: 14 };
const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 13,
};
const cardStyle: React.CSSProperties = {
  border: "1px solid #23251f",
  borderRadius: 14,
  padding: "18px 18px 16px",
  marginTop: 14,
  background: "#111310",
};

const pct = (f: number) => `${f >= 0 ? "+" : ""}${(f * 100).toFixed(1)}%`;
const DISCIPLINE_LABEL: Record<string, string> = {
  "strength-percent": "Strength (%1RM)",
  hypertrophy: "Hypertrophy",
  endurance: "Endurance",
  conditioning: "Conditioning",
};

export default async function ProgramsPage() {
  const index = await computeEfficacyIndex();
  const measured = index.rows.filter((r) => r.card);

  return (
    <main style={wrap}>
      <p style={muted}>
        <Link href="/" style={{ color: "#c6f84f" }}>
          ← HYBRID
        </Link>
      </p>
      <h1 style={h1}>Programs, ranked by measured outcome</h1>
      <p style={muted}>
        Updated {new Date(index.updatedAt).toISOString().slice(0, 10)} — recomputed automatically as
        athletes finish their 12-week windows
      </p>

      <p style={{ marginTop: 20 }}>
        Program selection is the highest-stakes decision a lifter makes, and it is usually made on
        vibes. This index makes it checkable: every program in the HYBRID library carries the
        strength it actually produced for the athletes who ran it — the median change in estimated
        1RM across a standard 12-week window, alongside how many athletes that claim rests on, how
        closely they followed the program, and how many stopped.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, margin: "30px 0 4px" }}>How it is measured</h2>
      <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
        <li style={{ margin: "6px 0" }}>
          <b>Outcome</b> — per athlete, per lift: best estimated 1RM in the window&rsquo;s first
          three weeks vs its last three. A program&rsquo;s figure is the <b>median</b> across its
          athletes, so one outlier PR cannot buy a ranking.
        </li>
        <li style={{ margin: "6px 0" }}>
          <b>Adherence</b> — days actually trained against days the program prescribes.
        </li>
        <li style={{ margin: "6px 0" }}>
          <b>Dropout</b> — an athlete whose last logged session lands before week 8 counts as a
          dropout, and the rate is published with the result.
        </li>
        <li style={{ margin: "6px 0" }}>
          <b>Privacy</b> — every figure is an aggregate over at least 5 athletes; smaller cohorts
          are suppressed, never estimated.
        </li>
      </ul>

      {measured.length === 0 && (
        <div style={{ ...cardStyle, borderStyle: "dashed" }}>
          <p style={{ margin: 0 }}>
            <b>The index is collecting its first evidence.</b> Every program below publishes its
            card automatically once five or more athletes have completed a 12-week window on it —
            no editor, no curation, just the logs. Run one and be part of the first cohort.
          </p>
        </div>
      )}

      {index.rows.map((r, i) => (
        <section key={r.planId} style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
              {r.card ? `${i + 1}. ` : ""}
              {r.name}
            </h3>
            <span style={{ ...mono, color: "#8b8f86" }}>
              {r.goalName} — {DISCIPLINE_LABEL[r.discipline] ?? r.discipline} — {r.weeks} wk
            </span>
          </div>
          {r.card ? (
            <>
              <p style={{ margin: "10px 0 0", fontSize: 22, fontWeight: 800, color: "#c6f84f" }}>
                {pct(r.card.medianDeltaPct)}{" "}
                <span style={{ fontSize: 13, fontWeight: 400, color: "#8b8f86" }}>
                  median e1RM change over 12 weeks (n={r.card.n})
                </span>
              </p>
              <p style={{ ...mono, color: "#8b8f86", margin: "8px 0 0" }}>
                adherence {(r.card.medianAdherence * 100).toFixed(0)}% (median) — dropout{" "}
                {(r.card.dropoutRate * 100).toFixed(0)}% of {r.card.enrolled} enrolled
              </p>
              {r.card.lifts.length > 0 && (
                <p style={{ margin: "10px 0 0", fontSize: 14 }}>
                  {r.card.lifts
                    .slice(0, 4)
                    .map((l) => `${l.lift} ${pct(l.medianDeltaPct)} (${l.medianDeltaKg >= 0 ? "+" : ""}${l.medianDeltaKg.toFixed(1)} kg, n=${l.n})`)
                    .join(" — ")}
                </p>
              )}
              {r.card.byAdherence.length > 1 && (
                <p style={{ ...mono, color: "#8b8f86", margin: "8px 0 0" }}>
                  by adherence:{" "}
                  {r.card.byAdherence.map((b) => `${b.band} ${pct(b.medianDeltaPct)} (n=${b.n})`).join(" — ")}
                </p>
              )}
            </>
          ) : (
            <p style={{ margin: "10px 0 0", color: "#8b8f86" }}>
              Collecting evidence — this card publishes itself once 5+ athletes complete a 12-week
              window on this program.
            </p>
          )}
        </section>
      ))}

      <p style={{ ...muted, marginTop: 40 }}>
        Rankings are computed from real training logs, never edited by hand. Endurance programs
        will carry a pace-based outcome in a future revision; until then they appear as
        collecting. The raw dataset behind this page is served at{" "}
        <Link href="/api/efficacy" style={{ color: "#c6f84f" }}>
          /api/efficacy
        </Link>
        .
      </p>
    </main>
  );
}
