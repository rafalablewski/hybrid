"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, type Role } from "@/lib/session";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { INK2, LINE, LIME, CHALK, ASH, VIOLET, AMBER, RED, disp, cond, mono, Mono } from "@/lib/ui";

// Ported from the prototype's Auth screen (reference/HybridApp.jsx).
// When Supabase keys are present this drives real Apple/Google/email auth;
// otherwise it's a demo entry that lets you preview each role.
const ROLE_INFO: { id: Role; label: string; accent: string; blurb: string }[] = [
  { id: "client", label: "Client", accent: LIME, blurb: "Your own training, plans, history." },
  { id: "coach", label: "Coach", accent: VIOLET, blurb: "Roster + the athlete view." },
  { id: "admin", label: "Admin", accent: AMBER, blurb: "Operator dashboard + roles. The admin panel." },
];

export default function LoginPage() {
  const router = useRouter();
  const { login } = useSession();
  const live = isSupabaseConfigured();
  const [role, setRole] = useState<Role>("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // --- DEMO entry (no backend): set a local session and go ---
  const demoEnter = (provider: "apple" | "google" | "email") => {
    const base =
      provider === "email" && email.trim()
        ? email.trim().split("@")[0]!
        : role === "admin"
          ? "Operator"
          : role === "coach"
            ? "Coach"
            : "Athlete";
    login({
      name: base.charAt(0).toUpperCase() + base.slice(1),
      email: email.trim() || `${role}@hybrid.app`,
      role,
      provider,
    });
    router.push("/app");
  };

  // --- LIVE entry (Supabase) ---
  const oauth = async (provider: "apple" | "google") => {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/app` },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  };

  const emailSignIn = async () => {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
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

        {/* DEMO ONLY: pick which role to sign in as so you can see each surface */}
        {!live && (
          <>
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
          </>
        )}

        {provs.map((p) => (
          <button
            key={p.key}
            disabled={busy}
            onClick={() => (live ? oauth(p.key) : demoEnter(p.key))}
            style={{
              ...disp,
              fontWeight: 700,
              fontSize: 15,
              padding: 15,
              width: "100%",
              borderRadius: 13,
              marginBottom: 11,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
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
          style={inputStyle}
        />
        {live && (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            style={inputStyle}
          />
        )}

        {error && (
          <Mono s={{ fontSize: 12, display: "block", marginBottom: 10 }} c={RED}>
            {error}
          </Mono>
        )}

        <button
          disabled={busy}
          onClick={() => (live ? emailSignIn() : demoEnter("email"))}
          style={{
            ...disp,
            fontWeight: 800,
            fontSize: 15,
            width: "100%",
            padding: 14,
            borderRadius: 13,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
            border: "none",
            background: LIME,
            color: "#0c0d0c",
          }}
        >
          {busy ? "…" : "Sign in →"}
        </button>

        <div style={{ textAlign: "center", marginTop: 22 }}>
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <Mono s={{ fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase" }} c={ASH}>
              ← back
            </Mono>
          </button>
        </div>

        <Mono s={{ fontSize: 11, display: "block", marginTop: 24, textAlign: "center", lineHeight: 1.5 }}>
          {live
            ? "Real auth · Supabase (Apple · Google · email)."
            : "Demo sign-in. Add Supabase keys to switch on real Apple / Google / email auth."}
        </Mono>
      </div>
    </div>
  );
}

const inputStyle = {
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
} as const;
