import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  useFonts,
  Archivo_900Black,
  Archivo_400Regular,
} from "@expo-google-fonts/archivo";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import { brand, colors, CORE_VERSION } from "@hybrid/core";

export default function Home() {
  const [fontsLoaded] = useFonts({
    Archivo_900Black,
    Archivo_400Regular,
    JetBrainsMono_400Regular,
  });

  if (!fontsLoaded) {
    return <View style={styles.screen} />;
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.center}>
        <Text style={styles.kicker}>{brand.web}</Text>

        <Text style={styles.wordmark}>
          {brand.name}
          <Text style={styles.dot}>.</Text>
        </Text>

        <Text style={styles.tagline}>{brand.tagline}</Text>

        <View style={styles.pill}>
          <View style={styles.dotMark} />
          <Text style={styles.pillText}>
            mobile client · @hybrid/core {CORE_VERSION}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  kicker: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 12,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: colors.lime,
  },
  wordmark: {
    fontFamily: "Archivo_900Black",
    fontSize: 64,
    color: colors.chalk,
    marginTop: 12,
    letterSpacing: -2,
  },
  dot: { color: colors.lime },
  tagline: {
    fontFamily: "Archivo_400Regular",
    fontSize: 15,
    color: colors.ash,
    marginTop: 12,
    textAlign: "center",
    maxWidth: 320,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 40,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.ink2,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  dotMark: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.lime,
  },
  pillText: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 12,
    color: colors.ash,
  },
});
