"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { stepUpRequired, isValidTotpCode } from "@hybrid/core";
import { useSession, type Role } from "@/lib/session";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { fs, space, INK, INK2, LINE, LIME, CHALK, ASH, VIOLET, AMBER, RED, ON_ACCENT, disp, mono, Mono, txt, GlassField } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";
import type { AuroraIconName } from "@hybrid/core";

/**
 * AURORA login — the rounded auth screen from the mobile Figma kit, on the web.
 * Reuses the SAME Supabase flow (OAuth · email · MFA step-up · demo roles) as
 * the classic login so there is no auth/2FA regression; only the layout differs.
 */
const buildRoleInfo = (t: (k: string) => string): { id: Role; label: string; accent: string }[] => [
  { id: "client", label: t("w.account.login.role-client"), accent: LIME },
  { id: "coach", label: t("w.account.login.role-coach"), accent: VIOLET },
  { id: "admin", label: t("w.account.login.role-admin"), accent: AMBER },
];

export default function AuroraLogin() {
  const router = useRouter();
  const { t } = useLang();
  const { login, session } = useSession();
  const ROLE_INFO = buildRoleInfo(t);
  const live = isSupabaseConfigured();
  const [role, setRole] = useState<Role>("admin");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mfaStep, setMfaStep] = useState<{ factorId: string; challengeId: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  // Defer the redirect until the session actually lands in context (see the
  // classic login for the full rationale — pushing immediately races the
  // SessionProvider listener and bounces back to /login on the first attempt).
  const [navTo, setNavTo] = useState<string | null>(null);
  useEffect(() => {
    if (navTo && session) {
      setNavTo(null); // fire exactly once — later session re-emits won't re-push
      router.push(navTo);
    }
  }, [navTo, session, router]);

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
      setError(t("w.account.login.mfa-error"));
      return;
    }
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.verify({ factorId: mfaStep.factorId, challengeId: mfaStep.challengeId, code: mfaCode.trim() });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    setNavTo("/app");
  };

  const demoEnter = (provider: "apple" | "google" | "email") => {
    const base =
      provider === "email" && email.trim()
        ? email.trim().split("@")[0]!
        : role === "admin"
          ? "Operator"
          : role === "coach"
            ? "Coach"
            : "Athlete";
    login({ name: base.charAt(0).toUpperCase() + base.slice(1), email: email.trim() || `${role}@hybrid.app`, role, entitlement: "free", provider });
    setNavTo("/app");
  };

  const oauth = async (provider: "apple" | "google") => {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/auth/callback?next=/app` } });
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
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name: name.trim() || email.split("@")[0], role: "client" } } });
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
      // The app-shell routes a not-yet-onboarded client into the questionnaire
      // (gated on server-side `onboardedAt`) — no client-side flag needed.
      if (data.session) {
        setNavTo("/app");
        return;
      }
      setNotice(t("w.account.login.signup-notice"));
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
    if (await maybeStepUp(supabase)) return;
    setNavTo("/app");
  };

  const isSignup = mode === "signup";

  return (
    <div style={{ ...disp, background: INK, color: CHALK, minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "40px 24px", position: "relative" }}>
      <GlassField />
      <div style={{ width: "100%", maxWidth: 400, position: "relative", zIndex: 1 }}>
        {/* brand mark */}
        <div style={{ width: 60, height: 60, borderRadius: 30, border: `1.5px solid ${LINE}`, display: "grid", placeItems: "center", marginBottom: 22 }}>
          <span style={{ ...disp, fontWeight: 900, fontSize: fs.display }}>H<span style={{ color: txt(LIME) }}>.</span></span>
        </div>

        {mfaStep ? (
          <>
            <h1 style={{ ...disp, fontWeight: 900, fontSize: 30, letterSpacing: "-.02em", margin: "0 0 8px", lineHeight: 1.1 }}>{t("w.account.login.verify-title")}</h1>
            <Mono s={{ fontSize: fs.bodyLg, display: "block", marginBottom: 20 }} c={ASH}>{t("w.account.login.verify-sub")}</Mono>
            <input value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoFocus aria-label={t("w.account.login.verify-title")} placeholder="000000" style={{ ...roundField, fontSize: 22, letterSpacing: ".3em", textAlign: "center" }} />
            {error && <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 12 }} c={RED}>{error}</Mono>}
            <button disabled={busy || !isValidTotpCode(mfaCode)} onClick={verifyMfa} style={{ ...lightPill, opacity: busy || !isValidTotpCode(mfaCode) ? 0.6 : 1 }}>{busy ? "…" : t("w.account.login.verify")}</button>
            <button onClick={() => { setMfaStep(null); setMfaCode(""); setError(""); }} style={linkBtn}><Mono s={{ fontSize: fs.body }} c={ASH}>← {t("w.account.login.cancel")}</Mono></button>
          </>
        ) : (
          <>
            <h1 style={{ ...disp, fontWeight: 900, fontSize: 32, letterSpacing: "-.02em", margin: "0 0 26px", lineHeight: 1.1 }}>
              {isSignup ? t("w.account.login.signup-title") : t("w.account.login.signin-title")}
            </h1>

            {!live && (
              <>
                <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 8 }}>{t("w.account.login.demo-label")}</Mono>
                <div style={{ display: "flex", gap: space.sm, marginBottom: 18 }}>
                  {ROLE_INFO.map((r) => {
                    const on = role === r.id;
                    return (
                      <button key={r.id} onClick={() => setRole(r.id)} style={{ flex: 1, ...mono, fontSize: fs.body, fontWeight: 700, padding: "11px 0", borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? r.accent : LINE}`, background: on ? r.accent : "transparent", color: on ? ON_ACCENT : ASH }}>{r.label}</button>
                    );
                  })}
                </div>
              </>
            )}

            {live && isSignup && (
              <Field icon="user"><input type="text" value={name} onChange={(e) => setName(e.target.value)} aria-label={t("w.account.login.username-ph")} placeholder={t("w.account.login.username-ph")} style={bareInput} /></Field>
            )}
            <Field icon="mail"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label={t("w.account.login.email-ph")} placeholder={t("w.account.login.email-ph")} style={bareInput} /></Field>
            {live && (
              <Field icon="lock" trailing="eye" onTrailingClick={() => setShowPassword((v) => !v)} trailingActive={showPassword}>
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} aria-label={t("w.account.login.password-ph")} placeholder={t("w.account.login.password-ph")} style={bareInput} />
              </Field>
            )}

            {error && <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 12 }} c={RED}>{error}</Mono>}
            {notice && <Mono s={{ fontSize: fs.body, display: "block", marginBottom: 12 }} c={LIME}>{notice}</Mono>}

            <button disabled={busy} onClick={() => (live ? emailSubmit() : demoEnter("email"))} style={{ ...lightPill, opacity: busy ? 0.6 : 1 }}>
              {busy ? "…" : isSignup ? t("w.account.login.register") : t("w.account.login.login")}
            </button>

            <div style={{ textAlign: "center", margin: "16px 0" }}><Mono s={{ fontSize: fs.body }}>{t("w.account.login.or-continue")}</Mono></div>
            <div style={{ display: "flex", gap: space.ms }}>
              {(["apple", "google"] as const).map((p) => (
                <button key={p} disabled={busy} onClick={() => (live ? oauth(p) : demoEnter(p))} style={{ ...softPill, flex: 1, textTransform: "capitalize" }}>{p}</button>
              ))}
            </div>

            {live && (
              <button onClick={() => { setMode((m) => (m === "signin" ? "signup" : "signin")); setError(""); setNotice(""); }} style={linkBtn}>
                <Mono s={{ fontSize: fs.bodyLg }} c={ASH}>
                  {isSignup ? t("w.account.login.have-account") : t("w.account.login.no-account")}
                  <span style={{ color: txt(LIME), fontWeight: 700 }}>{isSignup ? t("w.account.login.login-now") : t("w.account.login.register-now")}</span>
                </Mono>
              </button>
            )}

            <button onClick={() => router.push("/")} style={{ ...linkBtn, marginTop: 8 }}><Mono s={{ fontSize: fs.caption, textTransform: "uppercase", letterSpacing: ".06em" }} c={ASH}>← {t("w.account.login.back")}</Mono></button>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ icon, trailing, onTrailingClick, trailingActive, children }: { icon: AuroraIconName; trailing?: AuroraIconName; onTrailingClick?: () => void; trailingActive?: boolean; children: React.ReactNode }) {
  const { t } = useLang();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: space.md, padding: "0 16px", borderRadius: 16, background: INK2, border: `1px solid ${LINE}`, marginBottom: 13 }}>
      <AuroraIcon name={icon} size={20} color={ASH} />
      {children}
      {trailing && (
        onTrailingClick ? (
          <button type="button" onClick={onTrailingClick} aria-label={t("w.account.login.toggle-pw")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
            <AuroraIcon name={trailing} size={20} color={trailingActive ? LIME : ASH} />
          </button>
        ) : (
          <AuroraIcon name={trailing} size={20} color={ASH} />
        )
      )}
    </div>
  );
}
const roundField = { ...mono, fontSize: fs.note, width: "100%", padding: "16px 18px", borderRadius: 16, background: INK2, color: CHALK, border: `1px solid ${LINE}`, marginBottom: 13, outline: "none" } as const;
const bareInput = { ...mono, fontSize: fs.note, flex: 1, padding: "16px 0", background: "transparent", color: CHALK, border: "none", outline: "none" } as const;
const lightPill = { ...disp, fontWeight: 800, fontSize: fs.subtitle, width: "100%", padding: 17, borderRadius: 999, cursor: "pointer", border: "none", background: CHALK, color: ON_ACCENT } as const;
const softPill = { ...disp, fontWeight: 700, fontSize: fs.note, padding: 15, borderRadius: 999, cursor: "pointer", border: `1px solid ${LINE}`, background: INK2, color: CHALK } as const;
const linkBtn = { display: "block", width: "100%", textAlign: "center" as const, marginTop: 22, background: "none", border: "none", cursor: "pointer" };
