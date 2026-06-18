import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { TEMPLATES, type Lang } from "@hybrid/core";
import { resetAccount } from "../../lib/api";
import { clearGuestSessions } from "../../lib/guest";
import { clearDraft } from "../../lib/draft";
import { useSession } from "../../lib/session";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type ThemePref } from "../../lib/theme";
import { useTemplate } from "../../lib/template";
import { F } from "../../lib/ui";
import { AuroraScreen, ACard, ASegment, APill, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";
import type { AuroraIconName } from "@hybrid/core";

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

/** AURORA settings — avatar header + grouped rounded list, matching the Figma
 *  kit. Keeps every classic control (appearance/template/language/logger/reset). */
export default function AuroraSettings() {
  const { palette: C } = useTheme();
  const router = useRouter();
  const { t, lang, setLang } = useLang();
  const { signOut, name, role, entitlement } = useSession();
  const { pref, setPref } = useTheme();
  const { template, setTemplate } = useTemplate();
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
    await Promise.all([clearGuestSessions(), clearDraft()]);
    setBusy(false);
    router.replace("/(tabs)");
  };

  return (
    <AuroraScreen>
      {/* Profile header */}
      <View style={{ alignItems: "center", marginTop: 4 }}>
        <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="user" size={40} color={txt(C, C.lime)} />
        </View>
        <AHeading style={{ fontSize: 20, marginTop: 14 }}>{name}</AHeading>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Tag label={role.toUpperCase()} color={C.violet} />
          <Tag label={entitlement === "paid" ? "FULL · PAID" : "FREE"} color={entitlement === "paid" ? C.lime : C.ash} />
        </View>
      </View>

      <Section title="Preferences">
        <Field icon="settings" label="Appearance">
          <ASegment options={APPEARANCE} value={pref} onPick={setPref} />
        </Field>
        <Field icon="bell" label="Template">
          <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.ash, marginTop: -4, marginBottom: 10, lineHeight: 16 }}>
            Switch the whole app between the classic look and the new rounded design.
          </Text>
          <ASegment options={TEMPLATES.map((tp) => ({ id: tp.id, label: tp.label }))} value={template} onPick={setTemplate} />
          <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.ash, marginTop: 10, lineHeight: 16 }}>
            {TEMPLATES.find((tp) => tp.id === template)?.description}
          </Text>
        </Field>
        <Field icon="share" label="Language">
          <ASegment options={LANGUAGES} value={lang} onPick={setLang} />
        </Field>
      </Section>

      <Section title="Workout">
        <ListItem icon="play" label={t("loggerPrefs.title")} sub={t("loggerPrefs.intro")} onPress={() => router.push("/logger-settings")} />
      </Section>

      {/* Danger zone */}
      <ACard style={{ marginTop: 16, borderColor: `${C.red}55` }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <AuroraIcon name="logout" size={20} color={txt(C, C.red)} />
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: txt(C, C.red) }}>{t("settings.resetTitle")}</Text>
        </View>
        <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.ash, marginTop: 8, lineHeight: 17 }}>{t("settings.resetBody")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginTop: 14 }}>{t("settings.typeReset")}</Text>
        <TextInput
          value={confirm}
          onChangeText={setConfirm}
          placeholder="RESET"
          placeholderTextColor={C.ash}
          autoCapitalize="characters"
          autoCorrect={false}
          style={{ fontFamily: F.mono, fontSize: 15, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: armed ? C.red : C.line, borderRadius: RADIUS.field, paddingHorizontal: 14, paddingVertical: 13, marginTop: 12 }}
        />
        {!!error && <Text style={{ fontFamily: F.mono, fontSize: 12, color: txt(C, C.red), marginTop: 10 }}>{error}</Text>}
        <Pressable onPress={reset} disabled={!armed || busy} style={{ backgroundColor: armed && !busy ? C.red : `${C.red}55`, borderRadius: RADIUS.pill, paddingVertical: 15, alignItems: "center", marginTop: 14 }}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ fontFamily: F.bold, fontSize: 15, color: "#fff" }}>{t("settings.eraseEverything")}</Text>}
        </Pressable>
      </ACard>

      <APill label={t("common.signout")} variant="soft" onPress={() => void signOut()} style={{ marginTop: 16 }} />
    </AuroraScreen>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ borderWidth: 1, borderColor: `${color}66`, backgroundColor: `${color}1a`, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 10, color: txt(C, color), letterSpacing: 0.5 }}>{label}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ marginTop: 22 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginBottom: 10 }}>{title}</Text>
      {children}
    </View>
  );
}

function Field({ icon, label, children }: { icon: AuroraIconName; label: string; children: React.ReactNode }) {
  const { palette: C } = useTheme();
  return (
    <ACard style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <AuroraIcon name={icon} size={20} color={C.ash} />
        <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.chalk }}>{label}</Text>
      </View>
      {children}
    </ACard>
  );
}

function ListItem({ icon, label, sub, onPress }: { icon: AuroraIconName; label: string; sub?: string; onPress: () => void }) {
  const { palette: C } = useTheme();
  return (
    <Pressable onPress={onPress}>
      <ACard style={{ marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <AuroraIcon name={icon} size={20} color={C.ash} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.chalk }}>{label}</Text>
          {!!sub && <Text style={{ fontFamily: F.reg, fontSize: 11, color: C.ash, marginTop: 2, lineHeight: 15 }}>{sub}</Text>}
        </View>
        <AuroraIcon name="chevron-down" size={18} color={C.ash} style={{ transform: [{ rotate: "-90deg" }] }} />
      </ACard>
    </Pressable>
  );
}
