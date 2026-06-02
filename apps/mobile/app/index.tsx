import { Redirect } from "expo-router";
import { View } from "react-native";
import { useSession } from "../lib/session";
import { C } from "../lib/ui";

export default function Index() {
  const { session, ready } = useSession();
  if (!ready) return <View style={{ flex: 1, backgroundColor: C.ink }} />;
  return <Redirect href={session ? "/(tabs)" : "/login"} />;
}
