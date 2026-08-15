import { useState, useCallback, type ReactNode } from "react";
import { View, Text, TextInput, ActivityIndicator, AccessibilityInfo, Share, Image } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { type Lang, ACCOUNT_NOTIF_ROWS, ACCOUNT_PRIVACY_ROWS, SETTINGS_GROUPS, SETTINGS_CATEGORIES, matchSettings, passwordStrength, profileCompleteness, type SettingsCategory, type SettingsCategoryId } from "@hybrid/core";
import { resetAccount, deleteAccount } from "../../lib/api";
import { iapAvailable, manageSubscriptions } from "../../lib/iap";
import { clearGuestSessions } from "../../lib/guest";
import { clearDraft } from "../../lib/draft";
import { useSession } from "../../lib/session";
import { useClientPersonaChoice, setClientPersona } from "../../lib/persona";
import { useAccountSettings } from "../../lib/account";
import { getMyProfile } from "../../lib/social-api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { leading, tracking, fs, space, F, PressScale, Chip, FIXED_FONT_SCALE } from "../../lib/ui";
import { ToggleRow } from "../toggle-row";
import { AuroraScreen, ACard, AField, ASegment, APill, AHeading, RADIUS, ASearch } from "./kit";
import MfaSettings from "./mfa-settings";
import { AuroraIcon } from "./icons";
import { MetaLine } from "./meta";
import { LegalLinks } from "../legal-links";
import { LinearGradient } from "expo-linear-gradient";
import { useListMotion } from "../../lib/list-motion";

const LANGUAGES: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "pl", label: "Polski" },
  { id: "de", label: "Deutsch" },
];

/** Per-category icon-tile tint. Unified to a single neutral (ash) so the list
 *  reads as one system instead of a rainbow — the hue no longer encodes
 *  anything. Red is kept ONLY for the destructive `danger` section, where it is
 *  a real semantic warning. Mirrors web's TONE for parity. */
