"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { stepUpRequired, isValidTotpCode, STATE_OPACITY } from "@hybrid/core";
import { useSession } from "@/lib/session";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { fs, space, INK, INK2, LINE, LIME, CHALK, ASH, RED, ON_ACCENT, disp, mono, Mono, txt, GlassField } from "@/lib/ui";

// Admin sign-in. The web client is retired — the product ships on mobile — so
// this page exists for one audience: operators entering the /admin panel.
// Accounts are created in the mobile app; there is no web sign-up.
// When Supabase keys are present this drives real Apple/Google/email auth;
// otherwise it's a demo entry into the panel.
export default function LoginPage() {
  const router = useRouter();
  const { login, session } = useSession();
  const live = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // MFA step-up: set after a password sign-in when a second factor is required.
  const [mfaStep, setMfaStep] = useState<{ factorId: string; challengeId: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  // Navigate only once the session actually lands in context. Pushing the
  // instant signInWithPassword resolves races the SessionProvider's
  // onAuthStateChange listener — the "first login fails, second works" bug.
  const [navTo, setNavTo] = useState<string | null>(null);
  useEffect(() => {
    if (navTo && session) {
      setNavTo(null); // fire exactly once — later session re-emits won't re-push
      router.push(navTo);
    }
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
    setNavTo("/admin");
  };

  // --- DEMO entry (no backend): set a local operator session and go ---
  const demoEnter = (provider: "apple" | "google" | "email") => {
    login({
      name: "Operator",
      email: email.trim() || "admin@hybrid.app",
      role: "admin",
      entitlement: "free",
      provider,
    });
    setNavTo("/admin");
  };

  // --- LIVE entry (Supabase) ---
  const oauth = async (provider: "apple" | "google") => {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/admin` },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
    }
  };

  const emailSubmit = async () => {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    if (await maybeStepUp(supabase)) return; // a TOTP code is now required
    setNavTo("/admin");
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
            Admin panel
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
              aria-label="Authenticator code"
              placeholder="000000"
              style={{ ...inputStyle, fontSize: fs.heading, letterSpacing: ".3em", textAlign: "center" }}
            />
            <div role="alert">
              {error && (
                <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 10 }} c={RED}>
                  {error}
                </Mono>
              )}
            </div>
            <button className="pressable"
              disabled={busy || !isValidTotpCode(mfaCode)}
              onClick={verifyMfa}
              style={{ ...disp, fontWeight: 800, fontSize: fs.note, width: "100%", padding: 14, borderRadius: 13, cursor: "pointer", opacity: busy || !isValidTotpCode(mfaCode) ? STATE_OPACITY.busy : 1, border: "none", background: LIME, color: ON_ACCENT }}
            >
              {busy ? "…" : "Verify →"}
            </button>
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button className="pressable" onClick={() => { setMfaStep(null); setMfaCode(""); setError(""); }} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <Mono s={{ fontSize: fs.caption }} c={ASH}>← cancel</Mono>
              </button>
            </div>
          </>
        ) : (
        <>
        {provs.map((p) => (
          <button className="pressable"
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
              opacity: busy ? STATE_OPACITY.busy : 1,
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

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Email"
          placeholder="you@email.com"
          style={inputStyle}
        />
        {live && (
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="Password"
            placeholder="password"
            style={inputStyle}
          />
        )}

        <div role="alert">
          {error && (
            <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 10 }} c={RED}>
              {error}
            </Mono>
          )}
        </div>

        <button className="pressable"
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
            opacity: busy ? STATE_OPACITY.busy : 1,
            border: "none",
            background: LIME,
            color: ON_ACCENT,
          }}
        >
          {busy ? "…" : "Sign in →"}
        </button>

        <div style={{ textAlign: "center", marginTop: 22 }}>
          <button className="pressable" onClick={() => router.push("/")} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <Mono s={{ fontSize: fs.caption, letterSpacing: ".06em", textTransform: "uppercase" }} c={ASH}>
              ← back
            </Mono>
          </button>
        </div>

        <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 24, textAlign: "center", lineHeight: 1.5 }}>
          {live
            ? "Operators only. The HYBRID app lives on your phone."
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
