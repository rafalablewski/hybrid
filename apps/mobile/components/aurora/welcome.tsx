import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme, txt } from "../../lib/theme";
import { AuroraScreen, AuroraMark, APill, AHeading, ASub } from "./kit";
import { Text } from "react-native";
import { F } from "../../lib/ui";

/** AURORA welcome — the soft, centered entry from the Figma kit. */
export default function AuroraWelcome() {
  const { palette } = useTheme();
  const router = useRouter();
  return (
    <AuroraScreen scroll={false} center>
      <View style={{ alignItems: "center", marginBottom: 40 }}>
        <AuroraMark size={72} />
        <AHeading style={{ marginTop: 28, textAlign: "center", fontSize: 32 }}>
          Start your{"\n"}
          <Text style={{ color: txt(palette, palette.lime) }}>Fitness</Text> Journey
        </AHeading>
        <ASub style={{ marginTop: 12, textAlign: "center" }}>
          Strength and conditioning for hybrid athletes — programmed from your real training.
        </ASub>
      </View>

      <APill label="Login" variant="soft" onPress={() => router.push("/login")} />
      <APill label="Register" variant="light" onPress={() => router.push("/login?mode=signup")} style={{ marginTop: 14 }} />

      <Text
        onPress={() => router.push("/workout?source=empty")}
        style={{ fontFamily: F.bold, fontSize: 14, color: palette.chalk, textAlign: "center", marginTop: 28, textDecorationLine: "underline" }}
      >
        Continue as a guest
      </Text>
    </AuroraScreen>
  );
}
