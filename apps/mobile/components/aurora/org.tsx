import { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView } from "react-native";
import {
  buildTeamTree, flattenTree, canManageOrg, canRead, roleScope, ORG_ROLES,
  type OrgRole,
} from "@hybrid/core";
import {
  fetchOrgs, fetchOrgDetail, createOrg, addOrgTeam, inviteOrgMember, setOrgMember, revokeOrgInvite, fetchOrgAthlete,
  type Org, type OrgDetail, type OrgMember, type OrgAthleteView,
} from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading } from "./kit";

/**
 * AURORA Org Graph (mobile) — parity with apps/web/components/aurora/org.tsx.
 * Same /api/org flow: multi-org switcher, role-scoped team hierarchy + staff
 * management (create org, add teams, invite/role/move members, revoke invites)
 * and the per-athlete Performance State twin. Web's <select>s become inline
 * role/team pill pickers (no native picker on RN); members expand in place to
 * edit.
 */

const ROLE_COLOR_NAME: Record<OrgRole, string> = {
  OWNER: "lime", DIRECTOR: "lime", COACH: "blue", MEDICAL: "amber", ANALYST: "violet", ATHLETE: "ash",
};

export default function AuroraOrg() {
  const { t } = useLang();
  const { palette: C } = useTheme();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [newOrg, setNewOrg] = useState("");
  const [newTeam, setNewTeam] = useState("");
  const [newTeamParent, setNewTeamParent] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("COACH");
  const [inviteErr, setInviteErr] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [athlete, setAthlete] = useState<OrgAthleteView | null>(null);

  const colorOf = (name: string) =>
    name === "lime" ? C.lime : name === "blue" ? C.blue : name === "amber" ? C.amber : name === "violet" ? C.violet : name === "red" ? C.red : C.ash;
  const hpiColor = (b: string) =>
    b === "peak" || b === "primed" || b === "low" ? C.lime : b === "moderate" ? C.blue : b === "compromised" || b === "elevated" ? C.amber : C.red;

  const loadOrgs = async () => {
    const list = await fetchOrgs();
    setOrgs(list);
    setSelected((cur) => cur ?? list[0]?.id ?? null);
  };
  const loadDetail = async (id: string) => setDetail(await fetchOrgDetail(id));

  useEffect(() => { loadOrgs(); }, []);
  useEffect(() => { if (selected) loadDetail(selected); }, [selected]);

  const doCreateOrg = async () => {
    if (!newOrg.trim()) return;
    const o = await createOrg(newOrg.trim());
    if (o) { setNewOrg(""); await loadOrgs(); setSelected(o.id); }
  };
  const doAddTeam = async () => {
    if (!selected || !newTeam.trim()) return;
    if (await addOrgTeam(selected, newTeam.trim(), newTeamParent || undefined)) { setNewTeam(""); setNewTeamParent(""); loadDetail(selected); }
  };
  const doInvite = async () => {
    if (!selected || !inviteEmail.trim()) return;
    setInviteErr("");
    const r = await inviteOrgMember(selected, inviteEmail.trim(), inviteRole);
    if (r.ok) { setInviteEmail(""); setInviteErr(r.pending ? t("w.teams.org.invitedPending") : ""); loadDetail(selected); }
    else setInviteErr(r.error ?? t("w.teams.org.couldNotAddMember"));
  };
  const doSetMember = async (mid: string, patch: { role?: OrgRole; teamId?: string | null }) => {
    if (!selected) return;
    if (await setOrgMember(selected, mid, patch)) loadDetail(selected);
  };
  const doRevoke = async (iid: string) => {
    if (!selected) return;
    if (await revokeOrgInvite(selected, iid)) loadDetail(selected);
  };
  const viewAthlete = async (m: OrgMember) => {
    if (!selected) return;
    setAthlete(null);
    const d = await fetchOrgAthlete(selected, m.userId);
    if (d) setAthlete({ ...d, name: m.name });
  };

  const tree = detail ? flattenTree(buildTeamTree(detail.teams)) : [];
  const canManage = detail ? canManageOrg(detail.myRole) : false;
  const canSeeAthletes = detail ? canRead(detail.myRole, "performance") : false;
  const teamName = (tid: string | null) => tree.find((n) => n.id === tid)?.name ?? "—";

  const input = { fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 } as const;
  const Btn = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <Pressable onPress={onPress} style={{ backgroundColor: C.lime, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, justifyContent: "center" }}>
      <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>{label}</Text>
    </Pressable>
  );
  const Chip = ({ color, label }: { color: string; label: string }) => (
    <View style={{ backgroundColor: `${color}24`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, color) }}>{label}</Text>
    </View>
  );
  const SelectPill = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} style={{ borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? `${C.lime}24` : "transparent", borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11 }}>
      <Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: on ? txt(C, C.lime) : C.ash }}>{label}</Text>
    </Pressable>
  );

  return (
    <AuroraScreen>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.4, textTransform: "uppercase", color: C.lime }}>{t("w.teams.org.headerKicker")}</Text>
      <AHeading style={{ marginTop: 2, marginBottom: 16 }}>Organization</AHeading>

      {/* org switcher + create */}
      <ACard>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, alignItems: "center" }}>
          {orgs.map((o) => (
            <SelectPill key={o.id} label={`${o.name} · ${o.role.toLowerCase()}`} on={o.id === selected} onPress={() => setSelected(o.id)} />
          ))}
          {orgs.length === 0 && <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.teams.org.noOrgs")}</Text>}
        </View>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: 12 }}>
          <TextInput value={newOrg} onChangeText={setNewOrg} placeholder={t("w.teams.org.newOrgPlaceholder")} placeholderTextColor={C.ash} style={[input, { flex: 1 }]} />
          <Btn label={t("w.teams.org.createOrg")} onPress={doCreateOrg} />
        </View>
      </ACard>

      {detail && (
        <>
          <ACard style={{ marginTop: 14 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.2, color: C.blue }}>{t("w.teams.org.yourAccess")} · {detail.myRole.toLowerCase()}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, marginTop: 6, lineHeight: 18 }}>{roleScope(detail.myRole)}</Text>
          </ACard>

          {/* team hierarchy */}
          <ACard style={{ marginTop: 14 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginBottom: 10 }}>{t("w.teams.org.teamHierarchy")}</Text>
            {tree.length === 0 && <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.teams.org.noTeams")}</Text>}
            {tree.map((node) => {
              const count = detail.members.filter((m) => m.teamId === node.id).length;
              return (
                <View key={node.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5, marginLeft: node.depth * 16 }}>
                  <Text style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{node.name}</Text>
                  {count > 0 && <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{count} {count === 1 ? t("w.teams.org.member") : t("w.teams.org.members")}</Text>}
                </View>
              );
            })}
            {canManage && (
              <View style={{ marginTop: 12, gap: space.sm }}>
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  <TextInput value={newTeam} onChangeText={setNewTeam} placeholder={t("w.teams.org.newTeamPlaceholder")} placeholderTextColor={C.ash} style={[input, { flex: 1 }]} />
                  <Btn label={t("w.teams.org.addTeam")} onPress={doAddTeam} />
                </View>
                {tree.length > 0 && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, alignItems: "center" }}>
                    <SelectPill label={t("w.teams.org.topLevel")} on={newTeamParent === ""} onPress={() => setNewTeamParent("")} />
                    {tree.map((node) => (
                      <SelectPill key={node.id} label={`${"— ".repeat(node.depth)}${node.name}`} on={newTeamParent === node.id} onPress={() => setNewTeamParent(node.id)} />
                    ))}
                  </View>
                )}
              </View>
            )}
          </ACard>

          {/* staff & athletes */}
          <ACard style={{ marginTop: 14 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginBottom: 10 }}>{t("w.teams.org.staffAthletes")}</Text>
            {detail.members.map((m) => {
              const open = expanded === m.id;
              const isAthlete = m.role === "ATHLETE" && canSeeAthletes;
              return (
                <View key={m.id} style={{ borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 10 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm }}>
                    <Pressable
                      style={{ flex: 1, minWidth: 0 }}
                      onPress={() => (isAthlete ? viewAthlete(m) : canManage ? setExpanded(open ? null : m.id) : undefined)}
                    >
                      <Text style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: isAthlete ? txt(C, C.lime) : C.chalk }} numberOfLines={1}>
                        {m.name}{isAthlete ? " →" : ""}{m.email ? <Text style={{ color: C.ash }}> · {m.email}</Text> : null}
                      </Text>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{teamName(m.teamId)}</Text>
                    </Pressable>
                    {canManage ? (
                      <Pressable onPress={() => setExpanded(open ? null : m.id)} hitSlop={8}>
                        <Chip color={colorOf(ROLE_COLOR_NAME[m.role])} label={m.role.toLowerCase()} />
                      </Pressable>
                    ) : (
                      <Chip color={colorOf(ROLE_COLOR_NAME[m.role])} label={m.role.toLowerCase()} />
                    )}
                  </View>

                  {canManage && open && (
                    <View style={{ marginTop: 10, gap: 8 }}>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.8, color: C.ash }}>role</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
                        {ORG_ROLES.map((r) => <SelectPill key={r} label={r.toLowerCase()} on={m.role === r} onPress={() => doSetMember(m.id, { role: r })} />)}
                      </View>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.8, color: C.ash, marginTop: 4 }}>team</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
                        <SelectPill label={t("w.teams.org.noTeam")} on={!m.teamId} onPress={() => doSetMember(m.id, { teamId: null })} />
                        {tree.map((node) => <SelectPill key={node.id} label={`${"— ".repeat(node.depth)}${node.name}`} on={m.teamId === node.id} onPress={() => doSetMember(m.id, { teamId: node.id })} />)}
                      </View>
                    </View>
                  )}
                </View>
              );
            })}

            {canManage && (
              <View style={{ marginTop: 12, gap: space.sm }}>
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  <TextInput value={inviteEmail} onChangeText={setInviteEmail} placeholder="member@email.com" placeholderTextColor={C.ash} autoCapitalize="none" keyboardType="email-address" style={[input, { flex: 1 }]} />
                  <Btn label={t("w.teams.org.addMember")} onPress={doInvite} />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.xs, paddingRight: 8 }}>
                  {ORG_ROLES.map((r) => <SelectPill key={r} label={r.toLowerCase()} on={inviteRole === r} onPress={() => setInviteRole(r)} />)}
                </ScrollView>
                {inviteErr ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.red) }}>{inviteErr}</Text> : null}
              </View>
            )}

            {canManage && detail.invites.length > 0 && (
              <View style={{ marginTop: 14 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginBottom: 6 }}>{t("w.teams.org.pendingInvites")}</Text>
                {detail.invites.map((iv) => (
                  <View key={iv.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{iv.email} · {iv.role.toLowerCase()}</Text>
                    <Pressable onPress={() => doRevoke(iv.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${t("w.teams.org.revoke")} ${iv.email}`}>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.red) }}>{t("w.teams.org.revoke")}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </ACard>

          {/* athlete twin */}
          {athlete && (
            <ACard style={{ marginTop: 14 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.2, color: C.blue }}>{t("w.teams.org.athleteTwin")} · {athlete.name}</Text>
                <Pressable onPress={() => setAthlete(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.close")}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.ash }}>✕</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.lg, marginTop: 8 }}>
                <Text style={{ fontFamily: F.black, fontSize: 40, color: txt(C, hpiColor(athlete.hpi.band)) }}>{athlete.hpi.score}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, flex: 1 }}>
                  <Chip color={hpiColor(athlete.hpi.band)} label={athlete.hpi.band} />
                  <Chip color={C.amber} label={`${t("w.teams.org.limiter")} · ${athlete.hpi.limiter}`} />
                  <Chip color={athlete.injury.flaggedCount ? C.red : C.lime} label={`${t("w.teams.org.injury")} ${athlete.injury.overall}/100`} />
                </View>
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, marginTop: 8, lineHeight: 20 }}>{athlete.summary}</Text>
              {athlete.injury.tissues ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 10 }}>
                  {athlete.injury.tissues.filter((ti) => ti.risk > 0).map((ti) => <Chip key={ti.tissue} color={hpiColor(ti.band)} label={`${ti.tissue} ${ti.risk}`} />)}
                </View>
              ) : (
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 8 }}>{athlete.injury.flaggedCount} {t("w.teams.org.tissuesFlagged")}</Text>
              )}
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 8 }}>{athlete.sessionCount} {t("w.teams.org.sessionsLogged")}</Text>
            </ACard>
          )}
        </>
      )}
    </AuroraScreen>
  );
}
