"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRevalidate } from "@/lib/use-invalidate";
import { computeCompliance, type LoggedSession } from "@hybrid/core";
import { useSession } from "@/lib/session";
import { fs, space,
  INK2, LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED, ON_ACCENT,
  disp, cond, mono, Mono, Card, Chip,
} from "@/lib/ui";

type Checkin = {
  id: string; weekOf: string; bodyMassKg: number | null;
  energy: number | null; sleep: number | null; soreness: number | null; mood: number | null;
  adherencePct: number | null; note: string | null; coachReply: string | null; repliedAt: string | null; createdAt: string;
  sharedWithCoach?: boolean;
};

const RATINGS: { key: "energy" | "sleep" | "soreness" | "mood"; label: string }[] = [
  { key: "energy", label: "Energy" }, { key: "sleep", label: "Sleep" }, { key: "soreness", label: "Soreness" }, { key: "mood", label: "Mood" },
];

const statusColor = (s: string) => (s === "on-plan" ? LIME : s === "over" ? AMBER : s === "no-plan" ? ASH : AMBER);

export default function Checkins({ sessions }: { sessions: LoggedSession[] }) {
  const revalidate = useRevalidate();
  // Sharing a check-in with a coach is a paid ("Full") feature — the server
  // coerces it false for free accounts, so gate the UI off the same entitlement.
  const isPaid = useSession().entitlement === "paid";
  const [history, setHistory] = useState<Checkin[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ bodyMassKg: "", energy: 3, sleep: 3, soreness: 3, mood: 3, adherencePct: "", note: "", sharedWithCoach: false });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/checkins");
      setHistory(res.ok ? ((await res.json()) as { checkins?: Checkin[] }).checkins ?? [] : []);
    } catch { setHistory([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const compliance = useMemo(() => computeCompliance(sessions, { targetPerWeek: 3 }), [sessions]);

  const submit = async () => {
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/checkins", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekOf: new Date().toISOString(),
          bodyMassKg: form.bodyMassKg ? parseFloat(form.bodyMassKg) : null,
          energy: form.energy, sleep: form.sleep, soreness: form.soreness, mood: form.mood,
          adherencePct: form.adherencePct ? parseInt(form.adherencePct, 10) : null,
          note: form.note || null,
          // honored only for paid accounts (server coerces it false otherwise)
          sharedWithCoach: isPaid && form.sharedWithCoach,
        }),
      });
      if (res.status === 401) { setError("Sign in to submit a check-in (demo mode doesn't persist)."); setSaving(false); return; }
      if (!res.ok) { setError(`Couldn't submit (HTTP ${res.status}). If this persists, the Checkin table may need creating — run reference/sql-checkin.sql.`); setSaving(false); return; }
      setForm({ bodyMassKg: "", energy: 3, sleep: 3, soreness: 3, mood: 3, adherencePct: "", note: "", sharedWithCoach: false });
      await load();
      // A check-in writes recovery + body-mass signals that drive the
      // Performance State / readiness on Today — invalidate those queries so the
      // dashboard revalidates instead of showing pre-check-in numbers.
      revalidate.recovery();
    } catch { setError("Network error — try again."); }
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>This week</Mono>
          <Chip c={statusColor(compliance.status)}>{compliance.status}</Chip>
        </div>
        <div style={{ ...disp, fontWeight: 800, fontSize: fs.display, marginTop: 6 }}>
          {compliance.completedThisWeek}<span style={{ color: ASH, fontSize: fs.title }}>/{compliance.target} sessions</span>
        </div>
        <Mono s={{ fontSize: fs.caption }}>{compliance.pct}% of plan · {compliance.compliantWeeks}-week compliance streak</Mono>

        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginTop: 20 }} c={BLUE}>
          Daily check-in · today
        </Mono>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 14 }}>
          {RATINGS.map((r) => (
            <div key={r.key}>
              <Mono s={{ fontSize: fs.micro, textTransform: "uppercase" }}>{r.label}</Mono>
              <div style={{ display: "flex", gap: space.xs, marginTop: 6 }}>
                {[1, 2, 3, 4, 5].map((n) => {
                  const sel = form[r.key] === n;
                  return (
                    <button key={n} onClick={() => setForm((s) => ({ ...s, [r.key]: n }))}
                      style={{ width: 36, height: 36, borderRadius: 18, cursor: "pointer", ...mono, fontSize: fs.body, color: sel ? LIME : ASH, border: `1px solid ${sel ? LIME : LINE}`, background: sel ? `${LIME}1a` : "transparent" }}>
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: space.ms, marginTop: 14 }}>
          <Field label="bodyweight (kg)" value={form.bodyMassKg} onChange={(v) => setForm((s) => ({ ...s, bodyMassKg: v }))} />
          <Field label="adherence (%)" value={form.adherencePct} onChange={(v) => setForm((s) => ({ ...s, adherencePct: v }))} />
        </div>
        <textarea
          value={form.note}
          onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
          placeholder="How did today go? Anything your coach should know…"
          rows={3}
          style={{ ...mono, fontSize: fs.bodyLg, width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none", resize: "vertical", marginTop: 12 }}
        />

        {/* Share with coach — paid ("Full") only. Free users see it locked. */}
        <button
          onClick={() => isPaid && setForm((s) => ({ ...s, sharedWithCoach: !s.sharedWithCoach }))}
          disabled={!isPaid}
          style={{
            display: "flex", alignItems: "center", gap: space.ms, width: "100%", textAlign: "left",
            marginTop: 12, padding: "10px 12px", borderRadius: 10, background: INK2,
            border: `1px solid ${form.sharedWithCoach && isPaid ? VIOLET : LINE}`,
            cursor: isPaid ? "pointer" : "default", opacity: isPaid ? 1 : 0.6,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 18, height: 18, borderRadius: 5, flexShrink: 0,
              border: `1px solid ${form.sharedWithCoach && isPaid ? VIOLET : LINE}`,
              background: form.sharedWithCoach && isPaid ? VIOLET : "transparent",
              color: ON_ACCENT, ...mono, fontSize: fs.body, lineHeight: "16px", textAlign: "center",
            }}
          >
            {form.sharedWithCoach && isPaid ? "✓" : ""}
          </span>
          <span style={{ flex: 1 }}>
            <Mono s={{ fontSize: fs.body, display: "block" }} c={CHALK}>Share with coach</Mono>
            <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 2 }} c={ASH}>
              {isPaid ? "Send today's check-in to your coach." : "Full plan — upgrade to share check-ins with a coach."}
            </Mono>
          </span>
          {!isPaid && <Chip c={VIOLET}>Full plan</Chip>}
        </button>

        {error && <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 8 }} c={RED}>{error}</Mono>}
        <button onClick={submit} disabled={saving}
          style={{ ...disp, fontWeight: 800, fontSize: fs.note, background: LIME, color: ON_ACCENT, border: "none", borderRadius: 12, padding: "12px 24px", marginTop: 12, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
          {saving ? "Submitting…" : "Submit check-in →"}
        </button>
      </Card>

      <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", display: "block", margin: "4px 0 8px" }} c={BLUE}>Check-in history</Mono>
      {history.length === 0 ? (
        <Mono s={{ fontSize: fs.body }}>No check-ins yet — submit today&apos;s above.</Mono>
      ) : (
        history.map((c) => (
          <Card key={c.id} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ ...disp, fontWeight: 600, fontSize: fs.note }}>{new Date(c.weekOf).toLocaleDateString()}</div>
              <div style={{ display: "flex", alignItems: "center", gap: space.sm }}>
                {c.sharedWithCoach && <Chip c={VIOLET}>shared</Chip>}
                {c.adherencePct != null && <Mono s={{ fontSize: fs.caption }}>{c.adherencePct}% adherence</Mono>}
              </div>
            </div>
            <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 6 }}>
              energy {c.energy ?? "—"} · sleep {c.sleep ?? "—"} · soreness {c.soreness ?? "—"} · mood {c.mood ?? "—"}
              {c.bodyMassKg != null ? ` · ${c.bodyMassKg}kg` : ""}
            </Mono>
            {c.note && <Mono s={{ fontSize: fs.bodyLg, lineHeight: 1.5, display: "block", marginTop: 6 }} c={CHALK}>{c.note}</Mono>}
            {c.coachReply && (
              <div style={{ marginTop: 10, borderLeft: `2px solid ${VIOLET}`, paddingLeft: 10 }}>
                <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>Coach</Mono>
                <Mono s={{ fontSize: fs.bodyLg, lineHeight: 1.5, display: "block", marginTop: 4 }} c={CHALK}>{c.coachReply}</Mono>
              </div>
            )}
          </Card>
        ))
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ flex: 1 }}>
      <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", display: "block", marginBottom: 4 }}>{label}</Mono>
      <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="numeric" placeholder="0"
        style={{ ...mono, fontSize: fs.bodyLg, width: "100%", boxSizing: "border-box", background: INK2, color: CHALK, border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 10px", outline: "none" }} />
    </div>
  );
}
