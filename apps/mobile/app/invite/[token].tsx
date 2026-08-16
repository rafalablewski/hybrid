import { useCallback, useEffect, useState } from "react";
import { APill, AuroraScreen } from "../../components/aurora/kit";
import { View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSession } from "../../lib/session";
import { useTheme, txt } from "../../lib/theme";
import { leading, fs, F, PressScale as Pressable, Loading, LoadSwap } from "../../lib/ui";
import { claimCoachInvite } from "../../lib/api";

// Claim landing for a coach invite (QR / link / deep-link). Claims immediately
// when signed in (claim = consent → ACTIVE link), otherwise stashes the token and
// sends the visitor to sign in — the session layer finishes the claim on return.
export default function InviteClaim() {
  const C = useTheme().palette;
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session, ready } = useSession();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "claiming" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (token) AsyncStorage.setItem("hybrid.coachInviteToken", String(token)).catch(() => {});
  }, [token]);

  const claim = useCallback(async () => {
    if (!token) return;
    setState("claiming");
    const r = await claimCoachInvite(String(token));
    if (r.ok) {
      AsyncStorage.removeItem("hybrid.coachInviteToken").catch(() => {});
      setState("done");
    } else {
      setState("error");
      setMsg(r.error || "Couldn't accept the invite.");
    }
  }, [token]);

  useEffect(() => {
    if (ready && session && state === "idle") void claim();
  }, [ready, session, state, claim]);

  // Navigate home shortly after a successful claim; clear the timer on unmount.
  useEffect(() => {
    if (state !== "done") return;
    const timer = setTimeout(() => router.replace("/"), 1000);
    return () => clearTimeout(timer);
  }, [state, router]);

  // The shell, not a hand-painted ink rectangle: this is a LANDING — the first
  // screen an invited athlete ever sees — and it was one of the two surfaces in
  // the app drawing its own flat background, so it arrived with no ambient
  // field behind it and no entrance (the other was onboarding; both fixed in
  // the same pass, and design-tokens.test.ts now fails a third).
  return (
    <AuroraScreen scroll={false} center>
      <View style={{ alignItems: "center" }}>
        <Text style={{ fontFamily: F.black, fontSize: fs.display, color: C.chalk, textAlign: "center" }}>
          {state === "done" ? "You're connected ✓" : "Your coach invited you"}
        </Text>

        <LoadSwap loading={!ready}>
          {() => !ready ? null : !session ? (
            <>
              <Text style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.ash, textAlign: "center", marginTop: 12, lineHeight: leading(fs.bodyLg) }}>
                Create your free account or sign in to connect. Use the email your coach invited and you&apos;ll be linked automatically.
              </Text>
              <APill label="Sign in / Create account" onPress={() => router.replace("/login")} style={{ marginTop: 20 }} />
            </>
          ) : state === "error" ? (
            <>
              <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: txt(C, C.amber), textAlign: "center", marginTop: 12 }}>{msg}</Text>
              <Pressable onPress={() => void claim()} style={{ marginTop: 16 }}>
                <Text style={{ fontFamily: F.mono, color: txt(C, C.lime) }}>Try again</Text>
              </Pressable>
            </>
          ) : (
            <Loading />
          )}
        </LoadSwap>
      </View>
    </AuroraScreen>
  );
}
