import { useEffect, useState } from "react";
import { View, Text, TextInput, AccessibilityInfo } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { stepUpRequired, isValidTotpCode } from "@hybrid/core";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { useSession } from "../../lib/session";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, F, PressScale as Pressable } from "../../lib/ui";
import { AuroraScreen, AuroraMark, APill, AField, AHeading , RADIUS} from "./kit";
import { LegalLinks } from "../legal-links";

/** AURORA login/register — the rounded auth form from the Figma kit, on the
 *  same Supabase auth flow as the classic login screen. */
export default function AuroraLogin() {
  const { palette } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const { session } = useSession();
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const live = isSupabaseConfigured();
  const [mode, setMode] = useState<"signin" | "signup">(modeParam === "signup" ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // Where to go AFTER auth — navigate only once the session is actually present
  // in context. Navigating the instant signInWithPassword resolves races the
  // SessionProvider's onAuthStateChange listener: the (tabs) guard can still see
  // a null session and bounce straight back to /login (the "works on 2nd try"
  // bug). Gating on `session` makes the first attempt land reliably.
  const [navTo, setNavTo] = useState<string | null>(null);
  // TOTP step-up: when the account has MFA enrolled, a fresh password sign-in is
  // only AAL1 — we must challenge for the 6-digit code before entering the app.
  const [mfaStep, setMfaStep] = useState<{ factorId: string; challengeId: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  useEffect(() => {
    if (navTo && session) router.replace(navTo);
  }, [navTo, session, router]);

  const fail = (m: string) => {
    setError(m);
    AccessibilityInfo.announceForAccessibility(m);
    setBusy(false);
  };

  // Password reset — send a reset link to the entered email. Was a dead label
  // that locked users out on mobile.
  const resetPassword = async () => {
    if (!live || busy) return;
    if (!email.trim()) { setError(t("w.account.login.forgot-need-email")); return; }
    setBusy(true); setError(""); setNotice("");
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (err) { fail(err.message); return; }
    setNotice(t("w.account.login.forgot-sent"));
    AccessibilityInfo.announceForAccessibility(t("w.account.login.forgot-sent"));
  };

  // Mirrors the web login step-up (aurora/login.tsx): if the signed-in session is
  // below its target assurance level, challenge the enrolled TOTP factor and show
  // the code screen instead of navigating. Returns true when a step-up is pending.
  const maybeStepUp = async (): Promise<boolean> => {
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
    if (!mfaStep || !isValidTotpCode(mfaCode)) return fail(t("w.account.login.mfa-error"));
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.mfa.verify({ factorId: mfaStep.factorId, challengeId: mfaStep.challengeId, code: mfaCode.trim() });
    if (error) return fail(error.message);
    setNavTo("/");
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name: name.trim() || email.split("@")[0], role: "client" } },
      });
      if (error) return fail(error.message);
      // Fresh account → queue the first-run tutorial (shown on the home tab after
      // onboarding; deferred if a guest workout still needs to land). Onboarding
      // itself is now gated server-side (no client-side pendingOnboarding flag).
      await AsyncStorage.setItem("hybrid.pendingTour", "1").catch(() => {});
      if (!data.session) {
        setError(t("w.account.login.signup-notice"));
        AccessibilityInfo.announceForAccessibility(t("w.account.login.signup-notice"));
        setMode("signin");
        setBusy(false);
        return;
      }
      // Route through "/" — the entry gate sends a not-yet-onboarded client into
      // the questionnaire (server-side `onboardedAt`), no fragile flag needed.
      setNavTo("/");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return fail(error.message);
    // If MFA is enrolled, challenge before entering — otherwise straight in.
    if (await maybeStepUp()) return;
    // The entry gate decides onboarding vs the app from server-side state.
    setNavTo("/");
  };

  const isSignup = mode === "signup";

  return (
    <AuroraScreen hero={{ rank: "bar", title: "" }}>
      <AuroraMark size={56} />
      {mfaStep ? (
        <View style={{ marginTop: 24 }}>
          <AHeading>{t("w.account.login.verify-title")}</AHeading>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: palette.ash, marginTop: 8, marginBottom: 20 }}>{t("w.account.login.verify-sub")}</Text>
          <TextInput
            value={mfaCode}
            onChangeText={(v) => setMfaCode(v.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            autoFocus
            placeholder="000000"
            placeholderTextColor={palette.ash}
            accessibilityLabel={t("w.account.login.verify-title")}
            style={{ fontFamily: F.mono, fontSize: 24, letterSpacing: 8, textAlign: "center", color: palette.chalk, borderWidth: 1, borderColor: palette.line, borderRadius: RADIUS.field, paddingVertical: 16, backgroundColor: palette.ink2 }}
          />
          {!!error && (
            <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ fontFamily: F.reg, fontSize: fs.body, color: txt(palette, palette.red), marginTop: 10 }}>{error}</Text>
          )}
          <APill label={t("w.account.login.verify")} state={busy ? "saving" : "idle"} variant="light" onPress={verifyMfa} disabled={!isValidTotpCode(mfaCode)} style={{ marginTop: 16 }} />
          <Pressable onPress={() => { setMfaStep(null); setMfaCode(""); setError(""); }} style={{ marginTop: 16, alignItems: "center" }}>
            <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: palette.ash }}>← {t("w.account.login.cancel")}</Text>
          </Pressable>
        </View>
      ) : (
      <>
      <AHeading style={{ marginTop: 24 }}>
        {isSignup ? t("w.account.login.signup-title") : t("w.account.login.signin-title")}
      </AHeading>

      <View style={{ marginTop: 24 }}>
        {isSignup && <AField value={name} onChange={setName} placeholder={t("w.account.login.username-ph")} icon="user" />}
        <AField value={email} onChange={setEmail} placeholder={t("w.account.login.email-ph")} keyboard="email-address" icon="mail" />
        <AField value={password} onChange={setPassword} placeholder={t("w.account.login.password-ph")} secure icon="lock" />

        {!isSignup && (
          <Pressable onPress={resetPassword} accessibilityRole="button" accessibilityLabel={t("w.account.login.forgot-password")} hitSlop={8} style={{ alignSelf: "flex-end", marginBottom: 6 }}>
            <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: txt(palette, palette.lime), textAlign: "right" }}>
              {t("w.account.login.forgot-password")}
            </Text>
          </Pressable>
        )}

        {!!notice && (
          <Text accessibilityLiveRegion="polite" style={{ fontFamily: F.reg, fontSize: fs.body, color: txt(palette, palette.lime), marginBottom: 10 }}>{notice}</Text>
        )}
        {!!error && (
          <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ fontFamily: F.reg, fontSize: fs.body, color: txt(palette, palette.red), marginBottom: 10 }}>{error}</Text>
        )}

        <APill
          label={isSignup ? t("w.account.login.register") : t("w.account.login.login")}
          state={busy ? "saving" : "idle"}
          variant="light"
          onPress={submit}
          disabled={busy || !live}
          style={{ marginTop: 6 }}
        />
      </View>

      <Pressable
        onPress={() => {
          setMode((m) => (m === "signin" ? "signup" : "signin"));
          setError("");
        }}
        style={{ marginTop: 28, alignItems: "center" }}
      >
        <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: palette.ash }}>
          {isSignup ? t("w.account.login.have-account") : t("w.account.login.no-account")}
          <Text style={{ fontFamily: F.bold, color: txt(palette, palette.lime) }}>
            {isSignup ? t("w.account.login.login-now") : t("w.account.login.register-now")}
          </Text>
        </Text>
      </Pressable>
      </>
      )}

      {!live && (
        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: palette.ash, textAlign: "center", marginTop: 16 }}>
          {t("w.account.login.anon-key-hint")}
        </Text>
      )}

      <LegalLinks agree />
    </AuroraScreen>
  );
}
