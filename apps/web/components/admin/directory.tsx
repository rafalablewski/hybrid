"use client";

import { useEffect, useState } from "react";
import { fs, space, LINE, LIME, CHALK, ASH, VIOLET, AMBER, RED, disp, mono, Mono, Card, Chip } from "@/lib/ui";
import { Loading } from "../aurora/skeleton";

type Link = { id: string; status: string; createdAt: string; coach: string; client: string; notes: number };

const statusColor: Record<string, string> = { ACTIVE: LIME, PENDING: AMBER, ENDED: ASH };
const fmt = (d: string) => new Date(d).toISOString().slice(0, 10);

export default function AdminDirectory() {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [counts, setCounts] = useState<{ status: string; n: number }[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/coaching")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setLinks(d.links); setCounts(d.counts); })
      .catch(() => { setLinks([]); setErr("Couldn't load the directory — try reloading."); });
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.xxl }}>
      {err && (
        <div role="alert">
          <Mono s={{ fontSize: fs.body, display: "block" }} c={RED}>
            {err}
          </Mono>
        </div>
      )}
      {/* coaching links */}
      <section>
        <SectionTitle title="Coaching relationships" kicker="Coach ↔ client links" c={VIOLET} />
        <div style={{ display: "flex", gap: space.sm, marginBottom: 12, flexWrap: "wrap" }}>
          {counts.map((c) => (
            <Chip key={c.status} c={statusColor[c.status] ?? CHALK}>{c.status} – {c.n}</Chip>
          ))}
        </div>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <Table head={["Coach", "Client", "Status", "Notes", "Since"]} align={["left", "left", "left", "right", "right"]}>
            {links?.map((l) => (
              <tr key={l.id}>
                <Td label="Coach"><Mono s={{ fontSize: fs.bodyLg }} c={CHALK}>{l.coach}</Mono></Td>
                <Td label="Client"><Mono s={{ fontSize: fs.bodyLg }} c={CHALK}>{l.client}</Mono></Td>
                <Td label="Status"><Chip c={statusColor[l.status] ?? CHALK}>{l.status}</Chip></Td>
                <Td label="Notes" right><Mono s={{ fontSize: fs.bodyLg }} c={ASH}>{l.notes}</Mono></Td>
                <Td label="Since" right><Mono s={{ fontSize: fs.body }} c={ASH}>{fmt(l.createdAt)}</Mono></Td>
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
      <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={c}>{kicker}</Mono>
      <div style={{ ...disp, fontWeight: 800, fontSize: 19, marginTop: 2 }}>{title}</div>
    </div>
  );
}

function Table({ head, align, children }: { head: string[]; align: ("left" | "right")[]; children: React.ReactNode }) {
  return (
    <div style={{ overflowX: "auto", maxWidth: "100%" }}>
    <table className="adm-tbl" style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={h} style={{ ...mono, fontSize: fs.micro, color: ASH, textTransform: "uppercase", letterSpacing: ".08em", textAlign: align[i], padding: "12px 16px", borderBottom: `1px solid ${LINE}` }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
    </div>
  );
}

function Td({ children, right, label }: { children: React.ReactNode; right?: boolean; label?: string }) {
  return <td data-label={label ?? ""} style={{ padding: "11px 16px", textAlign: right ? "right" : "left", borderBottom: `1px solid ${LINE}` }}>{children}</td>;
}

function Empty({ data, cols, label }: { data: unknown[] | null; cols: number; label: string }) {
  if (data === null) return <tr><td colSpan={cols} style={{ padding: "8px 0" }}><Loading /></td></tr>;
  if (data.length === 0) return <tr><td colSpan={cols} style={{ ...mono, fontSize: fs.bodyLg, color: ASH, textAlign: "center", padding: 32 }}>{label}</td></tr>;
  return null;
}
