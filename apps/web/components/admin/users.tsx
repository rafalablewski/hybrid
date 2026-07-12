"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fs, space, INK2, CARD, LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED, ON_ACCENT, disp, cond, mono, Mono, Card, Chip, Select, txt } from "@/lib/ui";
import { useDialog } from "../../lib/use-dialog";
import AdminAnonSessions from "./anon-sessions";

type Row = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  language: string;
  entitlement: string;
  coachVerified: boolean;
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
  entitlement: string;
  coachVerified: boolean;
  subscriptionStatus: string | null;
  hasStripe: boolean;
  createdAt: string;
  linkedAuth: boolean;
  orgs: { id: string; name: string; role: string }[];
  counts: Record<string, number>;
  lastActiveAt: string | null;
};

const roleColor: Record<string, string> = { ADMIN: AMBER, COACH: VIOLET, CLIENT: LIME };
const planColor = (e: string) => (e === "paid" ? LIME : ASH);
const planLabel = (e: string) => (e === "paid" ? "Premium" : "Free");
const fmt = (d: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

// A small spinning ring for in-flight buttons — makes a working action read as
// active rather than stalled (see the "Deleting…" button). currentColor so it
// inherits the button's text colour.
function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      className="spin"
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid currentColor`,
        borderTopColor: "transparent",
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

// The Users section hosts two sub-tabs under Platform: the account directory and
// the guest (pre-account) workouts — the latter moved here from Governance so all
// people/usage records live in one place.
type UsersTab = "accounts" | "guests";

export default function AdminUsers() {
  const [tab, setTab] = useState<UsersTab>("accounts");
  return (
    <div>
      <div style={{ display: "flex", gap: space.xs, marginBottom: 18, flexWrap: "wrap" }}>
        <SubTab active={tab === "accounts"} onClick={() => setTab("accounts")}>Accounts</SubTab>
        <SubTab active={tab === "guests"} onClick={() => setTab("guests")}>Guest workouts</SubTab>
      </div>
      {tab === "accounts" ? <AccountsTab /> : <AdminAnonSessions />}
    </div>
  );
}

function SubTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...disp,
        fontWeight: 700,
        fontSize: fs.body,
        color: txt(active ? AMBER : ASH),
        background: active ? `${AMBER}1c` : "transparent",
        border: `1px solid ${active ? `${AMBER}66` : LINE}`,
        borderRadius: 999,
        padding: "8px 18px",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function AccountsTab() {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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
      <div style={{ display: "flex", gap: space.ms, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search email or name…"
          style={{
            ...mono,
            fontSize: fs.bodyLg,
            flex: 1,
            minWidth: 220,
            padding: "10px 14px",
            borderRadius: "var(--r-card)",
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
        <button
          onClick={() => setAdding(true)}
          style={{
            ...disp,
            fontWeight: 800,
            fontSize: fs.bodyLg,
            color: ON_ACCENT,
            background: AMBER,
            border: "none",
            borderRadius: "var(--r-field)",
            padding: "10px 18px",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          + Add user
        </button>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", maxWidth: "100%" }}>
        <table className="adm-tbl" style={{ width: "100%", minWidth: 640, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["User", "Role", "Plan", "Lang", "Sessions", "Joined", ""].map((h, i) => (
                <th
                  key={h || i}
                  style={{
                    ...mono,
                    fontSize: fs.micro,
                    color: ASH,
                    textTransform: "uppercase",
                    letterSpacing: ".08em",
                    textAlign: i >= 4 && i <= 5 ? "right" : "left",
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
                <td data-label="User" style={{ padding: "12px 16px", borderBottom: `1px solid ${LINE}` }}>
                  <div style={{ ...disp, fontWeight: 600, fontSize: fs.bodyLg }}>{u.name || "—"}</div>
                  <Mono s={{ fontSize: fs.caption }} c={ASH}>{u.email}</Mono>
                </td>
                <td data-label="Role" style={{ padding: "12px 16px", borderBottom: `1px solid ${LINE}` }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Chip c={roleColor[u.role] ?? CHALK}>{u.role}</Chip>
                    {u.role === "COACH" && u.coachVerified && (
                      <span title="Verified coach" style={{ color: txt(BLUE), fontSize: fs.body }}>✓</span>
                    )}
                  </span>
                </td>
                <td data-label="Plan" style={{ padding: "12px 16px", borderBottom: `1px solid ${LINE}` }}>
                  <Chip c={planColor(u.entitlement)}>{planLabel(u.entitlement)}</Chip>
                </td>
                <td data-label="Lang" style={{ padding: "12px 16px", borderBottom: `1px solid ${LINE}` }}>
                  <Mono s={{ fontSize: fs.body }} c={CHALK}>{u.language.toUpperCase()}</Mono>
                </td>
                <td data-label="Sessions" style={{ ...mono, fontSize: fs.bodyLg, color: CHALK, padding: "12px 16px", textAlign: "right", borderBottom: `1px solid ${LINE}` }}>
                  {u.sessions}
                </td>
                <td data-label="Joined" style={{ ...mono, fontSize: fs.body, color: ASH, padding: "12px 16px", textAlign: "right", borderBottom: `1px solid ${LINE}` }}>
                  {fmt(u.createdAt)}
                </td>
                <td data-label="" style={{ padding: "12px 16px", textAlign: "right", borderBottom: `1px solid ${LINE}`, color: ASH }}>→</td>
              </tr>
            ))}
            {data && data.users.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...mono, fontSize: fs.bodyLg, color: ASH, textAlign: "center", padding: 40 }}>
                  {loading ? "Loading…" : "No users match."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </Card>

      {/* pagination */}
      {data && data.pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
          <Mono s={{ fontSize: fs.body }} c={ASH}>
            {data.total.toLocaleString()} users – page {data.page} / {data.pages}
          </Mono>
          <div style={{ display: "flex", gap: space.sm }}>
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

      {adding && (
        <AddUserModal
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            setPage(1);
            load();
          }}
        />
      )}
    </div>
  );
}

// Provision a new account. Creates a real, loginable Supabase auth user via the
// server (service-role) and the matching app row. An admin can set an initial
// password (account is confirmed immediately) or leave it blank and send a
// verification/magic-link email instead.
function AddUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("CLIENT");
  const [entitlement, setEntitlement] = useState("free");
  const [language, setLanguage] = useState("en");
  const [password, setPassword] = useState("");
  const [sendVerification, setSendVerification] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  const create = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || null,
          role,
          entitlement,
          language,
          password: password.trim() || undefined,
          sendVerification,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        onCreated();
      } else {
        setMsg({ ok: false, text: body.error ?? "Could not create the user." });
      }
    } catch {
      setMsg({ ok: false, text: "Network error — try again." });
    } finally {
      setBusy(false);
    }
  };

  const field = { ...mono, fontSize: fs.bodyLg, width: "100%", padding: "10px 14px", borderRadius: "var(--r-field)", background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none" } as const;
  const labelCss = { fontSize: fs.caption, display: "block", marginBottom: 5 } as const;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 50, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "6vh 16px" }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" tabIndex={-1} onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "94vw", background: CARD, border: `1px solid ${LINE}`, borderRadius: "var(--r-card)", padding: 26, ...disp, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <Mono s={{ fontSize: fs.micro, letterSpacing: ".12em", textTransform: "uppercase" }} c={AMBER}>New account</Mono>
            <div style={{ ...disp, fontWeight: 800, fontSize: 22, marginTop: 2 }}>Add a user</div>
          </div>
          <button aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", color: ASH, fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <label style={{ display: "block", marginBottom: 12 }}>
          <Mono s={labelCss} c={ASH}>Email *</Mono>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@email.com" style={field} />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          <Mono s={labelCss} c={ASH}>Name</Mono>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" style={field} />
        </label>
        <div style={{ display: "flex", gap: space.ms, marginBottom: 12 }}>
          <label style={{ flex: 1 }}>
            <Mono s={labelCss} c={ASH}>Role</Mono>
            <Select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: "100%" }}>
              <option value="CLIENT">Client</option>
              <option value="COACH">Coach</option>
              <option value="ADMIN">Admin</option>
            </Select>
          </label>
          <label style={{ flex: 1 }}>
            <Mono s={labelCss} c={ASH}>Plan</Mono>
            <Select value={entitlement} onChange={(e) => setEntitlement(e.target.value)} style={{ width: "100%" }}>
              <option value="free">Free</option>
              <option value="paid">Premium</option>
            </Select>
          </label>
          <label style={{ flex: 1 }}>
            <Mono s={labelCss} c={ASH}>Lang</Mono>
            <Select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ width: "100%" }}>
              <option value="en">EN</option>
              <option value="pl">PL</option>
              <option value="de">DE</option>
            </Select>
          </label>
        </div>
        <label style={{ display: "block", marginBottom: 12 }}>
          <Mono s={labelCss} c={ASH}>Initial password (optional — 8+ chars)</Mono>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="text" placeholder="Leave blank to send a magic link" style={field} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, cursor: "pointer" }}>
          <input type="checkbox" checked={sendVerification} onChange={(e) => setSendVerification(e.target.checked)} />
          <Mono s={{ fontSize: fs.body }} c={ASH}>Send a verification / welcome email</Mono>
        </label>

        {msg && <div role="alert"><Mono s={{ fontSize: fs.body, display: "block", marginBottom: 10 }} c={msg.ok ? LIME : RED}>{msg.text}</Mono></div>}

        <button onClick={create} disabled={busy || !email.trim()} style={{ width: "100%", ...disp, fontWeight: 800, fontSize: fs.bodyLg, color: ON_ACCENT, background: busy || !email.trim() ? LINE : AMBER, border: "none", borderRadius: "var(--r-card)", padding: "11px 0", cursor: busy || !email.trim() ? "default" : "pointer" }}>
          {busy ? "Creating…" : "Create account"}
        </button>
        <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 10, lineHeight: 1.5 }} c={ASH}>
          Creates a real Supabase auth login. Needs SUPABASE_SERVICE_ROLE_KEY configured; the email needs Resend configured.
        </Mono>
      </div>
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
        fontSize: fs.body,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: ".05em",
        color: disabled ? ASH : CHALK,
        background: CARD,
        border: `1px solid ${LINE}`,
        borderRadius: "var(--r-field)",
        padding: "10px 14px",
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
  const [entitlement, setEntitlement] = useState("free");
  const [coachVerified, setCoachVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/users/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((det: Detail) => {
        setD(det);
        setRole(det.role);
        setLanguage(det.language);
        setEntitlement(det.entitlement ?? "free");
        setCoachVerified(Boolean(det.coachVerified));
      })
      .catch(() => setD(null));
  }, [id]);

  const dirty =
    d &&
    (role !== d.role ||
      language !== d.language ||
      entitlement !== (d.entitlement ?? "free") ||
      coachVerified !== Boolean(d.coachVerified));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, language, entitlement, coachVerified }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setD((prev) => (prev ? { ...prev, role, language, entitlement, coachVerified } : prev));
        setMsg({ ok: true, text: "Saved – change recorded in the audit log." });
        onSaved();
      } else {
        setMsg({ ok: false, text: body.error ?? "Update failed." });
      }
    } catch {
      setMsg({ ok: false, text: "Network error — try again." });
    } finally {
      setSaving(false);
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
            <Mono s={{ fontSize: fs.micro, letterSpacing: ".12em", textTransform: "uppercase" }} c={AMBER}>User record</Mono>
            <div style={{ ...disp, fontWeight: 800, fontSize: 22, marginTop: 2 }}>{d?.name || "—"}</div>
            <Mono s={{ fontSize: fs.body }} c={ASH}>{d?.email ?? "…"}</Mono>
          </div>
          <button aria-label="Close" onClick={onClose} style={{ background: "none", border: "none", color: ASH, fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        {!d ? (
          <Mono>Loading…</Mono>
        ) : (
          <>
            <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap", marginBottom: 18 }}>
              <Chip c={roleColor[d.role] ?? CHALK}>{d.role}</Chip>
              {d.role === "COACH" && d.coachVerified && <Chip c={BLUE}>✓ verified coach</Chip>}
              <Chip c={planColor(d.entitlement)}>{planLabel(d.entitlement)}</Chip>
              <Chip c={d.linkedAuth ? LIME : ASH}>{d.linkedAuth ? "auth linked" : "no auth"}</Chip>
              <Chip c={ASH}>joined {fmt(d.createdAt)}</Chip>
              {d.lastActiveAt && <Chip c={CHALK}>last active {fmt(d.lastActiveAt)}</Chip>}
            </div>

            {/* activity counts */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: space.sm, marginBottom: 20 }}>
              {Object.entries(d.counts).map(([k, v]) => (
                <div key={k} style={{ background: INK2, border: `1px solid ${LINE}`, borderRadius: "var(--r-card)", padding: "10px 12px" }}>
                  <div style={{ ...disp, fontWeight: 800, fontSize: fs.heading }}>{v}</div>
                  <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".06em" }} c={ASH}>{k.replace(/([A-Z])/g, " $1")}</Mono>
                </div>
              ))}
            </div>

            {d.orgs.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 8 }} c={ASH}>Organizations</Mono>
                {d.orgs.map((o) => (
                  <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${LINE}` }}>
                    <Mono s={{ fontSize: fs.bodyLg }} c={CHALK}>{o.name}</Mono>
                    <Mono s={{ fontSize: fs.body }} c={VIOLET}>{o.role}</Mono>
                  </div>
                ))}
              </div>
            )}

            {/* role / language editor */}
            <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 18 }}>
              <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 12 }} c={AMBER}>
                Manage access
              </Mono>
              <div style={{ display: "flex", gap: space.ms, marginBottom: 12 }}>
                <label style={{ flex: 1 }}>
                  <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 5 }} c={ASH}>Role</Mono>
                  <Select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: "100%" }}>
                    <option value="CLIENT">Client</option>
                    <option value="COACH">Coach</option>
                    <option value="ADMIN">Admin</option>
                  </Select>
                </label>
                <label style={{ flex: 1 }}>
                  <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 5 }} c={ASH}>Language</Mono>
                  <Select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ width: "100%" }}>
                    <option value="en">EN</option>
                    <option value="pl">PL</option>
                    <option value="de">DE</option>
                  </Select>
                </label>
              </div>

              {/* plan (entitlement) — free vs premium. Mirrored into the auth
                  session so both clients unlock paid features immediately. */}
              <div style={{ display: "flex", gap: space.ms, marginBottom: 12, alignItems: "flex-end" }}>
                <label style={{ flex: 1 }}>
                  <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 5 }} c={ASH}>Plan</Mono>
                  <Select value={entitlement} onChange={(e) => setEntitlement(e.target.value)} style={{ width: "100%" }}>
                    <option value="free">Free</option>
                    <option value="paid">Premium</option>
                  </Select>
                </label>
                {d.subscriptionStatus && (
                  <Mono s={{ fontSize: fs.caption, paddingBottom: 10 }} c={ASH}>
                    Stripe: {d.subscriptionStatus}
                  </Mono>
                )}
              </div>

              {/* verified-coach tick — shown on the coach's profile to clients. */}
              {role === "COACH" && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, cursor: "pointer" }}>
                  <input type="checkbox" checked={coachVerified} onChange={(e) => setCoachVerified(e.target.checked)} />
                  <Mono s={{ fontSize: fs.body }} c={CHALK}>Verified coach <span style={{ color: txt(BLUE) }}>✓</span> — shows a verified tick to their clients</Mono>
                </label>
              )}

              {msg && (
                <div role="alert">
                  <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 10 }} c={msg.ok ? LIME : RED}>
                    {msg.text}
                  </Mono>
                </div>
              )}

              <button
                onClick={save}
                disabled={!dirty || saving}
                style={{
                  width: "100%",
                  ...disp,
                  fontWeight: 800,
                  fontSize: fs.bodyLg,
                  color: ON_ACCENT,
                  background: dirty && !saving ? AMBER : LINE,
                  border: "none",
                  borderRadius: "var(--r-card)",
                  padding: "11px 0",
                  cursor: dirty && !saving ? "pointer" : "default",
                }}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>

            {/* danger zone — irreversible account deletion (cascades all data) */}
            <div style={{ borderTop: `1px solid ${RED}44`, marginTop: 22, paddingTop: 18 }}>
              <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 8 }} c={RED}>
                Danger zone
              </Mono>
              <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block", marginBottom: 12 }} c={ASH}>
                Permanently delete this account and everything attached to it — sessions, check-ins,
                memberships. This cannot be undone.
              </Mono>
              <button
                onClick={() => setConfirming(true)}
                style={{
                  width: "100%",
                  ...disp,
                  fontWeight: 800,
                  fontSize: fs.bodyLg,
                  color: txt(RED),
                  background: `${RED}14`,
                  border: `1px solid ${RED}66`,
                  borderRadius: "var(--r-card)",
                  padding: "11px 0",
                  cursor: "pointer",
                }}
              >
                Delete account
              </button>
            </div>
          </>
        )}
      </div>

      {confirming && d && (
        <DeleteAccountDialog
          email={d.email}
          name={d.name}
          onClose={() => setConfirming(false)}
          onDeleted={() => {
            setConfirming(false);
            onSaved();
            onClose();
          }}
          doDelete={() => fetch(`/api/admin/users/${id}`, { method: "DELETE" })}
        />
      )}
    </div>
  );
}

