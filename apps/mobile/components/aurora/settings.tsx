import { useState, type ReactNode } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, LayoutAnimation, Platform, UIManager } from "react-native";
import { useRouter } from "expo-router";
import { type Lang, ACCOUNT_NOTIF_ROWS, ACCOUNT_PRIVACY_ROWS, SETTINGS_GROUPS, type SettingsCategoryId } from "@hybrid/core";
import { resetAccount } from "../../lib/api";
import { clearGuestSessions } from "../../lib/guest";
import { clearDraft } from "../../lib/draft";
import { useSession } from "../../lib/session";
import { useAccountSettings } from "../../lib/account";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type ThemePref } from "../../lib/theme";
import { useLiquidGlass } from "../../lib/liquid-glass";
import { fs, space, F } from "../../lib/ui";
import { ToggleRow } from "../toggle-row";
import { AuroraScreen, ACard, AField, ASegment, APill, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";
import type { AuroraIconName } from "@hybrid/core";

// Enable smooth expand/collapse on Android (on by default on iOS).
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

/** Per-category accent — the icon-tile tint, matching the V1 mockup. */
const TONE: Record<SettingsCategoryId, "lime" | "blue" | "violet" | "amber" | "red" | "ash"> = {
  account: "lime", social: "lime", preferences: "blue", logger: "amber", notifications: "violet",
  privacy: "blue", coaching: "violet", security: "blue", subscription: "lime",
  data: "ash", danger: "red",
};

/**
 * AURORA settings — an Instagram-style grouped HUB. A profile header, then the
 * shared SETTINGS_GROUPS rendered as labelled glass lists; each row either
 * expands inline to its controls (accordion) or navigates to a dedicated screen
 * (logger / coaching / subscription). Keeps every existing control + the shared
 * account logic (useAccountSettings) so web ↔ mobile stay in lockstep.
 */
export default function AuroraSettings() {
  const { palette: C } = useTheme();
  const router = useRouter();
  const { t, lang, setLang } = useLang();
  const { signOut, name, role, entitlement } = useSession();
  const { pref, setPref } = useTheme();
  const lg = useLiquidGlass();
  const acct = useAccountSettings();
  const [open, setOpen] = useState<SettingsCategoryId | null>("account");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const armed = confirm.trim().toUpperCase() === "RESET";

  const toggle = (id: SettingsCategoryId) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(180, "easeInEaseOut", "opacity"));
    setOpen((cur) => (cur === id ? null : id));
  };

  const reset = async () => {
    if (!armed) return;
    setBusy(true);
    setError("");
    const ok = await resetAccount();
    if (!ok) { setError(t("settings.resetError")); setBusy(false); return; }
    await Promise.all([clearGuestSessions(), clearDraft()]);
    setBusy(false);
    router.replace("/(tabs)");
  };

  const tone = (c: string) => ({ tile: `${c}24`, fg: txt(C, c) });
  const toneColor: Record<string, string> = { lime: C.lime, blue: C.blue, violet: C.violet, amber: C.amber, red: C.red, ash: C.ash };

  // The expandable body for each category, generated lazily so only the OPEN
  // category's JSX is built (not all of them on every keystroke). Rows not
  // listed here navigate instead of expanding.
  const renderBody = (id: SettingsCategoryId): ReactNode => {
    switch (id) {
      case "account":
        return (
      <>
        <Label color={C.lime}>PROFILE</Label>
        <AField value={acct.name} onChange={acct.setName} placeholder={t("w.account.settings.your-name-ph")} icon="user" />
        <AField value={acct.newEmail} onChange={acct.setNewEmail} placeholder={acct.email ?? "new@email.com"} keyboard="email-address" icon="mail" />
        {!!acct.profileMsg && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: acct.profileMsg.startsWith("✓") ? txt(C, C.lime) : C.ash, marginBottom: 10 }}>{acct.profileMsg}</Text>}
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <APill label={t("w.account.settings.save-name")} variant="soft" disabled={acct.busy} onPress={acct.saveName} style={{ flex: 1, paddingVertical: 13 }} />
          <APill label={t("w.account.settings.update-email")} variant="soft" disabled={acct.busy || !acct.newEmail.trim()} onPress={acct.changeEmail} style={{ flex: 1, paddingVertical: 13 }} />
        </View>
        {!acct.authOn && <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 10 }}>{t("w.account.settings.profile-needs-account")}</Text>}
      </>
        );
      case "preferences":
        return (
      <>
        <Label color={C.blue}>APPEARANCE</Label>
        <ASegment options={APPEARANCE} value={pref} onPick={setPref} />
        <Label color={C.blue} top>LANGUAGE</Label>
        <ASegment options={LANGUAGES} value={lang} onPick={setLang} />
        {lg.supported && (
          <View style={{ marginTop: 6 }}>
            <ToggleRow C={C} title={t("w.account.settings.liquid-glass")} desc={t("w.account.settings.liquid-glass-help")} on={lg.enabled} onToggle={() => lg.setEnabled(!lg.enabled)} />
          </View>
        )}
      </>
        );
      case "notifications":
        return (
      <>
        <Text style={{ fontFamily: F.reg, fontSize: fs.micro, color: C.ash, lineHeight: 16, marginBottom: 2 }}>{t("w.account.settings.notifications-desc")}</Text>
        {ACCOUNT_NOTIF_ROWS.map((row) => (
          <ToggleRow key={row.key} C={C} title={t(`w.account.settings.notif-${row.key}-t`)} desc={t(`w.account.settings.notif-${row.key}-d`)} on={!!acct.notif[row.key]} onToggle={() => acct.toggleNotif(row.key)} disabled={!acct.authOn} />
        ))}
      </>
        );
      case "privacy":
        return (
      <>
        <Text style={{ fontFamily: F.reg, fontSize: fs.micro, color: C.ash, lineHeight: 16, marginBottom: 2 }}>{t("w.account.settings.privacy-desc")}</Text>
        {ACCOUNT_PRIVACY_ROWS.map((row) => (
          <ToggleRow key={row.key} C={C} title={t(`w.account.settings.priv-${row.key}-t`)} desc={t(`w.account.settings.priv-${row.key}-d`)} on={!!acct.priv[row.key]} onToggle={() => acct.togglePriv(row.key)} disabled={!acct.authOn} />
        ))}
      </>
        );
      case "security":
        return (
      <>
        <Label color={C.blue}>PASSWORD</Label>
        {acct.provider && acct.provider !== "email" ? (
          <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: 17 }}>{t("w.account.settings.signin-with")} {acct.provider} {t("w.account.settings.manage-password-there")}</Text>
        ) : (
          <>
            <AField value={acct.newPw} onChange={acct.setNewPw} placeholder={t("w.account.settings.new-password-ph")} secure icon="lock" />
            <APill label={t("w.account.settings.update-password")} variant="soft" disabled={acct.busy || acct.newPw.length < 8} onPress={acct.changePassword} style={{ paddingVertical: 13 }} />
            {!!acct.passwordMsg && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: acct.passwordMsg.startsWith("✓") ? txt(C, C.lime) : C.ash, marginTop: 8 }}>{acct.passwordMsg}</Text>}
          </>
        )}
        <Label color={C.blue} top>ACTIVE SESSIONS</Label>
        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, lineHeight: 16, marginBottom: 10 }}>{t("w.account.settings.active-sessions-desc")}</Text>
        <APill label={t("w.account.settings.sign-out-everywhere")} variant="soft" onPress={acct.signOutEverywhere} style={{ paddingVertical: 13 }} />
      </>
        );
      case "data":
        return (
      <>
        <Label color={C.blue}>EXPORT</Label>
        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, lineHeight: 16, marginBottom: 10 }}>{t("w.account.settings.export-data-desc")}</Text>
        {acct.exportBusy ? <ActivityIndicator color={txt(C, C.lime)} /> : <APill label={t("w.account.settings.download-data")} variant="soft" onPress={acct.exportData} style={{ paddingVertical: 13 }} />}
        {!!acct.exportMsg && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 8 }}>{acct.exportMsg}</Text>}
      </>
        );
      case "danger":
        return (
      <>
        <APill label={t("common.signout")} variant="soft" onPress={() => void signOut()} style={{ paddingVertical: 13 }} />
        <View style={{ borderLeftWidth: 3, borderLeftColor: C.red, paddingLeft: 14, marginTop: 16 }}>
          <Label color={C.red}>{t("settings.resetTitle").toUpperCase()}</Label>
          <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: 6, lineHeight: 17 }}>{t("settings.resetBody")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 12 }}>{t("settings.typeReset")}</Text>
          <TextInput
            value={confirm} onChangeText={setConfirm} placeholder="RESET" placeholderTextColor={C.ash}
            autoCapitalize="characters" autoCorrect={false}
            style={{ fontFamily: F.mono, fontSize: fs.note, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: armed ? C.red : C.line, borderRadius: RADIUS.field, paddingHorizontal: 14, paddingVertical: 13, marginTop: 8 }}
          />
          {!!error && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.red), marginTop: 10 }}>{error}</Text>}
          <Pressable onPress={reset} disabled={!armed || busy} style={{ backgroundColor: armed && !busy ? C.red : `${C.red}55`, borderRadius: RADIUS.pill, paddingVertical: 14, alignItems: "center", marginTop: 12 }}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: "#fff" }}>{t("settings.eraseEverything")}</Text>}
          </Pressable>
        </View>
      </>
        );
      default:
        return null;
    }
  };

  // Rows that navigate to a dedicated screen instead of expanding.
  const ROUTES: Partial<Record<SettingsCategoryId, string>> = {
    social: "/profile-edit",
    logger: "/logger-settings",
    coaching: "/coach-apply",
    subscription: "/upgrade",
  };

  return (
    <AuroraScreen>
      {/* Profile header */}
      <View style={{ alignItems: "center", marginTop: 4 }}>
        <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="user" size={38} color={txt(C, C.lime)} />
        </View>
        <AHeading style={{ fontSize: fs.heading, marginTop: 14 }}>{name}</AHeading>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: 8 }}>
          <Tag label={role.toUpperCase()} color={C.violet} />
          <Tag label={entitlement === "paid" ? "FULL · PAID" : "FREE"} color={entitlement === "paid" ? C.lime : C.ash} />
        </View>
        {!!acct.email && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 8 }}>{acct.email}</Text>}
      </View>

      {/* Grouped hub */}
      {SETTINGS_GROUPS.map((group) => (
        <View key={group.id} style={{ marginTop: 22 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginBottom: 10, marginLeft: 4 }}>{group.label}</Text>
          <ACard style={{ padding: 0, overflow: "hidden" }}>
            {group.categories.map((cat, i) => {
              const accent = toneColor[TONE[cat.id]];
              const { tile, fg } = tone(accent);
              const isOpen = open === cat.id;
              const navTo = ROUTES[cat.id];
              return (
                <View key={cat.id} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
                  <Pressable
                    onPress={() => (navTo ? (router.push as (p: string) => void)(navTo) : toggle(cat.id))}
                    style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: 16, paddingVertical: 15 }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: tile, alignItems: "center", justifyContent: "center" }}>
                      <AuroraIcon name={cat.icon} size={19} color={fg} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: cat.danger ? (txt(C, C.red) as string) : C.chalk }}>{cat.title}</Text>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2, lineHeight: 15 }}>{cat.subtitle}</Text>
                    </View>
                    <AuroraIcon
                      name="chevron-down"
                      size={18}
                      color={C.ash}
                      style={{ transform: [{ rotate: navTo ? "-90deg" : isOpen ? "0deg" : "-90deg" }] }}
                    />
                  </Pressable>
                  {isOpen && !navTo && (
                    <View style={{ paddingHorizontal: 16, paddingBottom: 18, paddingTop: 2, borderTopWidth: 1, borderTopColor: `${C.line}99` }}>
                      {renderBody(cat.id)}
                    </View>
                  )}
                </View>
              );
            })}
          </ACard>
        </View>
      ))}
    </AuroraScreen>
  );
}

function Label({ children, color, top }: { children: ReactNode; color: string; top?: boolean }) {
  return (
    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color, marginTop: top ? 18 : 14, marginBottom: 10 }}>
      {children}
    </Text>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ borderWidth: 1, borderColor: `${color}66`, backgroundColor: `${color}1a`, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, color), letterSpacing: 0.5 }}>{label}</Text>
    </View>
  );
}
