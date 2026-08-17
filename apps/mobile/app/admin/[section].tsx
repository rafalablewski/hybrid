import { View, Text, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Mono } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { AuroraScreen } from "../../components/aurora/kit";
import { ADMIN_SECTIONS, type AdminSectionId } from "../../components/admin/sections";

import AdminOverview from "../../components/admin/overview";
import AdminUsers from "../../components/admin/users";
import AdminDirectory from "../../components/admin/directory";
import AdminModeration from "../../components/admin/moderation";
import AdminAnnouncements from "../../components/admin/announcements";
import AdminExercises from "../../components/admin/exercises";
import AdminMedia from "../../components/admin/media";
import AdminTranslations from "../../components/admin/translations";
import AdminFlags from "../../components/admin/flags";
import AdminContent from "../../components/admin/content";
import AdminAccess from "../../components/admin/access";
import AdminSecurity from "../../components/admin/security";
import AdminAudit from "../../components/admin/audit";
import AdminSystem from "../../components/admin/system";
import AdminGuidance from "../../components/admin/guidance";

// Each body renders plain content (no Screen/ScrollView of its own — the host
// provides the scroll + chrome), matching the web split where panel.tsx owns the
// header and each section component owns only its body.
const BODIES: Record<AdminSectionId, () => React.JSX.Element> = {
  overview: AdminOverview,
  users: AdminUsers,
  directory: AdminDirectory,
  moderation: AdminModeration,
  announcements: AdminAnnouncements,
  exercises: AdminExercises,
  media: AdminMedia,
  translations: AdminTranslations,
  flags: AdminFlags,
  content: AdminContent,
  access: AdminAccess,
  security: AdminSecurity,
  audit: AdminAudit,
  system: AdminSystem,
  guidance: AdminGuidance,
};

export default function AdminSectionScreen() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const router = useRouter();
  const { palette } = useTheme();
  const meta = ADMIN_SECTIONS.find((s) => s.id === section);
  const Body = meta ? BODIES[meta.id] : undefined;

  return (
    <AuroraScreen
      hero={{ rank: "title", title: meta?.label ?? "Section", eyebrow: "admin.hybrid.app", accent: palette.amber }}
      back={() => (router.canGoBack() ? router.back() : router.replace("/admin"))}
    >
      {Body ? <Body /> : <Mono color={palette.ash}>Unknown section.</Mono>}
    </AuroraScreen>
  );
}