// Permanently delete the account + all its data. A designed, focused modal (not a
// bare window.prompt): it names the account, spells out the cascade, and gates
// the destructive action behind typing the email back. Two-step confirm since
// this is irreversible. While the request is in flight the button shows a live
// spinner so it never reads as stalled.
function DeleteAccountDialog({
  email,
  name,
  onClose,
  onDeleted,
  doDelete,
}: {
  email: string;
  name: string | null;
  onClose: () => void;
  onDeleted: () => void;
  doDelete: () => Promise<Response>;
}) {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Don't let the backdrop click close mid-delete (the request is committing).
  const dialogRef = useDialog<HTMLDivElement>(() => {
    if (!deleting) onClose();
  });

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  const confirm = async () => {
    if (!matches || deleting) return;
    setDeleting(true);
    setErr(null);
    try {
      const res = await doDelete();
      if (res.ok) {
        onDeleted();
      } else {
        const body = await res.json().catch(() => ({}));
        setErr(body.error ?? "Delete failed — nothing was removed.");
        setDeleting(false);
      }
    } catch {
      setErr("Network error — try again.");
      setDeleting(false);
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ position: "fixed", inset: 0, background: "#000b", zIndex: 60, display: "flex", justifyContent: "center", alignItems: "center", padding: "6vh 16px", backdropFilter: "blur(2px)" }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={`Delete ${email}`}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches && !deleting) confirm();
        }}
        style={{
          width: 440,
          maxWidth: "94vw",
          background: CARD,
          border: `1px solid ${RED}55`,
          borderRadius: "var(--r-card)",
          padding: 26,
          ...disp,
          boxShadow: `0 30px 80px -24px rgba(0,0,0,.75)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div
            aria-hidden
            style={{ width: 42, height: 42, flexShrink: 0, borderRadius: "50%", background: `${RED}18`, border: `1px solid ${RED}55`, display: "grid", placeItems: "center", color: txt(RED), fontSize: 22 }}
          >
            ⚠
          </div>
          <div>
            <Mono s={{ fontSize: fs.micro, letterSpacing: ".12em", textTransform: "uppercase" }} c={RED}>Permanent deletion</Mono>
            <div style={{ ...disp, fontWeight: 800, fontSize: 21, marginTop: 1 }}>Delete this account?</div>
          </div>
        </div>

        {/* who — the account being removed */}
        <div style={{ background: INK2, border: `1px solid ${LINE}`, borderRadius: "var(--r-card)", padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ ...disp, fontWeight: 700, fontSize: fs.bodyLg }}>{name || "—"}</div>
          <Mono s={{ fontSize: fs.body }} c={ASH}>{email}</Mono>
        </div>

        <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block", marginBottom: 16 }} c={CHALK}>
          This permanently erases <b>everything</b> attached to this account — sessions, check-ins,
          plans, coaching links and memberships — and removes their login. This <b style={{ color: txt(RED) }}>cannot be undone</b>.
        </Mono>

        <label style={{ display: "block", marginBottom: 16 }}>
          <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 6 }} c={ASH}>
            Type <b style={{ color: txt(CHALK) }}>{email}</b> to confirm
          </Mono>
          <input
            ref={inputRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={deleting}
            placeholder={email}
            autoComplete="off"
            spellCheck={false}
            style={{
              ...mono,
              fontSize: fs.bodyLg,
              width: "100%",
              padding: "10px 14px",
              borderRadius: "var(--r-field)",
              background: INK2,
              color: CHALK,
              border: `1px solid ${matches ? `${RED}88` : LINE}`,
              outline: "none",
            }}
          />
        </label>

        {err && (
          <div role="alert">
            <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 12 }} c={RED}>{err}</Mono>
          </div>
        )}

        <div style={{ display: "flex", gap: space.sm }}>
          <button
            onClick={onClose}
            disabled={deleting}
            style={{
              flex: 1,
              ...disp,
              fontWeight: 700,
              fontSize: fs.bodyLg,
              color: txt(CHALK),
              background: INK2,
              border: `1px solid ${LINE}`,
              borderRadius: "var(--r-card)",
              padding: "11px 0",
              cursor: deleting ? "default" : "pointer",
              opacity: deleting ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!matches || deleting}
            style={{
              flex: 1.4,
              ...disp,
              fontWeight: 800,
              fontSize: fs.bodyLg,
              color: matches ? ON_ACCENT : txt(ASH),
              background: !matches ? LINE : deleting ? `${RED}cc` : RED,
              border: "none",
              borderRadius: "var(--r-card)",
              padding: "11px 0",
              cursor: matches && !deleting ? "pointer" : "default",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
              transition: "background .15s",
            }}
          >
            {deleting ? (
              <>
                <Spinner />
                Deleting…
              </>
            ) : (
              "Delete forever"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
