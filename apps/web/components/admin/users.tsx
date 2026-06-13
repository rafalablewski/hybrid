"use client";

import { useCallback, useEffect, useState } from "react";
import { INK2, CARD, LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED, ON_ACCENT, disp, cond, mono, Mono, Card, Chip, Select } from "@/lib/ui";

type Row = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  language: string;
  createdAt: string;
  sessions: number;
  clientsCoached: number;
  coaches: number;
  orgs: number;
  checkins: number;
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

const roleColor: Record<string, string> = { ADMIN: AMBER, COACH: VIOLET, CLIENT: LIME };
const fmt = (d: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

export default function AdminUsers() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (q) params.set("q", q);
    if (role) params.set("role", role);
    fetch(`/api/admin/users?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [q, role, page]);

  // Debounce search/filter; reset to page 1 when the query changes.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div>
      {/* controls */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search email or name…"
          style={{
            ...mono,
            fontSize: 13,
            flex: 1,
            minWidth: 220,
            padding: "10px 14px",
            borderRadius: 10,
            background: INK2,
            color: CHALK,
            border: `1px solid ${LINE}`,
            outline: "none",
          }}
        />
        <Select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All roles</option>
          <option value="CLIENT">Client</option>
          <option value="COACH">Coach</option>
          <option value="ADMIN">Admin</option>
        </Select>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["User", "Role", "Lang", "Sessions", "Joined", ""].map((h, i) => (
                <th
                  key={h || i}
                  style={{
                    ...mono,
                    fontSize: 10,
                    color: ASH,
                    textTransform: "uppercase",
                    letterSpacing: ".08em",
                    textAlign: i >= 3 && i <= 4 ? "right" : "left",
                    padding: "12px 16px",
                    borderBottom: `1px solid ${LINE}`,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.users.map((u) => (
              <tr
                key={u.id}
                onClick={() => setSelected(u.id)}
                style={{ cursor: "pointer", transition: "background .12s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = INK2)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td style={{ padding: "12px 16px", borderBottom: `1px solid ${LINE}` }}>
                  <div style={{ ...disp, fontWeight: 600, fontSize: 14 }}>{u.name || "—"}</div>
                  <Mono s={{ fontSize: 11 }} c={ASH}>{u.email}</Mono>
                </td>
                <td style={{ padding: "12px 16px", borderBottom: `1px solid ${LINE}` }}>
                  <Chip c={roleColor[u.role] ?? CHALK}>{u.role}</Chip>
                </td>
                <td style={{ padding: "12px 16px", borderBottom: `1px solid ${LINE}` }}>
                  <Mono s={{ fontSize: 12 }} c={CHALK}>{u.language.toUpperCase()}</Mono>
                </td>
                <td style={{ ...mono, fontSize: 13, color: CHALK, padding: "12px 16px", textAlign: "right", borderBottom: `1px solid ${LINE}` }}>
                  {u.sessions}
                </td>
                <td style={{ ...mono, fontSize: 12, color: ASH, padding: "12px 16px", textAlign: "right", borderBottom: `1px solid ${LINE}` }}>
                  {fmt(u.createdAt)}
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right", borderBottom: `1px solid ${LINE}`, color: ASH }}>→</td>
              </tr>
            ))}
            {data && data.users.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...mono, fontSize: 13, color: ASH, textAlign: "center", padding: 40 }}>
                  {loading ? "Loading…" : "No users match."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* pagination */}
      {data && data.pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
          <Mono s={{ fontSize: 12 }} c={ASH}>
            {data.total.toLocaleString()} users · page {data.page} / {data.pages}
          </Mono>
          <div style={{ display: "flex", gap: 8 }}>
            <PageBtn disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Prev</PageBtn>
            <PageBtn disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next →</PageBtn>
          </div>
        </div>
      )}

      {selected && (
        <UserDrawer
          id={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            load();
          }}
        />
      )}
    </div>
  );
}

function PageBtn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...cond,
        fontSize: 12,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: ".05em",
        color: disabled ? ASH : CHALK,
        background: CARD,
        border: `1px solid ${LINE}`,
        borderRadius: 9,
        padding: "8px 14px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function UserDrawer({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [role, setRole] = useState("");
  const [language, setLanguage] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/users/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((det: Detail) => {
        setD(det);
        setRole(det.role);
        setLanguage(det.language);
      })
      .catch(() => setD(null));
  }, [id]);

  const dirty = d && (role !== d.role || language !== d.language);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, language }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      setD((prev) => (prev ? { ...prev, role, language } : prev));
      setMsg({ ok: true, text: "Saved · change recorded in the audit log." });
      onSaved();
    } else {
      setMsg({ ok: false, text: body.error ?? "Update failed." });
    }
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 50, display: "flex", justifyContent: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxWidth: "92vw",
          height: "100%",
          background: CARD,
          borderLeft: `1px solid ${LINE}`,
          padding: 26,
          overflowY: "auto",
          ...disp,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <Mono s={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase" }} c={AMBER}>User record</Mono>
            <div style={{ ...disp, fontWeight: 800, fontSize: 22, marginTop: 2 }}>{d?.name || "—"}</div>
            <Mono s={{ fontSize: 12 }} c={ASH}>{d?.email ?? "…"}</Mono>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: ASH, fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {!d ? (
          <Mono>Loading…</Mono>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
              <Chip c={roleColor[d.role] ?? CHALK}>{d.role}</Chip>
              <Chip c={d.linkedAuth ? LIME : ASH}>{d.linkedAuth ? "auth linked" : "no auth"}</Chip>
              <Chip c={BLUE}>joined {fmt(d.createdAt)}</Chip>
              {d.lastActiveAt && <Chip c={CHALK}>last active {fmt(d.lastActiveAt)}</Chip>}
            </div>

            {/* activity counts */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 20 }}>
              {Object.entries(d.counts).map(([k, v]) => (
                <div key={k} style={{ background: INK2, border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ ...disp, fontWeight: 800, fontSize: 20 }}>{v}</div>
                  <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em" }} c={ASH}>{k.replace(/([A-Z])/g, " $1")}</Mono>
                </div>
              ))}
            </div>

            {d.orgs.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 8 }} c={ASH}>Organizations</Mono>
                {d.orgs.map((o) => (
                  <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${LINE}` }}>
                    <Mono s={{ fontSize: 13 }} c={CHALK}>{o.name}</Mono>
                    <Mono s={{ fontSize: 12 }} c={VIOLET}>{o.role}</Mono>
                  </div>
                ))}
              </div>
            )}

            {/* role / language editor */}
            <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 18 }}>
              <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 12 }} c={AMBER}>
                Manage access
              </Mono>
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <label style={{ flex: 1 }}>
                  <Mono s={{ fontSize: 11, display: "block", marginBottom: 5 }} c={ASH}>Role</Mono>
                  <Select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: "100%" }}>
                    <option value="CLIENT">Client</option>
                    <option value="COACH">Coach</option>
                    <option value="ADMIN">Admin</option>
                  </Select>
                </label>
                <label style={{ flex: 1 }}>
                  <Mono s={{ fontSize: 11, display: "block", marginBottom: 5 }} c={ASH}>Language</Mono>
                  <Select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ width: "100%" }}>
                    <option value="en">EN</option>
                    <option value="pl">PL</option>
                    <option value="de">DE</option>
                  </Select>
                </label>
              </div>

              {msg && (
                <Mono s={{ fontSize: 12, display: "block", marginBottom: 10 }} c={msg.ok ? LIME : RED}>
                  {msg.text}
                </Mono>
              )}

              <button
                onClick={save}
                disabled={!dirty || saving}
                style={{
                  width: "100%",
                  ...disp,
                  fontWeight: 800,
                  fontSize: 14,
                  color: ON_ACCENT,
                  background: dirty && !saving ? AMBER : LINE,
                  border: "none",
                  borderRadius: 10,
                  padding: "11px 0",
                  cursor: dirty && !saving ? "pointer" : "default",
                }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
