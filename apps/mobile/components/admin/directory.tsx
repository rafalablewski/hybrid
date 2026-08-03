import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { adminGet } from "../../lib/admin-api";
import { fs, space, Mono, Chip, Loading, F } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { Intro, ErrorNote, Segmented, KV } from "./_kit";
import { ACard, cardStack } from "../aurora/kit";

// Read-only platform directory: organizations + coach↔client links. Mirrors
// apps/web/components/admin/directory.tsx (/api/admin/orgs + /api/admin/coaching),
// rendered as card rows instead of tables for mobile.
type Org = { id: string; name: string; createdAt: string; teams: number; members: number };
type Link = { id: string; status: string; createdAt: string; coach: string; client: string; notes: number };
type View2 = "orgs" | "coaching";

const fmt = (d: string) => new Date(d).toISOString().slice(0, 10);

export default function AdminDirectory() {
  const { palette } = useTheme();
  const statusColor: Record<string, string> = {
    ACTIVE: palette.lime,
    PENDING: palette.amber,
    ENDED: palette.ash,
  };

  const [view, setView] = useState<View2>("orgs");
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [links, setLinks] = useState<Link[] | null>(null);
  const [counts, setCounts] = useState<{ status: string; n: number }[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    adminGet<{ orgs: Org[] }>("/api/admin/orgs").then((res) => {
      if (res.ok) setOrgs(res.data?.orgs ?? []);
      else {
        setOrgs([]);
        setErr("Couldn't load the directory — try reloading.");
      }
    });
    adminGet<{ links: Link[]; counts: { status: string; n: number }[] }>("/api/admin/coaching").then((res) => {
      if (res.ok) {
        setLinks(res.data?.links ?? []);
        setCounts(res.data?.counts ?? []);
      } else {
        setLinks([]);
        setErr("Couldn't load the directory — try reloading.");
      }
    });
  }, []);

  return (
    <View>
      <Segmented<View2>
        options={[
          { value: "orgs", label: `Orgs${orgs ? ` – ${orgs.length}` : ""}` },
          { value: "coaching", label: `Coaching${links ? ` – ${links.length}` : ""}` },
        ]}
        value={view}
        onChange={setView}
      />

      <ErrorNote error={err} onDismiss={() => setErr(null)} />

      {view === "orgs" && (
        <View>
          <Intro>Organizations across the platform — teams and membership counts.</Intro>
          {orgs === null ? (
            <Loading />
          ) : orgs.length === 0 ? (
            <Mono color={palette.ash}>No organizations yet.</Mono>
          ) : (
            orgs.map((o) => (
              <ACard key={o.id} style={cardStack}>
                <Text style={{ fontFamily: F.semi, fontSize: fs.note, color: palette.chalk, marginBottom: 6 }}>{o.name}</Text>
                <KV k="Teams" v={o.teams} />
                <KV k="Members" v={o.members} />
                <KV k="Created" v={fmt(o.createdAt)} />
              </ACard>
            ))
          )}
        </View>
      )}

      {view === "coaching" && (
        <View>
          <Intro>Coach ↔ client links across the platform.</Intro>
          {counts.length > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginBottom: 12 }}>
              {counts.map((c) => (
                <Chip key={c.status} color={statusColor[c.status] ?? palette.chalk}>
                  {c.status} – {c.n}
                </Chip>
              ))}
            </View>
          )}
          {links === null ? (
            <Loading />
          ) : links.length === 0 ? (
            <Mono color={palette.ash}>No coaching links yet.</Mono>
          ) : (
            links.map((l) => (
              <ACard key={l.id} style={cardStack}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: palette.chalk, flexShrink: 1 }}>
                    {l.coach} → {l.client}
                  </Text>
                  <Chip color={statusColor[l.status] ?? palette.chalk}>{l.status}</Chip>
                </View>
                <KV k="Notes" v={l.notes} />
                <KV k="Since" v={fmt(l.createdAt)} />
              </ACard>
            ))
          )}
        </View>
      )}
    </View>
  );
}
