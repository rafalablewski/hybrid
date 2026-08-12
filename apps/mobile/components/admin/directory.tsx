import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { adminGet } from "../../lib/admin-api";
import { fs, space, Mono, Chip, LoadSwap, F } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { Intro, ErrorNote, KV } from "./_kit";
import { ACard, cardStack } from "../aurora/kit";

// Read-only platform directory: coach↔client links. Mirrors
// apps/web/components/admin/directory.tsx (/api/admin/coaching), rendered as
// card rows instead of tables for mobile.
//
// The Organizations half went with the Org Graph / Team OS in the 2026-08
// strategy cuts, which is also why there is no view switcher left — one view
// does not need a filter above it.
type Link = { id: string; status: string; createdAt: string; coach: string; client: string; notes: number };

const fmt = (d: string) => new Date(d).toISOString().slice(0, 10);

export default function AdminDirectory() {
  const { palette } = useTheme();
  const statusColor: Record<string, string> = {
    ACTIVE: palette.lime,
    PENDING: palette.amber,
    ENDED: palette.ash,
  };

  const [links, setLinks] = useState<Link[] | null>(null);
  const [counts, setCounts] = useState<{ status: string; n: number }[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
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
      <ErrorNote error={err} onDismiss={() => setErr(null)} />

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
      <LoadSwap loading={links === null}>
        {() => {
          if (links === null) return null;
          return links.length === 0 ? (
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
          );
        }}
      </LoadSwap>
    </View>
  );
}
