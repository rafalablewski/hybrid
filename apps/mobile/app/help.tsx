import { useState } from "react";
import { View, Text, Linking } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TOUR_SEEN_KEY } from "@hybrid/core";
import { setPref } from "../lib/synced-prefs";
import { HELP_ROWS, SUPPORT_EMAIL, supportMailto, type HelpRow } from "@hybrid/core";
import { API_BASE } from "../lib/api";
import { useLang } from "../lib/i18n";
import { useTheme } from "../lib/theme";
import { fs, F, PressScale as Pressable } from "../lib/ui";
import { AuroraScreen , RADIUS} from "../components/aurora/kit";
import { AuroraIcon } from "../components/aurora/icons";
import { NAV_HREF } from "../lib/nav-href";

/**
 * HELP CENTER (mobile) — the third row in the side menu's footer. The rows,
 * their order and their words come from @hybrid/core (help.ts); only the
 * plumbing behind each action lives here.
 *
 * Every row does something that exists today: it re-arms the real first-run
 * tour, opens a mailbox that receives mail, walks into the request-access flow
 * inside Settings, or opens the published legal pages. There is deliberately no
 * article index and no search box — we have no articles, and a search field
 * over nothing is the worst kind of placeholder.
 */
export default function HelpCenter() {
  const C = useTheme().palette;
  const { t } = useLang();
  const router = useRouter();
  // The tour is the one row with no destination — it arms something that
  // happens on the NEXT screen, so it confirms in place rather than leaving.
  const [tourArmed, setTourArmed] = useState(false);

  const act = (row: HelpRow) => {
    switch (row.action.kind) {
      case "tour":
        // Both flags: `tourSeen` is what suppresses it forever, `pendingTour`
        // is the one-shot marker Today looks for (see aurora/home.tsx).
        setPref(TOUR_SEEN_KEY, null);
        AsyncStorage.setItem("hybrid.pendingTour", "1").catch(() => {});
        setTourArmed(true);
        return;
      case "mail":
        Linking.openURL(supportMailto()).catch(() => {});
        return;
      case "screen":
        router.push(NAV_HREF[row.action.screen] ?? "/settings");
        return;
      case "web":
        Linking.openURL(`${API_BASE}${row.action.path}`).catch(() => {});
        return;
    }
  };

  return (
    <AuroraScreen hero={{ rank: "title", title: t("help.title"), eyebrow: t("nav.group.account") }}>
      <Text style={{ marginTop: 12, fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("help.intro")}</Text>

      <View style={{ marginTop: 18, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, overflow: "hidden" }}>
        {HELP_ROWS.map((row, i) => (
          <Pressable
            key={row.id}
            onPress={() => act(row)}
            accessibilityRole="button"
            accessibilityLabel={t(row.titleKey)}
            style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16, paddingHorizontal: 18, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}
          >
            <View style={{ width: 32, height: 32, borderRadius: RADIUS.field, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
              <AuroraIcon name={row.icon} size={16} color={C.chalk} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{t(row.titleKey)}</Text>
              <Text style={{ marginTop: 3, fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>
                {row.id === "tour" && tourArmed ? t("help.tourDone") : row.id === "contact" ? SUPPORT_EMAIL : t(row.bodyKey)}
              </Text>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.ash }}>›</Text>
          </Pressable>
        ))}
      </View>
    </AuroraScreen>
  );
}
