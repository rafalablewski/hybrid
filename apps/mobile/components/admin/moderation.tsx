import { useCallback, useEffect, useState } from "react";
import { View, Text } from "react-native";
import { adminGet, adminSend } from "../../lib/admin-api";
import { fs, space, Mono, Chip, LoadSwap, F } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { Intro, Banner, ErrorNote, FilterGroup, PillBtn } from "./_kit";
import { ACard, cardStack } from "../aurora/kit";
import { useConfirm } from "../aurora/confirm";

// The moderation queue: discoverable talent profiles awaiting approval + open
// content reports. Mirrors apps/web/components/admin/moderation.tsx and its
// /api/admin/moderation routes (optimistic action → resync, unavailable state).
type PendingProfile = {
  id: string;
  name: string;
  email: string;
  sport: string;
  sex: string;
  age: number;
  metrics: Record<string, number>;
  updatedAt: string;
};
type ReportItem = {
  id: string;
  reporterEmail: string;
  targetType: string;
  targetId: string;
  reason: string;
  detail: string | null;
  createdAt: string;
  target: { name: string; email: string; sport: string; visibility: string; moderationStatus: string } | null;
};
type ModResp = { pendingProfiles?: PendingProfile[]; reports?: ReportItem[]; unavailable?: boolean };
type Tab = "profiles" | "reports";

