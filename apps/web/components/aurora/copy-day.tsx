"use client";

import { useMemo, useState } from "react";
import {
  copyDayPlan,
  copySources,
  type CopyableEntry,
  type CopyPlan,
  type CopySource,
} from "@hybrid/core";
import { fs } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";
import Sheet from "./sheet";

const C = (v: string) => `var(--color-${v})`;

/**
 * COPY A DAY (web) — the twin of apps/mobile/components/aurora/copy-day.tsx.
 *
 * TWO STEPS, AND THE SECOND ONE IS THE POINT. Picking a source day is not the
 * decision; committing to what it will do is. So the sheet shows the plan
 * before it writes it — item count, energy, and whether the target day already
 * has food on it — computed by the SAME @hybrid/core copyDayPlan that produces
 * the rows. The sentence the athlete agrees to and the entries that land cannot
 * disagree, because they are the same object.
 *
 * WHAT IT NEVER DOES is replace. Copying appends, the confirm step says so in
 * words when the target is not empty, and no existing entry is touched. A copy
 * that silently overwrote a day would destroy typed entries; one that silently
 * merged would produce a doubled day nobody ordered.
 *
 * The part chips narrow the copy to breakfast, or lunch, or the whole day —
 * "yesterday's breakfast" is the common case and should not require copying
 * yesterday's dinner too.
 */
export default function CopyDaySheet({
  open,
  onClose,
  logs,
  /** the day being copied INTO */
  to,
  /** localized label for the target day ("Today", "Tue 10 Mar") */
  toLabel,
  /** localized name for a part key */
  partLabel,
  onCopy,
  busy,
  message,
}: {
  open: boolean;
  onClose: () => void;
  logs: CopyableEntry[];
  to: string;
  toLabel: string;
  partLabel: (key: string) => string;
  onCopy: (plan: CopyPlan) => void;
  busy?: boolean;
  message?: string;
}) {
  const { t } = useLang();
  const [from, setFrom] = useState<string | null>(null);
  const [parts, setParts] = useState<string[] | null>(null); // null = whole day

  const sources = useMemo(() => copySources(logs, { to }), [logs, to]);
  const source = sources.find((s) => s.date === from) ?? null;
  const plan = useMemo(
    () => (from ? copyDayPlan(logs, { from, to, parts: parts ?? undefined }) : null),
    [logs, from, to, parts],
  );

  const mono = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em",
    textTransform: "uppercase", color: C("ash"), ...extra,
  });

  // A source label the athlete can recognise without doing date arithmetic.
  const sourceLabel = (s: CopySource) =>
    s.daysAgo === 1
      ? t("w.recovery.nutrition.copyYesterday")
      : t("w.recovery.nutrition.copyDaysAgo").replace("{n}", String(s.daysAgo));

  const close = () => { setFrom(null); setParts(null); onClose(); };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={t("w.recovery.nutrition.copyDay")}
      sub={t("w.recovery.nutrition.copyTo").replace("{v}", toLabel)}
    >
      {sources.length === 0 ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), lineHeight: 1.6, padding: "8px 2px" }}>
          {t("w.recovery.nutrition.copyNoSources")}
        </div>
      ) : (
        <>
          {/* STEP ONE — which day. Each row states what is actually on it, so
              the choice is made from content rather than from a bare date. */}
          <div style={mono()}>{t("w.recovery.nutrition.copyFrom")}</div>
          <div style={{ marginTop: 6 }}>
            {sources.map((s, i) => {
              const on = s.date === from;
              return (
                <button
                  key={s.date}
                  className="pressable"
                  onClick={() => { setFrom(s.date); setParts(null); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                    background: "none", border: "none", borderTop: i ? `1px solid ${C("line")}` : "none",
                    padding: "12px 2px", cursor: "pointer", color: C("chalk"),
                  }}
                >
                  <span style={{
                    width: 22, height: 22, borderRadius: 999, flexShrink: 0,
                    border: `2px solid ${on ? C("lime") : C("line")}`, background: on ? C("lime") : "transparent",
                    display: "grid", placeItems: "center",
                  }}>
                    {on && <AuroraIcon name="check" size={11} color="var(--on-accent)" />}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body }}>
                      {sourceLabel(s)}
                    </span>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 2 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("chalk"), fontVariantNumeric: "tabular-nums" }}>
                        {s.kcal} kcal
                      </span>
                      <span style={mono({ letterSpacing: 0, textTransform: "none" })}>
                        {t("w.recovery.nutrition.copyEntries").replace("{n}", String(s.entries))}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* STEP TWO — how much of it. Absent until a day is picked: parts of
              a day nobody has chosen are chips that mean nothing. */}
          {source && (
            <div style={{ marginTop: 18 }}>
              {/* No heading: the first chip IS the label ("Whole day"), and a
                  heading above it would name the row twice. */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <Chip label={t("w.recovery.nutrition.copyWhole")} on={parts === null} onClick={() => setParts(null)} />
                {source.parts.map((p) => (
                  <Chip
                    key={p}
                    label={partLabel(p)}
                    on={parts?.length === 1 && parts[0] === p}
                    onClick={() => setParts([p])}
                  />
                ))}
              </div>
            </div>
          )}

          {/* THE PLAN — stated before it happens. */}
          {plan && plan.entries.length > 0 && (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C("line")}` }}>
              <div style={{ ...mono({ textTransform: "none", letterSpacing: 0, fontSize: fs.caption }), lineHeight: 1.6 }}>
                {t("w.recovery.nutrition.copyTimes")}
                {plan.targetEntries > 0 && (
                  <>
                    <br />
                    <span style={{ color: "var(--amber-text)" }}>
                      {t("w.recovery.nutrition.copyAppends").replace("{n}", String(plan.targetEntries))}
                    </span>
                  </>
                )}
              </div>
              <button
                className="pressable"
                onClick={() => onCopy(plan)}
                disabled={busy}
                style={{
                  width: "100%", marginTop: 16, fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body,
                  background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999,
                  padding: 14, cursor: busy ? "default" : "pointer", opacity: busy ? .6 : 1,
                }}
              >
                {t("w.recovery.nutrition.copyConfirm")
                  .replace("{n}", String(plan.entries.length))
                  .replace("{kcal}", String(plan.kcal))}
              </button>
            </div>
          )}
        </>
      )}

      {message && (
        <div style={{ ...mono({ color: "var(--lime-text)", textTransform: "none", letterSpacing: 0, fontSize: fs.caption }), marginTop: 14, padding: "0 2px" }}>
          {message}
        </div>
      )}
    </Sheet>
  );
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      className="pressable"
      onClick={onClick}
      aria-pressed={on}
      style={{
        fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase",
        fontWeight: on ? 700 : 500,
        background: on ? C("lime") : "transparent",
        color: on ? "var(--on-accent)" : C("ash"),
        border: `1px solid ${on ? C("lime") : C("line")}`,
        borderRadius: 999, padding: "8px 14px", cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}