const TONE: Record<SettingsCategoryId, "lime" | "blue" | "violet" | "amber" | "red" | "ash"> = {
  account: "ash", preferences: "ash", logger: "ash", notifications: "ash",
  privacy: "ash", coaching: "ash", security: "ash", subscription: "ash",
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
  // Survivors of a filter MOVE to their new positions; only arrivals fade.
  const refilter = useListMotion();
  const { palette: C } = useTheme();
  const router = useRouter();
  const { t, lang, setLang } = useLang();
  const { signOut, name, role, entitlement } = useSession();
  const acct = useAccountSettings();
  // Mode toggle — Full (athlete) is a paid upgrade; a CLIENT chooses casual vs
  // athlete, mirroring web's useClientPersonaChoice()/setClientPersona().
  const paid = entitlement === "paid";
  // No stored choice = the resolvePersona default: Full for a paid account
  // (paying shouldn't require flipping a toggle), Simple for a free one.
  const personaChoice = useClientPersonaChoice() ?? (paid ? "athlete" : "casual");
  const isClient = role === "client";
  // Drill-in navigation: null = the category list; a category id = its sub-page.
  const [cat, setCat] = useState<SettingsCategoryId | null>(null);
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const armed = confirm.trim().toUpperCase() === "RESET";
  const [delConfirm, setDelConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState("");
  const armedDelete = delConfirm.trim().toUpperCase() === "DELETE";
  // Public profile — loaded for the header completeness ring + Share action.
  // Re-fetched on every screen focus so returning from Edit profile (this screen
  // stays mounted in the stack) reflects the latest handle/bio/photo.
  const [profile, setProfile] = useState<any>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    getMyProfile().then((d: any) => { if (active && d?.profile) setProfile(d.profile); }).catch(() => {});
    return () => { active = false; };
  }, []));
  const completeness = profileCompleteness({ name, handle: profile?.handle, displayName: profile?.displayName, bio: profile?.bio, avatarUrl: profile?.avatarUrl });
  const nudge = completeness.complete
    ? `${t("w.account.settings.cmpl-done")} ✓`
    : `${t("w.account.settings.cmpl-add")} ${completeness.missing.slice(0, 2).map((m) => t(`w.account.settings.cmpl-${m}`)).join(" & ")}`;
  const openEditProfile = () => (router.push as (p: string) => void)("/profile-edit");
  const shareProfile = async () => { if (profile?.handle) { try { await Share.share({ message: `Follow @${profile.handle} on HYBRID` }); } catch { /* dismissed */ } } };

  const reset = async () => {
    if (!armed) return;
    setBusy(true);
    setError("");
    const ok = await resetAccount();
    if (!ok) { setError(t("settings.resetError")); AccessibilityInfo.announceForAccessibility(t("settings.resetError")); setBusy(false); return; }
    await Promise.all([clearGuestSessions(), clearDraft()]);
    setBusy(false);
    router.replace("/(tabs)");
  };

  const del = async () => {
    if (!armedDelete) return;
    setDeleting(true);
    setDelError("");
    const ok = await deleteAccount();
    if (!ok) { setDelError(t("settings.deleteError")); AccessibilityInfo.announceForAccessibility(t("settings.deleteError")); setDeleting(false); return; }
    // Account (incl. login) is gone — clear local state and sign out to the login screen.
    await Promise.all([clearGuestSessions(), clearDraft()]);
    await signOut();
    setDeleting(false);
  };

  const tone = (c: string) => ({ tile: `${c}24`, fg: txt(C, c) });
  const toneColor: Record<string, string> = { lime: C.lime, blue: C.blue, violet: C.violet, amber: C.amber, red: C.red, ash: C.ash };

  // The expandable body for each category, generated lazily so only the OPEN
  // category's JSX is built (not all of them on every keystroke). Rows not
  // listed here navigate instead of expanding.
  const renderBody = (id: SettingsCategoryId): ReactNode => {
    switch (id) {
      // "account" (Edit profile) now navigates to the dedicated /profile-edit
      // screen (see ROUTES) — the unified avatar + public-profile + name/email
      // editor — so it has no inline body here.
      case "preferences":
        return (
      <>
        <Section label={t("w.account.settings.language")}>
          <ASegment options={LANGUAGES} value={lang} onPick={setLang} />
        </Section>
        {/* The Liquid Glass switch is gone on purpose: the native SwiftUI
            treatment is ALWAYS ON on iOS — the look is the product, not a
            preference (see swiftui.tsx LIQUID_GLASS_SUPPORTED). */}
      </>
        );
      case "notifications":
        return (
      <>
        <Text style={{ fontFamily: F.reg, fontSize: fs.micro, color: C.ash, lineHeight: leading(fs.micro), marginBottom: 12, marginLeft: 4 }}>{t("w.account.settings.notifications-desc")}</Text>
        {groupRows(ACCOUNT_NOTIF_ROWS).map((g) => (
          <Section key={g.group} label={g.group}>
            {g.items.map((row, i) => (
              <ToggleRow key={row.key} C={C} title={t(`w.account.settings.notif-${row.key}-t`)} desc={t(`w.account.settings.notif-${row.key}-d`)} on={!!acct.notif[row.key]} onToggle={() => acct.toggleNotif(row.key)} disabled={!acct.authOn} noBorder={i === 0} />
            ))}
          </Section>
        ))}
      </>
        );
      case "privacy":
        return (
      <>
        <Text style={{ fontFamily: F.reg, fontSize: fs.micro, color: C.ash, lineHeight: leading(fs.micro), marginBottom: 12, marginLeft: 4 }}>{t("w.account.settings.privacy-desc")}</Text>
        {groupRows(ACCOUNT_PRIVACY_ROWS).map((g) => (
          <Section key={g.group} label={g.group}>
            {g.items.map((row, i) => (
              <ToggleRow key={row.key} C={C} title={t(`w.account.settings.priv-${row.key}-t`)} desc={t(`w.account.settings.priv-${row.key}-d`)} on={!!acct.priv[row.key]} onToggle={() => acct.togglePriv(row.key)} disabled={!acct.authOn} noBorder={i === 0} />
            ))}
          </Section>
        ))}
      </>
        );
      case "security": {
        const emailProvider = !acct.provider || acct.provider === "email";
        const pw = passwordStrength(acct.newPw);
        const pwColor = txt(C, pw.score >= 4 ? C.lime : pw.score === 3 ? C.blue : pw.score === 2 ? C.amber : C.red);
        return (
      <>
        <MfaSettings />
        <Section label={t("w.account.settings.sec-login-recovery")}>
          <Label color={C.ash} tight>{t("w.account.settings.change-password").toUpperCase()}</Label>
          {!emailProvider ? (
            <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: leading(fs.caption) }}>{t("w.account.settings.signin-with")} {acct.provider} {t("w.account.settings.manage-password-there")}</Text>
          ) : (
            <>
              <AField value={acct.newPw} onChange={acct.setNewPw} placeholder={t("w.account.settings.new-password-ph")} secure icon="lock" />
              {acct.newPw.length > 0 && (
                <View accessibilityLiveRegion="polite" style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    {[1, 2, 3, 4].map((i) => <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= pw.score ? pwColor : C.line }} />)}
                  </View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: pwColor, marginTop: 6 }}>{t("w.account.settings.pw-strength")}: {t(`w.account.settings.pw-${pw.label}`)}</Text>
                </View>
              )}
              <APill label={t("w.account.settings.update-password")} variant="soft" disabled={acct.busy || acct.newPw.length < 8} onPress={acct.changePassword} style={{ paddingVertical: 12 }} />
              {!!acct.passwordMsg && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: acct.passwordMsg.startsWith("✓") ? txt(C, C.lime) : C.ash, marginTop: 8 }}>{acct.passwordMsg}</Text>}
            </>
          )}
          <Label color={C.ash} top>{t("w.account.settings.connected-account").toUpperCase()}</Label>
          <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: leading(fs.caption) }}>{!emailProvider ? acct.provider : (acct.email || t("w.account.settings.new-password-ph"))}</Text>
        </Section>
        <Section label={t("w.account.settings.sec-checks")}>
          <Label color={C.ash} tight>{t("w.account.settings.where-logged-in").toUpperCase()}</Label>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: txt(C, C.lime) }} />
            <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk }}>{t("w.account.settings.this-device")}</Text>
          </View>
          <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption, "snug"), marginBottom: 10 }}>{t("w.account.settings.active-sessions-desc")}</Text>
          <APill label={t("w.account.settings.sign-out-everywhere")} variant="soft" onPress={acct.signOutEverywhere} style={{ paddingVertical: 12 }} />
        </Section>
      </>
        );
      }
      case "subscription": {
        // Mode toggle — parity with web account-settings.tsx. A CLIENT flips
        // Simple(casual)/Full(athlete); Full is a paid upgrade, so when not paid
        // tapping it routes to the upgrade screen instead of switching. Coaches/
        // admins get the read-only line (no self-serve persona).
        const goUpgrade = () => (router.push as (p: string) => void)("/upgrade");
        if (!isClient) {
          return (
        <Section label={t("w.account.settings.mode")}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: leading(fs.caption) }}>
            {paid ? t("w.account.settings.full-paid") : t("w.account.settings.free")} — {t("w.account.settings.mode-desc")}
          </Text>
        </Section>
          );
        }
        const ModeCard = ({ on, title, tags, locked, onPress }: { on: boolean; title: string; tags: string; locked?: boolean; onPress: () => void }) => (
          <PressScale onPress={onPress} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ selected: on }} style={{ flex: 1, padding: 12, borderRadius: RADIUS.field, borderWidth: 1, borderColor: on ? (txt(C, C.lime) as string) : C.line, backgroundColor: on ? `${C.lime}14` : "transparent" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: on ? (txt(C, C.lime) as string) : C.chalk }}>{title}</Text>
              {locked && (
                <>
                  <AuroraIcon name="lock" size={fs.micro + 2} color={C.ash} />
                  <View style={{ borderWidth: 1, borderColor: txt(C, C.lime), backgroundColor: `${C.lime}1a`, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, C.lime), textTransform: "uppercase", letterSpacing: tracking.label }}>{t("w.account.settings.paid")}</Text>
                  </View>
                </>
              )}
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 4 }}>{tags}</Text>
          </PressScale>
        );
        return (
      <>
        <Section label={t("w.account.settings.mode")}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: leading(fs.caption), marginBottom: 12 }}>{t("w.account.settings.mode-desc")}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <ModeCard on={personaChoice === "casual"} title={t("w.account.settings.simple")} tags={t("w.account.settings.simple-tags")} onPress={() => setClientPersona("casual", paid)} />
            <ModeCard on={paid && personaChoice === "athlete"} title={t("w.account.settings.full")} tags={t("w.account.settings.full-tags")} locked={!paid} onPress={() => (paid ? setClientPersona("athlete", true) : goUpgrade())} />
          </View>
          {!paid ? (
            <>
              <APill label={t("w.account.settings.upgrade-full")} variant="primary" onPress={goUpgrade} style={{ paddingVertical: 12, marginTop: 16 }} />
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 10, lineHeight: leading(fs.micro) }}>{t("w.account.settings.unlocks")}</Text>
            </>
          ) : (
            <APill label={t("w.account.settings.manage-subscription")} variant="soft" onPress={() => (iapAvailable() ? void manageSubscriptions() : goUpgrade())} style={{ paddingVertical: 12, marginTop: 16 }} />
          )}
        </Section>
      </>
        );
      }
      case "data":
        return (
      <>
        <Section label={t("w.account.settings.export")}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption, "snug"), marginBottom: 10 }}>{t("w.account.settings.export-data-desc")}</Text>
          <View style={{ marginBottom: 12 }}>
            {[1, 2, 3].map((n) => (
              <View key={n} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
                <Text style={{ color: txt(C, C.lime) as string, fontFamily: F.bold }}>✓</Text>
                <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk }}>{t(`w.account.settings.data-incl-${n}`)}</Text>
              </View>
            ))}
          </View>
          {acct.exportBusy ? <ActivityIndicator color={txt(C, C.lime)} /> : <APill label={t("w.account.settings.download-data")} variant="soft" onPress={acct.exportData} style={{ paddingVertical: 12 }} />}
          {!!acct.exportMsg && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 8 }}>{acct.exportMsg}</Text>}
        </Section>
      </>
        );
      case "danger":
        return (
      <>
        <Section label={t("common.signout")}>
          <APill label={t("common.signout")} variant="soft" onPress={() => void signOut()} style={{ paddingVertical: 12 }} />
        </Section>
        <Section label={t("w.account.settings.erase-all")} tone={C.red}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption) }}>{t("settings.resetBody")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 12 }}>{t("settings.typeReset")}</Text>
          <TextInput
            value={confirm} onChangeText={setConfirm} placeholder="RESET" placeholderTextColor={C.ash}
            autoCapitalize="characters" autoCorrect={false}
            style={{ fontFamily: F.mono, fontSize: fs.note, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: armed ? C.red : C.line, borderRadius: RADIUS.field, paddingHorizontal: 16, paddingVertical: 12, marginTop: 8 }}
          />
          {!!error && <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.red), marginTop: 10 }}>{error}</Text>}
          <PressScale onPress={reset} disabled={!armed || busy} style={{ backgroundColor: armed && !busy ? C.red : `${C.red}55`, borderRadius: RADIUS.pill, paddingVertical: 16, alignItems: "center", marginTop: 12 }}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: "#fff" }}>{t("w.account.settings.erase-everything")}</Text>}
          </PressScale>
        </Section>
        <Section label={t("settings.deleteTitle")} tone={C.red}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption) }}>{t("settings.deleteBody")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 12 }}>{t("settings.typeDelete")}</Text>
          <TextInput
            value={delConfirm} onChangeText={setDelConfirm} placeholder="DELETE" placeholderTextColor={C.ash}
            autoCapitalize="characters" autoCorrect={false}
            style={{ fontFamily: F.mono, fontSize: fs.note, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: armedDelete ? C.red : C.line, borderRadius: RADIUS.field, paddingHorizontal: 16, paddingVertical: 12, marginTop: 8 }}
          />
          {!!delError && <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.red), marginTop: 10 }}>{delError}</Text>}
          <PressScale onPress={del} disabled={!armedDelete || deleting} accessibilityRole="button" accessibilityLabel={t("settings.deleteAccount")} style={{ backgroundColor: armedDelete && !deleting ? C.red : `${C.red}55`, borderRadius: RADIUS.pill, paddingVertical: 16, alignItems: "center", marginTop: 12 }}>
            {deleting ? <ActivityIndicator color="#fff" /> : <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: "#fff" }}>{t("settings.deleteAccount")}</Text>}
          </PressScale>
        </Section>
        <Section label={t("legal.section")}>
          <LegalLinks align="left" />
        </Section>
      </>
        );
      default:
        return null;
    }
  };

  // Rows that navigate to a dedicated screen instead of a drill-in sub-view.
  const ROUTES: Partial<Record<SettingsCategoryId, string>> = {
    account: "/profile-edit",
    logger: "/logger-settings",
    coaching: "/coach-apply",
    // `subscription` drills in to the inline Mode section (Simple/Full toggle),
    // parity with web; the Full upgrade CTA there routes on to /upgrade.
  };

  // A short current-value summary shown on the right of each category row.
  const summary = (id: SettingsCategoryId): string => {
    switch (id) {
      case "account": return name ?? "";
      case "preferences": return lang.toUpperCase();
      case "notifications": return `${Object.values(acct.notif).filter(Boolean).length}/${Object.keys(acct.notif).length}`;
      case "privacy": return `${Object.values(acct.priv).filter(Boolean).length}/${Object.keys(acct.priv).length}`;
      case "subscription": return entitlement === "paid" ? "Full" : "Free";
      case "security": return acct.provider && acct.provider !== "email" ? acct.provider : "";
      default: return "";
    }
  };

  const openCat = (c: SettingsCategory) => {
    const nav = ROUTES[c.id];
    setQuery("");
    if (nav) (router.push as (p: string) => void)(nav);
    else setCat(c.id);
  };

  // A render HELPER (not a component) so it doesn't remount on each keystroke.
  // Each category is a full-width LIST ROW inside its group's Section card: a
  // tinted icon chip, the title, a one-line value/subtitle and a chevron. A
  // hairline separates rows within the card (first row draws none).
  const renderRow = (c: SettingsCategory, first: boolean) => {
    const accent = toneColor[TONE[c.id]];
    const { tile, fg } = tone(accent);
    const line = summary(c.id) || c.subtitle;
    const titleColor = c.danger ? (txt(C, C.red) as string) : C.chalk;
    return (
      <PressScale
        key={c.id}
        onPress={() => openCat(c)}
        accessibilityRole="button"
        accessibilityLabel={c.title}
        style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderTopColor: C.line }}
      >
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.danger ? `${C.red}24` : tile, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name={c.icon} size={20} color={c.danger ? (txt(C, C.red) as string) : fg} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: titleColor }}>{c.title}</Text>
          <View style={{ marginTop: 3 }}><MetaLine text={line} textStyle={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }} /></View>
        </View>
        <AuroraIcon name="chevron-down" size={18} color={C.ash} style={{ transform: [{ rotate: "-90deg" }] }} />
      </PressScale>
    );
  };

  const active = cat ? SETTINGS_CATEGORIES[cat] : null;
  const results = matchSettings(query);

  // ── SUB-PAGE ── a focused category with a back button.
  if (active) {
    return (
      <AuroraScreen
        hero={{ rank: "title", title: active.title, accent: active.danger ? C.red : undefined }}
        back={() => setCat(null)}
        backLabel={t("nav.settings")}
      >
        {renderBody(active.id)}
      </AuroraScreen>
    );
  }

  // ── LIST ── screen title, profile header, search, grouped category tiles.
  return (
    <AuroraScreen>
      <AHeading style={{ fontSize: fs.display, marginBottom: 16 }}>{t("w.account.settings.title")}</AHeading>
      {/* Profile header — tappable → Edit profile, with a completeness ring
          around the avatar (a clay accent ring + a proportional bar, since RN has no
          inline SVG here), the % + "add a photo & bio" nudge, the FREE/FULL pill,
          and quick-action chips. Shared completeness math with web. */}
      <View style={{ padding: 16, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card }}>
        <PressScale onPress={openEditProfile} accessibilityRole="button" accessibilityLabel={t("w.account.settings.edit-profile")} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2.5, borderColor: txt(C, C.lime), alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {profile?.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={{ width: "100%", height: "100%" }} />
            ) : (
              <LinearGradient colors={[C.lime, C.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: F.black, fontSize: fs.headline, color: C.onAccent }}>{(name || acct.email || "?").slice(0, 1).toUpperCase()}</Text>
              </LinearGradient>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk }}>{name || t("w.account.settings.your-account")}</Text>
            <View style={{ marginTop: 3 }}><MetaLine text={`${completeness.percent}% · ${nudge}`} textStyle={{ fontFamily: F.mono, fontSize: fs.micro, color: completeness.complete ? (txt(C, C.lime) as string) : C.ash }} /></View>
            <View style={{ height: 5, borderRadius: 5, backgroundColor: C.line, marginTop: 8, overflow: "hidden" }}>
              <View style={{ width: `${completeness.percent}%`, height: "100%", backgroundColor: txt(C, C.lime) }} />
            </View>
          </View>
          <Chip color={entitlement === "paid" ? C.lime : C.ash} tone="outline">{entitlement === "paid" ? t("w.account.settings.full-paid") : t("w.account.settings.free")}</Chip>
        </PressScale>
        {/* Quick actions */}
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: 16, flexWrap: "wrap" }}>
          <PressScale onPress={openEditProfile} style={{ borderWidth: 1, borderColor: `${txt(C, C.lime)}66`, backgroundColor: `${C.lime}14`, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("w.account.settings.edit-profile")}</Text>
          </PressScale>
          {!!profile?.handle && (
            <PressScale onPress={shareProfile} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>↗ {t("w.account.settings.share-profile")}</Text>
            </PressScale>
          )}
        </View>
      </View>

      {/* Search */}
      <View style={{ marginTop: 20 }}>
        <ASearch value={query} onChange={(v: string) => refilter(() => setQuery(v))} placeholder={t("w.account.settings.search")} />
      </View>

      {query ? (
        results.length === 0 ? (
          <ACard style={{ marginTop: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.account.settings.no-results")}</Text>
          </ACard>
        ) : (
          <ACard style={{ marginTop: 16 }}>
            {results.map((c, i) => renderRow(c, i === 0))}
          </ACard>
        )
      ) : (
        <View style={{ marginTop: 8 }}>
          {SETTINGS_GROUPS.map((group) => (
            <Section key={group.id} label={group.label}>
              {group.categories.map((c, i) => renderRow(c, i === 0))}
            </Section>
          ))}
        </View>
      )}
    </AuroraScreen>
  );
}

function Label({ children, color, top, tight }: { children: ReactNode; color: string; top?: boolean; tight?: boolean }) {
  return (
    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.caps, color, marginTop: tight ? 0 : top ? 18 : 14, marginBottom: 10 }}>
      {children}
    </Text>
  );
}

/** A labelled section — the app-wide grouping: an uppercase header sitting above
 *  its own card. Every Settings sub-page is built from these so the whole surface
 *  reads as consistent sections (matching the Sectioned edit-profile screen). */
function Section({ label, tone, children }: { label: string; tone?: string; children: ReactNode }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.caps, color: tone ?? C.ash, marginLeft: 4, marginBottom: 10 }}>{label}</Text>
      <ACard>{children}</ACard>
    </View>
  );
}

/** Collapse a flat, group-tagged row list into contiguous [group → items] runs
 *  so each group can render as its own Section. */
function groupRows<T extends { group: string }>(rows: readonly T[]): { group: string; items: T[] }[] {
  const out: { group: string; items: T[] }[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.group === r.group) last.items.push(r);
    else out.push({ group: r.group, items: [r] });
  }
  return out;
}

