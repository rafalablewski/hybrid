import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { useSession } from "../../lib/session";
import { useTheme, txt } from "../../lib/theme";
import { fs, F } from "../../lib/ui";
import { AuroraScreen, AuroraMark, APill, AField, AHeading } from "./kit";
import { AuroraIcon } from "./icons";

// Mirrors app/login.tsx: a brand-new account owes onboarding on next entry.
const PENDING_ONBOARDING = "hybrid.pendingOnboarding";

/** AURORA login/register — the rounded auth form from the Figma kit, on the
 *  same Supabase auth flow as the classic login screen. */
export default function AuroraLogin() {
  const { palette } = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const live = isSupabaseConfigured();
  const [mode, setMode] = useState<"signin" | "signup">(modeParam === "signup" ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Where to go AFTER auth — navigate only once the session is actually present
  // in context. Navigating the instant signInWithPassword resolves races the
  // SessionProvider's onAuthStateChange listener: the (tabs) guard can still see
  // a null session and bounce straight back to /login (the "works on 2nd try"
  // bug). Gating on `session` makes the first attempt land reliably.
  const [navTo, setNavTo] = useState<string | null>(null);
  useEffect(() => {
    if (navTo && session) router.replace(navTo);
  }, [navTo, session, router]);

  const fail = (m: string) => {
    setError(m);
    setBusy(false);
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
      await AsyncStorage.setItem(PENDING_ONBOARDING, "1").catch(() => {});
      // Fresh account → also queue the first-run tutorial (shown on the home tab
      // after onboarding; deferred if a guest workout still needs to land).
      await AsyncStorage.setItem("hybrid.pendingTour", "1").catch(() => {});
      if (!data.session) {
        setError("Account created. Confirm via email, then sign in.");
        setMode("signin");
        setBusy(false);
        return;
      }
      await AsyncStorage.removeItem(PENDING_ONBOARDING).catch(() => {});
      setNavTo("/onboarding");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return fail(error.message);
    const pending = await AsyncStorage.getItem(PENDING_ONBOARDING).catch(() => null);
    if (pending) {
      await AsyncStorage.removeItem(PENDING_ONBOARDING).catch(() => {});
      setNavTo("/onboarding");
      return;
    }
    setNavTo("/(tabs)");
  };

  const isSignup = mode === "signup";

  return (
    <AuroraScreen>
      <Pressable
        onPress={() => router.back()}
        hitSlop={10}
        style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" }}
      >
        <AuroraIcon name="back" size={20} color={palette.chalk} />
      </Pressable>

      <AuroraMark size={56} />
      <AHeading style={{ marginTop: 22 }}>
        {isSignup ? "Hello! Register to\nget started" : "Welcome back! Glad\nto see you, Again!"}
      </AHeading>

      <View style={{ marginTop: 26 }}>
        {isSignup && <AField value={name} onChange={setName} placeholder="Username" icon="user" />}
        <AField value={email} onChange={setEmail} placeholder="Enter your email" keyboard="email-address" icon="mail" />
        <AField value={password} onChange={setPassword} placeholder="Enter your password" secure icon="lock" />

        {!isSignup && (
          <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: palette.ash, textAlign: "right", marginBottom: 6 }}>
            Forgot Password?
          </Text>
        )}

        {!!error && (
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: txt(palette, palette.red), marginBottom: 10 }}>{error}</Text>
        )}

        <APill
          label={busy ? "…" : isSignup ? "Register" : "Login"}
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
          {isSignup ? "Already have an account? " : "Don't have an account? "}
          <Text style={{ fontFamily: F.bold, color: txt(palette, palette.lime) }}>
            {isSignup ? "Login Now" : "Register Now"}
          </Text>
        </Text>
      </Pressable>

      {!live && (
        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: palette.ash, textAlign: "center", marginTop: 18 }}>
          Set EXPO_PUBLIC_SUPABASE_ANON_KEY to enable sign-in.
        </Text>
      )}
    </AuroraScreen>
  );
}
