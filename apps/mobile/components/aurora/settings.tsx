import { useState, useCallback, type ReactNode } from "react";
import { View, Text, TextInput, AccessibilityInfo, Share, Image } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { type Lang, ACCOUNT_NOTIF_ROWS, ACCOUNT_PRIVACY_ROWS, SETTINGS_GROUPS, SETTINGS_CATEGORIES, matchSettings, passwordStrength, profileCompleteness, type SettingsCategory, type SettingsCategoryId , ALPHA, FEEDBACK, type AccentKey } from "@hybrid/core";
import { resetAccount, deleteAccount } from "../../lib/api";
import { iapAvailable, manageSubscriptions } from "../../lib/iap";
import { clearGuestSessions } from "../../lib/guest";
import { clearDraft } from "../../lib/draft";
import { useSession } from "../../lib/session";
import { useClientPersonaChoice, setClientPersona } from "../../lib/persona";
import { useAccountSettings } from "../../lib/account";
import { pushSupported, usePushSwitch } from "../../lib/push";
import { getMyProfile } from "../../lib/social-api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, accentColor } from "../../lib/theme";
import { leading, tracking, fs, space, F, PressScale, Chip, FIXED_FONT_SCALE, ty } from "../../lib/ui";
import { ToggleRow } from "../toggle-row";
import { AuroraScreen, ACard, AField, ASegment, APill, AHeading, RADIUS, ASearch, Ring } from "./kit";
import MfaSettings from "./mfa-settings";
import { AuroraIcon } from "./icons";
import { MetaLine } from "./meta";
import { LegalLinks } from "../legal-links";
import { LinearGradient } from "expo-linear-gradient";
import { useListMotion } from "../../lib/list-motion";
import { withAlpha } from "./field";

const LANGUAGES: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "pl", label: "Polski" },
  { id: "de", label: "Deutsch" },
];

/** Per-category icon-tile tint. Unified to a single neutral (ash) so the list
 *  reads as one system instead of a rainbow — the hue no longer encodes
 *  anything. Red is kept ONLY for the destructive `danger` section, where it is
 *  a real semantic warning. Mirrors web's TONE for parity. */
/** Settings categories that live on their OWN screen rather than as a sub-page
 *  here. Exported so anything routing to a setting (the cross-app search) sends
 *  the athlete to the real screen instead of a settings page that would only
 *  bounce them onward. `subscription` drills in to the inline Mode section
 *  (Simple/Full toggle), parity with web; its Full CTA routes on to /upgrade. */
export const SETTINGS_ROUTES: Partial<Record<SettingsCategoryId, string>> = {
  account: "/profile-edit",
  logger: "/logger-settings",
  coaching: "/coach-apply",
};

