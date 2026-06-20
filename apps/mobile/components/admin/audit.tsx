import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { adminGet } from "../../lib/admin-api";
import { Card, Mono, Chip, Loading, F } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { Input, PillBtn, Banner } from "./_kit";

// Mobile Audit log — parity with apps/web/components/admin/audit.tsx, fed by
// GET /api/admin/audit?page&pageSize&action. Action text filter (debounced like
// web), Prev/Next pagination, each row tappable to reveal the JSON metadata, and
// the amber "table not migrated" unavailable state.

type Entry = {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  summary: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
};
type Resp = { total: number; page: number; pages: number; entries: Entry[]; unavailable?: boolean };

export default function AdminAudit() {
  const { palette } = useTheme();
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Resp | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "50" });
    if (action) params.set("action", action);
    setErr(null);
    adminGet<Resp>(`/api/admin/audit?${params.toString()}`).then((r) => {
      if (r.ok && r.data) setData(r.data);
      else {
        setData(null);
        setErr("Couldn't load the audit log — try reloading.");
      }
      setLoading(false);
    });
  }, [action, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  if (data?.unavailable)
    return (
      <Banner tone="amber" title="Audit log not initialized">
        The AdminAudit table doesn&apos;t exist yet. Run reference/sql-admin-audit.sql in the Supabase SQL Editor to
        create it. Until then, privileged actions still work but aren&apos;t recorded.
      </Banner>
    );

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Input
            value={action}
            onChangeText={(t) => {
              setAction(t);
              setPage(1);
            }}
            placeholder="Filter by action (e.g. user.update)…"
          />
        </View>
        <Mono color={palette.ash} style={{ fontSize: 12 }}>{data ? `${data.total.toLocaleString()} events` : "…"}</Mono>
      </View>

      {err ? <Mono color={palette.red} style={{ fontSize: 12, marginBottom: 12 }}>{err}</Mono> : null}

      {loading && !data ? <Loading /> : null}

      {data && data.entries.length === 0 ? (
        <Mono color={palette.ash} style={{ fontSize: 13, textAlign: "center", paddingVertical: 30 }}>No audit events recorded yet.</Mono>
      ) : null}

      {data?.entries.map((e) => {
        const isOpen = open === e.id;
        return (
          <Card key={e.id}>
            <Pressable onPress={() => setOpen(isOpen ? null : e.id)}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <Mono color={palette.ash} style={{ fontSize: 11 }}>
                  {new Date(e.createdAt).toISOString().slice(0, 19).replace("T", " ")}
                </Mono>
                <Chip color={palette.amber}>{e.action}</Chip>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6 }}>
                <Mono color={palette.chalk} style={{ fontSize: 12, flex: 1 }}>{e.actorEmail}</Mono>
                <Text style={{ color: palette.ash, fontFamily: F.mono }}>{isOpen ? "▾" : "▸"}</Text>
              </View>
              <Mono color={palette.ash} style={{ fontSize: 12, marginTop: 4 }}>
                {e.summary || (e.targetType ? `${e.targetType}:${e.targetId?.slice(0, 8)}` : "—")}
              </Mono>
            </Pressable>
            {isOpen ? (
              <View style={{ marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: palette.ink2 }}>
                <Mono color={palette.ash} style={{ fontSize: 11, lineHeight: 16 }}>
                  {JSON.stringify({ ip: e.ip, targetType: e.targetType, targetId: e.targetId, metadata: e.metadata }, null, 2)}
                </Mono>
              </View>
            ) : null}
          </Card>
        );
      })}

      {data && data.pages > 1 ? (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 12 }}>
          <PillBtn label="← Prev" outline disabled={page <= 1} onPress={() => setPage((p) => Math.max(1, p - 1))} />
          <Mono color={palette.ash} style={{ fontSize: 12 }}>{data.page} / {data.pages}</Mono>
          <PillBtn label="Next →" outline disabled={page >= data.pages} onPress={() => setPage((p) => p + 1)} />
        </View>
      ) : null}
    </View>
  );
}
