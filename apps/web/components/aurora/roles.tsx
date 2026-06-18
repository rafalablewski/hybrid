"use client";

import { usePersona } from "@/lib/persona";
import AdminAccess from "../admin/access";
import { AuroraIcon } from "./icons";

const PERMISSIONS = [
  { cap: "Own training data & analytics", client: "full", coach: "own", admin: "no" },
  { cap: "Other athletes' data", client: "no", coach: "consented only", admin: "aggregate" },
  { cap: "Leave coaching notes", client: "no", coach: "yes (+private)", admin: "no" },
  { cap: "Private coach notes visible", client: "no", coach: "own", admin: "no" },
  { cap: "Adjust someone's plan", client: "no", coach: "consented only", admin: "no" },
  { cap: "Platform metrics (MAU, retention)", client: "no", coach: "no", admin: "yes" },
  { cap: "Manage content & languages", client: "no", coach: "no", admin: "yes" },
  { cap: "Manage accounts & verify coaches", client: "no", coach: "no", admin: "yes" },
];

const ROLES = [
  ["Client", "lime", "Owns their own data. Sees only themselves. Private coach notes stay hidden."],
  ["Coach", "violet", "Sees only athletes who accepted them (mutual consent). Can leave private notes. Also a client."],
  ["Admin", "amber", "Platform aggregates & content. No silent access to private training data; support access is audited."],
] as const;

/** AURORA Roles & access (web) — same role model + permission matrix + admin
 *  AdminAccess editor as the classic, in the rounded Aurora style. */
export default function AuroraRoles() {
  const persona = usePersona();
  const C = (v: string) => `var(--color-${v})`;
  const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, padding: 20 } as const;
  const yes = (v: string) => v === "full" || v === "yes" || v === "yes (+private)";

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <h1 style={{ fontWeight: 900, fontSize: 26, margin: 0 }}>Roles &amp; access</h1>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: C("ash"), marginTop: 8 }}>Three roles, each scoped. Access is enforced server-side by <i>relationship</i>, not role label alone.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginTop: 16 }}>
        {ROLES.map(([n, c, d]) => (
          <div key={n} style={{ ...card, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <AuroraIcon name="user" size={24} color={C(c)} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 18, color: C(c) }}>{n}</div>
              <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>{d}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash"), marginBottom: 12 }}>Permission matrix</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Capability", "Client", "Coach", "Admin"].map((h, i) => (
                <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: i === 0 ? C("ash") : i === 1 ? C("lime") : i === 2 ? C("violet") : C("amber"), textTransform: "uppercase", textAlign: i === 0 ? "left" : "center", padding: "8px 6px", borderBottom: `1px solid ${C("line")}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((p) => (
              <tr key={p.cap}>
                <td style={{ fontWeight: 600, fontSize: 13, padding: "11px 6px", borderBottom: `1px solid ${C("line")}` }}>{p.cap}</td>
                {[p.client, p.coach, p.admin].map((v, i) => (
                  <td key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "center", padding: "11px 6px", borderBottom: `1px solid ${C("line")}`, color: v === "no" ? C("ash") : yes(v) ? C("lime") : C("amber") }}>{v === "no" ? "—" : v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {persona === "admin" && (
        <div style={{ ...card, marginTop: 16, borderColor: `color-mix(in srgb, ${C("amber")} 40%, ${C("line")})` }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: C("amber"), marginBottom: 6 }}>Access control · admin</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10 }}>Set permissions per feature</div>
          <AdminAccess />
        </div>
      )}
    </div>
  );
}
