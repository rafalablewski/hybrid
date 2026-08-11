import { useCallback, useEffect, useState } from "react";
import { View, Text } from "react-native";
import { adminGet, adminSend } from "../../lib/admin-api";
import { fs, space, Mono, Chip, Loading, LoadSwap, F, PressScale as Pressable } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { Intro, ErrorNote, Input, PillBtn, FilterGroup, KV } from "./_kit";
import { ACard, cardStack } from "../aurora/kit";
import AdminAnon from "./anon";
import { useConfirm } from "../aurora/confirm";

// Paginated, searchable user directory + per-user management drawer. Mirrors
// apps/web/components/admin/users.tsx and /api/admin/users[/:id]. Each user is a
// tappable Card that expands into an inline detail (role / language editor +
// activity counts), with a danger-zone delete behind an Alert. The section also
// hosts the guest (pre-account) workouts as a second sub-tab (moved here from
// Governance so all people/usage records live under Users).

type Row = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  language: string;
  createdAt: string;
  sessions: number;
};
type ListResp = { total: number; page: number; pages: number; pageSize: number; users: Row[] };
type Detail = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  language: string;
  createdAt: string;
  linkedAuth: boolean;
  orgs: { id: string; name: string; role: string }[];
  counts: Record<string, number>;
  lastActiveAt: string | null;
};

type RoleVal = "CLIENT" | "COACH" | "ADMIN";
type LangVal = "en" | "pl" | "de";
type UsersTab = "accounts" | "guests";

const fmt = (d: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

// The Users section: an Accounts directory + the Guest workouts list, switched by
// a segmented control (mirrors the web sub-tabs).
export default function AdminUsers() {
  const [tab, setTab] = useState<UsersTab>("accounts");
  return (
    <View>
      <FilterGroup<UsersTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "accounts", label: "Accounts" },
          { value: "guests", label: "Guest sessions" },
        ]}
      />
      {tab === "accounts" ? <AccountsTab /> : <AdminAnon />}
    </View>
  );
}

function AccountsTab() {
  const { palette } = useTheme();
  const roleColor: Record<string, string> = { ADMIN: palette.amber, COACH: palette.violet, CLIENT: palette.lime };

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (q) params.set("q", q);
    adminGet<ListResp>(`/api/admin/users?${params.toString()}`)
      .then((res) => setData(res.ok ? res.data : null))
      .finally(() => setLoading(false));
  }, [q, page]);

  // Debounce search; page changes apply immediately (load depends on both).
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <View>
      <Intro>Search, inspect, and manage every account. Counts only — never raw training rows.</Intro>

      <Input
        label="Search"
        value={q}
        onChangeText={(t) => {
          setQ(t);
          setPage(1);
        }}
        placeholder="Search email or name…"
      />

      <LoadSwap loading={data === null && loading}>
        {() => data === null ? (
        <Mono color={palette.ash}>Couldn&apos;t load users — try again.</Mono>
      ) : data.users.length === 0 ? (
        <Mono color={palette.ash}>{loading ? "Loading…" : "No users match."}</Mono>
      ) : (
        data.users.map((u) => (
          <View key={u.id}>
            <Pressable onPress={() => setSelected(selected === u.id ? null : u.id)}>
              <ACard style={cardStack}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.ms }}>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={{ fontFamily: F.semi, fontSize: fs.note, color: palette.chalk }}>{u.name || "—"}</Text>
                    <Mono color={palette.ash} style={{ marginTop: 2 }}>{u.email}</Mono>
                  </View>
                  <Chip color={roleColor[u.role] ?? palette.chalk}>{u.role}</Chip>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 8 }}>
                  <Chip color={palette.ash}>{u.language.toUpperCase()}</Chip>
                  <Chip color={palette.ash}>{u.sessions} sessions</Chip>
                  <Chip color={palette.ash}>joined {fmt(u.createdAt)}</Chip>
                </View>
              </ACard>
            </Pressable>
            {selected === u.id && (
              <UserDetail
                id={u.id}
                onClose={() => setSelected(null)}
                onSaved={load}
                onDeleted={() => {
                  setSelected(null);
                  load();
                }}
              />
            )}
          </View>
        ))
      )}
      </LoadSwap>

      {data && data.pages > 1 && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <Mono color={palette.ash}>
            {data.total.toLocaleString()} – page {data.page}/{data.pages}
          </Mono>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <PillBtn label="← Prev" outline color={palette.chalk} disabled={page <= 1} onPress={() => setPage((p) => Math.max(1, p - 1))} />
            <PillBtn label="Next →" outline color={palette.chalk} disabled={page >= data.pages} onPress={() => setPage((p) => p + 1)} />
          </View>
        </View>
      )}
    </View>
  );
}

