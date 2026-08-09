"use client";

import { useMemo, useState } from "react";
import {
  macroDraft,
  parseQuickAdd,
  quickAddDraft,
  quickAddVocab,
  resolveQuickAdd,
  type QuickAddCandidate,
  type QuickAddDraft,
  type QuickAddMatch,
} from "@hybrid/core";
import { fs } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";

const C = (v: string) => `var(--color-${v})`;

/**
 * QUICK ADD (web) — the twin of apps/mobile/components/aurora/quick-add.tsx.
 *
 * One field, parsed live by @hybrid/core. It sits at the top of the food picker
 * rather than behind a new screen, because a control whose whole promise is
 * speed cannot be reached through navigation.
 *
 * ── IT SHOWS ITS WORKING ──────────────────────────────────────────────────
 * A parser that acts on an interpretation the user never saw is a guessing
 * machine. So the field renders WHAT IT UNDERSTOOD as a row you tap — the food
 * it matched, the quantity it computed, the macros it read — and does nothing
 * until you tap it. "chicken 200g" resolving to the wrong chicken is then a
 * visible mistake, not a wrong entry discovered three days later in the diary.
 *
 * ── AN UNCONVERTIBLE QUANTITY OPENS THE PORTION EDITOR ────────────────────
 * Grams only become servings when the food's serving weight is on record. When
 * it is not, the engine flags `needsPortion` and the row says so and routes to
 * the editor rather than logging 1 serving of an unknown weight.
 *
 * It searches the athlete's OWN foods only — never the network. A quick add
 * that waited on a request would not be quick, and "chicken" should resolve to
 * the chicken this athlete eats, not to a stranger's guess.
 */
