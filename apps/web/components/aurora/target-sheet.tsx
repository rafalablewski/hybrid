"use client";

import { useEffect, useState } from "react";
import {
  TARGET_FIELDS,
  cleanTargetOverride,
  hasOverride,
  type MacroTargets,
  type TargetField,
  type TargetOverride,
} from "@hybrid/core";
import { fs } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import Sheet from "./sheet";

const C = (v: string) => `var(--color-${v})`;

/**
 * MANUAL TARGETS (web) — the twin of apps/mobile/components/aurora/target-sheet.tsx.
 *
 * FOUR BOXES, AND AN EMPTY ONE MEANS SOMETHING. Leaving a field blank is not
 * "zero" and not "unset" — it means that figure keeps adapting, and the
 * placeholder shows what the engine currently computes for it, so the athlete
 * can see the number they are choosing to leave alone. That is why the fields
 * are not pre-filled with the adaptive values: pre-filling would silently
 * convert every figure into a manual one the moment anybody opened this sheet.
 *
 * The mismatch line is rendered by the CALLER, on the screen where the targets
 * actually live, rather than here — a contradiction between the four numbers is
 * a standing fact about the athlete's setup, not a note about this form.
 */
export default function TargetSheet({
  open,
  onClose,
  /** what the engine computes today, for the placeholders */
  adaptive,
  /** what is currently overridden */
  override,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  adaptive: MacroTargets;
  override: TargetOverride | null;
  /** null clears the override entirely and hands the numbers back */
  onSave: (next: TargetOverride | null) => void;
}) {
  const { t } = useLang();
  const [form, setForm] = useState<Record<TargetField, string>>({ kcal: "", protein: "", carbs: "", fat: "" });
  const [fuel, setFuel] = useState(true);

  // Re-seed on every open: the sheet edits what is SAVED, and a stale draft
  // from a cancelled edit must not be what the athlete sees next time.
  useEffect(() => {
    if (!open) return;
    setForm({
      kcal: override?.kcal != null ? String(override.kcal) : "",
      protein: override?.protein != null ? String(override.protein) : "",
      carbs: override?.carbs != null ? String(override.carbs) : "",
      fat: override?.fat != null ? String(override.fat) : "",
    });
    setFuel(override?.trainingFuel !== false);
  }, [open, override]);

  const label: Record<TargetField, string> = {
    kcal: t("w.recovery.nutrition.calories"),
    protein: t("w.recovery.nutrition.protein"),
    carbs: t("w.recovery.nutrition.carbs"),
    fat: t("w.recovery.nutrition.fat"),
  };
  const unit: Record<TargetField, string> = { kcal: "kcal", protein: "g", carbs: "g", fat: "g" };
  const tint: Record<TargetField, string> = {
    kcal: "var(--lime-text)", protein: "var(--blue-text)", carbs: "var(--amber-text)", fat: "var(--violet-text)",
  };

  const save = () => {
    const ov = cleanTargetOverride({ ...form, trainingFuel: fuel });
    // Every box emptied IS a clear — see the prefs route's note.
    onSave(hasOverride(ov) ? ov : null);
    onClose();
  };

  const mono = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em",
    textTransform: "uppercase", color: C("ash"), ...extra,
  });

  return (
    <Sheet open={open} onClose={onClose} title={t("w.recovery.nutrition.tg.title")} sub={t("w.recovery.nutrition.tg.sub")}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {TARGET_FIELDS.map((f) => (
          <label
            key={f}
            style={{ display: "flex", alignItems: "center", gap: 12, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 16px" }}
          >
            <span style={{ ...mono({ color: tint[f] }), flex: 1 }}>{label[f]}</span>
            <input
              value={form[f]}
              onChange={(e) => setForm((s) => ({ ...s, [f]: e.target.value }))}
              inputMode="numeric"
              // The placeholder is the ADAPTIVE figure — the number the athlete
              // is choosing to leave alone by leaving the box empty.
              placeholder={t("w.recovery.nutrition.tg.placeholder").replace("{v}", String(adaptive[f]))}
              aria-label={label[f]}
              style={{ width: 132, minWidth: 0, border: "none", outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.bodyLg, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
            />
            <span style={{ ...mono(), width: 30 }}>{unit[f]}</span>
          </label>
        ))}
      </div>

      {/* The training bump survives a manual target by default — the app's
          whole thesis is eating for the work done. */}
      <button
        className="pressable"
        onClick={() => setFuel((v) => !v)}
        aria-pressed={fuel}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: "none", border: "none", padding: "16px 2px 0", marginTop: 4, cursor: "pointer", color: C("chalk") }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body }}>
            {t("w.recovery.nutrition.tg.fuel")}
          </span>
          <span style={{ ...mono({ textTransform: "none", letterSpacing: 0 }), display: "block", marginTop: 3, lineHeight: 1.5 }}>
            {t("w.recovery.nutrition.tg.fuelSub")}
          </span>
        </span>
        <span style={{ width: 46, height: 28, borderRadius: 999, flexShrink: 0, background: fuel ? C("lime") : C("line"), display: "flex", alignItems: "center", padding: 3, transition: "background .18s ease" }}>
          <span style={{ width: 22, height: 22, borderRadius: 999, background: fuel ? "var(--on-accent)" : C("ash"), transform: `translateX(${fuel ? 18 : 0}px)`, transition: "transform .18s cubic-bezier(.4,0,.2,1)" }} />
        </span>
      </button>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
        <button
          className="pressable"
          onClick={save}
          style={{ width: "100%", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: 14, cursor: "pointer" }}
        >
          {t("w.recovery.nutrition.tg.save")}
        </button>
        {hasOverride(override) && (
          <button
            className="pressable"
            onClick={() => { onSave(null); onClose(); }}
            style={{ width: "100%", background: "none", border: "none", padding: 8, cursor: "pointer", ...mono() }}
          >
            {t("w.recovery.nutrition.tg.clear")}
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** The one-line contradiction notice. Rendered where the TARGETS live, not
 *  inside the form, because a mismatch is a standing fact about the athlete's
 *  setup rather than feedback about an edit. */
export function TargetMismatchLine({ macroKcal, deltaKcal }: { macroKcal: number; deltaKcal: number }) {
  const { t } = useLang();
  const key = deltaKcal > 0 ? "w.recovery.nutrition.tg.mismatchOver" : "w.recovery.nutrition.tg.mismatchUnder";
  return (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: "var(--amber-text)", marginTop: 10, lineHeight: 1.6, padding: "0 2px" }}>
      {t(key).replace("{n}", String(macroKcal)).replace("{d}", `${Math.abs(deltaKcal)} kcal`)}
      <br />
      <span style={{ color: C("ash") }}>{t("w.recovery.nutrition.tg.mismatchNote")}</span>
    </div>
  );
}
