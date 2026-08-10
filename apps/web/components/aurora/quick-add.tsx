"use client";

import {
  macroDraft,
  quickAddDraft,
  PROVENANCE_KEY,
  type PickerAnswer,
  type QuickAddDraft,
  type QuickAddMatch,
} from "@hybrid/core";
import { fs } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";
import { IBarcode, IClose } from "./nutrition-kit";

const C = (v: string) => `var(--color-${v})`;

/**
 * THE PICKER FIELD (web) — the twin of apps/mobile/components/aurora/quick-add.tsx.
 *
 * This used to be quick add sitting ABOVE a database search: two inputs, ninety
 * pixels apart, in the same shape with the same left-hand glyph. It is now the
 * screen's ONE field, and quick add is what it does FIRST — the grammar still
 * runs over every keystroke (see core/food-picker.ts), so "40g protein" is still
 * a macro line and "chicken 200g" still resolves to two servings of this
 * athlete's chicken. What was lost is only the duplicate box, and the mono
 * caption underneath that explained how to use it: a field that needs a manual
 * is a field that is not finished, so the question moved into the placeholder.
 *
 * IT STILL SHOWS ITS WORKING. The interpretation is a ROW YOU TAP, never an
 * action already taken, so a phrase that resolved to the wrong chicken is a
 * visible mistake rather than a wrong entry found three days later in the diary.
 * And a gram phrase against a food with no serving weight on record opens the
 * portion editor instead of logging one serving of an unknown weight.
 *
 * The parent owns the text (it also drives the database search off it) and the
 * ANSWER — one read of the grammar, shared, so the field and the screen below it
 * can never disagree about what was typed.
 */

/** The field. The screen's one container; everything else is type on the ground. */
export function PickerField({ value, onChange, onSubmit, onScan }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  /** Point-and-scan, where the client has a camera for it. The browser does
   *  not (see the nutrition-barcode-camera capability, which is mobile-only and
   *  still waiting on a device check), so on web the glyph stays a HINT: a
   *  typed barcode is a perfectly good query, and the field takes one. */
  onScan?: () => void;
}) {
  const { t } = useLang();
  const typed = value.trim().length > 0;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, borderRadius: 16, padding: "13px 16px",
      // The screen's one container wears the glass film (the mobile twin drops
      // a native GlassSurface behind the same field): a light body under a
      // modest blur, identity at the rim — not the solid card fill.
      background: "rgba(var(--glass-base), 0.45)",
      WebkitBackdropFilter: "blur(14px) saturate(150%)",
      backdropFilter: "blur(14px) saturate(150%)",
      border: "1px solid transparent",
      boxShadow: "inset 0 1.5px 0 var(--inner-hi), inset 0 0 0 1px rgba(var(--text-rgb), 0.06)",
    }}>
      <AuroraIcon name="search" size={18} color={C("ash")} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
        placeholder={t("w.recovery.nutrition.pick.placeholder")}
        aria-label={t("w.recovery.nutrition.pick.placeholder")}
        style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontSize: fs.bodyLg }}
      />
      {typed ? (
        <button className="pressable" onClick={() => onChange("")} aria-label={t("w.recovery.nutrition.clear")} style={{ background: "none", border: "none", color: C("ash"), cursor: "pointer", display: "grid", placeItems: "center", padding: 0 }}>
          <IClose size={18} color={C("ash")} />
        </button>
      ) : onScan ? (
        // Scanning is the same question asked with a camera, so it stays the
        // field's trailing glyph rather than becoming a control of its own.
        <button className="pressable" onClick={onScan} aria-label={t("w.recovery.nutrition.scan.title")} style={{ background: "none", border: "none", color: C("ash"), cursor: "pointer", display: "grid", placeItems: "center", padding: 0 }}>
          <IBarcode size={20} color={C("ash")} />
        </button>
      ) : (
        <IBarcode size={20} color={C("ash")} />
      )}
    </div>
  );
}