const TONE: Record<SettingsCategoryId, AccentKey> = {
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
export default function AuroraSettings({ landOn }: {
  /** Land on one category rather than the list — the cross-app search's setting
   *  results. A result that only reached the settings ROOT would be a broken
   *  promise: the athlete named the setting. Categories that live on their own
   *  screen (see ROUTES) are routed there by the caller instead. */
  landOn?: SettingsCategoryId;
} = {}) {
  // One motion hook for every layout change the user causes here: survivors of
  // a search re-filter MOVE to their new positions (only arrivals fade), and
  // the hub ⇄ category drill-in travels instead of teleporting — the whole
  // body swaps, which is exactly the class of change that must not hard-cut.
  const motion = useListMotion();
  const { palette: C } = useTheme();
  const router = useRouter();
  const { t, lang, setLang } = useLang();
  const { signOut, name, role, entitlement } = useSession();
  const acct = useAccountSettings();
  // The push master switch (permission + this phone's registration).
  const push = usePushSwitch();
  // Mode toggle — Full (athlete) is a paid upgrade; a CLIENT chooses casual vs
  // athlete, mirroring web's useClientPersonaChoice()/setClientPersona().
  const paid = entitlement === "paid";
  // No stored choice = the resolvePersona default: Full for a paid account
  // (paying shouldn't require flipping a toggle), Simple for a free one.
  const personaChoice = useClientPersonaChoice() ?? (paid ? "athlete" : "casual");
  const isClient = role === "client";
  // Drill-in navigation: null = the category list; a category id = its sub-page.
  const [cat, setCat] = useState<SettingsCategoryId | null>(landOn ?? null);
  // One level deeper — the FIELD screens (Instagram's grammar): an input never
  // sits inline in a list, it gets a row, and the row opens a screen that is
  // only that input. Password / erase / delete each own one.
  const [sub, setSub] = useState<null | "password" | "erase" | "delete">(null);
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

  const tone = (c: string) => ({ tile: withAlpha(c, ALPHA.solid), fg: txt(C, c) });
  // Was a local copy of one lookup — see lib/theme accentColor.

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
          {/* `surface="card"`: a Section wraps its body in an ACard, and the
              default track is the card's own ink2 — so this switch had been
              drawing an invisible track on every non-glass device. */}
          <ASegment options={LANGUAGES} value={lang} onPick={setLang} surface="card" />
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
        {/* THE MASTER SWITCH FIRST, because it is a different KIND of thing from
            the three under it: this one asks iOS for permission and registers
            this phone (lib/push.ts), while those three choose what may be sent
            to it. `blocked` is the state the switch alone can't say — iOS never
            shows the prompt twice, so once refused the only way through is the
            Settings app, and the row says that instead of flicking back with no
            explanation. Hidden entirely off iOS: Android delivery is FCM, a
            separate key and sender, and a switch for it would be a promise. */}
        {pushSupported() && (
          <Section label={t("w.account.settings.push-section")}>
            <ToggleRow
              C={C}
              title={t("w.account.settings.push-t")}
              desc={push.blocked ? t("w.account.settings.push-blocked") : t("w.account.settings.push-d")}
              on={push.on}
              onToggle={push.toggle}
              disabled={!acct.authOn || push.busy}
              noBorder
            />
          </Section>
        )}
        {groupRows(ACCOUNT_NOTIF_ROWS).map((g) => (
          <Section key={g.group} label={g.group}>
            {g.items.map((row, i) => (
              // Disabled while push is off: the switch would otherwise let an
              // athlete pick which of three notifications to receive on a phone
              // that has agreed to receive none.
              <ToggleRow key={row.key} C={C} title={t(`w.account.settings.notif-${row.key}-t`)} desc={t(`w.account.settings.notif-${row.key}-d`)} on={!!acct.notif[row.key]} onToggle={() => acct.toggleNotif(row.key)} disabled={!acct.authOn || (pushSupported() && !push.on)} noBorder={i === 0} />
            ))}
          </Section>
        ))}
        {pushSupported() && !push.on && (
          <Text style={{ fontFamily: F.reg, fontSize: fs.micro, color: C.ash, lineHeight: leading(fs.micro), marginLeft: 4 }}>{t("w.account.settings.push-off-note")}</Text>
        )}
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
        return (
      <>
        <MfaSettings />
        <Section label={t("w.account.settings.sec-login-recovery")}>
          {/* The password FORM does not live in this list — the row does, and
              the row opens the one-field screen (the field-screen grammar). */}
          {!emailProvider ? (
            <>
              <Label color={C.ash} tight>{t("w.account.settings.change-password")}</Label>
              <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: leading(fs.caption) }}>{t("w.account.settings.signin-with")} {acct.provider} {t("w.account.settings.manage-password-there")}</Text>
            </>
          ) : (
            <DrillRow first title={t("w.account.settings.change-password")} onPress={() => motion(() => setSub("password"))} />
          )}
          <Label color={C.ash} top>{t("w.account.settings.connected-account")}</Label>
          <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: leading(fs.caption) }}>{!emailProvider ? acct.provider : (acct.email || t("w.account.settings.new-password-ph"))}</Text>
        </Section>
        <Section label={t("w.account.settings.sec-checks")}>
          <Label color={C.ash} tight>{t("w.account.settings.where-logged-in")}</Label>
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
          <PressScale onPress={onPress} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ selected: on }} style={{ flex: 1, padding: 12, borderRadius: RADIUS.field, borderWidth: 1, borderColor: on ? (txt(C, C.lime) as string) : C.line, backgroundColor: on ? withAlpha(C.lime, ALPHA.wash) : "transparent" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: on ? (txt(C, C.lime) as string) : C.chalk }}>{title}</Text>
              {locked && (
                <>
                  <AuroraIcon name="lock" size={fs.micro + 2} color={C.ash} />
                  <View style={{ borderWidth: 1, borderColor: txt(C, C.lime), backgroundColor: withAlpha(C.lime, ALPHA.fill), borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, C.lime), textTransform: "uppercase", letterSpacing: tracking(fs.nano, "label") }}>{t("w.account.settings.paid")}</Text>
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
          {/* APill's commit state, not a spinner swapped in where the button
              was — the pill holds its width and reports in place, so the
              screen doesn't reflow the moment the export starts. */}
          <APill label={t("w.account.settings.download-data")} variant="soft" state={acct.exportBusy ? "saving" : "idle"} onPress={acct.exportData} style={{ paddingVertical: 12 }} />
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
        {/* The destructive flows are ROWS, not inline forms (the field-screen
            grammar): a type-to-confirm input sitting open in a list is armed
            the moment you scroll past it. Each row opens a screen that is only
            that decision — its explanation, its one field, its one button. */}
        <Section label={t("w.account.settings.erase-all")} tone={C.red}>
          <DrillRow first danger title={t("w.account.settings.erase-all")} onPress={() => motion(() => setSub("erase"))} />
          <DrillRow danger title={t("settings.deleteTitle")} onPress={() => motion(() => setSub("delete"))} />
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
  const ROUTES = SETTINGS_ROUTES;

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
    if (nav) { setQuery(""); (router.push as (p: string) => void)(nav); return; }
    motion(() => { setQuery(""); setCat(c.id); });
  };

  // A render HELPER (not a component) so it doesn't remount on each keystroke.
  // Each category is a full-width LIST ROW inside its group's Section card: a
  // tinted icon chip, the title, a one-line value/subtitle and a chevron. A
  // hairline separates rows within the card (first row draws none).
  const renderRow = (c: SettingsCategory, first: boolean) => {
    const accent = accentColor(C, TONE[c.id]);
    const { tile, fg } = tone(accent);
    const line = summary(c.id) || c.subtitle;
    const titleColor = c.danger ? (txt(C, C.red) as string) : C.chalk;
    return (
      <PressScale
        key={c.id}
        onPress={() => openCat(c)}
        accessibilityRole="button"
        // The value line is part of what the row SAYS ("Notifications, 3/4") —
        // a label of just the title would read less to VoiceOver than the row
        // shows everyone else.
        accessibilityLabel={line ? `${c.title}, ${line}` : c.title}
        style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderTopColor: C.line }}
      >
        <View style={{ width: 40, height: 40, borderRadius: RADIUS.inner, backgroundColor: c.danger ? withAlpha(C.red, ALPHA.solid) : tile, alignItems: "center", justifyContent: "center" }}>
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

  // ── FIELD SCREEN ── one decision, alone on its own screen, one level below
  // the category (Instagram's grammar: a list holds rows; an input holds a
  // screen). Back returns to the category that opened it.
  if (active && sub) {
    const titles = { password: t("w.account.settings.change-password"), erase: t("w.account.settings.erase-all"), delete: t("settings.deleteTitle") } as const;
    const danger = sub !== "password";
    const pw = passwordStrength(acct.newPw);
    const pwColor = txt(C, pw.score >= 4 ? C.lime : pw.score === 3 ? C.blue : pw.score === 2 ? C.amber : C.red);
    return (
      <AuroraScreen
        hero={{ rank: "title", title: titles[sub], accent: danger ? C.red : undefined }}
        back={() => motion(() => setSub(null))}
        backLabel={active.title}
      >
        {sub === "password" && (
          <ACard>
            <AField value={acct.newPw} onChange={acct.setNewPw} placeholder={t("w.account.settings.new-password-ph")} secure icon="lock" autoFocus />
            {acct.newPw.length > 0 && (
              <View accessibilityLiveRegion="polite" style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", gap: 4 }}>
                  {[1, 2, 3, 4].map((i) => <View key={i} style={{ flex: 1, height: 5, borderRadius: RADIUS.mark, backgroundColor: i <= pw.score ? pwColor : C.line }} />)}
                </View>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: pwColor, marginTop: 6 }}>{t("w.account.settings.pw-strength")}: {t(`w.account.settings.pw-${pw.label}`)}</Text>
              </View>
            )}
            <APill label={t("w.account.settings.update-password")} variant="soft" disabled={acct.busy || acct.newPw.length < 8} onPress={acct.changePassword} style={{ paddingVertical: 12 }} />
            {!!acct.passwordMsg && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: acct.passwordMsg.startsWith("✓") ? txt(C, C.lime) : C.ash, marginTop: 8 }}>{acct.passwordMsg}</Text>}
          </ACard>
        )}
        {sub === "erase" && (
          <ACard>
            <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption) }}>{t("settings.resetBody")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 12 }}>{t("settings.typeReset")}</Text>
            <TextInput
              value={confirm} onChangeText={setConfirm} placeholder="RESET" placeholderTextColor={C.ash}
              accessibilityLabel={t("settings.typeReset")}
              autoCapitalize="characters" autoCorrect={false}
              style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: armed ? C.red : C.line, borderRadius: RADIUS.field, paddingHorizontal: 16, paddingVertical: 12, marginTop: 8 }}
            />
            {!!error && <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.caption, color: FEEDBACK.error.text, marginTop: 10 }}>{error}</Text>}
            <APill
              label={t("w.account.settings.erase-everything")}
              color={C.red}
              state={busy ? "saving" : "idle"}
              disabled={!armed || busy}
              onPress={reset}
              style={{ marginTop: 12 }}
            />
          </ACard>
        )}
        {sub === "delete" && (
          <ACard>
            <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption) }}>{t("settings.deleteBody")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 12 }}>{t("settings.typeDelete")}</Text>
            <TextInput
              value={delConfirm} onChangeText={setDelConfirm} placeholder="DELETE" placeholderTextColor={C.ash}
              accessibilityLabel={t("settings.typeDelete")}
              autoCapitalize="characters" autoCorrect={false}
              style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: armedDelete ? C.red : C.line, borderRadius: RADIUS.field, paddingHorizontal: 16, paddingVertical: 12, marginTop: 8 }}
            />
            {!!delError && <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.caption, color: FEEDBACK.error.text, marginTop: 10 }}>{delError}</Text>}
            <APill
              label={t("settings.deleteAccount")}
              color={C.red}
              state={deleting ? "saving" : "idle"}
              disabled={!armedDelete || deleting}
              onPress={del}
              style={{ marginTop: 12 }}
            />
          </ACard>
        )}
      </AuroraScreen>
    );
  }

  // ── SUB-PAGE ── a focused category with a back button.
  if (active) {
    return (
      <AuroraScreen
        hero={{ rank: "title", title: active.title, accent: active.danger ? C.red : undefined }}
        back={() => motion(() => setCat(null))}
        backLabel={t("nav.settings")}
      >
        {renderBody(active.id)}
      </AuroraScreen>
    );
  }

  // ── LIST ── screen title, profile header, search, grouped category tiles.
  return (
    <AuroraScreen>
      <AHeading style={{ marginBottom: 16 }}>{t("w.account.settings.title")}</AHeading>
      {/* Profile header — tappable → Edit profile. The completeness reading is
          the kit's Ring AROUND the avatar (the ring the original comment wanted
          and couldn't draw before Ring existed — the linear bar it settled for
          restated the same figure a second time, one line under the % that
          already says it). A PERSON is a circle, so the avatar is one — the
          square tile was borrowing the THING radius (see AMarkTile's shape
          grammar). Shared completeness math with web. */}
      <View style={{ padding: 16, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card }}>
        <PressScale onPress={openEditProfile} accessibilityRole="button" accessibilityLabel={`${t("w.account.settings.edit-profile")} — ${name || t("w.account.settings.your-account")}, ${completeness.percent}%`} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <Ring value={completeness.percent} size={60} color={txt(C, C.lime) as string} track={C.line}>
            <View style={{ width: 44, height: 44, borderRadius: RADIUS.pill, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
              {profile?.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={{ width: "100%", height: "100%" }} />
              ) : (
                <LinearGradient colors={[C.lime, C.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: "100%", height: "100%", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.onAccent }}>{(name || acct.email || "?").slice(0, 1).toUpperCase()}</Text>
                </LinearGradient>
              )}
            </View>
          </Ring>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk }}>{name || t("w.account.settings.your-account")}</Text>
            <View style={{ marginTop: 3 }}><MetaLine text={`${completeness.percent}% · ${nudge}`} textStyle={{ fontFamily: F.mono, fontSize: fs.micro, color: completeness.complete ? (txt(C, C.lime) as string) : C.ash }} /></View>
          </View>
          <Chip color={entitlement === "paid" ? C.lime : C.ash} tone="outline">{entitlement === "paid" ? t("w.account.settings.full-paid") : t("w.account.settings.free")}</Chip>
        </PressScale>
        {/* Quick actions — the kit's compact pill (a button in a ROW), not a
            hand-rolled chip pair: same vocabulary as every other row action,
            and the 44dp target the chips were quietly under. */}
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: 16, flexWrap: "wrap" }}>
          <APill label={t("w.account.settings.edit-profile")} size="compact" variant="soft" onPress={openEditProfile} />
          {/* No mark. The text arrow that used to lead this label was a third drawing
              of share — after the recipe cover's SF Symbol and the finish
              summary's — standing beside a button that carries no mark at
              all, so it read as a stray arrow rather than an icon language.
              The label already says what the button does. */}
          {!!profile?.handle && (
            <APill label={t("w.account.settings.share-profile")} size="compact" variant="outline" onPress={() => void shareProfile()} />
          )}
        </View>
      </View>

      {/* Search */}
      <View style={{ marginTop: 20 }}>
        <ASearch value={query} onChange={(v: string) => motion(() => setQuery(v))} placeholder={t("w.account.settings.search")} />
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

/** A row that opens a FIELD SCREEN — the drill grammar one level below the
 *  category rows: a title (red when destructive) and the chevron, no icon
 *  tile. It exists so an input never has to sit open inside a list. */
function DrillRow({ title, onPress, danger, first }: { title: string; onPress: () => void; danger?: boolean; first?: boolean }) {
  const { palette: C } = useTheme();
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderTopColor: C.line }}
    >
      <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.bodyLg, color: danger ? (txt(C, C.red) as string) : C.chalk }}>{title}</Text>
      <AuroraIcon name="chevron-down" size={18} color={C.ash} style={{ transform: [{ rotate: "-90deg" }] }} />
    </PressScale>
  );
}

function Label({ children, color, top, tight }: { children: ReactNode; color: string; top?: boolean; tight?: boolean }) {
  const { palette: C } = useTheme();
  // The system's section-label voice (ty "overline"), not a hand-rolled copy of
  // it — one of the ~325 reassembled eyebrows the token layer exists to end.
  return (
    <Text style={[ty(C, "overline", color), { marginTop: tight ? 0 : top ? 18 : 14, marginBottom: 10 }]}>
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
      <Text style={[ty(C, "overline", tone), { marginLeft: 4, marginBottom: 10 }]}>{label}</Text>
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

