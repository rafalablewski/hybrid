import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { brand } from "@hybrid/core";
import { useLang } from "../lib/i18n";
import { fs, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraWelcome from "../components/aurora/welcome";

export default function Welcome() {
  if (useTemplate().template === "aurora") return <AuroraWelcome />;
  return <ClassicWelcome />;
}

function ClassicWelcome() {
  const C = useTheme().palette;
  const router = useRouter();
  const { t } = useLang();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.ink, padding: 28 }}>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Text style={{ fontFamily: F.black, fontSize: 52, color: C.chalk, letterSpacing: -2 }}>
          {brand.name}
          <Text style={{ color: txt(C, C.lime) }}>.</Text>
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime), letterSpacing: 3, marginTop: 8 }}>
          {t("welcome.tagline")}
        </Text>

        <Text style={{ fontFamily: F.black, fontSize: 30, color: C.chalk, marginTop: 40, lineHeight: 36 }}>
          {t("welcome.hook")}
        </Text>
        <Text style={{ fontFamily: F.reg, fontSize: fs.note, color: C.ash, marginTop: 14, lineHeight: 22 }}>
          {t("welcome.sub")}
        </Text>
      </View>

      <Pressable
        onPress={() => router.push("/workout?source=empty")}
        style={{ backgroundColor: C.lime, borderRadius: 18, paddingVertical: 22, alignItems: "center" }}
      >
        <Text style={{ fontFamily: F.black, fontSize: 19, color: C.ink }}>▶  {t("welcome.start")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ink, opacity: 0.7, marginTop: 4 }}>{t("welcome.startSub")}</Text>
      </Pressable>

      <Pressable onPress={() => router.push("/login")} style={{ alignItems: "center", paddingVertical: 20 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>
          {t("welcome.haveAccount")} <Text style={{ color: txt(C, C.lime) }}>{t("welcome.signIn")}</Text>
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}
