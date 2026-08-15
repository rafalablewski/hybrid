import { View, Text } from "react-native";
import { fs, F, leading , tracking} from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { AuroraScreen } from "../../components/aurora/kit";
import { AuroraIcon } from "../../components/aurora/icons";

/**
 * MESSAGES — the bottom bar's fourth destination, mirrored on web by
 * apps/web/components/aurora/messages.tsx.
 *
 * IT IS A PLACEHOLDER, AND IT SAYS SO. Direct messages are not built: there is
 * no thread model, no delivery, no unread state. The screen exists because the
 * slot does — the bar spends its fourth tab here instead of on the retired More
 * springboard — and an empty room the athlete can walk into and read is a
 * better answer than a tab that opens nothing.
 *
 * What it must NEVER do is fake the feature: no sample threads, no fabricated
 * unread badge, no "3 new messages", and no badge on the tab. Tracked in
 * capabilities.ts as `direct-messages` (planned); when the real thing lands,
 * this file is what it replaces.
 */
export default function Messages() {
  const C = useTheme().palette;
  const { t } = useLang();
  return (
    <AuroraScreen hero={{ rank: "title", title: t("messages.title"), eyebrow: t("nav.group.social") }} back={false}>
      <View style={{ marginTop: 24, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 28, padding: 20 }}>
        <AuroraIcon name="mail" size={28} color={C.ash} />
        <Text style={{ marginTop: 14, fontFamily: F.black, fontSize: fs.heading, letterSpacing: tracking.display, color: C.chalk }}>{t("messages.soonTitle")}</Text>
        <Text style={{ marginTop: 8, fontFamily: F.mono, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash }}>{t("messages.soonBody")}</Text>
        <Text style={{ marginTop: 14, fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{t("messages.soonNote")}</Text>
      </View>
    </AuroraScreen>
  );
}