function UserDetail({
  id,
  onClose,
  onSaved,
  onDeleted,
}: {
  id: string;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { palette } = useTheme();
  const roleColor: Record<string, string> = { ADMIN: palette.amber, COACH: palette.violet, CLIENT: palette.lime };

  const [d, setD] = useState<Detail | null>(null);
  const [role, setRole] = useState<RoleVal>("CLIENT");
  const [language, setLanguage] = useState<LangVal>("en");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    adminGet<Detail>(`/api/admin/users/${id}`).then((res) => {
      if (res.ok && res.data) {
        const det = res.data;
        setD(det);
        setRole((det.role as RoleVal) ?? "CLIENT");
        setLanguage((det.language as LangVal) ?? "en");
      } else {
        setD(null);
      }
    });
  }, [id]);

  const dirty = d && (role !== d.role || language !== d.language);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const res = await adminSend<Detail>("PATCH", `/api/admin/users/${id}`, { role, language });
    if (res.ok) {
      setD((prev) => (prev ? { ...prev, role, language } : prev));
      setMsg({ ok: true, text: "Saved – recorded in the audit log." });
      onSaved();
    } else {
      // Surface the server rail (self-demote / last-admin / etc.).
      setMsg({ ok: false, text: res.error ?? "Update failed." });
    }
    setSaving(false);
  };

  // Permanently delete the account + all data. Match the web's typed-confirm
  // intent with a clear destructive Alert.
  const remove = async () => {
    if (!d) return;
    const ok = await confirm({
      title: "Delete account",
      message: `Permanently delete ${d.email} and ALL their data — sessions, check-ins, everything. This cannot be undone.`,
      confirmLabel: "Delete forever",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    setMsg(null);
    const res = await adminSend(`DELETE`, `/api/admin/users/${id}`);
    if (res.ok) {
      onDeleted();
    } else {
      setMsg({ ok: false, text: res.error ?? "Delete failed." });
      setDeleting(false);
    }
  };

  return (
    <LoadSwap loading={!d} placeholder={<ACard style={[cardStack, { marginTop: -4 }]}><Loading /></ACard>}>
      {() => {
        if (!d) return null;
        return (
          <ACard accent={palette.amber} style={[cardStack, { marginTop: -4 }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flexShrink: 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.2, color: txt(palette, palette.amber), textTransform: "uppercase" }}>
                  User record
                </Text>
                <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: palette.chalk, marginTop: 2 }}>{d.name || "—"}</Text>
                <Mono color={palette.ash}>{d.email}</Mono>
              </View>
              <Pressable onPress={onClose} hitSlop={10}>
                <Mono color={palette.ash}>Close</Mono>
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 12, marginBottom: 16 }}>
              <Chip color={roleColor[d.role] ?? palette.chalk}>{d.role}</Chip>
              <Chip color={d.linkedAuth ? palette.lime : palette.ash}>{d.linkedAuth ? "auth linked" : "no auth"}</Chip>
              <Chip color={palette.blue}>joined {fmt(d.createdAt)}</Chip>
              {d.lastActiveAt ? <Chip color={palette.chalk}>last active {fmt(d.lastActiveAt)}</Chip> : null}
            </View>

            {/* activity counts */}
            <View>
              {Object.entries(d.counts).map(([k, v]) => (
                <KV key={k} k={k.replace(/([A-Z])/g, " $1")} v={v} />
              ))}
            </View>

            {d.orgs.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.9, textTransform: "uppercase", color: palette.ash, marginBottom: 6 }}>
                  Organizations
                </Text>
                {d.orgs.map((o) => (
                  <KV key={o.id} k={o.name} v={o.role} />
                ))}
              </View>
            )}

            {/* role / language editor */}
            <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 16 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.9, textTransform: "uppercase", color: txt(palette, palette.amber), marginBottom: 8 }}>
                Manage access
              </Text>

              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: palette.ash, marginBottom: 4 }}>Role</Text>
              <FilterGroup<RoleVal>
                options={[
                  { value: "CLIENT", label: "Client" },
                  { value: "COACH", label: "Coach" },
                  { value: "ADMIN", label: "Admin" },
                ]}
                value={role}
                onChange={setRole}
              />

              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: palette.ash, marginBottom: 4 }}>Language</Text>
              <FilterGroup<LangVal>
                options={[
                  { value: "en", label: "EN" },
                  { value: "pl", label: "PL" },
                  { value: "de", label: "DE" },
                ]}
                value={language}
                onChange={setLanguage}
              />

              {msg ? (
                <View accessibilityLiveRegion={msg.ok ? "polite" : "assertive"} accessibilityRole={msg.ok ? undefined : "alert"}>
                  <Mono color={msg.ok ? palette.lime : palette.red} style={{ marginBottom: 10 }}>
                    {msg.text}
                  </Mono>
                </View>
              ) : null}

              <PillBtn
                label="Save changes"
                busyLabel="Saving…"
                onPress={save}
                color={palette.amber}
                disabled={!dirty || saving}
              />
            </View>

            {/* danger zone */}
            <View style={{ marginTop: 20, borderTopWidth: 1, borderTopColor: `${palette.red}44`, paddingTop: 16 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.9, textTransform: "uppercase", color: txt(palette, palette.red), marginBottom: 6 }}>
                Danger zone
              </Text>
              <Mono color={palette.ash} style={{ lineHeight: 18, marginBottom: 12 }}>
                Permanently delete this account and everything attached to it — sessions, check-ins, memberships. This cannot
                be undone.
              </Mono>
              <PillBtn
                label="Delete account"
                busyLabel="Deleting…"
                onPress={remove}
                color={palette.red}
                outline
                disabled={deleting}
                busy={deleting}
              />
            </View>
          </ACard>
        );
      }}
    </LoadSwap>
  );
}

  const { confirm } = useConfirm();