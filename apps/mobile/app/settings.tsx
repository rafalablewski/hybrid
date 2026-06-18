import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { resetAccount } from "../lib/api";
import { clearGuestSessions } from "../lib/guest";
import { clearDraft } from "../lib/draft";
import { useSession } from "../lib/session";
import { useLang } from "../lib/i18n";
import type { Lang } from "@hybrid/core";
import { TEMPLATES, ACCOUNT_NOTIF_ROWS, ACCOUNT_PRIVACY_ROWS } from "@hybrid/core";
import { useTheme, txt, type ThemePref } from "../lib/theme";
import { useTemplate } from "../lib/template";
import { useAccountSettings } from "../lib/account";
import { Screen, Card, Kicker, Mono, F } from "../lib/ui";
import { ToggleRow } from "../components/toggle-row";
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
  const acct = useAccountSettings();
  const C = palette;
  const inputStyle = { fontFamily: F.mono, fontSize: 15, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 } as const;
  const btn = (color: string) => ({ borderWidth: 1, borderColor: color, backgroundColor: `${color}1a`, borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" as const, alignItems: "center" as const });
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
        {!!acct.email && <Mono color={C.chalk} style={{ marginTop: 10, fontSize: 12 }}>{acct.email}</Mono>}
      </Card>

      {/* Edit profile — name / email, on the user's own Supabase auth */}
      <Card style={{ marginTop: 16 }}>
        <Kicker color={C.lime}>Edit profile</Kicker>
        <Mono color={C.ash} style={{ marginTop: 12, marginBottom: 6, fontSize: 11 }}>Display name</Mono>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput value={acct.name} onChangeText={acct.setName} placeholder="Your name" placeholderTextColor={C.ash} style={{ ...inputStyle, flex: 1 }} />
          <Pressable onPress={acct.saveName} disabled={acct.busy} style={btn(C.lime)}><Text style={{ fontFamily: F.mono, fontSize: 13, color: txt(C, C.lime) }}>Save</Text></Pressable>
        </View>
        <Mono color={C.ash} style={{ marginTop: 14, marginBottom: 6, fontSize: 11 }}>Change email</Mono>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput value={acct.newEmail} onChangeText={acct.setNewEmail} placeholder={acct.email ?? "new@email.com"} placeholderTextColor={C.ash} autoCapitalize="none" keyboardType="email-address" style={{ ...inputStyle, flex: 1 }} />
          <Pressable onPress={acct.changeEmail} disabled={acct.busy || !acct.newEmail.trim()} style={btn(C.ash)}><Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>Update</Text></Pressable>
        </View>
        {!!acct.profileMsg && <Mono color={acct.profileMsg.startsWith("✓") ? C.lime : C.ash} style={{ marginTop: 10, fontSize: 12 }}>{acct.profileMsg}</Mono>}
        {!acct.authOn && <Mono color={C.ash} style={{ marginTop: 8, fontSize: 11 }}>Profile editing needs a real signed-in account.</Mono>}
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

      {/* Notifications */}
      <Card style={{ marginTop: 16 }}>
        <Kicker color={C.lime}>Notifications</Kicker>
        <Mono color={C.ash} style={{ marginTop: 6, fontSize: 11, lineHeight: 16 }}>What HYBRID may send you. Saved to your account &amp; synced across devices; honoured as each channel rolls out.</Mono>
        <View style={{ marginTop: 8 }}>
          {ACCOUNT_NOTIF_ROWS.map((row) => (
            <ToggleRow key={row.key} C={C} title={row.title} desc={row.desc} on={!!acct.notif[row.key]} onToggle={() => acct.toggleNotif(row.key)} disabled={!acct.authOn} />
          ))}
        </View>
        {!acct.authOn && <Mono color={C.ash} style={{ marginTop: 10, fontSize: 11 }}>Sign in with a real account to change these.</Mono>}
      </Card>

      {/* Privacy */}
      <Card style={{ marginTop: 16 }}>
        <Kicker color={C.lime}>Privacy</Kicker>
        <Mono color={C.ash} style={{ marginTop: 6, fontSize: 11, lineHeight: 16 }}>You control what you share. Saved to your account &amp; synced across devices.</Mono>
        <View style={{ marginTop: 8 }}>
          {ACCOUNT_PRIVACY_ROWS.map((row) => (
            <ToggleRow key={row.key} C={C} title={row.title} desc={row.desc} on={!!acct.priv[row.key]} onToggle={() => acct.togglePriv(row.key)} disabled={!acct.authOn} />
          ))}
        </View>
        {!acct.authOn && <Mono color={C.ash} style={{ marginTop: 10, fontSize: 11 }}>Sign in with a real account to change these.</Mono>}
      </Card>

      {/* Security — change password + sign out everywhere */}
      <Card style={{ marginTop: 16 }}>
        <Kicker color={C.blue}>Security</Kicker>
        {acct.provider && acct.provider !== "email" ? (
          <Mono color={C.chalk} style={{ marginTop: 10, fontSize: 12, lineHeight: 17 }}>You sign in with {acct.provider} — manage your password there.</Mono>
        ) : (
          <>
            <Mono color={C.ash} style={{ marginTop: 12, marginBottom: 6, fontSize: 11 }}>Change password</Mono>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput value={acct.newPw} onChangeText={acct.setNewPw} placeholder="New password" placeholderTextColor={C.ash} secureTextEntry autoCapitalize="none" style={{ ...inputStyle, flex: 1 }} />
              <Pressable onPress={acct.changePassword} disabled={acct.busy || acct.newPw.length < 8} style={btn(C.lime)}><Text style={{ fontFamily: F.mono, fontSize: 13, color: txt(C, C.lime) }}>Update</Text></Pressable>
            </View>
            {!!acct.passwordMsg && <Mono color={acct.passwordMsg.startsWith("✓") ? C.lime : C.ash} style={{ marginTop: 10, fontSize: 12 }}>{acct.passwordMsg}</Mono>}
          </>
        )}
        <Mono color={C.ash} style={{ marginTop: 16, fontSize: 11, lineHeight: 16 }}>Sign out of every device — revokes all other sessions and ends this one.</Mono>
        <Pressable onPress={acct.signOutEverywhere} style={{ ...btn(C.ash), alignSelf: "flex-start", marginTop: 10, paddingVertical: 10 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>Sign out everywhere</Text>
        </Pressable>
      </Card>

      {/* Data — export */}
      <Card style={{ marginTop: 16 }}>
        <Kicker color={C.blue}>Export my data</Kicker>
        <Mono color={C.chalk} style={{ marginTop: 8, fontSize: 12, lineHeight: 17 }}>Download everything tied to your account — sessions, signals, check-ins, plans, templates, events and more — as one JSON file.</Mono>
        <Pressable onPress={acct.exportData} disabled={acct.exportBusy} style={{ ...btn(C.lime), alignSelf: "flex-start", marginTop: 12, paddingVertical: 11 }}>
          {acct.exportBusy ? <ActivityIndicator color={txt(C, C.lime)} /> : <Text style={{ fontFamily: F.mono, fontSize: 13, color: txt(C, C.lime) }}>Download my data (JSON)</Text>}
        </Pressable>
        {!!acct.exportMsg && <Mono color={C.ash} style={{ marginTop: 10, fontSize: 12 }}>{acct.exportMsg}</Mono>}
      </Card>

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
