import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSession } from "../../lib/session";
import { useTheme } from "../../lib/theme";
import { fs, F } from "../../lib/ui";
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

  return (
    <View style={{ flex: 1, backgroundColor: C.ink, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Text style={{ fontFamily: F.black, fontSize: 24, color: C.chalk, textAlign: "center" }}>
        {state === "done" ? "You're connected ✓" : "Your coach invited you"}
      </Text>

      {!ready ? (
        <ActivityIndicator color={C.lime} style={{ marginTop: 16 }} />
      ) : !session ? (
        <>
          <Text style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.ash, textAlign: "center", marginTop: 12, lineHeight: 20 }}>
            Create your free account or sign in to connect. Use the email your coach invited and you&apos;ll be linked automatically.
          </Text>
          <Pressable onPress={() => router.replace("/login")} style={{ marginTop: 20, backgroundColor: C.lime, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24 }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.ink }}>Sign in / Create account</Text>
          </Pressable>
        </>
      ) : state === "error" ? (
        <>
          <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.amber, textAlign: "center", marginTop: 12 }}>{msg}</Text>
          <Pressable onPress={() => void claim()} style={{ marginTop: 16 }}>
            <Text style={{ fontFamily: F.mono, color: C.lime }}>Try again</Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator color={C.lime} style={{ marginTop: 16 }} />
      )}
    </View>
  );
}
