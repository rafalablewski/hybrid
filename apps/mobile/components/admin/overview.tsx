import { useEffect, useState } from "react";
import { View } from "react-native";
import { adminGet } from "../../lib/admin-api";
import { Card, Mono, Kicker, Loading } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { Stat, ErrorNote } from "./_kit";

// Mobile Overview — parity with apps/web/components/admin/overview.tsx, fed by
// GET /api/admin/stats. Web draws recharts line/bar charts; on mobile we keep the
// same DATA but render the growth series + splits as label+bar ROWS (no chart dep).

type Stats = {
  totalUsers: number;
  sessions: number;
  newUsers30: number;
  coaches: number;
  mau: number;
  orgs: number;
  activeLinks: number;
  planPopularity: { goal: string; n: number }[];
  langSplit: { lang: string; n: number }[];
  roleSplit: { role: string; n: number }[];
  growth: { week: string; signups: number; sessions: number }[];
};

export default function AdminOverview() {
  const { palette } = useTheme();
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    adminGet<Stats>("/api/admin/stats").then((r) => {
      if (r.ok && r.data) setS(r.data);
      else setErr(true);
    });
  }, []);

  if (err) return <ErrorNote error="Failed to load platform analytics." />;
  if (!s) return <Loading />;

  const roleColor: Record<string, string> = {
    ADMIN: palette.amber,
    COACH: palette.violet,
    CLIENT: palette.lime,
  };

  return (
    <View>
      <Row2>
        <Stat label="Total users" value={s.totalUsers.toLocaleString()} sub={`+${s.newUsers30} / 30d`} color={palette.lime} />
        <Stat label="Active (30d)" value={s.mau.toLocaleString()} sub="trained in 30d" color={palette.lime} />
      </Row2>
      <Row2>
        <Stat label="Sessions logged" value={s.sessions.toLocaleString()} />
        <Stat label="Active coaches" value={s.coaches.toLocaleString()} color={palette.violet} />
      </Row2>
      <Row2>
        <Stat label="Organizations" value={s.orgs.toLocaleString()} color={palette.blue} />
        <Stat label="Active coach links" value={s.activeLinks.toLocaleString()} color={palette.violet} />
      </Row2>
      <Row2>
        <Stat label="Avg sessions / user" value={s.totalUsers ? (s.sessions / s.totalUsers).toFixed(1) : "0"} />
        <Stat label="30d activation" value={s.totalUsers ? `${Math.round((s.mau / s.totalUsers) * 100)}%` : "0%"} color={palette.lime} />
      </Row2>

      {/* Growth — the web line chart's underlying numbers as paired bar rows. */}
      <Card>
        <Kicker color={palette.lime}>Growth</Kicker>
        <Mono color={palette.ash} style={{ marginTop: 2, marginBottom: 10 }}>Last 12 weeks · signups vs sessions</Mono>
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 8 }}>
          <Legend color={palette.lime} label="signups" />
          <Legend color={palette.blue} label="sessions" />
        </View>
        {(() => {
          const max = Math.max(1, ...s.growth.map((g) => Math.max(g.signups, g.sessions)));
          return s.growth.map((g) => (
            <View key={g.week} style={{ marginBottom: 8 }}>
              <Mono color={palette.ash} style={{ fontSize: 11, marginBottom: 3 }}>{g.week}</Mono>
              <BarRow value={g.signups} max={max} color={palette.lime} />
              <BarRow value={g.sessions} max={max} color={palette.blue} />
            </View>
          ));
        })()}
      </Card>

      {s.planPopularity.length > 0 && (
        <Card>
          <Kicker color={palette.lime}>Plans enrolled · by goal</Kicker>
          <View style={{ marginTop: 10 }}>
            {(() => {
              const max = Math.max(1, ...s.planPopularity.map((p) => p.n));
              return s.planPopularity.map((p) => (
                <View key={p.goal} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Mono color={palette.chalk} style={{ fontSize: 12 }}>{p.goal}</Mono>
                    <Mono color={palette.ash} style={{ fontSize: 12 }}>{p.n}</Mono>
                  </View>
                  <BarRow value={p.n} max={max} color={palette.lime} />
                </View>
              ));
            })()}
          </View>
        </Card>
      )}

      <Row2>
        <Card style={{ flex: 1 }}>
          <Kicker color={palette.amber}>Roles · user base</Kicker>
          <View style={{ marginTop: 8 }}>
            {s.roleSplit.length === 0 && <Mono style={{ fontSize: 13 }}>No users yet.</Mono>}
            {s.roleSplit.map((r) => (
              <View key={r.role} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                <Mono color={roleColor[r.role] ?? palette.chalk} style={{ fontSize: 13 }}>{r.role}</Mono>
                <Mono color={palette.ash} style={{ fontSize: 12 }}>{r.n}</Mono>
              </View>
            ))}
          </View>
        </Card>
        <Card style={{ flex: 1 }}>
          <Kicker color={palette.blue}>Languages · by locale</Kicker>
          <View style={{ marginTop: 8 }}>
            {s.langSplit.length === 0 && <Mono style={{ fontSize: 13 }}>—</Mono>}
            {s.langSplit.map((l) => (
              <View key={l.lang} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                <Mono color={palette.chalk} style={{ fontSize: 13 }}>{l.lang.toUpperCase()}</Mono>
                <Mono color={palette.ash} style={{ fontSize: 12 }}>{l.n}</Mono>
              </View>
            ))}
          </View>
        </Card>
      </Row2>
    </View>
  );
}

// Lay two cards side-by-side, each sharing half the row. Stat renders a Card with
// no intrinsic flex, so wrap each child in a flex:1 cell to split the width evenly.
function Row2({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      {[...(Array.isArray(children) ? children : [children])].map((c, i) => (
        <View key={i} style={{ flex: 1 }}>
          {c}
        </View>
      ))}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
      <Mono color={palette.ash} style={{ fontSize: 11 }}>{label}</Mono>
    </View>
  );
}

function BarRow({ value, max, color }: { value: number; max: number; color: string }) {
  const { palette } = useTheme();
  const pct = Math.max(value > 0 ? 3 : 0, Math.round((value / max) * 100));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
      <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: palette.line, overflow: "hidden" }}>
        <View style={{ width: `${pct}%`, height: "100%", backgroundColor: color, borderRadius: 4 }} />
      </View>
      <Mono color={palette.ash} style={{ fontSize: 10, width: 26, textAlign: "right" }}>{value}</Mono>
    </View>
  );
}
