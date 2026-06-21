import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSession } from "../lib/session";
import { fetchOnboardedAt } from "../lib/api";
import { C } from "../lib/ui";

// Entry gate. A signed-out visitor → welcome. A signed-in CLIENT who hasn't
// onboarded → the questionnaire; everyone else → the app. Onboarding gates on
// the server-side `onboardedAt` (so it reliably appears once and survives the
// email-confirm round-trip + device changes), with a same-device fallback flag
// for before sql-onboarding.sql is applied.
export default function Index() {
  const { session, ready, role } = useSession();
  const [dest, setDest] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!session) { setDest("/welcome"); return; }
    if (role !== "client") { setDest("/(tabs)"); return; }
    let alive = true;
    (async () => {
      try {
        const done = await AsyncStorage.getItem("hybrid.onboarded");
        if (done === "1") { if (alive) setDest("/(tabs)"); return; }
        const onboardedAt = await fetchOnboardedAt();
        if (alive) setDest(onboardedAt ? "/(tabs)" : "/onboarding");
      } catch {
        if (alive) setDest("/(tabs)");
      }
    })();
    return () => { alive = false; };
  }, [ready, session, role]);

  if (!ready || !dest) return <View style={{ flex: 1, backgroundColor: C.ink }} />;
  return <Redirect href={dest} />;
}
