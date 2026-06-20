import { Stack, Redirect } from "expo-router";
import { View } from "react-native";
import { useSession } from "../../lib/session";
import { useTheme } from "../../lib/theme";

// The mobile admin console mirrors the web `/admin` surface. Gating here is the
// client guard (UX); the real boundary is server-side — every `/api/admin/*`
// route runs requireAdmin() and 401/403s a non-admin, so no admin data is ever
// served even if this guard were bypassed. A signed-out or non-admin visitor is
// bounced to the app shell (matching the web layout's redirect to /app).
export default function AdminLayout() {
  const { session, ready, role } = useSession();
  const { palette } = useTheme();

  if (!ready) return <View style={{ flex: 1, backgroundColor: palette.ink }} />;
  if (!session) return <Redirect href="/login" />;
  if (role !== "admin") return <Redirect href="/(tabs)" />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.ink } }} />;
}
