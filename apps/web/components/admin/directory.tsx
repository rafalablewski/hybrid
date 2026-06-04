"use client";

import { useEffect, useState } from "react";
import { LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, disp, mono, Mono, Card, Chip } from "@/lib/ui";

type Org = { id: string; name: string; createdAt: string; teams: number; members: number };
type Link = { id: string; status: string; createdAt: string; coach: string; client: string; notes: number };

const statusColor: Record<string, string> = { ACTIVE: LIME, PENDING: AMBER, ENDED: ASH };
const fmt = (d: string) => new Date(d).toISOString().slice(0, 10);

export default function AdminDirectory() {
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [links, setLinks] = useState<Link[] | null>(null);
  const [counts, setCounts] = useState<{ status: string; n: number }[]>([]);

  useEffect(() => {
    fetch("/api/admin/orgs").then((r) => r.json()).then((d) => setOrgs(d.orgs)).catch(() => setOrgs([]));
    fetch("/api/admin/coaching").then((r) => r.json()).then((d) => { setLinks(d.links); setCounts(d.counts); }).catch(() => setLinks([]));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* organizations */}
      <section>
        <SectionTitle title="Organizations" kicker={`${orgs?.length ?? 0} total`} c={BLUE} />
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <Table head={["Organization", "Teams", "Members", "Created"]} align={["left", "right", "right", "right"]}>
            {orgs?.map((o) => (
              <tr key={o.id}>
                <Td><span style={{ ...disp, fontWeight: 600, fontSize: 14 }}>{o.name}</span></Td>
                <Td right><Mono s={{ fontSize: 13 }} c={CHALK}>{o.teams}</Mono></Td>
                <Td right><Mono s={{ fontSize: 13 }} c={CHALK}>{o.members}</Mono></Td>
                <Td right><Mono s={{ fontSize: 12 }} c={ASH}>{fmt(o.createdAt)}</Mono></Td>
              </tr>
            ))}
            <Empty data={orgs} cols={4} label="No organizations yet." />
          </Table>
        </Card>
      </section>

      {/* coaching links */}
      <section>
        <SectionTitle title="Coaching relationships" kicker="Coach ↔ client links" c={VIOLET} />
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          {counts.map((c) => (
            <Chip key={c.status} c={statusColor[c.status] ?? CHALK}>{c.status} · {c.n}</Chip>
          ))}
        </div>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <Table head={["Coach", "Client", "Status", "Notes", "Since"]} align={["left", "left", "left", "right", "right"]}>
            {links?.map((l) => (
              <tr key={l.id}>
                <Td><Mono s={{ fontSize: 13 }} c={CHALK}>{l.coach}</Mono></Td>
                <Td><Mono s={{ fontSize: 13 }} c={CHALK}>{l.client}</Mono></Td>
                <Td><Chip c={statusColor[l.status] ?? CHALK}>{l.status}</Chip></Td>
                <Td right><Mono s={{ fontSize: 13 }} c={ASH}>{l.notes}</Mono></Td>
                <Td right><Mono s={{ fontSize: 12 }} c={ASH}>{fmt(l.createdAt)}</Mono></Td>
              </tr>
            ))}
            <Empty data={links} cols={5} label="No coaching links yet." />
          </Table>
        </Card>
      </section>
    </div>
  );
}

function SectionTitle({ title, kicker, c }: { title: string; kicker: string; c: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em" }} c={c}>{kicker}</Mono>
      <div style={{ ...disp, fontWeight: 800, fontSize: 19, marginTop: 2 }}>{title}</div>
    </div>
  );
}

function Table({ head, align, children }: { head: string[]; align: ("left" | "right")[]; children: React.ReactNode }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={h} style={{ ...mono, fontSize: 10, color: ASH, textTransform: "uppercase", letterSpacing: ".08em", textAlign: align[i], padding: "12px 16px", borderBottom: `1px solid ${LINE}` }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td style={{ padding: "11px 16px", textAlign: right ? "right" : "left", borderBottom: `1px solid ${LINE}` }}>{children}</td>;
}

function Empty({ data, cols, label }: { data: unknown[] | null; cols: number; label: string }) {
  if (data === null) return <tr><td colSpan={cols} style={{ ...mono, fontSize: 13, color: ASH, textAlign: "center", padding: 32 }}>Loading…</td></tr>;
  if (data.length === 0) return <tr><td colSpan={cols} style={{ ...mono, fontSize: 13, color: ASH, textAlign: "center", padding: 32 }}>{label}</td></tr>;
  return null;
}
