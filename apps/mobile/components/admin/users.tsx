import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { NAV_ITEMS } from "@hybrid/core";
import { adminGet, adminSend } from "../../lib/admin-api";
import { fs, space, Card, Mono, Chip, Loading, F } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { Intro, ErrorNote, Input, PillBtn, Segmented, KV } from "./_kit";

// Paginated, searchable user directory + per-user management drawer. Mirrors
// apps/web/components/admin/users.tsx and /api/admin/users[/:id]. Each user is a
// tappable Card that expands into an inline detail (role / language / feature
// grants editor + activity counts), with a danger-zone delete behind an Alert.

// Features worth granting a single user beyond their persona.
const GRANTABLE = NAV_ITEMS.filter((i) => i.minPersona && i.minPersona !== "casual");

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
  featureGrants: string[];
  createdAt: string;
  linkedAuth: boolean;
  orgs: { id: string; name: string; role: string }[];
  counts: Record<string, number>;
  lastActiveAt: string | null;
};

type RoleVal = "CLIENT" | "COACH" | "ADMIN";
type LangVal = "en" | "pl" | "de";

const fmt = (d: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

export default function AdminUsers() {
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

      {data === null ? (
        loading ? (
          <Loading />
        ) : (
          <Mono color={palette.ash}>Couldn&apos;t load users — try again.</Mono>
        )
      ) : data.users.length === 0 ? (
        <Mono color={palette.ash}>{loading ? "Loading…" : "No users match."}</Mono>
      ) : (
        data.users.map((u) => (
          <View key={u.id}>
            <Pressable onPress={() => setSelected(selected === u.id ? null : u.id)}>
              <Card>
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
              </Card>
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

      {data && data.pages > 1 && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <Mono color={palette.ash}>
            {data.total.toLocaleString()} · page {data.page}/{data.pages}
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
  const [grants, setGrants] = useState<string[]>([]);
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
        setGrants(det.featureGrants ?? []);
      } else {
        setD(null);
      }
    });
  }, [id]);

  const grantsKey = (g: string[]) => [...g].sort().join(",");
  const dirty = d && (role !== d.role || language !== d.language || grantsKey(grants) !== grantsKey(d.featureGrants ?? []));
  const toggleGrant = (navId: string) =>
    setGrants((g) => (g.includes(navId) ? g.filter((x) => x !== navId) : [...g, navId]));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const res = await adminSend<Detail>("PATCH", `/api/admin/users/${id}`, { role, language, featureGrants: grants });
    if (res.ok) {
      setD((prev) => (prev ? { ...prev, role, language, featureGrants: grants } : prev));
      setMsg({ ok: true, text: "Saved · recorded in the audit log." });
      onSaved();
    } else {
      // Surface the server rail (self-demote / last-admin / etc.).
      setMsg({ ok: false, text: res.error ?? "Update failed." });
    }
    setSaving(false);
  };

  // Permanently delete the account + all data. Match the web's typed-confirm
  // intent with a clear destructive Alert.
  const remove = () => {
    if (!d) return;
    Alert.alert(
      "Delete account",
      `Permanently delete ${d.email} and ALL their data — sessions, check-ins, everything. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete forever",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            setMsg(null);
            const res = await adminSend(`DELETE`, `/api/admin/users/${id}`);
            if (res.ok) {
              onDeleted();
            } else {
              setMsg({ ok: false, text: res.error ?? "Delete failed." });
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  if (!d)
    return (
      <Card style={{ marginTop: -4 }}>
        <Loading />
      </Card>
    );

  return (
    <Card accent={palette.amber} style={{ marginTop: -4 }}>
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

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 12, marginBottom: 14 }}>
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
        <View style={{ marginTop: 14 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1, textTransform: "uppercase", color: palette.ash, marginBottom: 6 }}>
            Organizations
          </Text>
          {d.orgs.map((o) => (
            <KV key={o.id} k={o.name} v={o.role} />
          ))}
        </View>
      )}

      {/* role / language editor */}
      <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 14 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1, textTransform: "uppercase", color: txt(palette, palette.amber), marginBottom: 8 }}>
          Manage access
        </Text>

        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: palette.ash, marginBottom: 4 }}>Role</Text>
        <Segmented<RoleVal>
          options={[
            { value: "CLIENT", label: "Client" },
            { value: "COACH", label: "Coach" },
            { value: "ADMIN", label: "Admin" },
          ]}
          value={role}
          onChange={setRole}
        />

        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: palette.ash, marginBottom: 4 }}>Language</Text>
        <Segmented<LangVal>
          options={[
            { value: "en", label: "EN" },
            { value: "pl", label: "PL" },
            { value: "de", label: "DE" },
          ]}
          value={language}
          onChange={setLanguage}
        />

        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: palette.ash, marginTop: 4, marginBottom: 8, lineHeight: 16 }}>
          Feature access — unlock individual features beyond this user&apos;s persona.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginBottom: 14 }}>
          {GRANTABLE.map((item) => {
            const on = grants.includes(item.id);
            return (
              <Pressable
                key={item.id}
                onPress={() => toggleGrant(item.id)}
                style={{
                  borderWidth: 1,
                  borderColor: on ? palette.lime : palette.line,
                  backgroundColor: on ? `${palette.lime}1a` : "transparent",
                  borderRadius: 999,
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(palette, on ? palette.lime : palette.ash) }}>
                  {on ? "✓ " : "+ "}
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {msg ? (
          <View accessibilityLiveRegion={msg.ok ? "polite" : "assertive"} accessibilityRole={msg.ok ? undefined : "alert"}>
            <Mono color={msg.ok ? palette.lime : palette.red} style={{ marginBottom: 10 }}>
              {msg.text}
            </Mono>
          </View>
        ) : null}

        <PillBtn
          label={saving ? "Saving…" : "Save changes"}
          onPress={save}
          color={palette.amber}
          disabled={!dirty || saving}
        />
      </View>

      {/* danger zone */}
      <View style={{ marginTop: 20, borderTopWidth: 1, borderTopColor: `${palette.red}44`, paddingTop: 14 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1, textTransform: "uppercase", color: txt(palette, palette.red), marginBottom: 6 }}>
          Danger zone
        </Text>
        <Mono color={palette.ash} style={{ lineHeight: 18, marginBottom: 12 }}>
          Permanently delete this account and everything attached to it — sessions, check-ins, memberships. This cannot
          be undone.
        </Mono>
        <PillBtn
          label={deleting ? "Deleting…" : "Delete account"}
          onPress={remove}
          color={palette.red}
          outline
          disabled={deleting}
        />
      </View>
    </Card>
  );
}
