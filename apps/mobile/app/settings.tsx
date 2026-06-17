import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { resetAccount } from "../lib/api";
import { clearGuestSessions } from "../lib/guest";
import { clearDraft } from "../lib/draft";
import { useSession } from "../lib/session";
import { useLang } from "../lib/i18n";
import type { Lang } from "@hybrid/core";
import { useTheme, txt, type ThemePref } from "../lib/theme";
import { useTemplate } from "../lib/template";
import { TEMPLATES } from "@hybrid/core";
import { Screen, Card, Kicker, Mono, F } from "../lib/ui";
import AuroraSettings from "../components/aurora/settings";

const APPEARANCE: { id: ThemePref; label: string }[] = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

const LANGUAGES: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "pl", label: "Polski" },
  { id: "de", label: "Deutsch" },
];

export default function Settings() {
  if (useTemplate().template === "aurora") return <AuroraSettings />;
  return <ClassicSettings />;
}

function ClassicSettings() {
  const router = useRouter();
  const { t, lang, setLang } = useLang();
  const { signOut, name, role, entitlement } = useSession();
  const { palette, pref, setPref } = useTheme();
  const { template, setTemplate } = useTemplate();
  const C = palette;
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const armed = confirm.trim().toUpperCase() === "RESET";

  const reset = async () => {
    if (!armed) return;
    setBusy(true);
    setError("");
    const ok = await resetAccount();
    if (!ok) {
      setError(t("settings.resetError"));
      setBusy(false);
      return;
    }
    // Clear on-device caches too, then drop into the now-empty account.
    await Promise.all([clearGuestSessions(), clearDraft()]);
    setBusy(false);
    router.replace("/(tabs)");
  };

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={10}>
        <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>← {t("common.back")}</Text>
      </Pressable>
      <Text style={{ fontFamily: F.black, fontSize: 26, color: C.chalk, marginTop: 10 }}>{t("settings.title")}</Text>

      {/* Account identity */}
      <Card style={{ marginTop: 16 }}>
        <Kicker color={C.blue}>Account</Kicker>
        <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.chalk, marginTop: 8 }}>{name}</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <View style={{ borderWidth: 1, borderColor: `${C.violet}55`, backgroundColor: `${C.violet}1a`, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.violet, letterSpacing: 0.5 }}>{role.toUpperCase()}</Text>
          </View>
          <View style={{ borderWidth: 1, borderColor: entitlement === "paid" ? C.lime : C.line, backgroundColor: entitlement === "paid" ? `${C.lime}1a` : "transparent", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 10, color: entitlement === "paid" ? C.lime : C.ash, letterSpacing: 0.5 }}>{entitlement === "paid" ? "FULL · PAID" : "FREE"}</Text>
          </View>
        </View>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Kicker>Appearance</Kicker>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          {APPEARANCE.map((opt) => {
            const on = pref === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setPref(opt.id)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 11,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: on ? C.lime : C.line,
                  backgroundColor: on ? C.lime : "transparent",
                }}
              >
                <Text style={{ fontFamily: F.bold, fontSize: 13, color: on ? C.onAccent : C.ash }}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Kicker>Template</Kicker>
        <Mono style={{ marginTop: 4, fontSize: 11 }}>Switch the whole app between the classic look and the new rounded design.</Mono>
        <View style={{ gap: 8, marginTop: 12 }}>
          {TEMPLATES.map((opt) => {
            const on = template === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setTemplate(opt.id)}
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: on ? C.lime : C.line,
                  backgroundColor: on ? `${C.lime}14` : "transparent",
                  padding: 14,
                }}
              >
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: on ? txt(C, C.lime) : C.chalk }}>{opt.label}</Text>
                <Mono style={{ marginTop: 3, fontSize: 11, lineHeight: 16 }}>{opt.description}</Mono>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Kicker>Language</Kicker>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          {LANGUAGES.map((opt) => {
            const on = lang === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setLang(opt.id)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 11,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: on ? C.lime : C.line,
                  backgroundColor: on ? C.lime : "transparent",
                }}
              >
                <Text style={{ fontFamily: F.bold, fontSize: 13, color: on ? C.onAccent : C.ash }}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Pressable onPress={() => router.push("/logger-settings")}>
        <Card style={{ marginTop: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Kicker>{t("loggerPrefs.title")}</Kicker>
            <Mono style={{ marginTop: 4, fontSize: 11 }}>{t("loggerPrefs.intro")}</Mono>
          </View>
          <Text style={{ fontFamily: F.black, fontSize: 18, color: C.ash, marginLeft: 10 }}>→</Text>
        </Card>
      </Pressable>

      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.red, marginTop: 16 }}>
        <Kicker color={C.red}>{t("settings.dangerZone")}</Kicker>
        <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.chalk, marginTop: 8 }}>{t("settings.resetTitle")}</Text>
        <Mono color={C.chalk} style={{ marginTop: 6, lineHeight: 19 }}>{t("settings.resetBody")}</Mono>

        <Mono color={C.ash} style={{ marginTop: 16, marginBottom: 6 }}>{t("settings.typeReset")}</Mono>
        <TextInput
          value={confirm}
          onChangeText={setConfirm}
          placeholder="RESET"
          placeholderTextColor={C.ash}
          autoCapitalize="characters"
          autoCorrect={false}
          style={{ fontFamily: F.mono, fontSize: 16, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: armed ? C.red : C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 }}
        />

        {!!error && <Mono color={C.red} style={{ marginTop: 10 }}>{error}</Mono>}

        <Pressable
          onPress={reset}
          disabled={!armed || busy}
          style={{ backgroundColor: armed && !busy ? C.red : `${C.red}55`, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 16 }}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ fontFamily: F.black, fontSize: 15, color: "#fff" }}>{t("settings.eraseEverything")}</Text>}
        </Pressable>
      </Card>

      <Pressable onPress={() => void signOut()} style={{ alignItems: "center", paddingVertical: 18 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>{t("common.signout")}</Text>
      </Pressable>
    </Screen>
  );
}
