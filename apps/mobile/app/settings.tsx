import { useLocalSearchParams } from "expo-router";
import { SETTINGS_CATEGORIES, type SettingsCategoryId } from "@hybrid/core";
import AuroraSettings from "../components/aurora/settings";

export default function Settings() {
  const { cat } = useLocalSearchParams<{ cat?: string }>();
  // Only a category the app actually has — a stale link from an older build
  // lands on the list rather than a blank sub-page.
  const landOn = typeof cat === "string" && cat in SETTINGS_CATEGORIES ? (cat as SettingsCategoryId) : undefined;
  return <AuroraSettings landOn={landOn} />;
}
