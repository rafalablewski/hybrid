import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { brand } from "@hybrid/core";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { useSession } from "../lib/session";

// Set when an account is first created, consumed on the next authenticated
// entry — so a brand-new user lands in onboarding to set their persona + goal +
// preferences, whether the session is immediate or arrives after email confirm.
const PENDING_ONBOARDING = "hybrid.pendingOnboarding";
import { useLang } from "../lib/i18n";
import { F, Button } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraLogin from "../components/aurora/login";

export default function Login() {
  if (useTemplate().template === "aurora") return <AuroraLogin />;
  return <ClassicLogin />;
}

function ClassicLogin() {
  const C = useTheme().palette;
  const router = useRouter();
  const { t } = useLang();
  const { session } = useSession();
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const live = isSupabaseConfigured();
  const [mode, setMode] = useState<"signin" | "signup">(modeParam === "signup" ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Navigate only once the session lands in context — see the Aurora login for
  // the full rationale: replacing the instant signInWithPassword resolves races
  // the SessionProvider listener and the (tabs) guard bounces back to /login
  // (the "login fails on the first try, works on the second" bug).
  const [navTo, setNavTo] = useState<string | null>(null);
  useEffect(() => {
    if (navTo && session) router.replace(navTo);
  }, [navTo, session, router]);

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
      // Fresh registration → onboarding (now or right after they confirm + sign
      // in). Any guest workouts have already flushed up on sign-in.
      await AsyncStorage.setItem(PENDING_ONBOARDING, "1").catch(() => {});
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
    // Returning users go straight to the app — unless they just registered and
    // still owe onboarding (email-confirm path).
    const pending = await AsyncStorage.getItem(PENDING_ONBOARDING).catch(() => null);
    if (pending) {
      await AsyncStorage.removeItem(PENDING_ONBOARDING).catch(() => {});
      setNavTo("/onboarding");
      return;
    }
    setNavTo("/(tabs)");
  };
  const fail = (m: string) => {
    setError(m);
    setBusy(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.ink, justifyContent: "center", padding: 28 }}>
      <View style={{ alignItems: "center", marginBottom: 32 }}>
        <Text style={{ fontFamily: F.black, fontSize: 44, color: C.chalk, letterSpacing: -2 }}>
          {brand.name}
          <Text style={{ color: txt(C, C.lime) }}>.</Text>
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: txt(C, C.lime), letterSpacing: 3, marginTop: 6 }}>
          STRENGTH · CONDITIONING
        </Text>
      </View>

      {mode === "signup" && (
        <Input value={name} onChange={setName} placeholder="name" />
      )}
      <Input value={email} onChange={setEmail} placeholder="you@email.com" keyboard="email-address" />
      <Input value={password} onChange={setPassword} placeholder="password" secure />

      {!!error && (
        <Text style={{ fontFamily: F.mono, fontSize: 12, color: txt(C, C.red), marginBottom: 10 }}>{error}</Text>
      )}

      <Button
        label={busy ? "…" : mode === "signup" ? "Create account →" : "Sign in →"}
        onPress={submit}
        disabled={busy || !live}
      />

      <Pressable
        onPress={() => {
          setMode((m) => (m === "signin" ? "signup" : "signin"));
          setError("");
        }}
        style={{ alignItems: "center", marginTop: 16 }}
      >
        <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>
          {mode === "signin" ? "Need an account? " : "Have an account? "}
          <Text style={{ color: txt(C, C.lime) }}>{mode === "signin" ? "Create one" : "Sign in"}</Text>
        </Text>
      </Pressable>

      <Pressable onPress={() => router.push("/workout?source=empty")} style={{ alignItems: "center", marginTop: 22 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>← {t("login.guest")}</Text>
      </Pressable>

      {!live && (
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, textAlign: "center", marginTop: 20 }}>
          Set EXPO_PUBLIC_SUPABASE_ANON_KEY to enable sign-in.
        </Text>
      )}
    </SafeAreaView>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  secure,
  keyboard,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  secure?: boolean;
  keyboard?: "email-address";
}) {
  const C = useTheme().palette;
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={C.ash}
      secureTextEntry={secure}
      keyboardType={keyboard ?? "default"}
      autoCapitalize="none"
      style={{
        fontFamily: F.mono,
        fontSize: 15,
        color: C.chalk,
        backgroundColor: C.ink2,
        borderWidth: 1,
        borderColor: C.line,
        borderRadius: 12,
        padding: 14,
        marginBottom: 11,
      }}
    />
  );
}
