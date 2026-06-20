"use client";

import { useEffect, useState } from "react";
import { LINE, LIME, CHALK, ASH, RED, AMBER, disp, mono, Mono, Card, Chip } from "@/lib/ui";

type Sys = {
  versions: { core: string; node: string; nextPublicAppVersion: string | null };
  deployment: { env: string; region: string | null; commit: string | null; branch: string | null };
  env: Record<string, boolean>;
  db: { ok: boolean; latencyMs: number | null; auditTable: boolean };
  serverTime: string;
};

export default function AdminSystem() {
  const [s, setS] = useState<Sys | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch("/api/admin/system").then((r) => (r.ok ? r.json() : Promise.reject())).then(setS).catch(() => setErr(true));
  }, []);

  if (err) return <Card style={{ textAlign: "center", padding: 60 }}><Mono>Failed to load system status.</Mono></Card>;
  if (!s) return <Card style={{ textAlign: "center", padding: 60 }}><Mono>Loading…</Mono></Card>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 16 }}>
      {/* health */}
      <Card style={{ borderLeft: `3px solid ${s.db.ok ? LIME : RED}` }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 12 }} c={s.db.ok ? LIME : RED}>
          Database
        </Mono>
        <Row k="Status" v={<Chip c={s.db.ok ? LIME : RED}>{s.db.ok ? "online" : "unreachable"}</Chip>} />
        <Row k="Round-trip" v={s.db.latencyMs != null ? `${s.db.latencyMs} ms` : "—"} />
        <Row k="Audit table" v={<Chip c={s.db.auditTable ? LIME : AMBER}>{s.db.auditTable ? "present" : "missing — run SQL"}</Chip>} />
      </Card>

      {/* deployment */}
      <Card>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 12 }} c={ASH}>
          Deployment
        </Mono>
        <Row k="Environment" v={s.deployment.env} />
        <Row k="Region" v={s.deployment.region ?? "—"} />
        <Row k="Commit" v={s.deployment.commit ?? "—"} />
        <Row k="Branch" v={s.deployment.branch ?? "—"} />
      </Card>

      {/* versions */}
      <Card>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 12 }} c={ASH}>
          Versions
        </Mono>
        <Row k="@hybrid/core" v={s.versions.core} />
        <Row k="Node" v={s.versions.node} />
        <Row k="Server time" v={s.serverTime.slice(0, 19).replace("T", " ")} />
      </Card>

      {/* env presence */}
      <Card>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 12 }} c={ASH}>
          Environment (presence only — no secrets)
        </Mono>
        {Object.entries(s.env).map(([k, present]) => (
          <Row key={k} k={k} v={<Chip c={present ? LIME : ASH}>{present ? "set" : "unset"}</Chip>} />
        ))}
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${LINE}` }}>
      <Mono s={{ fontSize: 13 }} c={ASH}>{k}</Mono>
      {typeof v === "string" ? <Mono s={{ fontSize: 13 }} c={CHALK}>{v}</Mono> : v}
    </div>
  );
}
