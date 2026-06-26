"use client";

import { useCallback, useEffect, useState } from "react";
import { fs, space, INK, INK2, LINE, LIME, CHALK, ASH, AMBER, RED, disp, cond, mono, Mono, Card, Chip, Select, txt } from "@/lib/ui";

type Flag = {
  key: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
  defaultAudience: string;
  overridden: boolean;
  enabled: boolean;
  audience: string;
  value: unknown;
  updatedByEmail: string | null;
  updatedAt: string | null;
};

const AUDIENCES = ["all", "coaches", "clients", "admins"];

export default function AdminFlags() {
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/flags")
      .then((r) => r.json())
      .then((d) => {
        setUnavailable(Boolean(d.unavailable));
        setFlags(d.flags ?? []);
      })
      .catch(() => setFlags([]));
  }, []);

  useEffect(load, [load]);

  async function upsert(key: string, body: Record<string, unknown>) {
    setBusy(key);
    setErr(null);
    try {
      const res = await fetch("/api/admin/flags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, ...body }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setErr("Couldn't save that change — re-syncing.");
    }
    setBusy(null);
    load();
  }

  async function reset(key: string) {
    setBusy(key);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/flags/${encodeURIComponent(key)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setErr("Couldn't reset that flag — re-syncing.");
    }
    setBusy(null);
    load();
  }

  return (
    <div>
      {unavailable && (
        <Card style={{ borderLeft: `3px solid ${AMBER}`, marginBottom: 16 }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle, marginBottom: 6 }}>Overrides not persisted yet</div>
          <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block" }} c={CHALK}>
            The <b>FeatureFlag</b> table doesn&apos;t exist yet — run{" "}
            <span style={{ color: txt(AMBER) }}>reference/sql-feature-flags.sql</span> in Supabase to make toggles persist.
            Until then the app runs on the registry defaults below.
          </Mono>
        </Card>
      )}

      {err && (
        <div role="alert">
          <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 12 }} c={RED}>
            {err}
          </Mono>
        </div>
      )}

      <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 14 }} c={ASH}>
        {flags ? `${flags.length} flags` : "…"} · toggles take effect on the next client load — no deploy.
      </Mono>

      <div style={{ display: "flex", flexDirection: "column", gap: space.ms }}>
        {flags?.map((f) => (
          <Card key={f.key} style={{ borderLeft: `3px solid ${f.enabled ? LIME : ASH}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: space.md, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ marginBottom: 4 }}>
                  <Chip c={f.enabled ? LIME : ASH}>{f.enabled ? "on" : "off"}</Chip>
                  {f.overridden ? <Chip c={AMBER}>overridden</Chip> : <Chip c={ASH}>default</Chip>}
                  <Chip c={ASH}>{f.audience}</Chip>
                </div>
                <div style={{ ...disp, fontWeight: 800, fontSize: fs.subtitle }}>{f.label}</div>
                <Mono s={{ fontSize: fs.body, lineHeight: 1.5, display: "block", marginTop: 2 }} c={ASH}>{f.description}</Mono>
                <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 6 }} c={ASH}>
                  {f.key} · default {f.defaultEnabled ? "on" : "off"}
                  {f.updatedByEmail ? ` · last by ${f.updatedByEmail}` : ""}
                </Mono>
              </div>

              <div style={{ display: "flex", gap: space.sm, alignItems: "center", flexShrink: 0 }}>
                <Select
                  value={f.audience}
                  onChange={(e) => upsert(f.key, { enabled: f.enabled, audience: e.target.value })}
                >
                  {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
                </Select>
                <button
                  disabled={busy === f.key}
                  onClick={() => upsert(f.key, { enabled: !f.enabled, audience: f.audience })}
                  style={toggle(f.enabled)}
                  title={f.enabled ? "Disable" : "Enable"}
                >
                  <span style={knob(f.enabled)} />
                </button>
                {f.overridden && (
                  <button disabled={busy === f.key} onClick={() => reset(f.key)} style={resetBtn} title="Reset to default">
                    ↺ reset
                  </button>
                )}
              </div>
            </div>
          </Card>
        ))}

        {flags && flags.length === 0 && (
          <Card>
            <Mono s={{ fontSize: fs.bodyLg, textAlign: "center", display: "block", padding: 24 }} c={ASH}>
              No flags in the registry.
            </Mono>
          </Card>
        )}
      </div>
    </div>
  );
}

function toggle(on: boolean): React.CSSProperties {
  return {
    width: 46,
    height: 26,
    borderRadius: 999,
    border: `1px solid ${on ? LIME : LINE}`,
    background: on ? `${LIME}33` : INK2,
    cursor: "pointer",
    padding: 2,
    display: "flex",
    justifyContent: on ? "flex-end" : "flex-start",
    alignItems: "center",
    transition: "all .12s",
  };
}
function knob(on: boolean): React.CSSProperties {
  return { width: 20, height: 20, borderRadius: 999, background: on ? LIME : ASH, display: "block" };
}
const resetBtn: React.CSSProperties = {
  ...cond,
  fontSize: fs.caption,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  padding: "8px 10px",
  borderRadius: "var(--r-field)",
  cursor: "pointer",
  border: `1px solid ${LINE}`,
  background: INK,
  color: txt(ASH),
};
