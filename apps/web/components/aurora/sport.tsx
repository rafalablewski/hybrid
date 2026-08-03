"use client";

import { useMemo, useState } from "react";
import { ago, fs, searchSports, space, sportIndex, sportIndexMeta, type SportIndexEntry } from "@hybrid/core";
import { useSessions } from "@/lib/use-sessions";
import { useLang } from "@/lib/i18n";
import { HeroScreen } from "./hero";

const C = (v: string) => `var(--color-${v})`;
const mono = (size: number, color = C("ash")) => ({ fontFamily: "var(--font-mono)", fontSize: size, color }) as const;
const label = (color = C("ash")) => ({ ...mono(fs.micro, color), letterSpacing: ".12em", textTransform: "uppercase" as const });

/**
 * AURORA Sport — the INDEX.
 *
 * This screen used to BE the sport experience: a chip picker over one shared
 * body, so a sport was a filter rather than a place. Now every sport has its own
 * page (sport-page.tsx) and this is the list that lifts into it — the sports the
 * athlete actually trains first, then the ones the app can prescribe strength
 * for, with the rest of the catalog behind the search field so all 65 have an
 * address without 65 rows on one screen.
 *
 * The mobile twin is apps/mobile/components/aurora/sport.tsx.
 */
export default function AuroraSport({ onOpen }: { onOpen?: (sport: string) => void }) {
  const { t } = useLang();
  const { sessions } = useSessions();
  const [query, setQuery] = useState("");

  const { yours, prescribable } = useMemo(() => sportIndex(sessions), [sessions]);
  const results = useMemo(() => (query.trim() ? searchSports(query) : []), [query]);

  const Row = ({ e, last, showTransfer = true }: { e: SportIndexEntry; last: boolean; showTransfer?: boolean }) => (
    <button
      className="pressable"
      onClick={() => onOpen?.(e.name)}
      aria-label={t("w.train.sportPage.openSport").replace("{sport}", e.name)}
      style={{
        display: "flex", alignItems: "center", gap: space.md, width: "100%", textAlign: "left",
        padding: `${space.md}px 0`, background: "none", border: "none",
        borderBottom: last ? "none" : `1px solid ${C("line")}`, color: C("chalk"), cursor: "pointer",
      }}
    >
      <span aria-hidden style={{ fontSize: 24, lineHeight: 1 }}>{e.icon}</span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontSize: fs.bodyLg, fontWeight: 700, letterSpacing: "-.01em" }}>{e.name}</span>
        <span style={{ ...mono(fs.micro), display: "block", marginTop: 3 }}>
          {e.efforts > 0
            ? `${t("w.train.sportPage.effortsMeta").replace("{n}", String(e.efforts))}${e.lastAt ? ` – ${ago(e.lastAt)}` : ""}`
            : sportIndexMeta(e)}
        </span>
      </span>
      {e.hasTransfer && showTransfer && <span style={{ ...label(C("lime")), fontSize: fs.nano, whiteSpace: "nowrap" }}>{t("w.train.sportPage.transfer")}</span>}
      <span aria-hidden style={{ ...mono(fs.body), marginLeft: space.xs }}>→</span>
    </button>
  );

  const Group = ({ title, meta, list, showTransfer = true }: { title: string; meta?: string; list: SportIndexEntry[]; showTransfer?: boolean }) =>
    list.length === 0 ? null : (
      <div style={{ marginTop: space.xxl }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: space.md, marginBottom: space.xs }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.title, letterSpacing: "-.01em", margin: 0 }}>{title}</h2>
          {!!meta && <span style={{ ...label(), whiteSpace: "nowrap" }}>{meta}</span>}
        </div>
        {list.map((e, i) => <Row key={e.name} e={e} last={i === list.length - 1} showTransfer={showTransfer} />)}
      </div>
    );

  return (
    <HeroScreen hero={{ rank: "title", title: t("w.train.sport.title") }}>
      <div style={{ maxWidth: 620, margin: "0 auto", color: C("chalk") }}>
        <p style={{ ...mono(fs.body), lineHeight: 1.6, margin: "4px 0 0" }}>{t("w.train.sportPage.indexIntro")}</p>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("w.train.sportPage.searchSports")}
          aria-label={t("w.train.sportPage.searchSports")}
          style={{
            width: "100%", marginTop: space.lg, fontFamily: "var(--font-mono)", fontSize: fs.bodyLg,
            padding: "12px 16px", borderRadius: 16, background: C("ink2"), color: C("chalk"),
            border: `1px solid ${C("line")}`, outline: "none",
          }}
        />

        {query.trim() ? (
          results.length === 0 ? (
            <p style={{ ...mono(fs.body), marginTop: space.xxl }}>{t("w.train.sportPage.noMatch")}</p>
          ) : (
            <Group title={t("w.train.sport.title")} meta={String(results.length)} list={results} />
          )
        ) : (
          <>
            <Group title={t("w.train.sportPage.yourSports")} meta={yours.length ? String(yours.length) : undefined} list={yours} />
            {/* every row in this group has a pool — the tag would be noise. */}
            <Group title={t("w.train.sportPage.wePrescribe")} list={prescribable} showTransfer={false} />
          </>
        )}
      </div>
    </HeroScreen>
  );
}
