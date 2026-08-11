import { useEffect, useState } from "react";
import { View } from "react-native";
import { adminGet } from "../../lib/admin-api";
import { Mono, Kicker, Chip, LoadSwap } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { KV, ErrorNote } from "./_kit";
import { ACard, cardStack } from "../aurora/kit";

// Mobile System — parity with apps/web/components/admin/system.tsx, fed by
// GET /api/admin/system. KV rows for DB health / deployment / versions, and the
// env-var PRESENCE booleans as ✓/✗ chips. Reveals no secrets (presence only).

type Sys = {
  versions: { core: string; node: string; nextPublicAppVersion: string | null };
  deployment: { env: string; region: string | null; commit: string | null; branch: string | null };
  env: Record<string, boolean>;
  db: { ok: boolean; latencyMs: number | null; auditTable: boolean };
  serverTime: string;
};

export default function AdminSystem() {
  const { palette } = useTheme();
  const [s, setS] = useState<Sys | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    adminGet<Sys>("/api/admin/system").then((r) => {
      if (r.ok && r.data) setS(r.data);
      else setErr(true);
    });
  }, []);

  if (err) return <ErrorNote error="Failed to load system status." />;
  return (
    <LoadSwap loading={!s}>
      {() => {
        if (!s) return null;
        return (
          <View>
            {/* Database health */}
            <ACard accent={s.db.ok ? palette.lime : palette.red} style={cardStack}>
              <Kicker color={s.db.ok ? palette.lime : palette.red}>Database</Kicker>
              <View style={{ marginTop: 8 }}>
                <KV k="Status" v={<Chip color={s.db.ok ? palette.lime : palette.red}>{s.db.ok ? "online" : "unreachable"}</Chip>} />
                <KV k="Round-trip" v={s.db.latencyMs != null ? `${s.db.latencyMs} ms` : "—"} />
                <KV k="Audit table" v={<Chip color={s.db.auditTable ? palette.lime : palette.amber}>{s.db.auditTable ? "present" : "missing — run SQL"}</Chip>} />
              </View>
            </ACard>

            {/* Deployment */}
            <ACard style={cardStack}>
              <Kicker>Deployment</Kicker>
              <View style={{ marginTop: 8 }}>
                <KV k="Environment" v={s.deployment.env} />
                <KV k="Region" v={s.deployment.region ?? "—"} />
                <KV k="Commit" v={s.deployment.commit ?? "—"} />
                <KV k="Branch" v={s.deployment.branch ?? "—"} />
              </View>
            </ACard>

            {/* Versions */}
            <ACard style={cardStack}>
              <Kicker>Versions</Kicker>
              <View style={{ marginTop: 8 }}>
                <KV k="@hybrid/core" v={s.versions.core} />
                <KV k="Node" v={s.versions.node} />
                <KV k="Server time" v={s.serverTime.slice(0, 19).replace("T", " ")} />
              </View>
            </ACard>

            {/* Env presence — booleans only, no secrets */}
            <ACard style={cardStack}>
              <Kicker>Environment – presence only — no secrets</Kicker>
              <View style={{ marginTop: 8 }}>
                {Object.entries(s.env).map(([k, present]) => (
                  <KV key={k} k={k} v={<Chip color={present ? palette.lime : palette.ash}>{present ? "✓ set" : "✗ unset"}</Chip>} />
                ))}
              </View>
            </ACard>
          </View>
        );
      }}
    </LoadSwap>
  );
}
