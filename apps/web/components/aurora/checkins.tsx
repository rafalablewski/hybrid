"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { computeCompliance, type LoggedSession } from "@hybrid/core";
import { useSession } from "@/lib/session";
import { AuroraIcon } from "./icons";

type Checkin = {
  id: string; weekOf: string; bodyMassKg: number | null;
  energy: number | null; sleep: number | null; soreness: number | null; mood: number | null;
  adherencePct: number | null; note: string | null; coachReply: string | null; repliedAt: string | null; createdAt: string;
  sharedWithCoach?: boolean;
};

const RATINGS: { key: "energy" | "sleep" | "soreness" | "mood"; label: string }[] = [
  { key: "energy", label: "Energy" }, { key: "sleep", label: "Sleep" }, { key: "soreness", label: "Soreness" }, { key: "mood", label: "Mood" },
];

/** AURORA Check-in (web) — bespoke rounded layout, same compliance + /api/checkins
 *  flow as the classic. */
export default function AuroraCheckins({ sessions }: { sessions: LoggedSession[] }) {
  const isPaid = useSession().entitlement === "paid";
  const [history, setHistory] = useState<Checkin[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ bodyMassKg: "", energy: 3, sleep: 3, soreness: 3, mood: 3, adherencePct: "", note: "", sharedWithCoach: false });
  const C = (v: string) => `var(--color-${v})`;

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
          sharedWithCoach: isPaid && form.sharedWithCoach,
        }),
      });
      if (res.status === 401) { setError("Sign in to submit a check-in (demo mode doesn't persist)."); setSaving(false); return; }
      if (!res.ok) { setError(`Couldn't submit (HTTP ${res.status}).`); setSaving(false); return; }
      setForm({ bodyMassKg: "", energy: 3, sleep: 3, soreness: 3, mood: 3, adherencePct: "", note: "", sharedWithCoach: false });
      await load();
    } catch { setError("Network error — try again."); }
    setSaving(false);
  };

  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, padding: 22 } as const;
  const numField = { fontFamily: "var(--font-mono)", fontSize: 14, width: "100%", boxSizing: "border-box" as const, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 14, padding: "13px 14px", outline: "none" };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h1 style={{ fontWeight: 900, fontSize: 26, margin: 0 }}>Daily check-in</h1>
        <span style={{ marginLeft: "auto" }}><AuroraIcon name="heart" size={24} color={C("red")} /></span>
      </div>

      <div style={{ ...card, marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: C("lime") }}>This week</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash") }}>{compliance.status}</span>
        </div>
        <div style={{ fontWeight: 900, fontSize: 28, marginTop: 6 }}>
          {compliance.completedThisWeek}<span style={{ color: C("ash"), fontSize: 18 }}>/{compliance.target} sessions</span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash") }}>{compliance.pct}% of plan · {compliance.compliantWeeks}-week streak</div>

        {RATINGS.map((r) => (
          <div key={r.key} style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{r.label}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const sel = form[r.key] === n;
                return (
                  <button key={n} onClick={() => setForm((s) => ({ ...s, [r.key]: n }))}
                    style={{ flex: 1, height: 46, borderRadius: 999, cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: sel ? C("ink") : C("ash"), border: `1px solid ${sel ? C("lime") : C("line")}`, background: sel ? C("lime") : "transparent" }}>
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <input value={form.bodyMassKg} onChange={(e) => setForm((s) => ({ ...s, bodyMassKg: e.target.value }))} inputMode="numeric" placeholder="Weight kg" style={numField} />
          <input value={form.adherencePct} onChange={(e) => setForm((s) => ({ ...s, adherencePct: e.target.value }))} inputMode="numeric" placeholder="Adherence %" style={numField} />
        </div>
        <textarea value={form.note} onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))} placeholder="How did today go? Anything your coach should know…" rows={3}
          style={{ ...numField, resize: "vertical", marginTop: 12 }} />

        <button onClick={() => isPaid && setForm((s) => ({ ...s, sharedWithCoach: !s.sharedWithCoach }))} disabled={!isPaid}
          style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", marginTop: 14, padding: 14, borderRadius: 14, background: form.sharedWithCoach && isPaid ? "rgba(201,169,240,.10)" : "transparent", border: `1px solid ${form.sharedWithCoach && isPaid ? C("violet") : C("line")}`, cursor: isPaid ? "pointer" : "default", opacity: isPaid ? 1 : 0.6, color: C("chalk") }}>
          <AuroraIcon name={form.sharedWithCoach && isPaid ? "check" : "lock"} size={20} color={form.sharedWithCoach && isPaid ? C("violet") : C("ash")} />
          <span style={{ flex: 1 }}>
            <span style={{ fontWeight: 700, fontSize: 13, display: "block" }}>Share with coach</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), display: "block", marginTop: 2 }}>
              {isPaid ? "Send today's check-in to your coach." : "Full plan — upgrade to share check-ins with a coach."}
            </span>
          </span>
        </button>

        {error && <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("red"), marginTop: 8 }}>{error}</div>}
        <button onClick={submit} disabled={saving}
          style={{ width: "100%", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 16, background: C("lime"), color: C("ink"), border: "none", borderRadius: 999, padding: 16, marginTop: 14, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
          {saving ? "Submitting…" : "Submit check-in"}
        </button>
      </div>

      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: C("blue"), margin: "18px 0 10px" }}>Check-in history</div>
      {history.length === 0 ? (
        <div style={{ fontSize: 13, color: C("ash") }}>No check-ins yet — submit today&apos;s above.</div>
      ) : (
        history.map((c) => (
          <div key={c.id} style={{ ...card, padding: 18, marginBottom: 11 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{new Date(c.weekOf).toLocaleDateString()}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {c.sharedWithCoach && <span style={{ background: "rgba(201,169,240,.14)", color: C("violet"), borderRadius: 999, padding: "2px 10px", fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase" }}>shared</span>}
                {c.adherencePct != null && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash") }}>{c.adherencePct}% adherence</span>}
              </div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash"), marginTop: 6 }}>
              energy {c.energy ?? "—"} · sleep {c.sleep ?? "—"} · soreness {c.soreness ?? "—"} · mood {c.mood ?? "—"}{c.bodyMassKg != null ? ` · ${c.bodyMassKg}kg` : ""}
            </div>
            {c.note && <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 6 }}>{c.note}</div>}
            {c.coachReply && (
              <div style={{ marginTop: 10, borderLeft: `2px solid ${C("violet")}`, paddingLeft: 10 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C("violet") }}>Coach</div>
                <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 4 }}>{c.coachReply}</div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
