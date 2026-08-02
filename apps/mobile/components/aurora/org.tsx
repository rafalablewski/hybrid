import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import {
  buildTeamTree, flattenTree, canManageOrg, canRead, roleScope, ORG_ROLES,
  type OrgRole,
} from "@hybrid/core";
import {
  fetchOrgs, fetchOrgDetail, createOrg, createOrgTeam, addOrgMember, patchOrgMember,
  revokeOrgInvite, fetchOrgAthlete,
  type OrgSummary, type OrgDetail, type OrgMember, type OrgAthleteView,
} from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { ABack, AuroraScreen, ACard, AHeading, APill, RADIUS } from "./kit";

const hpiColor = (C: Palette, b: string) =>
  b === "peak" || b === "primed" || b === "low" ? txt(C, C.lime)
  : b === "moderate" ? txt(C, C.blue)
  : b === "compromised" || b === "elevated" ? txt(C, C.amber)
  : txt(C, C.red);

const roleColor = (C: Palette, r: OrgRole) =>
  r === "OWNER" || r === "DIRECTOR" ? txt(C, C.lime)
  : r === "COACH" ? txt(C, C.blue)
  : r === "MEDICAL" ? txt(C, C.amber)
  : r === "ANALYST" ? txt(C, C.violet)
  : C.ash;

/** AURORA Org Graph (mobile) — the twin of the web console
 *  (apps/web/components/aurora/org.tsx), on the same /api/org endpoints and the
 *  same shared authority engines (buildTeamTree / flattenTree / canManageOrg /
 *  canRead / roleScope), so what a role may see and do is identical on both
 *  clients — the permission logic lives in core, not in either client.
 *
 *  The web version is a two-column grid with <select> dropdowns; on a phone the
 *  columns stack and each dropdown becomes a tap-through rail of role/team
 *  pills. Same operations: create an org, add nested teams, add or invite
 *  members, change a member's role or team, revoke an invite, and open an
 *  athlete's Performance-State readout. Part of closing mobile-team-surfaces. */
