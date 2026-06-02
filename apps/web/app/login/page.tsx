"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, type Role } from "@/lib/session";
import { INK2, LINE, LIME, CHALK, ASH, VIOLET, AMBER, disp, cond, mono, Mono } from "@/lib/ui";

// Ported from the prototype's Auth screen (reference/HybridApp.jsx). The provider
// buttons are demo entries for now; Sprint 1 wires them to Supabase Auth
// (Apple + Google are required by the App Store once any social login exists).
const ROLE_INFO: { id: Role; label: string; accent: string; blurb: string }[] = [
  { id: "client", label: "Client", accent: LIME, blurb: "Your own training, plans, history." },
  { id: "coach", label: "Coach", accent: VIOLET, blurb: "Roster + the athlete view." },
  { id: "admin", label: "Admin", accent: AMBER, blurb: "Operator dashboard + roles. The admin panel." },
];

export default function LoginPage() {
  const router = useRouter();
  const { login } = useSession();
  const [role, setRole] = useState<Role>("admin");
  const [email, setEmail] = useState("");

  const enter = (provider: "apple" | "google" | "email" | "demo") => {
    const name =
      provider === "email" && email.trim()
        ? email.trim().split("@")[0]!
        : role === "admin"
          ? "Operator"
          : role === "coach"
            ? "Coach"
            : "Athlete";
    login({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      email: email.trim() || `${role}@hybrid.app`,
      role,
      provider,
    });
    router.push("/app");
  };

  const provs = [
    { key: "apple" as const, n: "Continue with Apple", bg: "#fff", fg: "#000", i: "" },
    { key: "google" as const, n: "Continue with Google", bg: INK2, fg: CHALK, i: "G" },
  ];

  return (
    <div
      style={{
        ...disp,
        background: "#0c0d0c",
        color: CHALK,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "40px 24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ ...disp, fontWeight: 900, fontSize: 40, letterSpacing: "-.05em" }}>
            HYBRID<span style={{ color: LIME }}>.</span>
          </div>
          <Mono s={{ fontSize: 12, letterSpacing: ".25em", textTransform: "uppercase", marginTop: 6 }} c={LIME}>
            Strength · Conditioning
          </Mono>
        </div>

        {/* DEMO: pick which role to sign in as so you can see each surface */}
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 8 }}>
          Sign in as (demo)
        </Mono>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {ROLE_INFO.map((r) => {
            const on = role === r.id;
            return (
              <button
                key={r.id}
                onClick={() => setRole(r.id)}
                style={{
                  flex: 1,
                  ...cond,
                  fontSize: 13,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: ".04em",
                  padding: "10px 0",
                  borderRadius: 10,
                  cursor: "pointer",
                  border: `1px solid ${on ? r.accent : LINE}`,
                  background: on ? r.accent : "transparent",
                  color: on ? "#0c0d0c" : ASH,
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        <Mono s={{ fontSize: 12, display: "block", marginBottom: 22, minHeight: 18 }}>
          {ROLE_INFO.find((r) => r.id === role)!.blurb}
        </Mono>

        {provs.map((p) => (
          <button
            key={p.key}
            onClick={() => enter(p.key)}
            style={{
              ...disp,
              fontWeight: 700,
              fontSize: 15,
              padding: 15,
              width: "100%",
              borderRadius: 13,
              marginBottom: 11,
              cursor: "pointer",
              border: "none",
              background: p.bg,
              color: p.fg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            {p.i && <b style={disp}>{p.i}</b>}
            {p.n}
          </button>
        ))}

        <div style={{ textAlign: "center", margin: "14px 0" }}>
          <Mono s={{ fontSize: 13 }}>or sign in with email</Mono>
        </div>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          style={{
            ...mono,
            fontSize: 14,
            width: "100%",
            padding: "13px 14px",
            borderRadius: 12,
            background: INK2,
            color: CHALK,
            border: `1px solid ${LINE}`,
            marginBottom: 11,
            outline: "none",
          }}
        />
        <button
          onClick={() => enter("email")}
          style={{
            ...disp,
            fontWeight: 800,
            fontSize: 15,
            width: "100%",
            padding: 14,
            borderRadius: 13,
            cursor: "pointer",
            border: "none",
            background: LIME,
            color: "#0c0d0c",
          }}
        >
          Sign in →
        </button>

        <div style={{ textAlign: "center", marginTop: 22 }}>
          <button
            onClick={() => router.push("/")}
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <Mono s={{ fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase" }} c={ASH}>
              ← back
            </Mono>
          </button>
        </div>

        <Mono s={{ fontSize: 11, display: "block", marginTop: 24, textAlign: "center", lineHeight: 1.5 }}>
          Demo sign-in. Apple / Google / email become real in Sprint 1 (Supabase Auth).
        </Mono>
      </div>
    </div>
  );
}
