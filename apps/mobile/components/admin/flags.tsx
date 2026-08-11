import { useCallback, useEffect, useState } from "react";
import { View, Text } from "react-native";
import { fs, space, Mono, Chip, LoadSwap, F } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { Banner, ErrorNote, PillBtn } from "./_kit";
import { ACard, cardStack } from "../aurora/kit";
import { adminGet, adminSend } from "../../lib/admin-api";

// Mobile parity for apps/web/components/admin/flags.tsx. Same /api/admin/flags
// (+/[key]) backend: every registry flag (FEATURE_FLAGS via the API) with an
// on/off toggle, an audience scope selector, an override/default badge, and a
// per-flag reset (DELETE /[key]) that drops the override back to its registry
// default. Toggles take effect on the next client load — no deploy.

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

type ListResp = { flags?: Flag[]; unavailable?: boolean };

const AUDIENCES = ["all", "coaches", "clients", "admins"];

export default function AdminFlags() {
  const { palette } = useTheme();
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await adminGet<ListResp>("/api/admin/flags");
    if (!r.ok || !r.data) {
      setFailed(true);
      setFlags([]);
      return;
    }
    setFailed(false);
    setUnavailable(Boolean(r.data.unavailable));
    setFlags(r.data.flags ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function upsert(key: string, body: Record<string, unknown>) {
    setBusy(key);
    setErr(null);
    const r = await adminSend("POST", "/api/admin/flags", { key, ...body });
    setBusy(null);
    if (!r.ok) setErr("Couldn't save that change — re-syncing.");
    load();
  }

  async function reset(key: string) {
    setBusy(key);
    setErr(null);
    const r = await adminSend("DELETE", `/api/admin/flags/${encodeURIComponent(key)}`);
    setBusy(null);
    if (!r.ok) setErr("Couldn't reset that flag — re-syncing.");
    load();
  }

  return (
    <LoadSwap loading={flags === null && !failed}>
      {() => {
        if (flags === null && !failed) return null;
        if (failed) return <ErrorNote error="Couldn't load feature flags. Pull to retry." />;

        return (
          <View>
            {unavailable ? (
              <Banner tone="amber" title="Overrides not persisted yet">
                The FeatureFlag table doesn&apos;t exist yet — run reference/sql-feature-flags.sql in Supabase to make toggles
                persist. Until then the app runs on the registry defaults below.
              </Banner>
            ) : null}

            {err ? <ErrorNote error={err} onDismiss={() => setErr(null)} /> : null}

            <Mono color={palette.ash} style={{ marginBottom: 16, lineHeight: 18 }}>
              {flags ? `${flags.length} flags` : "…"} – toggles take effect on the next client load — no deploy.
            </Mono>

            {flags?.map((f) => (
              <ACard key={f.key} accent={f.enabled ? palette.lime : palette.ash} style={cardStack}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginBottom: 4 }}>
                  <Chip color={f.enabled ? palette.lime : palette.ash}>{f.enabled ? "on" : "off"}</Chip>
                  {f.overridden ? <Chip color={palette.amber}>overridden</Chip> : <Chip color={palette.ash}>default</Chip>}
                  <Chip color={palette.ash}>{f.audience}</Chip>
                </View>
                <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: palette.chalk }}>{f.label}</Text>
                <Mono color={palette.ash} style={{ marginTop: 2, lineHeight: 18 }}>{f.description}</Mono>
                <Mono color={palette.ash} style={{ marginTop: 6, fontSize: fs.micro }}>
                  {f.key} – default {f.defaultEnabled ? "on" : "off"}
                  {f.updatedByEmail ? ` – last by ${f.updatedByEmail}` : ""}
                </Mono>

                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: palette.ash, marginTop: 10, marginBottom: 6 }}>Audience</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
                  {AUDIENCES.map((a) => (
                    <PillBtn
                      key={a}
                      label={a}
                      color={palette.blue}
                      outline={f.audience !== a}
                      disabled={busy === f.key}
                      onPress={() => upsert(f.key, { enabled: f.enabled, audience: a })}
                    />
                  ))}
                </View>

                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 12 }}>
                  <PillBtn
                    label={f.enabled ? "Turn off" : "Turn on"}
                    color={f.enabled ? palette.ash : palette.lime}
                    outline={f.enabled}
                    disabled={busy === f.key}
                    onPress={() => upsert(f.key, { enabled: !f.enabled, audience: f.audience })}
                  />
                  {f.overridden ? (
                    <PillBtn label="↺ Reset to default" outline color={palette.ash} disabled={busy === f.key} onPress={() => reset(f.key)} />
                  ) : null}
                </View>
              </ACard>
            ))}

            {flags && flags.length === 0 ? (
              <Mono color={palette.ash} style={{ textAlign: "center", paddingVertical: 24 }}>
                No flags in the registry.
              </Mono>
            ) : null}
          </View>
        );
      }}
    </LoadSwap>
  );
}
