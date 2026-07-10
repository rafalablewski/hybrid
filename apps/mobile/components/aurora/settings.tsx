import { useState, useCallback, type ReactNode } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, AccessibilityInfo, Share, Image } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { type Lang, ACCOUNT_NOTIF_ROWS, ACCOUNT_PRIVACY_ROWS, SETTINGS_GROUPS, SETTINGS_CATEGORIES, matchSettings, passwordStrength, profileCompleteness, type SettingsCategory, type SettingsCategoryId } from "@hybrid/core";
import { resetAccount } from "../../lib/api";
import { clearGuestSessions } from "../../lib/guest";
import { clearDraft } from "../../lib/draft";
import { useSession } from "../../lib/session";
import { useAccountSettings } from "../../lib/account";
import { getMyProfile } from "../../lib/social-api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, type ThemePref } from "../../lib/theme";
import { useLiquidGlass } from "../../lib/liquid-glass";
import { fs, space, F } from "../../lib/ui";
import { ToggleRow } from "../toggle-row";
import { AuroraScreen, ACard, AField, ASegment, APill, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";
import { LinearGradient } from "expo-linear-gradient";

// Theme picker swatches — a mini colour preview per template (shared shape with
// web's Preferences). system = mixed, Aurora = dark/lime, Japandi = warm/clay.
const THEME_SWATCHES: { id: ThemePref; label: string; colors: [string, string, string] }[] = [
  { id: "system", label: "System", colors: ["#0a0b09", "#efeee7", "#8a8f82"] },
  { id: "dark", label: "Aurora", colors: ["#0a0b09", "#c6f135", "#8a8f82"] },
  { id: "light", label: "Japandi", colors: ["#efeee7", "#a9d426", "#63665c"] },
];
const LANGUAGES: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "pl", label: "Polski" },
  { id: "de", label: "Deutsch" },
];