/** WHAT IT UNDERSTOOD — the macro line, or the athlete's own foods ranked across
 *  all four sources. Each row says where it came from, because one list mixing
 *  four sources without saying so is worse than four lists, not better. */
export function Understood({ answer, entryName, onLog, onPortion }: {
  answer: PickerAnswer;
  entryName: string;
  onLog: (draft: QuickAddDraft) => void;
  onPortion: (match: QuickAddMatch) => void;
}) {
  const { t } = useLang();
  const rowStyle: React.CSSProperties = {
    width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
    background: "none", border: "none", borderBottom: `1px solid ${C("line")}`,
    padding: "12px 6px", cursor: "pointer", color: C("chalk"),
  };
  const tagStyle: React.CSSProperties = {
    flexShrink: 0, fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.nano,
    letterSpacing: ".1em", textTransform: "uppercase", color: C("ash"),
  };

  if (answer.kind === "macros") {
    const f = answer.macros.facts;
    const phrase = [
      f.kcal != null && !answer.macros.derivedKcal ? `${f.kcal} kcal` : null,
      f.protein != null ? `${f.protein} g ${t("w.recovery.nutrition.protein")}` : null,
      f.carbs != null ? `${f.carbs} g ${t("w.recovery.nutrition.carbs")}` : null,
      f.fat != null ? `${f.fat} g ${t("w.recovery.nutrition.fat")}` : null,
    ].filter(Boolean).join(", ") || `${f.kcal ?? 0} kcal`;
    return (
      <button className="pressable" onClick={() => onLog(macroDraft(answer.macros, entryName))} style={rowStyle}>
        <span style={{ width: 44, height: 44, borderRadius: 999, border: "1.6px solid var(--color-lime)", color: "var(--lime-text)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <AuroraIcon name="add" size={18} color="var(--lime-text)" />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.subtitle }}>
            {t("w.recovery.nutrition.qa.logMacros").replace("{v}", phrase)}
          </span>
          <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 3 }}>
            {answer.macros.derivedKcal ? `${f.kcal} kcal – ${t("w.recovery.nutrition.qa.derived")}` : `${f.kcal} kcal`}
          </span>
        </span>
      </button>
    );
  }

  if (answer.kind !== "matches" || answer.matches.length === 0) return null;

  return (
    <>
      {answer.matches.map((m) => (
        <button
          key={m.candidate.id}
          className="pressable"
          onClick={() => (m.needsPortion ? onPortion(m) : onLog(quickAddDraft(m)))}
          style={rowStyle}
        >
          <span style={{ width: 44, height: 44, borderRadius: 999, border: `1.6px solid ${m.needsPortion ? C("line") : "var(--color-lime)"}`, color: m.needsPortion ? C("ash") : "var(--lime-text)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <AuroraIcon name={m.needsPortion ? "chevron-down" : "add"} size={18} color={m.needsPortion ? C("ash") : "var(--lime-text)"} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.subtitle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {m.candidate.name}
            </span>
            {/* The QUANTITY it computed, stated — this is the number the reader
                is being asked to approve. */}
            {m.needsPortion ? (
              <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--amber-text)", marginTop: 3 }}>
                {t("w.recovery.nutrition.qa.needsPortion")}
              </span>
            ) : (
              <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 3 }}>
                {t("w.recovery.nutrition.qa.servings").replace("{n}", String(m.qty)).replace("{v}", m.candidate.servingLabel)}
                {"  –  "}
                {Math.round(m.candidate.facts.kcal * m.qty)} kcal
              </span>
            )}
          </span>
          <span style={tagStyle}>{t(PROVENANCE_KEY[m.candidate.source])}</span>
        </button>
      ))}
    </>
  );
}

/** The line the screen shows when nothing of the athlete's own matched — said
 *  once, above the database results, rather than as an error. */
export function NoneOfYours({ query }: { query: string }) {
  const { t } = useLang();
  return (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), padding: "14px 6px", lineHeight: 1.6 }}>
      {t("w.recovery.nutrition.pick.noneYours").replace("{v}", query)}
    </div>
  );
}
