import { View, Text } from "react-native";
import { fs, F, leading } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { AuroraScreen, AHeading } from "../../components/aurora/kit";
import { AuroraIcon } from "../../components/aurora/icons";

/**
 * MESSAGES — the bottom bar's fourth destination. (It used to name a web twin
 * here; that file went with the web client in Aug 2026, and mobile is the
 * product.)
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
    // NO HERO — a TAB ROOT keeps the plain scaffold, the rule the kit states on
    // AuroraScreen's `hero` prop ("a root tab has nothing to pop and no title to
    // establish, so a rail there would be chrome for its own sake") and again at
    // Nutrition's own tab root. This screen was the app's one exception, and it
    // was the expensive kind: the last file anyone would read for precedent,
    // quietly teaching the opposite of the rule. The hero also spent a fixed
    // 132dp on a box it filled with a title and a nav-group label, on a screen
    // whose entire content is one card saying the feature does not exist yet.
    // Its `eyebrow` went with it: "Social" was a NAV GROUP name borrowed into a
    // head slot, and the tab bar already says Messages directly below.
    <AuroraScreen>
      <AHeading>{t("messages.title")}</AHeading>
      <View style={{ marginTop: 24, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 28, padding: 20 }}>
        <AuroraIcon name="mail" size={28} color={C.ash} />
        <Text style={{ marginTop: 14, fontFamily: F.black, fontSize: fs.heading, letterSpacing: -0.4, color: C.chalk }}>{t("messages.soonTitle")}</Text>
        <Text style={{ marginTop: 8, fontFamily: F.mono, fontSize: fs.body, lineHeight: leading(fs.body), color: C.ash }}>{t("messages.soonBody")}</Text>
        <Text style={{ marginTop: 14, fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{t("messages.soonNote")}</Text>
      </View>
    </AuroraScreen>
  );
}