export default function AdminModeration() {
  const { confirmText } = useConfirm();
  const { palette } = useTheme();
  const [tab, setTab] = useState<Tab>("profiles");
  const [profiles, setProfiles] = useState<PendingProfile[] | null>(null);
  const [reports, setReports] = useState<ReportItem[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    adminGet<ModResp>("/api/admin/moderation").then((res) => {
      const d = res.data ?? {};
      setUnavailable(Boolean(d.unavailable));
      setProfiles(d.pendingProfiles ?? []);
      setReports(d.reports ?? []);
    });
  }, []);

  useEffect(load, [load]);

  async function moderateProfile(id: string, action: "approve" | "reject", note?: string) {
    setBusy(id);
    setErr(null);
    const res = await adminSend("PATCH", `/api/admin/moderation/profile/${id}`, { action, note });
    if (!res.ok) setErr(res.error ?? "That action didn't go through — re-syncing the queue.");
    setBusy(null);
    load();
  }

  async function resolveReport(id: string, action: "dismiss" | "resolve" | "takedown", note?: string) {
    setBusy(id);
    setErr(null);
    const res = await adminSend("PATCH", `/api/admin/moderation/report/${id}`, { action, note });
    if (!res.ok) setErr(res.error ?? "That action didn't go through — re-syncing the queue.");
    setBusy(null);
    load();
  }

  // Reject / takedown can carry an optional note. This used to branch on
  // `Alert.prompt`, which is iOS-ONLY: the non-iOS path fell back to a plain
  // confirm and silently DROPPED the note — a moderator on Android could not
  // record why they took something down. The shared confirm sheet has the field
  // on every platform, so the branch is gone with the system dialog.
  const confirmWithNote = async (
    title: string,
    message: string,
    onConfirm: (note?: string) => void,
    destructive?: boolean,
  ) => {
    const note = await confirmText({
      title,
      message,
      confirmLabel: title,
      destructive,
      input: { placeholder: "Add a note (optional)" },
    });
    if (note !== null) onConfirm(note.trim() || undefined);
  };

  if (unavailable)
    return (
      <Banner tone="amber" title="Moderation not initialized">
        The moderation tables aren&apos;t set up yet. Run reference/sql-moderation.sql in the Supabase SQL Editor, then
        reload.
      </Banner>
    );

  return (
    <LoadSwap loading={profiles === null || reports === null}>
      {() => {
        if (profiles === null || reports === null) return null;
        const pCount = profiles.length;
        const rCount = reports.length;

        return (
          <View>
            <FilterGroup<Tab>
              options={[
                { value: "profiles", label: `Pending profiles${pCount ? ` – ${pCount}` : ""}` },
                { value: "reports", label: `Reports${rCount ? ` – ${rCount}` : ""}` },
              ]}
              value={tab}
              onChange={setTab}
            />

            <ErrorNote error={err} onDismiss={() => setErr(null)} />

            {tab === "profiles" && (
              <View>
                <Intro>Discoverable talent profiles awaiting approval before they surface in discovery.</Intro>
                {pCount === 0 ? (
                  <Mono color={palette.ash}>No profiles awaiting review.</Mono>
                ) : (
                  profiles.map((p) => (
                    <ACard key={p.id} accent={palette.amber} style={cardStack}>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginBottom: 6 }}>
                        <Chip color={palette.amber}>pending</Chip>
                        <Chip color={palette.ash}>{p.sport}</Chip>
                        <Chip color={palette.ash}>
                          {p.sex}
                          {p.age}
                        </Chip>
                      </View>
                      <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: palette.chalk }}>{p.name}</Text>
                      <Mono color={palette.ash} style={{ marginTop: 2 }}>{p.email}</Mono>
                      <Mono color={palette.ash} style={{ marginTop: 6, lineHeight: 18 }}>
                        {Object.entries(p.metrics ?? {})
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" – ") || "no metrics"}
                      </Mono>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: 16 }}>
                        <PillBtn
                          label="Approve"
                          onPress={() => moderateProfile(p.id, "approve")}
                          color={palette.lime}
                          disabled={busy === p.id}
                        />
                        <PillBtn
                          label="Reject"
                          onPress={() =>
                            confirmWithNote(
                              "Reject",
                              "Reason for rejection (optional, shown to no one):",
                              (note) => moderateProfile(p.id, "reject", note),
                              true,
                            )
                          }
                          color={palette.red}
                          outline
                          disabled={busy === p.id}
                        />
                      </View>
                    </ACard>
                  ))
                )}
              </View>
            )}

            {tab === "reports" && (
              <View>
                <Intro>
                  User-flagged content. Take down to drop the target from discovery; dismiss if it&apos;s fine.
                </Intro>
                {rCount === 0 ? (
                  <Mono color={palette.ash}>No open reports.</Mono>
                ) : (
                  reports.map((r) => (
                    <ACard key={r.id} accent={palette.red} style={cardStack}>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginBottom: 6 }}>
                        <Chip color={palette.red}>{r.reason}</Chip>
                        <Chip color={palette.ash}>{r.targetType}</Chip>
                        {r.target && (
                          <Chip color={r.target.moderationStatus === "approved" ? palette.lime : palette.amber}>
                            {r.target.moderationStatus}
                          </Chip>
                        )}
                      </View>
                      <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: palette.chalk }}>
                        {r.target
                          ? `${r.target.name} – ${r.target.sport}`
                          : `${r.targetType}:${r.targetId.slice(0, 8)} (target gone)`}
                      </Text>
                      {r.detail ? (
                        <Mono color={palette.chalk} style={{ marginTop: 4, lineHeight: 18 }}>
                          “{r.detail}”
                        </Mono>
                      ) : null}
                      <Mono color={palette.ash} style={{ marginTop: 6 }}>
                        reported by {r.reporterEmail} – {new Date(r.createdAt).toLocaleDateString()}
                      </Mono>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: 16 }}>
                        <PillBtn
                          label="Take down"
                          onPress={() =>
                            confirmWithNote(
                              "Take down",
                              "Takedown note (optional):",
                              (note) => resolveReport(r.id, "takedown", note),
                              true,
                            )
                          }
                          color={palette.red}
                          disabled={busy === r.id}
                        />
                        <PillBtn
                          label="Dismiss"
                          onPress={() => resolveReport(r.id, "dismiss")}
                          color={palette.ash}
                          outline
                          disabled={busy === r.id}
                        />
                        <PillBtn
                          label="Mark resolved"
                          onPress={() => resolveReport(r.id, "resolve")}
                          color={palette.ash}
                          outline
                          disabled={busy === r.id}
                        />
                      </View>
                    </ACard>
                  ))
                )}
              </View>
            )}
          </View>
        );
      }}
    </LoadSwap>
  );
}
