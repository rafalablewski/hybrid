"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { allTranslationKeys, baselineString, LANGS, type Lang } from "@hybrid/core";
import { fs, space, INK2, LINE, LIME, CHALK, ASH, AMBER, disp, mono, Mono, Card, Select, txt } from "@/lib/ui";

const LANG_LIST = Object.keys(LANGS) as Lang[];

type Row = { id: string; lang: string; key: string; value: string; updatedByEmail: string | null };
// override map: lang → key → value
type OvMap = Record<string, Record<string, string>>;

export default function AdminTranslations() {
  const [ov, setOv] = useState<OvMap>({});
  const [unavailable, setUnavailable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [prefix, setPrefix] = useState("all");
  const [filter, setFilter] = useState<"all" | "overridden" | "missing">("all");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingCell, setSavingCell] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/translations")
      .then((r) => r.json())
      .then((d) => {
        setUnavailable(Boolean(d.unavailable));
        const map: OvMap = {};
        for (const r of (d.translations ?? []) as Row[]) (map[r.lang] ??= {})[r.key] = r.value;
        setOv(map);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  useEffect(load, [load]);

  const keys = useMemo(() => {
    const base = allTranslationKeys();
    const baseSet = new Set(base);
    const extra = new Set<string>();
    for (const lang of Object.keys(ov)) {
      const m = ov[lang];
      if (!m) continue;
      for (const k of Object.keys(m)) if (!baseSet.has(k)) extra.add(k);
    }
    return [...base, ...[...extra].sort()];
  }, [ov]);

  const prefixes = useMemo(() => ["all", ...[...new Set(keys.map((k) => k.split(".")[0]))].sort()], [keys]);

  const effective = (lang: string, key: string) => ov[lang]?.[key] ?? baselineString(lang as Lang, key) ?? "";
  const isOverridden = (lang: string, key: string) => ov[lang]?.[key] !== undefined;

  const visible = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return keys.filter((key) => {
      if (prefix !== "all" && key.split(".")[0] !== prefix) return false;
      if (ql && !key.toLowerCase().includes(ql) && !LANG_LIST.some((l) => effective(l, key).toLowerCase().includes(ql)))
        return false;
      if (filter === "overridden" && !LANG_LIST.some((l) => isOverridden(l, key))) return false;
      if (filter === "missing" && !LANG_LIST.some((l) => !baselineString(l, key) && !ov[l]?.[key])) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, q, prefix, filter, ov]);

  const overrideCount = useMemo(() => Object.values(ov).reduce((n, m) => n + Object.keys(m).length, 0), [ov]);

  async function save(lang: string, key: string, raw: string) {
    const ck = `${lang}:${key}`;
    const value = raw;
    setSavingCell(ck);
    const res = await fetch("/api/admin/translations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lang, key, value }),
    });
    setSavingCell(null);
    if (!res.ok) return;
    // optimistic local update
    setOv((m) => {
      const langMap = { ...(m[lang] ?? {}) };
      if (value.trim()) langMap[key] = value;
      else delete langMap[key];
      return { ...m, [lang]: langMap };
    });
    setEdits((e) => {
      const n = { ...e };
      delete n[ck];
      return n;
    });
  }

  if (unavailable)
    return (
      <Card style={{ borderLeft: `3px solid ${AMBER}` }}>
        <div style={{ ...disp, fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Localization not initialized</div>
        <Mono s={{ fontSize: fs.bodyLg, lineHeight: 1.6, display: "block" }} c={CHALK}>
          The <b>Translation</b> table doesn&apos;t exist yet. Run{" "}
          <span style={{ color: txt(AMBER) }}>reference/sql-translation.sql</span> in the Supabase SQL Editor, then reload.
        </Mono>
      </Card>
    );

  const capped = visible.slice(0, 120);

  return (
    <div>
      <div style={{ display: "flex", gap: space.sm, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search keys or text…"
          style={{ ...mono, fontSize: fs.bodyLg, flex: 1, minWidth: 200, padding: "10px 14px", borderRadius: "var(--r-card)", background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none" }}
        />
        <Select value={prefix} onChange={(e) => setPrefix(e.target.value)}>
          {prefixes.map((p) => <option key={p} value={p}>{p === "all" ? "All groups" : p}</option>)}
        </Select>
        <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">All keys</option>
          <option value="overridden">Overridden only</option>
          <option value="missing">Missing a translation</option>
        </Select>
      </div>
      <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 14 }} c={ASH}>
        {loaded ? `${keys.length} keys · ${overrideCount} override${overrideCount === 1 ? "" : "s"}` : "…"} · edits layer
        over the shipped strings live — empty a field to revert to baseline.
      </Mono>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", maxWidth: "100%" }}>
        <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ ...mono, fontSize: fs.micro, color: txt(ASH), textTransform: "uppercase", letterSpacing: ".08em", textAlign: "left", padding: "10px 14px", borderBottom: `1px solid ${LINE}`, width: "22%" }}>Key</th>
              {LANG_LIST.map((l) => (
                <th key={l} style={{ ...mono, fontSize: fs.micro, color: txt(ASH), textTransform: "uppercase", letterSpacing: ".08em", textAlign: "left", padding: "10px 14px", borderBottom: `1px solid ${LINE}` }}>
                  {LANGS[l]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {capped.map((key) => (
              <tr key={key}>
                <td style={{ ...mono, fontSize: fs.caption, color: CHALK, padding: "10px 14px", borderBottom: `1px solid ${LINE}`, wordBreak: "break-word", verticalAlign: "top" }}>
                  {key}
                </td>
                {LANG_LIST.map((lang) => {
                  const ck = `${lang}:${key}`;
                  const eff = effective(lang, key);
                  const val = edits[ck] ?? eff;
                  const overridden = isOverridden(lang, key);
                  const missing = !baselineString(lang, key) && !overridden;
                  return (
                    <td key={lang} style={{ padding: "8px 10px", borderBottom: `1px solid ${LINE}`, verticalAlign: "top" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: space.xxs }}>
                        <textarea
                          value={val}
                          onChange={(e) => setEdits((s) => ({ ...s, [ck]: e.target.value }))}
                          onBlur={() => {
                            if ((edits[ck] ?? eff) !== eff) save(lang, key, edits[ck] ?? "");
                          }}
                          rows={1}
                          placeholder={missing ? "— missing —" : ""}
                          style={{
                            ...mono,
                            width: "100%",
                            fontSize: fs.body,
                            lineHeight: 1.4,
                            padding: "8px 8px",
                            borderRadius: "var(--r-field)",
                            background: INK2,
                            color: txt(missing && !val ? ASH : CHALK),
                            border: `1px solid ${overridden ? LIME : missing ? AMBER : LINE}`,
                            outline: "none",
                            resize: "vertical",
                            boxSizing: "border-box",
                            opacity: savingCell === ck ? 0.5 : 1,
                          }}
                        />
                        {overridden && (
                          <button
                            title="Revert to baseline"
                            onClick={() => save(lang, key, "")}
                            style={{ background: "transparent", border: "none", color: txt(ASH), cursor: "pointer", fontSize: fs.bodyLg, padding: "6px 2px", flexShrink: 0 }}
                          >
                            ↺
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {loaded && visible.length === 0 && (
              <tr><td colSpan={1 + LANG_LIST.length} style={{ ...mono, fontSize: fs.bodyLg, color: txt(ASH), textAlign: "center", padding: 32 }}>No keys match.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>

      {visible.length > capped.length && (
        <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 10, textAlign: "center" }} c={ASH}>
          Showing {capped.length} of {visible.length} — refine the search or group filter to narrow.
        </Mono>
      )}
      <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
        <Legend c={LIME}>overridden</Legend>
        <Legend c={AMBER}>missing translation</Legend>
        <Legend c={LINE}>baseline (shipped)</Legend>
      </div>
    </div>
  );
}

function Legend({ c, children }: { c: string; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: space.xs }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, border: `1px solid ${c}`, background: `${c}22`, display: "inline-block" }} />
      <Mono s={{ fontSize: fs.caption }} c={ASH}>{children}</Mono>
    </span>
  );
}
