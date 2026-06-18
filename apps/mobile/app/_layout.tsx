import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  Archivo_400Regular,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_900Black,
} from "@expo-google-fonts/archivo";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import { SessionProvider } from "../lib/session";
import { LanguageProvider } from "../lib/i18n";
import { TemplateProvider } from "../lib/template";
import { ThemeProvider, useTheme } from "../lib/theme";
import { C } from "../lib/ui";
import AuroraGlobalNav from "../components/aurora/global-nav";

// Inner shell so it can read the theme (the provider sits above it): drives the
// status-bar style + the navigator background so the whole app follows
// light/dark (system by default, overridable in Settings). In Aurora it also
// renders the global floating pill nav over every screen (self-gating).
function Shell() {
  const { scheme, palette } = useTheme();
  return (
    <>
      <StatusBar style={scheme === "light" ? "dark" : "light"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.ink } }} />
      <AuroraGlobalNav />
    </>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Archivo_400Regular,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_900Black,
    JetBrainsMono_400Regular,
  });

  if (!loaded) return <View style={{ flex: 1, backgroundColor: C.ink }} />;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <TemplateProvider>
          <SessionProvider>
            <LanguageProvider>
              <Shell />
            </LanguageProvider>
          </SessionProvider>
        </TemplateProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
