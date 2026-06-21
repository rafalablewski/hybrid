"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { stepUpRequired, isValidTotpCode } from "@hybrid/core";
import { useSession, type Role } from "@/lib/session";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useTemplate } from "@/lib/use-template";
import AuroraLogin from "@/components/aurora/login";
import { fs, space, INK, INK2, LINE, LIME, CHALK, ASH, VIOLET, AMBER, RED, ON_ACCENT, disp, cond, mono, Mono, txt, GlassField } from "@/lib/ui";

// Ported from the prototype's Auth screen (reference/HybridApp.jsx).
// When Supabase keys are present this drives real Apple/Google/email auth;
// otherwise it's a demo entry that lets you preview each role.
const ROLE_INFO: { id: Role; label: string; accent: string; blurb: string }[] = [
  { id: "client", label: "Client", accent: LIME, blurb: "Your own training, plans, history." },
  { id: "coach", label: "Coach", accent: VIOLET, blurb: "Roster + the athlete view." },
  { id: "admin", label: "Admin", accent: AMBER, blurb: "Operator dashboard + roles. The admin panel." },
];

export default function LoginPage() {
  const { template } = useTemplate();
  if (template === "aurora") return <AuroraLogin />;
  return <ClassicLoginPage />;
}

function ClassicLoginPage() {
  const router = useRouter();
  const { login, session } = useSession();
  const live = isSupabaseConfigured();
  const [role, setRole] = useState<Role>("admin");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // MFA step-up: set after a password sign-in when a second factor is required.
  const [mfaStep, setMfaStep] = useState<{ factorId: string; challengeId: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  // Navigate only once the session actually lands in context. Pushing to /app
  // the instant signInWithPassword resolves races the SessionProvider's
  // onAuthStateChange listener, so the app-shell guard sees no session yet and
  // bounces back to /login — the "first login fails, second works" bug. Mirror
  // the mobile login: defer the redirect until `session` is populated.
  const [navTo, setNavTo] = useState<string | null>(null);
  useEffect(() => {
    if (navTo && session) router.push(navTo);
  }, [navTo, session, router]);

  // After a password sign-in, ask Supabase whether the session must step up to
  // aal2 (a verified factor exists). If so, challenge it and show the code
  // prompt. Defensive: any MFA hiccup falls through to a normal sign-in so a
  // user is never locked out by this check. Returns true if a prompt was shown.
  const maybeStepUp = async (supabase: ReturnType<typeof createClient>): Promise<boolean> => {
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!aal || !stepUpRequired(aal.currentLevel, aal.nextLevel)) return false;
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.[0];
      if (!totp) return false;
      const { data: ch } = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (!ch) return false;
      setMfaStep({ factorId: totp.id, challengeId: ch.id });
      setBusy(false);
      return true;
    } catch {
      return false;
    }
  };

  const verifyMfa = async () => {
    if (!mfaStep || !isValidTotpCode(mfaCode)) {
      setError("Enter the 6-digit code from your authenticator.");
      return;
    }
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.verify({
      factorId: mfaStep.factorId,
      challengeId: mfaStep.challengeId,
      code: mfaCode.trim(),
    });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    setNavTo("/app");
  };

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
      entitlement: "free",
      provider,
    });
    setNavTo("/app");
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

  const emailSubmit = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    const supabase = createClient();

    if (mode === "signup") {
      // New users start as CLIENT. Elevate to admin/coach server-side
      // (see reference/SETUP_SPRINT1.md) — never self-assign privileged roles.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name: name.trim() || email.split("@")[0], role: "client" } },
      });
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
      // Fresh registration → land them in onboarding (consumed in the app shell)
      // to set their persona + goal + preferences, whether the session is
      // immediate or arrives after email confirm + sign in.
      try { localStorage.setItem("hybrid.pendingOnboarding", "1"); } catch { /* ignore */ }
      if (data.session) {
        setNavTo("/app");
        return;
      }
      // Email confirmation is on — no session yet.
      setNotice("Account created. Check your email to confirm, then sign in.");
      setMode("signin");
      setBusy(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    if (await maybeStepUp(supabase)) return; // a TOTP code is now required
    setNavTo("/app");
  };

  const provs = [
    { key: "apple" as const, n: "Continue with Apple", bg: "#fff", fg: "#000", i: "" },
    { key: "google" as const, n: "Continue with Google", bg: INK2, fg: CHALK, i: "G" },
  ];

  return (
    <div
      style={{
        ...disp,
        background: INK,
        color: CHALK,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "40px 24px",
        position: "relative",
      }}
    >
      {/* ambient field — drifting accent blobs the glass refracts */}
      <GlassField />
      <div className="liquid-glass" style={{ width: "100%", maxWidth: 380, position: "relative", zIndex: 1, padding: 30 }}>
        <span className="lg-sheen" />
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ ...disp, fontWeight: 900, fontSize: 40, letterSpacing: "-.05em" }}>
            HYBRID<span style={{ color: txt(LIME) }}>.</span>
          </div>
          <Mono s={{ fontSize: fs.caption, letterSpacing: ".25em", textTransform: "uppercase", marginTop: 6 }} c={LIME}>
            Strength · Conditioning
          </Mono>
        </div>

        {/* MFA step-up: shown after a password sign-in when 2FA is required */}
        {mfaStep ? (
          <>
            <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 12, textAlign: "center" }} c={CHALK}>
              Enter the 6-digit code from your authenticator app.
            </Mono>
            <input
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoFocus
              placeholder="000000"
              style={{ ...inputStyle, fontSize: fs.heading, letterSpacing: ".3em", textAlign: "center" }}
            />
            {error && (
              <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 10 }} c={RED}>
                {error}
              </Mono>
            )}
            <button
              disabled={busy || !isValidTotpCode(mfaCode)}
              onClick={verifyMfa}
              style={{ ...disp, fontWeight: 800, fontSize: fs.note, width: "100%", padding: 14, borderRadius: 13, cursor: "pointer", opacity: busy || !isValidTotpCode(mfaCode) ? 0.6 : 1, border: "none", background: LIME, color: ON_ACCENT }}
            >
              {busy ? "…" : "Verify →"}
            </button>
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button onClick={() => { setMfaStep(null); setMfaCode(""); setError(""); }} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <Mono s={{ fontSize: fs.caption }} c={ASH}>← cancel</Mono>
              </button>
            </div>
          </>
        ) : (
        <>
        {/* DEMO ONLY: pick which role to sign in as so you can see each surface */}
        {!live && (
          <>
            <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 8 }}>
              Sign in as (demo)
            </Mono>
            <div style={{ display: "flex", gap: space.sm, marginBottom: 8 }}>
              {ROLE_INFO.map((r) => {
                const on = role === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setRole(r.id)}
                    style={{
                      flex: 1,
                      ...cond,
                      fontSize: fs.body,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: ".04em",
                      padding: "10px 0",
                      borderRadius: 10,
                      cursor: "pointer",
                      border: `1px solid ${on ? r.accent : LINE}`,
                      background: on ? r.accent : "transparent",
                      color: on ? ON_ACCENT : ASH,
                    }}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
            <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 22, minHeight: 18 }}>
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
              fontSize: fs.note,
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
              gap: space.ms,
            }}
          >
            {p.i && <b style={disp}>{p.i}</b>}
            {p.n}
          </button>
        ))}

        <div style={{ textAlign: "center", margin: "14px 0" }}>
          <Mono s={{ fontSize: fs.body }}>or sign in with email</Mono>
        </div>

        {live && mode === "signup" && (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="name"
            style={inputStyle}
          />
        )}
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
          <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 10 }} c={RED}>
            {error}
          </Mono>
        )}
        {notice && (
          <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 10 }} c={LIME}>
            {notice}
          </Mono>
        )}

        <button
          disabled={busy}
          onClick={() => (live ? emailSubmit() : demoEnter("email"))}
          style={{
            ...disp,
            fontWeight: 800,
            fontSize: fs.note,
            width: "100%",
            padding: 14,
            borderRadius: 13,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
            border: "none",
            background: LIME,
            color: ON_ACCENT,
          }}
        >
          {busy ? "…" : mode === "signup" ? "Create account →" : "Sign in →"}
        </button>

        {live && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button
              onClick={() => {
                setMode((m) => (m === "signin" ? "signup" : "signin"));
                setError("");
                setNotice("");
              }}
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              <Mono s={{ fontSize: fs.caption }} c={ASH}>
                {mode === "signin" ? "Need an account? " : "Have an account? "}
                <span style={{ color: txt(LIME) }}>
                  {mode === "signin" ? "Create one →" : "Sign in →"}
                </span>
              </Mono>
            </button>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 22 }}>
          <button onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <Mono s={{ fontSize: fs.caption, letterSpacing: ".06em", textTransform: "uppercase" }} c={ASH}>
              ← back
            </Mono>
          </button>
        </div>

        <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 24, textAlign: "center", lineHeight: 1.5 }}>
          {live
            ? "Real auth · Supabase (Apple · Google · email)."
            : "Demo sign-in. Add Supabase keys to switch on real Apple / Google / email auth."}
        </Mono>
        </>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  ...mono,
  fontSize: fs.bodyLg,
  width: "100%",
  padding: "13px 14px",
  borderRadius: 12,
  background: INK2,
  color: CHALK,
  border: `1px solid ${LINE}`,
  marginBottom: 11,
  outline: "none",
} as const;
