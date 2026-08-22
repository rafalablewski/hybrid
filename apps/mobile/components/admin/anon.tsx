import { useCallback, useEffect, useState } from "react";
import { View, Text } from "react-native";
import { adminGet, adminSend } from "../../lib/admin-api";
import { fs, space, Mono, Chip, LoadSwap, F } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { Intro, ErrorNote, PillBtn } from "./_kit";
import { ACard, cardStack } from "../aurora/kit";
import { useConfirm } from "../aurora/confirm";

// Anonymous (guest, pre-account) workouts — sessions logged on a device before
// the user ever signed in. Admin-only housekeeping: review and prune them.
// Mirrors apps/web/components/admin/anon-sessions.tsx (rows instead of a table).
type Block = { name?: string; kind?: string };
type AnonSession = {
  id: string;
  deviceId: string;
  platform: string | null;
  title: string;
  startedAt: string;
  blocks: Block[];
  createdAt: string;
};

const fmt = (d: string) => new Date(d).toISOString().slice(0, 19).replace("T", " ");
const trunc = (s: string) => (s.length > 12 ? `${s.slice(0, 8)}…${s.slice(-4)}` : s);

export default function AdminAnon() {
  const { confirm } = useConfirm();
  const { palette } = useTheme();
  const platformColor = (p: string | null) =>
    p === "ios" ? palette.blue : p === "web" ? palette.lime : p === "android" ? palette.red : palette.ash;

  const [sessions, setSessions] = useState<AnonSession[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    adminGet<{ sessions?: AnonSession[] }>("/api/admin/anon-sessions").then((res) => {
      setSessions(res.ok ? res.data?.sessions ?? [] : []);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string, title: string) => {
    const ok = await confirm({
      title: "Delete guest session",
      message: `Permanently delete the anonymous workout “${title}”? This can't be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setBusy(id);
    setErr(null);
    const res = await adminSend("DELETE", `/api/admin/anon-sessions?id=${encodeURIComponent(id)}`);
    if (!res.ok) setErr(res.error ?? "Delete failed — re-syncing.");
    setBusy(null);
    load();
  };

  return (
    <LoadSwap loading={sessions === null}>
      {() => {
        if (sessions === null) return null;
        return (
          <View>
            <Intro>Guest workouts logged on a device before any account existed.</Intro>
            <Mono color={palette.ash} style={{ marginBottom: 16 }}>
              {sessions.length.toLocaleString()} session{sessions.length === 1 ? "" : "s"}
            </Mono>

            <ErrorNote error={err} onDismiss={() => setErr(null)} />

            {sessions.length === 0 ? (
              <Mono color={palette.ash}>No anonymous workouts.</Mono>
            ) : (
              sessions.map((s) => (
                <ACard key={s.id} style={cardStack}>
                  <Text style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: palette.chalk }}>{s.title}</Text>
                  <Mono color={palette.ash} style={{ marginTop: 2 }}>
                    {s.blocks.length} block{s.blocks.length === 1 ? "" : "s"}
                    {s.blocks.length
                      ? ` – ${s.blocks.map((b) => b.name).filter(Boolean).slice(0, 4).join(", ")}`
                      : ""}
                  </Mono>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 8 }}>
                    <Chip color={platformColor(s.platform)}>{s.platform ?? "—"}</Chip>
                    <Chip color={palette.ash}>{trunc(s.deviceId)}</Chip>
                  </View>
                  <Mono color={palette.ash} style={{ marginTop: 8 }}>started {fmt(s.startedAt)}</Mono>
                  <View style={{ marginTop: 12 }}>
                    <PillBtn
                      label="Delete"
                      busyLabel="Deleting…"
                      onPress={() => remove(s.id, s.title)}
                      color={palette.red}
                      outline
                      disabled={busy === s.id}
                      busy={busy === s.id}
                    />
                  </View>
                </ACard>
              ))
            )}
          </View>
        );
      }}
    </LoadSwap>
  );
}
