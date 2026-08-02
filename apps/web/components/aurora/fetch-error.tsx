"use client";

import type { CSSProperties } from "react";
import { useLang } from "@/lib/i18n";

const C = (v: string) => `var(--color-${v})`;

/**
 * Distinct fetch-FAILURE card — separate from a genuine empty state so an
 * offline / 500 load never masquerades as "nothing here yet" (the reported
 * empty-state-on-failure bug). A soft Retry re-runs the query. Mirrors the
 * mobile <FetchError> so both clients speak one error voice.
 */
export default function FetchError({ onRetry, style }: { onRetry: () => void; style?: CSSProperties }) {
  const { t } = useLang();
  return (
    <div
      style={{
        background: C("ink2"),
        border: `1px solid ${C("line")}`,
        borderRadius: 28,
        boxShadow: "var(--shadow-card)",
        padding: "34px 20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        ...style,
      }}
    >
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 20, color: C("chalk") }}>{t("common.loadError")}</div>
      <div style={{ fontSize: 15, lineHeight: 1.5, color: C("ash"), marginTop: 8, maxWidth: 320 }}>{t("common.loadErrorHint")}</div>
      <button className="pressable"
        onClick={onRetry}
        style={{ marginTop: 16, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: "10px 28px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: C("chalk"), cursor: "pointer" }}
      >
        {t("common.retry")}
      </button>
    </div>
  );
}
