import { useEffect, useState } from "react";
import { View } from "react-native";
import { adminGet } from "../../lib/admin-api";
import { fs, space, Mono, Kicker, LoadSwap } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { Stat, ErrorNote } from "./_kit";
import { ACard, cardStack, AMeter } from "../aurora/kit";

// Mobile Overview — parity with apps/web/components/admin/overview.tsx, fed by
// GET /api/admin/stats. Web draws recharts line/bar charts; on mobile we keep the
// same DATA but render the growth series + splits as label+bar ROWS (no chart dep).

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
  return (
    <LoadSwap loading={!s}>
      {() => {
        if (!s) return null;
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
              <Stat label="Active coach links" value={s.activeLinks.toLocaleString()} color={palette.violet} />
              <Stat label="Avg sessions / user" value={s.totalUsers ? (s.sessions / s.totalUsers).toFixed(1) : "0"} />
            </Row2>
            <Row2>
              <Stat label="30d activation" value={s.totalUsers ? `${Math.round((s.mau / s.totalUsers) * 100)}%` : "0%"} color={palette.lime} />
            </Row2>

            {/* Growth — the web line chart's underlying numbers as paired bar rows. */}
            <ACard style={cardStack}>
              <Kicker color={palette.lime}>Growth</Kicker>
              <Mono color={palette.ash} style={{ marginTop: 2, marginBottom: 10 }}>Last 12 weeks – signups vs sessions</Mono>
              <View style={{ flexDirection: "row", gap: space.md, marginBottom: 8 }}>
                <Legend color={palette.lime} label="signups" />
                <Legend color={palette.blue} label="sessions" />
              </View>
              {(() => {
                const max = Math.max(1, ...s.growth.map((g) => Math.max(g.signups, g.sessions)));
                return s.growth.map((g) => (
                  <View key={g.week} style={{ marginBottom: 8 }}>
                    <Mono color={palette.ash} style={{ fontSize: fs.micro, marginBottom: 3 }}>{g.week}</Mono>
                    <AMeter value={String(g.signups)} pct={((g.signups) / ((max) || 1)) * 100} color={palette.lime} />
                    <AMeter value={String(g.sessions)} pct={((g.sessions) / ((max) || 1)) * 100} color={palette.blue} />
                  </View>
                ));
              })()}
            </ACard>

            {s.planPopularity.length > 0 && (
              <ACard style={cardStack}>
                <Kicker color={palette.lime}>Plans enrolled – by goal</Kicker>
                <View style={{ marginTop: 10 }}>
                  {(() => {
                    const max = Math.max(1, ...s.planPopularity.map((p) => p.n));
                    return s.planPopularity.map((p) => (
                      <View key={p.goal} style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Mono color={palette.chalk} style={{ fontSize: fs.caption }}>{p.goal}</Mono>
                          <Mono color={palette.ash} style={{ fontSize: fs.caption }}>{p.n}</Mono>
                        </View>
                        <AMeter value={String(p.n)} pct={((p.n) / ((max) || 1)) * 100} color={palette.lime} />
                      </View>
                    ));
                  })()}
                </View>
              </ACard>
            )}

            <Row2>
              <ACard style={[cardStack, { flex: 1 }]}>
                <Kicker color={palette.amber}>Roles – user base</Kicker>
                <View style={{ marginTop: 8 }}>
                  {s.roleSplit.length === 0 && <Mono style={{ fontSize: fs.body }}>No users yet.</Mono>}
                  {s.roleSplit.map((r) => (
                    <View key={r.role} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                      <Mono color={roleColor[r.role] ?? palette.chalk} style={{ fontSize: fs.body }}>{r.role}</Mono>
                      <Mono color={palette.ash} style={{ fontSize: fs.caption }}>{r.n}</Mono>
                    </View>
                  ))}
                </View>
              </ACard>
              <ACard style={[cardStack, { flex: 1 }]}>
                <Kicker color={palette.blue}>Languages – by locale</Kicker>
                <View style={{ marginTop: 8 }}>
                  {s.langSplit.length === 0 && <Mono style={{ fontSize: fs.body }}>—</Mono>}
                  {s.langSplit.map((l) => (
                    <View key={l.lang} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                      <Mono color={palette.chalk} style={{ fontSize: fs.body }}>{l.lang.toUpperCase()}</Mono>
                      <Mono color={palette.ash} style={{ fontSize: fs.caption }}>{l.n}</Mono>
                    </View>
                  ))}
                </View>
              </ACard>
            </Row2>
          </View>
        );
      }}
    </LoadSwap>
  );
}

// Lay two cards side-by-side, each sharing half the row. Stat renders a Card with
// no intrinsic flex, so wrap each child in a flex:1 cell to split the width evenly.
function Row2({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", gap: space.md }}>
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
      <Mono color={palette.ash} style={{ fontSize: fs.micro }}>{label}</Mono>
    </View>
  );
}

