import { View } from "react-native";
import { useRouter } from "expo-router";
import { space } from "../lib/ui";
import { AuroraScreen, AHeading, ASub } from "../components/aurora/kit";
import { MySocialProfileEdit } from "../components/aurora/my-social-profile";
import { useLang } from "../lib/i18n";

// Edit your public profile — handle, bio, photo and who can see your results.
// Reached from the account Profile ("Edit profile") and Settings → Public profile.
// Uses the shared AuroraScreen hero so it reads identically to the
// rest of Settings (was the last screen on the legacy Screen/GlassField chrome).
export default function ProfileEdit() {
  const router = useRouter();
  const { t } = useLang();
  return (
    <AuroraScreen hero={{ rank: "title", title: t("w.profile.editProfile") }}>
      <ASub style={{ marginTop: 8, marginBottom: 14 }}>{t("w.profile.editSub")}</ASub>
      <MySocialProfileEdit onDone={() => router.back()} />
    </AuroraScreen>
  );
}
