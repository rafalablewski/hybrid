import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text } from "react-native";
import { allTranslationKeys, baselineString, LANGS, type Lang } from "@hybrid/core";
import { fs, space, Card, Mono, Chip, Loading, F } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { Banner, ErrorNote, Input, PillBtn, Segmented } from "./_kit";
import { adminGet, adminSend } from "../../lib/admin-api";

// Mobile parity for apps/web/components/admin/translations.tsx. Same
// /api/admin/translations backend: an editable view over core's
// allTranslationKeys()/baselineString(), one card per key with a field per
// language. Saving (POST upsert) layers an override over the shipped baseline;
// emptying a field reverts to baseline. Search + a Segmented override/missing
// filter narrow the list, and rendering is capped (80 keys) with a "showing N
// of M" note — there are hundreds of keys.

const LANG_LIST = Object.keys(LANGS) as Lang[];
const CAP = 80;

type Row = { id: string; lang: string; key: string; value: string; updatedByEmail: string | null };
type ListResp = { translations?: Row[]; unavailable?: boolean };
// override map: lang → key → value
type OvMap = Record<string, Record<string, string>>;

type FilterMode = "all" | "overridden" | "missing";

export default function AdminTranslations() {
  const { palette } = useTheme();
  const [ov, setOv] = useState<OvMap>({});
  const [unavailable, setUnavailable] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await adminGet<ListResp>("/api/admin/translations");
    if (!r.ok || !r.data) {
      setFailed(true);
      setLoaded(true);
      return;
    }
    setFailed(false);
    setUnavailable(Boolean(r.data.unavailable));
    const map: OvMap = {};
    for (const row of r.data.translations ?? []) (map[row.lang] ??= {})[row.key] = row.value;
    setOv(map);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const effective = (lang: Lang, key: string) => ov[lang]?.[key] ?? baselineString(lang, key) ?? "";
  const isOverridden = (lang: Lang, key: string) => ov[lang]?.[key] !== undefined;

  const visible = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return keys.filter((key) => {
      if (ql && !key.toLowerCase().includes(ql) && !LANG_LIST.some((l) => effective(l, key).toLowerCase().includes(ql)))
        return false;
      if (filter === "overridden" && !LANG_LIST.some((l) => isOverridden(l, key))) return false;
      if (filter === "missing" && !LANG_LIST.some((l) => !baselineString(l, key) && !ov[l]?.[key])) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, q, filter, ov]);

  const overrideCount = useMemo(() => Object.values(ov).reduce((n, m) => n + Object.keys(m).length, 0), [ov]);

  async function save(lang: Lang, key: string, raw: string) {
    const ck = `${lang}:${key}`;
    setSavingCell(ck);
    setErr(null);
    const r = await adminSend("POST", "/api/admin/translations", { lang, key, value: raw });
    setSavingCell(null);
    if (!r.ok) {
      setErr("Couldn't save that string — re-syncing.");
      return;
    }
    setOv((m) => {
      const langMap = { ...(m[lang] ?? {}) };
      if (raw.trim()) langMap[key] = raw;
      else delete langMap[key];
      return { ...m, [lang]: langMap };
    });
    setEdits((e) => {
      const n = { ...e };
      delete n[ck];
      return n;
    });
  }

  if (!loaded && !failed) return <Loading />;
  if (failed) return <ErrorNote error="Couldn't load translations. Pull to retry." />;
  if (unavailable)
    return (
      <Banner tone="amber" title="Localization not initialized">
        The Translation table doesn&apos;t exist yet. Run reference/sql-translation.sql in the Supabase SQL Editor, then
        reload.
      </Banner>
    );

  const capped = visible.slice(0, CAP);

  return (
    <View>
      <Input value={q} onChangeText={setQ} placeholder="Search keys or text…" />
      <Segmented<FilterMode>
        options={[
          { value: "all", label: "All keys" },
          { value: "overridden", label: "Overridden" },
          { value: "missing", label: "Missing" },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <Mono color={palette.ash} style={{ marginBottom: 14, lineHeight: 18 }}>
        {`${keys.length} keys · ${overrideCount} override${overrideCount === 1 ? "" : "s"}`} · edits layer over the
        shipped strings live — empty a field to revert to baseline.
      </Mono>

      {err ? <ErrorNote error={err} onDismiss={() => setErr(null)} /> : null}

      {capped.map((key) => (
        <Card key={key}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: palette.chalk, marginBottom: 8 }}>{key}</Text>
          {LANG_LIST.map((lang) => {
            const ck = `${lang}:${key}`;
            const eff = effective(lang, key);
            const val = edits[ck] ?? eff;
            const overridden = isOverridden(lang, key);
            const missing = !baselineString(lang, key) && !overridden;
            const dirty = (edits[ck] ?? eff) !== eff;
            return (
              <View key={lang} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, marginBottom: 4 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: palette.ash }}>{LANGS[lang]}</Text>
                  {overridden ? <Chip color={palette.lime}>override</Chip> : null}
                  {missing ? <Chip color={palette.amber}>missing</Chip> : null}
                </View>
                <Input
                  value={val}
                  onChangeText={(t) => setEdits((s) => ({ ...s, [ck]: t }))}
                  placeholder={missing ? "— missing —" : ""}
                  multiline
                  style={{ marginBottom: 6 }}
                />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
                  {dirty ? (
                    <PillBtn label="Save" disabled={savingCell === ck} onPress={() => save(lang, key, edits[ck] ?? "")} />
                  ) : null}
                  {overridden ? (
                    <PillBtn label="↺ Revert" outline color={palette.ash} disabled={savingCell === ck} onPress={() => save(lang, key, "")} />
                  ) : null}
                </View>
              </View>
            );
          })}
        </Card>
      ))}

      {loaded && visible.length === 0 ? (
        <Mono color={palette.ash} style={{ textAlign: "center", paddingVertical: 24 }}>
          No keys match.
        </Mono>
      ) : null}

      {visible.length > capped.length ? (
        <Mono color={palette.ash} style={{ textAlign: "center", marginTop: 8 }}>
          {`Showing ${capped.length} of ${visible.length} — refine the search or filter to narrow.`}
        </Mono>
      ) : null}
    </View>
  );
}
