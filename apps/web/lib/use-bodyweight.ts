"use client";

import { useEffect, useState } from "react";

// The athlete's CURRENT bodyweight (kg) — the newest /api/body entry (the
// Profile → Private → Body & progress log). Powers bodyweight-aware tonnage:
// 10 pull-ups at 70 kg BW = 700 kg of work (core effectiveSetLoadKg). Null for
// guests or before any weight is logged — every consumer degrades to the
// pre-bodyweight math, so nothing breaks without data.

export function useBodyweight(): number | null {
  const [kg, setKg] = useState<number | null>(null);
  useEffect(() => {
    let on = true;
    fetch("/api/body")
      .then((r) => (r.ok ? (r.json() as Promise<{ metrics?: { weightKg?: number | null }[] }>) : null))
      .then((d) => {
        if (!on) return;
        const w = d?.metrics?.[0]?.weightKg;
        setKg(typeof w === "number" && w > 0 ? w : null);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);
  return kg;
}