/** Per-category accent — the icon-tile tint, matching the V1 mockup. */
const TONE: Record<SettingsCategoryId, "lime" | "blue" | "violet" | "amber" | "red" | "ash"> = {
  account: "lime", preferences: "blue", logger: "amber", notifications: "violet",
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
  const { signOut, name, entitlement } = useSession();
  const { pref, setPref } = useTheme();
  const lg = useLiquidGlass();
  const acct = useAccountSettings();
  // Drill-in navigation: null = the category list; a category id = its sub-page.
  const [cat, setCat] = useState<SettingsCategoryId | null>(null);
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const armed = confirm.trim().toUpperCase() === "RESET";
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
        <Label color={C.ash}>APPEARANCE</Label>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {THEME_SWATCHES.map((s) => {
            const on = pref === s.id;
            return (
              <Pressable key={s.id} onPress={() => setPref(s.id)} accessibilityRole="button" accessibilityLabel={s.label} style={{ flex: 1, padding: 11, borderRadius: RADIUS.field, borderWidth: 1, borderColor: on ? (txt(C, C.lime) as string) : C.line, backgroundColor: on ? `${C.lime}14` : "transparent" }}>
                <View style={{ flexDirection: "row", gap: 4, marginBottom: 8 }}>
                  {s.colors.map((c, i) => <View key={i} style={{ width: 15, height: 15, borderRadius: 5, backgroundColor: c, borderWidth: 1, borderColor: C.line }} />)}
                </View>
                <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: on ? (txt(C, C.lime) as string) : C.chalk }}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Label color={C.ash} top>LANGUAGE</Label>
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
        {ACCOUNT_NOTIF_ROWS.map((row, i) => (
          <View key={row.key}>
            {(i === 0 || ACCOUNT_NOTIF_ROWS[i - 1].group !== row.group) && <Label color={C.ash} top={i > 0}>{row.group.toUpperCase()}</Label>}
            <ToggleRow C={C} title={t(`w.account.settings.notif-${row.key}-t`)} desc={t(`w.account.settings.notif-${row.key}-d`)} on={!!acct.notif[row.key]} onToggle={() => acct.toggleNotif(row.key)} disabled={!acct.authOn} />
          </View>
        ))}
      </>
        );
      case "privacy":
        return (
      <>
        <Text style={{ fontFamily: F.reg, fontSize: fs.micro, color: C.ash, lineHeight: 16, marginBottom: 2 }}>{t("w.account.settings.privacy-desc")}</Text>
        {ACCOUNT_PRIVACY_ROWS.map((row, i) => (
          <View key={row.key}>
            {(i === 0 || ACCOUNT_PRIVACY_ROWS[i - 1].group !== row.group) && <Label color={C.ash} top={i > 0}>{row.group.toUpperCase()}</Label>}
            <ToggleRow C={C} title={t(`w.account.settings.priv-${row.key}-t`)} desc={t(`w.account.settings.priv-${row.key}-d`)} on={!!acct.priv[row.key]} onToggle={() => acct.togglePriv(row.key)} disabled={!acct.authOn} />
          </View>
        ))}
      </>
        );
      case "security": {
        const emailProvider = !acct.provider || acct.provider === "email";
        const pw = passwordStrength(acct.newPw);
        const pwColor = txt(C, pw.score >= 4 ? C.lime : pw.score === 3 ? C.blue : pw.score === 2 ? C.amber : C.red);
        return (
      <>
        {/* GROUP — Login & recovery */}
        <Label color={txt(C, C.lime) as string}>{t("w.account.settings.sec-login-recovery").toUpperCase()}</Label>
        <Label color={C.ash}>{t("w.account.settings.change-password").toUpperCase()}</Label>
        {!emailProvider ? (
          <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: 17 }}>{t("w.account.settings.signin-with")} {acct.provider} {t("w.account.settings.manage-password-there")}</Text>
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
            <APill label={t("w.account.settings.update-password")} variant="soft" disabled={acct.busy || acct.newPw.length < 8} onPress={acct.changePassword} style={{ paddingVertical: 13 }} />
            {!!acct.passwordMsg && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: acct.passwordMsg.startsWith("✓") ? txt(C, C.lime) : C.ash, marginTop: 8 }}>{acct.passwordMsg}</Text>}
          </>
        )}
        <Label color={C.ash} top>{t("w.account.settings.connected-account").toUpperCase()}</Label>
        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: 17 }}>{!emailProvider ? acct.provider : (acct.email || t("w.account.settings.new-password-ph"))}</Text>

        {/* GROUP — Security checks */}
        <Label color={txt(C, C.lime) as string} top>{t("w.account.settings.sec-checks").toUpperCase()}</Label>
        <Label color={C.ash}>{t("w.account.settings.where-logged-in").toUpperCase()}</Label>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: txt(C, C.lime) }} />
          <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk }}>{t("w.account.settings.this-device")}</Text>
        </View>
        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, lineHeight: 16, marginBottom: 10 }}>{t("w.account.settings.active-sessions-desc")}</Text>
        <APill label={t("w.account.settings.sign-out-everywhere")} variant="soft" onPress={acct.signOutEverywhere} style={{ paddingVertical: 13 }} />
      </>
        );
      }
      case "data":
        return (
      <>
        <Label color={C.ash}>EXPORT</Label>
        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, lineHeight: 16, marginBottom: 10 }}>{t("w.account.settings.export-data-desc")}</Text>
        <View style={{ marginBottom: 12 }}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
              <Text style={{ color: txt(C, C.lime) as string, fontFamily: F.bold }}>✓</Text>
              <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk }}>{t(`w.account.settings.data-incl-${n}`)}</Text>
            </View>
          ))}
        </View>
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
          {!!error && <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.red), marginTop: 10 }}>{error}</Text>}
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

  // Rows that navigate to a dedicated screen instead of a drill-in sub-view.
  const ROUTES: Partial<Record<SettingsCategoryId, string>> = {
    account: "/profile-edit",
    logger: "/logger-settings",
    coaching: "/coach-apply",
    subscription: "/upgrade",
  };

  // A short current-value summary shown on the right of each category row.
  const summary = (id: SettingsCategoryId): string => {
    switch (id) {
      case "account": return name ?? "";
      case "preferences": return `${pref === "system" ? "System" : pref === "light" ? "Japandi" : "Aurora"} · ${lang.toUpperCase()}`;
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
  // Each category is a BENTO tile: a tinted icon chip, the title and a one-line
  // value/subtitle. Two tiles per row; a group with an odd count gets a
  // full-width "wide" trailing tile (icon left, text, chevron) so the grid never
  // leaves a lonely half-tile.
  const renderTile = (c: SettingsCategory, i: number, count: number) => {
    const accent = toneColor[TONE[c.id]];
    const { tile, fg } = tone(accent);
    const line = summary(c.id) || c.subtitle;
    const wide = count % 2 === 1 && i === count - 1;
    const titleColor = c.danger ? (txt(C, C.red) as string) : C.chalk;
    return (
      <Pressable
        key={c.id}
        onPress={() => openCat(c)}
        accessibilityRole="button"
        accessibilityLabel={c.title}
        style={{
          flexGrow: 1,
          flexBasis: wide ? "100%" : "45%",
          minHeight: wide ? 0 : 118,
          flexDirection: wide ? "row" : "column",
          alignItems: wide ? "center" : "stretch",
          justifyContent: wide ? "flex-start" : "space-between",
          gap: wide ? space.md : 0,
          backgroundColor: C.ink2,
          borderWidth: 1,
          borderColor: c.danger ? `${C.red}47` : C.line,
          borderRadius: 20,
          padding: 16,
        }}
      >
        <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: c.danger ? `${C.red}24` : tile, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name={c.icon} size={20} color={c.danger ? (txt(C, C.red) as string) : fg} />
        </View>
        <View style={{ flex: wide ? 1 : undefined }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: titleColor }}>{c.title}</Text>
          <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 3, lineHeight: 15 }}>{line}</Text>
        </View>
        {wide ? <AuroraIcon name="chevron-down" size={18} color={C.ash} style={{ transform: [{ rotate: "-90deg" }] }} /> : null}
      </Pressable>
    );
  };

  const active = cat ? SETTINGS_CATEGORIES[cat] : null;
  const results = matchSettings(query);

  // ── SUB-PAGE ── a focused category with a back button.
  if (active) {
    return (
      <AuroraScreen>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: 4, marginBottom: 10 }}>
          <Pressable onPress={() => setCat(null)} accessibilityRole="button" accessibilityLabel={t("common.back")} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
            <AuroraIcon name="back" size={20} color={C.chalk} />
          </Pressable>
          <AHeading style={{ fontSize: fs.display, color: active.danger ? (txt(C, C.red) as string) : C.chalk }}>{active.title}</AHeading>
        </View>
        <ACard>{renderBody(active.id)}</ACard>
      </AuroraScreen>
    );
  }

  // ── LIST ── screen title, profile header, search, grouped category tiles.
  return (
    <AuroraScreen>
      <AHeading style={{ fontSize: fs.display, marginBottom: 14 }}>{t("w.account.settings.title")}</AHeading>
      {/* Profile header — tappable → Edit profile, with a completeness ring
          around the avatar (a lime ring + a proportional bar, since RN has no
          inline SVG here), the % + "add a photo & bio" nudge, the FREE/FULL pill,
          and quick-action chips. Shared completeness math with web. */}
      <View style={{ padding: 16, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 20 }}>
        <Pressable onPress={openEditProfile} accessibilityRole="button" accessibilityLabel={t("w.account.settings.edit-profile")} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2.5, borderColor: txt(C, C.lime), alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {profile?.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={{ width: "100%", height: "100%" }} />
            ) : (
              <LinearGradient colors={[C.lime, "#9bd400"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: F.black, fontSize: 22, color: C.onAccent }}>{(name || acct.email || "?").slice(0, 1).toUpperCase()}</Text>
              </LinearGradient>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk }}>{name || t("w.account.settings.your-account")}</Text>
            <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.micro, color: completeness.complete ? txt(C, C.lime) : C.ash, marginTop: 3 }}>{completeness.percent}% · {nudge}</Text>
            <View style={{ height: 5, borderRadius: 5, backgroundColor: C.line, marginTop: 7, overflow: "hidden" }}>
              <View style={{ width: `${completeness.percent}%`, height: "100%", backgroundColor: txt(C, C.lime) }} />
            </View>
          </View>
          <Tag label={entitlement === "paid" ? t("w.account.settings.full-paid") : t("w.account.settings.free")} color={entitlement === "paid" ? C.lime : C.ash} />
        </Pressable>
        {/* Quick actions */}
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: 14, flexWrap: "wrap" }}>
          <Pressable onPress={openEditProfile} style={{ borderWidth: 1, borderColor: `${txt(C, C.lime)}66`, backgroundColor: `${C.lime}14`, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("w.account.settings.edit-profile")}</Text>
          </Pressable>
          {!!profile?.handle && (
            <Pressable onPress={shareProfile} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>↗ {t("w.account.settings.share-profile")}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Search */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 14, marginTop: 20 }}>
        <AuroraIcon name="search" size={18} color={C.ash} />
        <TextInput value={query} onChangeText={setQuery} placeholder={t("w.account.settings.search")} placeholderTextColor={C.ash} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk, paddingVertical: 12 }} />
      </View>

      {query ? (
        results.length === 0 ? (
          <ACard style={{ marginTop: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.account.settings.no-results")}</Text>
          </ACard>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 11, marginTop: 16 }}>
            {results.map((c, i) => renderTile(c, i, results.length))}
          </View>
        )
      ) : (
        SETTINGS_GROUPS.map((group) => (
          <View key={group.id} style={{ marginTop: 22 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginBottom: 10, marginLeft: 4 }}>{group.label}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 11 }}>
              {group.categories.map((c, i) => renderTile(c, i, group.categories.length))}
            </View>
          </View>
        ))
      )}
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

function Tag({ label, color, upper }: { label: string; color: string; upper?: boolean }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ borderWidth: 1, borderColor: `${color}66`, backgroundColor: `${color}1a`, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
      <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, color), letterSpacing: 0.5, textTransform: upper ? "uppercase" : undefined }}>{label}</Text>
    </View>
  );
}
