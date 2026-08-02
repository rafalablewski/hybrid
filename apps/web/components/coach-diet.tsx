"use client";

import { useEffect, useState } from "react";
import { fs, space, LIME, ASH, CHALK, LINE, INK2, mono, Mono, Card } from "@/lib/ui";

type Diet = { kcal: string; protein: string; carbs: string; fat: string; note: string };
const EMPTY: Diet = { kcal: "", protein: "", carbs: "", fat: "", note: "" };

/**
 * Coach-assigned diet (daily macro targets) for one client — the nutrition
 * analogue of an assigned plan. The client sees it READ-ONLY on their Nutrition
 * screen. Shared by the classic + Aurora coach client-detail views. Soft-degrades
 * to an "enable it" note until reference/sql-coach-diet.sql is run.
 */
export default function CoachDiet({ linkId }: { linkId: string }) {
  const [d, setD] = useState<Diet>(EMPTY);
  const [unavailable, setUnavailable] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`/api/coach/links/${linkId}/diet`)
      .then((r) => r.json())
      .then((res: { diet?: { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; note: string | null } | null; unavailable?: boolean }) => {
        if (res.unavailable) setUnavailable(true);
        if (res.diet) setD({
          kcal: res.diet.kcal?.toString() ?? "",
          protein: res.diet.protein?.toString() ?? "",
          carbs: res.diet.carbs?.toString() ?? "",
          fat: res.diet.fat?.toString() ?? "",
          note: res.diet.note ?? "",
        });
      })
      .catch(() => {});
  }, [linkId]);

  const num = (s: string) => (s.trim() === "" ? undefined : Math.max(0, Number(s) || 0));
  const save = async () => {
    setMsg("");
    const r = await fetch(`/api/coach/links/${linkId}/diet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kcal: num(d.kcal), protein: num(d.protein), carbs: num(d.carbs), fat: num(d.fat), note: d.note.trim() || undefined }),
    });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Saved — your client sees it on Nutrition (read-only)." : (j.error || "Couldn't save."));
  };

  const field = (label: string, key: keyof Diet, unit: string) => (
    <div style={{ flex: "1 1 90px" }}>
      <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".08em", display: "block", marginBottom: 4 }} c={ASH}>{label}</Mono>
      <input
        value={d[key]}
        onChange={(e) => setD((p) => ({ ...p, [key]: e.target.value.replace(/[^0-9]/g, "") }))}
        inputMode="numeric"
        placeholder={unit}
        style={{ ...mono, fontSize: fs.bodyLg, width: "100%", padding: "9px 10px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none" }}
      />
    </div>
  );

  return (
    <Card style={{ borderLeft: `3px solid ${LIME}` }}>
      <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={LIME}>Assign diet – daily macros</Mono>
      <div style={{ display: "flex", gap: space.sm, marginTop: 10, flexWrap: "wrap" }}>
        {field("kcal", "kcal", "kcal")}
        {field("protein", "protein", "g")}
        {field("carbs", "carbs", "g")}
        {field("fat", "fat", "g")}
      </div>
      <input
        value={d.note}
        onChange={(e) => setD((p) => ({ ...p, note: e.target.value }))}
        placeholder="note (optional) — e.g. higher carbs on training days"
        style={{ ...mono, fontSize: fs.body, width: "100%", marginTop: 8, padding: "9px 10px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: space.ms, flexWrap: "wrap" }}>
        <button onClick={save} style={{ ...mono, fontSize: fs.body, fontWeight: 700, color: "#0c0d0c", background: LIME, border: "none", borderRadius: 10, padding: "9px 18px", cursor: "pointer" }}>
          Save diet
        </button>
        {msg && <div role="alert"><Mono s={{ fontSize: fs.caption }} c={LIME}>{msg}</Mono></div>}
      </div>
      {unavailable && (
        <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 10 }} c={ASH}>
          Diet assignment isn&apos;t enabled yet — run reference/sql-coach-diet.sql in Supabase.
        </Mono>
      )}
    </Card>
  );
}
