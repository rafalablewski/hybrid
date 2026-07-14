import { View, Text, Pressable, Linking } from "react-native";
import { API_BASE } from "../lib/api";
import { useLang } from "../lib/i18n";
import { useTheme, txt } from "../lib/theme";
import { fs, F } from "../lib/ui";

/** Open the public Privacy Policy / Terms pages (hosted on the web app). Shown
 *  on the login screen, the paywall (App Store requires Terms + Privacy links on
 *  auto-renewable subscription screens) and in Settings. */
export function LegalLinks({ align = "center", agree = false }: { align?: "center" | "left"; agree?: boolean }) {
  const { t } = useLang();
  const { palette: C } = useTheme();
  const open = (path: string) => Linking.openURL(`${API_BASE}${path}`).catch(() => {});
  const link = (label: string, path: string) => (
    <Pressable onPress={() => open(path)} accessibilityRole="link" accessibilityLabel={label} hitSlop={8}>
      <Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: txt(C, C.lime), textDecorationLine: "underline" }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center", justifyContent: align === "center" ? "center" : "flex-start" }}>
      {agree && <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash }}>{t("legal.agree")}</Text>}
      {link(t("legal.privacy"), "/privacy")}
      <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash }}>{t("legal.and")}</Text>
      {link(t("legal.terms"), "/terms")}
    </View>
  );
}
