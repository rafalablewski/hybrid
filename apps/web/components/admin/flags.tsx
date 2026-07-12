"use client";

import { useCallback, useEffect, useState } from "react";
import { PREMIUM_ACCENT_FLAG, PREMIUM_ACCENT_PRESETS, PREMIUM_ACCENT_DEFAULT, normalizePremiumAccent, resolvePremiumAccent, wcagRating, isHexColor, type WcagGrade } from "@hybrid/core";
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
        {flags ? `${flags.length} flags` : "…"} – toggles take effect on the next client load — no deploy.
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
                  {f.key} – default {f.defaultEnabled ? "on" : "off"}
                  {f.updatedByEmail ? ` – last by ${f.updatedByEmail}` : ""}
                </Mono>
                {f.key === PREMIUM_ACCENT_FLAG && (
                  <PremiumAccentPicker
                    value={f.value}
                    busy={busy === f.key}
                    onPick={(v) => upsert(f.key, { enabled: true, audience: f.audience, value: v })}
                  />
                )}
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
    background: on ? `color-mix(in srgb, var(--color-lime) 20%, transparent)` : INK2,
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

// The dark card surface the accent-as-text sits on (palette.dark.card) — the
// reference background for the "text on card" contrast check.
const CARD_DARK = "#151715";
const gradeColor = (g: WcagGrade) => (g === "AAA" ? LIME : g === "AA" ? AMBER : RED);

/** Admin picker for the premium-CTA accent: palette swatches + a custom hex,
 *  with a live WCAG readout for the two pairings that matter (accent-as-text on
 *  the card, and the auto-picked ink on a solid accent button). */
function PremiumAccentPicker({ value, onPick, busy }: { value: unknown; onPick: (v: string) => void; busy: boolean }) {
  const current = normalizePremiumAccent(value);
  const [hex, setHex] = useState(isHexColor(current) ? current : "#");
  const r = resolvePremiumAccent(current, "dark");
  const textR = wcagRating(r.text, CARD_DARK);
  const inkR = wcagRating(r.ink, r.fill);
  const hexValid = isHexColor(hex);
  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
      <Mono s={{ fontSize: fs.micro, display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".08em" }} c={ASH}>Premium CTA colour</Mono>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {PREMIUM_ACCENT_PRESETS.map((k) => {
          const swatch = resolvePremiumAccent(k, "dark").fill;
          const on = current === k;
          return (
            <button key={k} disabled={busy} onClick={() => onPick(k)} title={k}
              style={{ width: 30, height: 30, borderRadius: 8, background: swatch, cursor: busy ? "default" : "pointer", border: on ? `2px solid ${CHALK}` : `1px solid ${LINE}` }} />
          );
        })}
        <input
          value={hex}
          onChange={(e) => setHex(e.target.value.trim())}
          placeholder="#rrggbb"
          aria-label="Custom premium accent hex"
          style={{ ...mono, fontSize: fs.caption, width: 104, padding: "7px 9px", borderRadius: "var(--r-field)", border: `1px solid ${hex.length > 1 && !hexValid ? RED : LINE}`, background: INK, color: CHALK }}
        />
        <button disabled={busy || !hexValid || hex.toLowerCase() === current} onClick={() => onPick(hex.toLowerCase())} style={{ ...resetBtn, opacity: hexValid && hex.toLowerCase() !== current ? 1 : 0.45 }}>apply</button>
      </div>
      <div style={{ display: "flex", gap: 18, marginTop: 12, flexWrap: "wrap" }}>
        <ContrastReadout label="Accent text on card" fg={r.text} bg={CARD_DARK} ratio={textR.ratio} normal={textR.normal} />
        <ContrastReadout label="Ink on solid button" fg={r.ink} bg={r.fill} ratio={inkR.ratio} normal={inkR.normal} />
      </div>
      <Mono s={{ fontSize: fs.nano, display: "block", marginTop: 8 }} c={ASH}>
        Current: <span style={{ color: CHALK }}>{current}</span>{current === PREMIUM_ACCENT_DEFAULT ? " (default)" : ""} – ↺ reset returns to amber
      </Mono>
    </div>
  );
}

function ContrastReadout({ label, fg, bg, ratio, normal }: { label: string; fg: string; bg: string; ratio: number; normal: WcagGrade }) {
  const aa = ratio >= 4.5;
  const aaa = ratio >= 7;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 26, height: 18, borderRadius: 4, background: bg, border: `1px solid ${LINE}`, display: "grid", placeItems: "center" }}>
          <span style={{ color: fg, fontSize: 12, fontWeight: 800, lineHeight: 1 }}>A</span>
        </span>
        <Mono s={{ fontSize: fs.caption }} c={CHALK}>{ratio.toFixed(2)}:1</Mono>
        <Chip c={gradeColor(normal)}>{normal === "fail" ? "fail" : normal}</Chip>
      </div>
      <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
        <Chip c={aa ? LIME : RED}>AA {aa ? "✓" : "✕"}</Chip>
        <Chip c={aaa ? LIME : ASH}>AAA {aaa ? "✓" : "✕"}</Chip>
      </div>
      <Mono s={{ fontSize: fs.nano, display: "block", marginTop: 4 }} c={ASH}>{label}</Mono>
    </div>
  );
}
