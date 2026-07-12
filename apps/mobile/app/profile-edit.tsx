import { View } from "react-native";
import { useRouter } from "expo-router";
import { space } from "../lib/ui";
import { ABack, AuroraScreen, AHeading, ASub } from "../components/aurora/kit";
import { MySocialProfileEdit } from "../components/aurora/my-social-profile";

// Edit your public profile — handle, bio, photo and who can see your results.
// Reached from the account Profile ("Edit profile") and Settings → Public profile.
// Uses the shared AuroraScreen + AHeading + ABack so it reads identically to the
// rest of Settings (was the last screen on the legacy Screen/GlassField chrome).
export default function ProfileEdit() {
  const router = useRouter();
  return (
    <AuroraScreen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, marginBottom: 8 }}>
        <ABack />
        <AHeading style={{ fontSize: 28 }}>Edit profile</AHeading>
      </View>
      <ASub style={{ marginTop: 8, marginBottom: 14 }}>Photo, name, handle, bio and visibility.</ASub>
      <MySocialProfileEdit onDone={() => router.back()} />
    </AuroraScreen>
  );
}