export default function QuickAdd({
  candidates,
  onLog,
  onPortion,
  entryName,
}: {
  /** the athlete's own foods: recents, products, saved meals */
  candidates: QuickAddCandidate[];
  /** commit a draft to the diary */
  onLog: (draft: QuickAddDraft) => void;
  /** open the portion editor for a match whose quantity could not be computed */
  onPortion: (match: QuickAddMatch) => void;
  /** localized name for a macro-only entry ("Quick entry") */
  entryName: string;
}) {
  const { t } = useLang();
  const [text, setText] = useState("");

  // The vocabulary is the athlete's language, not English — see quick-add.ts.
  const vocab = useMemo(() => quickAddVocab(t), [t]);
  const parsed = useMemo(() => parseQuickAdd(text, vocab), [text, vocab]);
  const matches = useMemo(() => resolveQuickAdd(parsed, candidates), [parsed, candidates]);

  const typed = text.trim().length > 0;
  const mono = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em",
    textTransform: "uppercase", color: C("ash"), ...extra,
  });

  const commit = (draft: QuickAddDraft) => { onLog(draft); setText(""); };

  // The macro line, spelled back in the athlete's own terms.
  const macroPhrase = parsed.kind === "macros"
    ? [
        parsed.facts.kcal != null ? `${parsed.facts.kcal} kcal` : null,
        parsed.facts.protein != null ? `${parsed.facts.protein} g ${t("w.recovery.nutrition.protein")}` : null,
        parsed.facts.carbs != null ? `${parsed.facts.carbs} g ${t("w.recovery.nutrition.carbs")}` : null,
        parsed.facts.fat != null ? `${parsed.facts.fat} g ${t("w.recovery.nutrition.fat")}` : null,
      ].filter(Boolean).join(", ")
    : "";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 16px" }}>
        <AuroraIcon name="bolt" size={17} color={C("ash")} />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter commits the FIRST interpretation, which is the one on
            // screen — never a second-best the reader cannot see.
            if (e.key !== "Enter") return;
            if (parsed.kind === "macros") commit(macroDraft(parsed, entryName));
            else if (matches[0] && !matches[0].needsPortion) commit(quickAddDraft(matches[0]));
            else if (matches[0]) onPortion(matches[0]);
          }}
          placeholder={t("w.recovery.nutrition.qa.placeholder")}
          aria-label={t("w.recovery.nutrition.qa.hint")}
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontSize: fs.bodyLg }}
        />
        {typed && (
          <button className="pressable" onClick={() => setText("")} aria-label={t("w.recovery.nutrition.clear")} style={{ background: "none", border: "none", color: C("ash"), cursor: "pointer", fontSize: 17, lineHeight: 1 }}>×</button>
        )}
      </div>

      {!typed && (
        <div style={{ ...mono({ textTransform: "none", letterSpacing: 0 }), marginTop: 8, lineHeight: 1.5 }}>
          {t("w.recovery.nutrition.qa.hint")}
        </div>
      )}

      {/* WHAT IT UNDERSTOOD — a row you tap, never an action already taken. */}
      {typed && parsed.kind === "macros" && (
        <button
          className="pressable"
          onClick={() => commit(macroDraft(parsed, entryName))}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: "none", border: "none", borderTop: `1px solid ${C("line")}`, padding: "14px 2px 4px", marginTop: 10, cursor: "pointer", color: C("chalk") }}
        >
          <span style={{ width: 34, height: 34, borderRadius: 999, border: "1.6px solid var(--color-lime)", color: "var(--lime-text)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <AuroraIcon name="add" size={15} color="var(--lime-text)" />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body }}>
              {t("w.recovery.nutrition.qa.logMacros").replace("{v}", macroPhrase)}
            </span>
            {parsed.derivedKcal && (
              <span style={{ ...mono({ textTransform: "none", letterSpacing: 0 }), display: "block", marginTop: 2 }}>
                {t("w.recovery.nutrition.qa.derived")}
              </span>
            )}
          </span>
        </button>
      )}

      {typed && parsed.kind === "food" && (
        matches.length === 0 ? (
          <div style={{ ...mono({ textTransform: "none", letterSpacing: 0, fontSize: fs.caption }), marginTop: 12, padding: "0 2px", lineHeight: 1.6 }}>
            {t("w.recovery.nutrition.qa.noMatch")}
          </div>
        ) : (
          <div style={{ marginTop: 10 }}>
            {matches.map((m, i) => (
              <button
                key={m.candidate.id}
                className="pressable"
                onClick={() => (m.needsPortion ? onPortion(m) : commit(quickAddDraft(m)))}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: "none", border: "none", borderTop: `1px solid ${C("line")}`, padding: "12px 2px", cursor: "pointer", color: C("chalk") }}
              >
                <span style={{ width: 34, height: 34, borderRadius: 999, border: `1.6px solid ${m.needsPortion ? C("line") : "var(--color-lime)"}`, color: m.needsPortion ? C("ash") : "var(--lime-text)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <AuroraIcon name={m.needsPortion ? "chevron-down" : "add"} size={15} color={m.needsPortion ? C("ash") : "var(--lime-text)"} style={m.needsPortion ? { transform: "rotate(-90deg)" } : undefined} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: i === 0 ? 700 : 600, fontSize: fs.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.candidate.name}
                  </span>
                  {/* The QUANTITY it computed, stated — this is the number the
                      reader is being asked to approve. */}
                  {m.needsPortion ? (
                    <span style={{ ...mono({ textTransform: "none", letterSpacing: 0, color: "var(--amber-text)" }), display: "block", marginTop: 2 }}>
                      {t("w.recovery.nutrition.qa.needsPortion")}
                    </span>
                  ) : (
                    <span style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 2 }}>
                      <span style={mono({ textTransform: "none", letterSpacing: 0 })}>
                        {t("w.recovery.nutrition.qa.servings").replace("{n}", String(m.qty)).replace("{v}", m.candidate.servingLabel)}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("chalk"), fontVariantNumeric: "tabular-nums" }}>
                        {Math.round(m.candidate.facts.kcal * m.qty)} kcal
                      </span>
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}
