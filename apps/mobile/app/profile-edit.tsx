import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Screen, F } from "../lib/ui";
import { useTheme } from "../lib/theme";
import { MySocialProfileEdit } from "../components/aurora/my-social-profile";

// Edit your public profile — handle, bio, photo and who can see your results.
// Reached from the account Profile ("Edit profile") and Settings → Public profile.
export default function ProfileEdit() {
  const C = useTheme().palette;
  const router = useRouter();
  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.chalk, fontSize: 18 }}>‹</Text></Pressable>
        <View>
          <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 24 }}>Edit profile</Text>
          <Text style={{ color: C.ash, fontSize: 13 }}>Photo, name, handle, bio and visibility.</Text>
        </View>
      </View>
      <MySocialProfileEdit onDone={() => router.back()} />
    </Screen>
  );
}
