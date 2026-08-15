import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../lib/theme";
import { AuroraScreen, AuroraMark, APill, AHeading, ASub } from "./kit";
import { Text } from "react-native";
import { fs, F } from "../../lib/ui";
import { useLang } from "../../lib/i18n";

/** AURORA welcome — the soft, centered entry from the Figma kit. */
export default function AuroraWelcome() {
  const { palette } = useTheme();
  const router = useRouter();
  const { t } = useLang();
  return (
    <AuroraScreen scroll={false} center>
      <View style={{ alignItems: "center", marginBottom: 40 }}>
        <AuroraMark size={72} />
        <AHeading rank="cover" style={{ marginTop: 28, textAlign: "center" }}>
          {t("welcome.aurora.headline")}
        </AHeading>
        <ASub style={{ marginTop: 12, textAlign: "center" }}>
          {t("welcome.aurora.sub")}
        </ASub>
      </View>

      <APill label={t("welcome.aurora.login")} variant="soft" onPress={() => router.push("/login")} />
      <APill label={t("welcome.aurora.register")} variant="light" onPress={() => router.push("/login?mode=signup")} style={{ marginTop: 16 }} />

      <Text
        onPress={() => router.push("/workout?source=empty")}
        style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: palette.chalk, textAlign: "center", marginTop: 28, textDecorationLine: "underline" }}
      >
        {t("welcome.aurora.guest")}
      </Text>
    </AuroraScreen>
  );
}