export default function AuroraOrg() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [newOrg, setNewOrg] = useState("");
  const [newTeam, setNewTeam] = useState("");
  const [newTeamParent, setNewTeamParent] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("COACH");
  const [inviteErr, setInviteErr] = useState("");
  const [athlete, setAthlete] = useState<(OrgAthleteView & { name: string }) | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const loadOrgs = useCallback(async () => {
    const list = await fetchOrgs();
    setOrgs(list);
    setSelected((cur) => cur ?? list[0]?.id ?? null);
  }, []);

  const loadDetail = useCallback(async (id: string) => setDetail(await fetchOrgDetail(id)), []);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);
  useEffect(() => { if (selected) loadDetail(selected); }, [selected, loadDetail]);

  const onCreateOrg = async () => {
    if (!newOrg.trim()) return;
    const id = await createOrg(newOrg.trim());
    if (id) { setNewOrg(""); await loadOrgs(); setSelected(id); }
  };

  const onAddTeam = async () => {
    if (!selected || !newTeam.trim()) return;
    if (await createOrgTeam(selected, newTeam.trim(), newTeamParent)) {
      setNewTeam(""); setNewTeamParent(""); loadDetail(selected);
    }
  };

  const onInvite = async () => {
    if (!selected || !inviteEmail.trim()) return;
    setInviteErr("");
    const r = await addOrgMember(selected, inviteEmail.trim(), inviteRole);
    if (r.ok) {
      setInviteEmail("");
      setInviteErr(r.pending ? t("w.teams.org.invitedPending") : "");
      loadDetail(selected);
    } else {
      setInviteErr(r.error ?? t("w.teams.org.couldNotAddMember"));
    }
  };

  const onSetMember = async (mid: string, patch: { role?: OrgRole; teamId?: string | null }) => {
    if (!selected) return;
    if (await patchOrgMember(selected, mid, patch)) loadDetail(selected);
  };

  const onRevoke = async (iid: string) => {
    if (!selected) return;
    if (await revokeOrgInvite(selected, iid)) loadDetail(selected);
  };

  const onViewAthlete = async (m: OrgMember) => {
    if (!selected) return;
    setAthlete(null);
    const d = await fetchOrgAthlete(selected, m.userId);
    if (d) setAthlete({ ...d, name: m.name });
  };

  const tree = detail ? flattenTree(buildTeamTree(detail.teams)) : [];
  const canManage = detail ? canManageOrg(detail.myRole) : false;
  const canSeeAthletes = detail ? canRead(detail.myRole, "performance") : false;
  const teamName = (tid: string | null) => tree.find((n) => n.id === tid)?.name ?? "—";

  return (
    <AuroraScreen>
      <ABack />
      <AHeading style={{ fontSize: fs.display, marginTop: 12 }}>{t("nav.org")}</AHeading>

      {/* org picker + create */}
      <ACard style={{ marginTop: space.md }}>
        <Text style={kicker(txt(C, C.lime))}>{t("w.teams.org.headerKicker")}</Text>
        {orgs.length === 0 ? (
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, marginTop: 10 }}>{t("w.teams.org.noOrgs")}</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ gap: space.xs, paddingRight: space.md }}>
            {orgs.map((o) => (
              <Chip key={o.id} C={C} active={o.id === selected} onPress={() => setSelected(o.id)} label={`${o.name} – ${o.role.toLowerCase()}`} />
            ))}
          </ScrollView>
        )}
        <View style={{ flexDirection: "row", gap: space.ms, marginTop: 12 }}>
          <Field C={C} value={newOrg} onChange={setNewOrg} placeholder={t("w.teams.org.newOrgPlaceholder")} />
          <APill label={t("w.teams.org.createOrg")} onPress={onCreateOrg} />
        </View>
      </ACard>

      {detail ? (
        <>
          <ACard style={{ marginTop: space.md }}>
            <Text style={kicker(txt(C, C.blue))}>{t("w.teams.org.yourAccess")} – {detail.myRole.toLowerCase()}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, marginTop: 6, lineHeight: 20 }}>{roleScope(detail.myRole)}</Text>
          </ACard>

          {/* team hierarchy */}
          <ACard style={{ marginTop: space.md }}>
            <Text style={kicker(C.ash)}>{t("w.teams.org.teamHierarchy")}</Text>
            {tree.length === 0 ? (
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, marginTop: 10 }}>{t("w.teams.org.noTeams")}</Text>
            ) : (
              tree.map((node) => {
                const count = detail.members.filter((m) => m.teamId === node.id).length;
                return (
                  <View key={node.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, marginLeft: node.depth * 18 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk }}>{node.name}</Text>
                    {count > 0 ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{count} {count === 1 ? t("w.teams.org.member") : t("w.teams.org.members")}</Text> : null}
                  </View>
                );
              })
            )}
            {canManage ? (
              <>
                <View style={{ flexDirection: "row", gap: space.ms, marginTop: 12 }}>
                  <Field C={C} value={newTeam} onChange={setNewTeam} placeholder={t("w.teams.org.newTeamPlaceholder")} />
                  <APill label={t("w.teams.org.addTeam")} onPress={onAddTeam} />
                </View>
                {tree.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: space.xs, paddingRight: space.md }}>
                    <Chip C={C} active={newTeamParent === ""} onPress={() => setNewTeamParent("")} label={t("w.teams.org.topLevel")} />
                    {tree.map((node) => (
                      <Chip key={node.id} C={C} active={newTeamParent === node.id} onPress={() => setNewTeamParent(node.id)} label={node.name} />
                    ))}
                  </ScrollView>
                ) : null}
              </>
            ) : null}
          </ACard>

          {/* staff + athletes */}
          <ACard style={{ marginTop: space.md }}>
            <Text style={kicker(C.ash)}>{t("w.teams.org.staffAthletes")}</Text>
            {detail.members.map((m) => {
              const openable = m.role === "ATHLETE" && canSeeAthletes;
              const isEditing = editing === m.id;
              return (
                <View key={m.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
                    <Pressable
                      style={{ flex: 1 }}
                      disabled={!openable}
                      onPress={() => onViewAthlete(m)}
                      accessibilityRole={openable ? "button" : undefined}
                      accessibilityLabel={openable ? `${m.name} – ${t("w.teams.org.athleteTwin")}` : undefined}
                    >
                      <Text style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: openable ? txt(C, C.lime) : C.chalk }}>{m.name}{openable ? " →" : ""}</Text>
                      {m.email ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{m.email}</Text> : null}
                      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{teamName(m.teamId)}</Text>
                    </Pressable>
                    {canManage ? (
                      <Pressable onPress={() => setEditing(isEditing ? null : m.id)} accessibilityRole="button" accessibilityState={{ expanded: isEditing }}
                        style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
                        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: roleColor(C, m.role) }}>{m.role.toLowerCase()}</Text>
                      </Pressable>
                    ) : (
                      <View style={{ backgroundColor: `${roleColor(C, m.role)}24`, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: roleColor(C, m.role) }}>{m.role.toLowerCase()}</Text>
                      </View>
                    )}
                  </View>

                  {/* the web <select> pair, as tap-through rails */}
                  {canManage && isEditing ? (
                    <View style={{ marginTop: 10 }}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingRight: space.md }}>
                        {ORG_ROLES.map((r) => (
                          <Chip key={r} C={C} active={m.role === r} onPress={() => onSetMember(m.id, { role: r })} label={r.toLowerCase()} />
                        ))}
                      </ScrollView>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }} contentContainerStyle={{ gap: space.xs, paddingRight: space.md }}>
                        <Chip C={C} active={m.teamId == null} onPress={() => onSetMember(m.id, { teamId: null })} label={t("w.teams.org.noTeam")} />
                        {tree.map((node) => (
                          <Chip key={node.id} C={C} active={m.teamId === node.id} onPress={() => onSetMember(m.id, { teamId: node.id })} label={node.name} />
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
              );
            })}

            {canManage ? (
              <View style={{ marginTop: 12 }}>
                <View style={{ flexDirection: "row", gap: space.ms }}>
                  <Field C={C} value={inviteEmail} onChange={setInviteEmail} placeholder="member@email.com" keyboardType="email-address" />
                  <APill label={t("w.teams.org.addMember")} onPress={onInvite} />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: space.xs, paddingRight: space.md }}>
                  {ORG_ROLES.map((r) => (
                    <Chip key={r} C={C} active={inviteRole === r} onPress={() => setInviteRole(r)} label={r.toLowerCase()} />
                  ))}
                </ScrollView>
                {inviteErr ? <Text accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.red), marginTop: 8 }}>{inviteErr}</Text> : null}
              </View>
            ) : null}

            {canManage && detail.invites.length > 0 ? (
              <View style={{ marginTop: 14 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>{t("w.teams.org.pendingInvites")}</Text>
                {detail.invites.map((iv) => (
                  <View key={iv.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
                    <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{iv.email} – {iv.role.toLowerCase()}</Text>
                    <Pressable onPress={() => onRevoke(iv.id)} accessibilityRole="button" accessibilityLabel={`${t("w.teams.org.revoke")} ${iv.email}`} hitSlop={8}>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.red) }}>{t("w.teams.org.revoke")}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </ACard>

          {/* athlete Performance-State readout */}
          {athlete ? (
            <ACard style={{ marginTop: space.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space.ms }}>
                <Text style={[kicker(txt(C, C.blue)), { flexShrink: 1 }]}>{t("w.teams.org.athleteTwin")} – {athlete.name}</Text>
                <Pressable onPress={() => setAthlete(null)} accessibilityRole="button" accessibilityLabel={t("common.close")} hitSlop={8}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>✕</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.lg, marginTop: 8 }}>
                <Text style={{ fontFamily: F.black, fontSize: 40, color: hpiColor(C, athlete.hpi.band) }}>{athlete.hpi.score}</Text>
                <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  <Tag C={C} color={hpiColor(C, athlete.hpi.band)} label={athlete.hpi.band} />
                  <Tag C={C} color={txt(C, C.amber)} label={`${t("w.teams.org.limiter")} – ${athlete.hpi.limiter}`} />
                  <Tag C={C} color={athlete.injury.flaggedCount ? txt(C, C.red) : txt(C, C.lime)} label={`${t("w.teams.org.injury")} ${athlete.injury.overall}/100`} />
                </View>
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, marginTop: 10, lineHeight: 20 }}>{athlete.summary}</Text>
              {athlete.injury.tissues ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {athlete.injury.tissues.filter((x) => x.risk > 0).map((x) => (
                    <Tag key={x.tissue} C={C} color={hpiColor(C, x.band)} label={`${x.tissue} ${x.risk}`} />
                  ))}
                </View>
              ) : (
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 8 }}>{athlete.injury.flaggedCount} {t("w.teams.org.tissuesFlagged")}</Text>
              )}
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 8 }}>{athlete.sessionCount} {t("w.teams.org.sessionsLogged")}</Text>
            </ACard>
          ) : null}
        </>
      ) : null}

      <View style={{ height: RADIUS.card }} />
    </AuroraScreen>
  );
}

const kicker = (color: string) => ({ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase" as const, letterSpacing: 1.4, color });

function Field({ C, value, onChange, placeholder, keyboardType }: { C: Palette; value: string; onChange: (v: string) => void; placeholder: string; keyboardType?: "email-address" }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={C.ash}
      autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
      keyboardType={keyboardType}
      style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 12 }}
    />
  );
}

function Chip({ C, active, label, onPress }: { C: Palette; active: boolean; label: string; onPress: () => void }) {
  const accent = txt(C, C.lime);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}
      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: active ? accent : C.line, backgroundColor: active ? `${accent}29` : "transparent" }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: active ? accent : C.ash }}>{label}</Text>
    </Pressable>
  );
}

function Tag({ C, color, label }: { C: Palette; color: string; label: string }) {
  return (
    <View style={{ backgroundColor: `${color}24`, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 3 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color }}>{label}</Text>
    </View>
  );
}
