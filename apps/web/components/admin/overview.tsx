"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { fs, space, LINE, LINE_HEX, LIME, LIME_HEX, CHALK, ASH, BLUE, VIOLET, AMBER, mono, tip, Stat, ChartFrame, Card, Mono } from "@/lib/ui";
import { useIsMobile } from "@/lib/use-media-query";
import { Loading } from "../aurora/skeleton";

type Stats = {
  totalUsers: number;
  sessions: number;
  newUsers30: number;
  coaches: number;
  mau: number;
  activeLinks: number;
  planPopularity: { goal: string; n: number }[];
  langSplit: { lang: string; n: number }[];
  roleSplit: { role: string; n: number }[];
  growth: { week: string; signups: number; sessions: number }[];
};

export default function AdminOverview() {
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setS)
      .catch(() => setErr(true));
  }, []);

  if (err) return <Card style={{ textAlign: "center", padding: 60 }}><Mono>Failed to load platform analytics.</Mono></Card>;
  if (!s) return <Card><Loading /></Card>;

  const roleColor: Record<string, string> = { ADMIN: AMBER, COACH: VIOLET, CLIENT: LIME };

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: space.lg }}>
      <Stat label="Total users" value={s.totalUsers.toLocaleString()} sub={`+${s.newUsers30} / 30d`} c={LIME} />
      <Stat label="Active (30d)" value={s.mau.toLocaleString()} sub="trained in 30d" c={LIME} />
      <Stat label="Sessions logged" value={s.sessions.toLocaleString()} c={CHALK} />
      <Stat label="Active coaches" value={s.coaches.toLocaleString()} c={VIOLET} />
      <Stat label="Active coach links" value={s.activeLinks.toLocaleString()} c={VIOLET} />
      <Stat label="Avg sessions / user" value={s.totalUsers ? (s.sessions / s.totalUsers).toFixed(1) : "0"} c={CHALK} />
      <Stat label="30d activation" value={s.totalUsers ? `${Math.round((s.mau / s.totalUsers) * 100)}%` : "0%"} c={LIME} />

      <ChartFrame span={4} title="Growth" kicker="Last 12 weeks – signups vs sessions" c={LIME}>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={s.growth}>
            <CartesianGrid stroke={LINE_HEX} strokeDasharray="3 3" />
            <XAxis dataKey="week" stroke={ASH} style={{ ...mono, fontSize: fs.caption }} />
            <YAxis stroke={ASH} style={{ ...mono, fontSize: fs.caption }} allowDecimals={false} />
            <Tooltip contentStyle={tip} />
            <Line type="monotone" dataKey="signups" stroke={LIME_HEX} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="sessions" stroke={BLUE} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>

      {s.planPopularity.length > 0 && (
        <ChartFrame span={2} title="Plans enrolled" kicker="By goal" c={LIME}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={s.planPopularity}>
              <CartesianGrid stroke={LINE_HEX} strokeDasharray="3 3" />
              <XAxis dataKey="goal" stroke={ASH} style={{ ...mono, fontSize: fs.caption }} />
              <YAxis stroke={ASH} style={{ ...mono, fontSize: fs.caption }} allowDecimals={false} />
              <Tooltip contentStyle={tip} />
              <Bar dataKey="n" fill={LIME_HEX} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      )}

      <ChartFrame span={1} title="Roles" kicker="User base" c={AMBER}>
        <div style={{ display: "flex", flexDirection: "column", gap: space.ms, marginTop: 4 }}>
          {s.roleSplit.length === 0 && <Mono s={{ fontSize: fs.bodyLg }}>No users yet.</Mono>}
          {s.roleSplit.map((r) => (
            <div key={r.role} style={{ display: "flex", justifyContent: "space-between" }}>
              <Mono s={{ fontSize: fs.bodyLg }} c={roleColor[r.role] ?? CHALK}>{r.role}</Mono>
              <Mono s={{ fontSize: fs.body }}>{r.n}</Mono>
            </div>
          ))}
        </div>
      </ChartFrame>

      <ChartFrame span={1} title="Languages" kicker="Users by locale" c={BLUE}>
        <div style={{ display: "flex", flexDirection: "column", gap: space.ms, marginTop: 4 }}>
          {s.langSplit.length === 0 && <Mono s={{ fontSize: fs.bodyLg }}>—</Mono>}
          {s.langSplit.map((l) => (
            <div key={l.lang} style={{ display: "flex", justifyContent: "space-between" }}>
              <Mono s={{ fontSize: fs.bodyLg }} c={CHALK}>{l.lang.toUpperCase()}</Mono>
              <Mono s={{ fontSize: fs.body }}>{l.n}</Mono>
            </div>
          ))}
        </div>
      </ChartFrame>
    </div>
  );
}
