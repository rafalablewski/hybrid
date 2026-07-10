"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useSession } from "@/lib/session";
import { useClientPersonaChoice, setClientPersona } from "@/lib/persona";
import { useTheme } from "@/lib/use-theme";
import { useTemplate } from "@/lib/use-template";
import { ACCOUNT_NOTIF_DEFAULTS, ACCOUNT_PRIVACY_DEFAULTS, ACCOUNT_NOTIF_ROWS, ACCOUNT_PRIVACY_ROWS, SETTINGS_GROUPS, SETTINGS_CATEGORIES, matchSettings, type SettingsCategoryId, type AuroraIconName } from "@hybrid/core";
import { AuroraIcon } from "./aurora/icons";
import { useLang } from "@/lib/i18n";
import { useLoggerPrefs, setLoggerPref } from "@/lib/logger-prefs";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { fs, space, LINE, LIME, LIME_HEX, BLUE, VIOLET, AMBER, CHALK, ASH, RED, INK2, ON_ACCENT, disp, mono, Mono, Card, txt } from "@/lib/ui";
import MfaSettings from "./account/mfa";
import { SocialProfileEdit } from "./social-profile";
import { useIsMobile } from "@/lib/use-media-query";

type CoachStatus = "pending" | "approved" | "denied";

// Per-category accent — the icon-tile tint, mirroring mobile's TONE exactly so
// the two clients share the same hues. Uses LIME_HEX (raw hex) not LIME (a CSS
// var) so the `${accent}24` chip tint + txt(accent) icon colour resolve.
const TONE: Record<SettingsCategoryId, string> = {
  account: LIME_HEX, social: LIME_HEX, preferences: BLUE, logger: AMBER, notifications: VIOLET,
  privacy: BLUE, coaching: VIOLET, security: BLUE, subscription: LIME_HEX,
  data: ASH, danger: RED,
};

// Notification + privacy rows/defaults are shared in @hybrid/core so web +
// mobile render the same keys + copy (parity).
const NOTIF_DEFAULTS = ACCOUNT_NOTIF_DEFAULTS;
const PRIVACY_DEFAULTS = ACCOUNT_PRIVACY_DEFAULTS;
const LANGS: { id: "en" | "pl" | "de"; label: string }[] = [
  { id: "en", label: "EN" },
  { id: "pl", label: "PL" },
  { id: "de", label: "DE" },
];

export default function AccountSettings() {
  const isMobile = useIsMobile();
  const { logout, session, entitlement } = useSession();
  const personaChoice = useClientPersonaChoice() ?? "casual";
  const { theme, setTheme } = useTheme();
  const { template } = useTemplate();
  // Aurora rounds everything more. The Card surfaces already adapt via the
  // template skin; here we round the controls (inputs, buttons, choice cards)
  // to match, in place.
  const aurora = template === "aurora";
  const r = aurora ? 16 : 10;
  const rCard = aurora ? 16 : 12;
  const editInput = { ...mono, fontSize: fs.bodyLg, background: INK2, color: CHALK, border: `1px solid ${LINE}`, borderRadius: r, padding: "9px 12px", outline: "none" } as const;
  const editBtn = (c: string) => ({ ...mono, fontSize: fs.body, color: txt(c), background: `${c}1a`, border: `1px solid ${c}`, borderRadius: r, padding: "9px 16px", cursor: "pointer", whiteSpace: "nowrap" as const });
  const { lang, setLang, t } = useLang();
  const prefs = useLoggerPrefs();
  // Drill-in navigation: null = the category list; a category id = its sub-page.
  const [cat, setCat] = useState<SettingsCategoryId | null>(null);
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Profile editing — uses the user's OWN Supabase auth (no admin/backend route):
  // name lives in user_metadata, email/password are first-class auth fields.
  const authOn = isSupabaseConfigured();
  const [name, setName] = useState(session?.name ?? "");
  const [newEmail, setNewEmail] = useState("");
  const [newPw, setNewPw] = useState("");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);

  const runAuth = async (label: string, setMsgFn: (m: string | null) => void, op: () => Promise<{ error: { message: string } | null }>) => {
    if (!authOn) { setMsgFn(t("w.account.settings.auth-needed")); return; }
    setProfileBusy(true);
    setMsgFn(null);
    try {
      const { error } = await op();
      setMsgFn(error ? error.message : label);
    } catch {
      setMsgFn(t("w.account.settings.network-error"));
    }
    setProfileBusy(false);
  };
  const saveName = () => runAuth(`✓ ${t("w.account.settings.name-saved")}`, setProfileMsg, async () => createClient().auth.updateUser({ data: { name: name.trim() } }));
  const changeEmail = () =>
    runAuth(`✓ ${t("w.account.settings.email-check-inbox")}`, setProfileMsg, async () => createClient().auth.updateUser({ email: newEmail.trim() }));
  const changePassword = () =>
    runAuth(`✓ ${t("w.account.settings.password-updated")}`, setPasswordMsg, async () => createClient().auth.updateUser({ password: newPw }));
  const signOutEverywhere = async () => {
    if (authOn) await createClient().auth.signOut({ scope: "global" }).catch(() => {});
    void logout();
  };
  const exportData = () => { window.location.href = "/api/account/export"; };

  // Notification + privacy preferences live in Supabase auth user_metadata, so
  // they persist + sync across this user's devices (no extra table). updateUser
  // shallow-merges the provided keys, leaving name/entitlement/etc. intact.
  const [notif, setNotif] = useState<Record<string, boolean>>(NOTIF_DEFAULTS);
  const [priv, setPriv] = useState<Record<string, boolean>>(PRIVACY_DEFAULTS);
  useEffect(() => {
    if (!authOn) return;
    let live = true;
    createClient().auth.getUser().then(({ data }) => {
      if (!live || !data.user) return;
      const m = data.user.user_metadata ?? {};
      if (typeof m.name === "string") setName(m.name);
      setNotif({ ...NOTIF_DEFAULTS, ...(m.notifications ?? {}) });
      setPriv({ ...PRIVACY_DEFAULTS, ...(m.privacy ?? {}) });
    }).catch(() => {});
    return () => { live = false; };
  }, [authOn]);
  const toggleNotif = (k: string) => {
    const next = { ...notif, [k]: !notif[k] };
    setNotif(next);
    if (authOn) createClient().auth.updateUser({ data: { notifications: next } }).catch(() => {});
  };
  const togglePriv = (k: string) => {
    const next = { ...priv, [k]: !priv[k] };
    setPriv(next);
    if (authOn) createClient().auth.updateUser({ data: { privacy: next } }).catch(() => {});
  };

  // Mode toggle — Full (athlete) is a paid upgrade.
  const paid = entitlement === "paid";

  // Billing — checkout to upgrade, portal to manage an existing subscription.
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingMsg, setBillingMsg] = useState<string | null>(null);
  const [billingUnconfigured, setBillingUnconfigured] = useState(false);

  const upgrade = async () => {
    if (billingBusy) return;
    setBillingBusy(true);
    setBillingMsg(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { url?: string; configured?: boolean };
      if (res.status === 503 || j.configured === false) {
        setBillingUnconfigured(true);
        setBillingBusy(false);
        return;
      }
      if (res.ok && j.url) {
        window.location.href = j.url;
        return;
      }
      setBillingMsg(t("w.account.settings.checkout-failed"));
    } catch {
      setBillingMsg(t("w.account.settings.network-error"));
    }
    setBillingBusy(false);
  };

  const manageSubscription = async () => {
    if (billingBusy) return;
    setBillingBusy(true);
    setBillingMsg(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { url?: string; configured?: boolean };
      if (res.status === 503 || j.configured === false) {
        setBillingUnconfigured(true);
        setBillingBusy(false);
        return;
      }
      if (res.ok && j.url) {
        window.location.href = j.url;
        return;
      }
      const e = j as { error?: string };
      setBillingMsg(e.error ?? t("w.account.settings.portal-failed"));
    } catch {
      setBillingMsg(t("w.account.settings.network-error"));
    }
    setBillingBusy(false);
  };

  // Become a coach — a client applies; an admin approves it (→ COACH role).
  const isClient = session?.role === "client";
  const [credentials, setCredentials] = useState("");
  const [coachStatus, setCoachStatus] = useState<CoachStatus | null>(null);
  const [coachUnavailable, setCoachUnavailable] = useState(false);
  const [coachBusy, setCoachBusy] = useState(false);
  const [coachMsg, setCoachMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isClient) return;
    let live = true;
    fetch("/api/coach/apply")
      .then(async (r2) => {
        if (r2.status === 503) { if (live) setCoachUnavailable(true); return null; }
        return r2.ok ? r2.json() : null;
      })
      .then((d: { application?: { status?: CoachStatus } | null; unavailable?: boolean } | null) => {
        if (!live || !d) return;
        if (d.unavailable) { setCoachUnavailable(true); return; }
        if (d.application?.status) setCoachStatus(d.application.status);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [isClient]);

  const applyCoach = async () => {
    if (!credentials.trim() || coachBusy) return;
    setCoachBusy(true);
    setCoachMsg(null);
    try {
      const res = await fetch("/api/coach/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials: credentials.trim() }),
      });
      if (res.status === 503) { setCoachUnavailable(true); setCoachBusy(false); return; }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setCoachMsg(j.error ?? `${t("w.account.settings.failed")} (HTTP ${res.status})`);
        setCoachBusy(false);
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { application?: { status?: CoachStatus } };
      setCoachStatus(j.application?.status ?? "pending");
      setCredentials("");
    } catch {
      setCoachMsg(t("w.account.settings.network-error"));
    }
    setCoachBusy(false);
  };

  const armed = confirm.trim().toUpperCase() === "RESET";

  const reset = async () => {
    if (!armed) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/account/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "RESET" }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setMsg(j.error ?? `${t("w.account.settings.failed")} (HTTP ${res.status})`);
        setBusy(false);
        return;
      }
      // Wiped — drop all client state by reloading into the now-empty account.
      window.location.assign("/app");
    } catch {
      setMsg(t("w.account.settings.network-error"));
      setBusy(false);
    }
  };

  // The expand body for each category. Closures over the handlers above.
  const renderBody = (id: SettingsCategoryId): ReactNode => {
    switch (id) {
      case "account":
        return (
          <>
            <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 6 }} c={ASH}>{t("w.account.settings.display-name")}</Mono>
            <div style={{ display: "flex", gap: space.sm }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("w.account.settings.your-name-ph")} style={{ ...editInput, flex: 1 }} />
              <button onClick={saveName} disabled={profileBusy} style={editBtn(LIME)}>{t("w.account.settings.save")}</button>
            </div>
            <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 14, marginBottom: 6 }} c={ASH}>{t("w.account.settings.change-email")}</Mono>
            <div style={{ display: "flex", gap: space.sm }}>
              <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={session?.email ?? "new@email.com"} type="email" style={{ ...editInput, flex: 1 }} />
              <button onClick={changeEmail} disabled={profileBusy || !newEmail.trim()} style={editBtn(ASH)}>{t("w.account.settings.update")}</button>
            </div>
            {profileMsg && <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 10 }} c={profileMsg.startsWith("✓") ? LIME : ASH}>{profileMsg}</Mono>}
            {!authOn && <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 8 }} c={ASH}>{t("w.account.settings.profile-needs-account")}</Mono>}
          </>
        );
      case "social":
        return <SocialProfileEdit />;
      case "preferences":
        return (
          <>
            <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 6 }} c={ASH}>{t("w.account.settings.appearance")}</Mono>
            <div style={{ display: "flex", gap: space.sm }}>
              {(["dark", "light"] as const).map((m) => (
                <button key={m} onClick={() => setTheme(m)} title={m === "dark" ? t("w.account.settings.theme-dark") : t("w.account.settings.theme-light")} style={{ ...mono, fontSize: fs.body, padding: "8px 16px", borderRadius: r, cursor: "pointer", color: theme === m ? txt(LIME) : txt(ASH), background: theme === m ? `color-mix(in srgb, var(--color-lime) 10%, transparent)` : "transparent", border: `1px solid ${theme === m ? LIME : LINE}` }}>
                  {m === "dark" ? "Aurora" : "Japandi"}
                </button>
              ))}
            </div>
            <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 16, marginBottom: 6 }} c={ASH}>{t("w.account.settings.language")}</Mono>
            <div style={{ display: "flex", gap: space.sm }}>
              {LANGS.map((l) => (
                <button key={l.id} onClick={() => setLang(l.id)} style={{ ...mono, fontSize: fs.body, padding: "8px 16px", borderRadius: r, cursor: "pointer", color: lang === l.id ? txt(LIME) : txt(ASH), background: lang === l.id ? `color-mix(in srgb, var(--color-lime) 10%, transparent)` : "transparent", border: `1px solid ${lang === l.id ? LIME : LINE}` }}>
                  {l.label}
                </button>
              ))}
            </div>
          </>
        );
      case "logger":
        return (
          <>
            <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 6 }} c={ASH}>{t("w.account.settings.workout-logger")}</Mono>
            <button onClick={() => setLoggerPref("detailed", !prefs.detailed)} style={{ ...mono, fontSize: fs.body, padding: "8px 16px", borderRadius: r, cursor: "pointer", color: txt(CHALK), background: "transparent", border: `1px solid ${LINE}` }}>
              {prefs.detailed ? t("w.account.settings.logger-detailed") : t("w.account.settings.logger-simple")}
            </button>
            <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 16, marginBottom: 6 }} c={ASH}>{t("w.account.settings.units")}</Mono>
            <div style={{ display: "flex", gap: space.sm }}>
              {(["kg", "lb"] as const).map((u) => (
                <button key={u} onClick={() => setLoggerPref("units", u)} style={{ ...mono, fontSize: fs.body, padding: "8px 16px", borderRadius: r, cursor: "pointer", textTransform: "uppercase", color: prefs.units === u ? txt(LIME) : txt(ASH), background: prefs.units === u ? `color-mix(in srgb, var(--color-lime) 10%, transparent)` : "transparent", border: `1px solid ${prefs.units === u ? LIME : LINE}` }}>
                  {u}
                </button>
              ))}
            </div>
            <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 16, marginBottom: 6 }} c={ASH}>{t("w.account.settings.volume-counting")}</Mono>
            <button onClick={() => setLoggerPref("countWarmupsInVolume", !prefs.countWarmupsInVolume)} style={{ ...mono, fontSize: fs.body, padding: "8px 16px", borderRadius: r, cursor: "pointer", color: txt(prefs.countWarmupsInVolume ? LIME : CHALK), background: prefs.countWarmupsInVolume ? `color-mix(in srgb, var(--color-lime) 10%, transparent)` : "transparent", border: `1px solid ${prefs.countWarmupsInVolume ? LIME : LINE}` }}>
              {prefs.countWarmupsInVolume ? t("w.account.settings.warmups-count") : t("w.account.settings.warmups-excluded")}
            </button>
            <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 8 }} c={ASH}>{t("w.account.settings.volume-counting-help")}</Mono>
            <button onClick={() => setLoggerPref("fractionalVolume", !prefs.fractionalVolume)} style={{ ...mono, fontSize: fs.body, padding: "8px 16px", borderRadius: r, cursor: "pointer", marginTop: 12, color: txt(prefs.fractionalVolume ? LIME : CHALK), background: prefs.fractionalVolume ? `color-mix(in srgb, var(--color-lime) 10%, transparent)` : "transparent", border: `1px solid ${prefs.fractionalVolume ? LIME : LINE}` }}>
              {prefs.fractionalVolume ? t("w.account.settings.fractional-on") : t("w.account.settings.fractional-off")}
            </button>
            <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 8 }} c={ASH}>{t("w.account.settings.fractional-help")}</Mono>
          </>
        );
      case "notifications":
        return (
          <>
            <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 6 }} c={ASH}>{t("w.account.settings.notifications-desc")}</Mono>
            <div>
              {ACCOUNT_NOTIF_ROWS.map(({ key, title, desc }) => (
                <PrefRow key={key} title={title} desc={desc} on={!!notif[key]} onToggle={() => toggleNotif(key)} disabled={!authOn} />
              ))}
            </div>
            {!authOn && <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 10 }} c={ASH}>{t("w.account.settings.signin-to-change")}</Mono>}
          </>
        );
      case "privacy":
        return (
          <>
            <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 6 }} c={ASH}>{t("w.account.settings.privacy-desc")}</Mono>
            <div>
              {ACCOUNT_PRIVACY_ROWS.map(({ key, title, desc }) => (
                <PrefRow key={key} title={title} desc={desc} on={!!priv[key]} onToggle={() => togglePriv(key)} disabled={!authOn} />
              ))}
            </div>
            {!authOn && <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 10 }} c={ASH}>{t("w.account.settings.signin-to-change")}</Mono>}
          </>
        );
      case "coaching":
        return (
          <>
            {isClient && (
              <div style={{ marginBottom: 16 }}>
                <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", display: "block" }} c={ASH}>{t("w.account.settings.become-coach")}</Mono>
                {coachUnavailable ? (
                  <Mono s={{ fontSize: fs.body, display: "block", marginTop: 8 }} c={ASH}>{t("w.account.settings.coach-not-enabled")}</Mono>
                ) : coachStatus ? (
                  <Mono s={{ fontSize: fs.body, display: "block", marginTop: 8 }} c={CHALK}>
                    {t("w.account.settings.application-is")} <b style={{ color: txt(coachStatus === "approved" ? LIME : coachStatus === "denied" ? RED : ASH) }}>{coachStatus}</b>.
                  </Mono>
                ) : (
                  <>
                    <Mono s={{ fontSize: fs.body, display: "block", marginTop: 8 }} c={CHALK}>{t("w.account.settings.coach-intro")}</Mono>
                    <textarea value={credentials} onChange={(e) => setCredentials(e.target.value)} placeholder={t("w.account.settings.coach-credentials-ph")} rows={3} style={{ ...mono, fontSize: fs.body, width: "100%", marginTop: 10, padding: "10px 12px", borderRadius: r, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none", resize: "vertical" }} />
                    {coachMsg && <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 8 }} c={RED}>{coachMsg}</Mono>}
                    <button onClick={applyCoach} disabled={!credentials.trim() || coachBusy} style={{ ...disp, fontWeight: 800, fontSize: fs.bodyLg, color: txt(LIME), background: `color-mix(in srgb, var(--color-lime) 10%, transparent)`, border: `1px solid ${LIME}`, borderRadius: r, padding: "10px 18px", marginTop: 12, cursor: !credentials.trim() || coachBusy ? "not-allowed" : "pointer", opacity: !credentials.trim() || coachBusy ? 0.6 : 1 }}>
                      {coachBusy ? t("w.account.settings.applying") : t("w.account.settings.apply")}
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        );
      case "security":
        return (
          <>
            <MfaSettings />
            <div style={{ marginTop: 16 }}>
              <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", display: "block" }} c={ASH}>{t("w.account.settings.change-password")}</Mono>
              {session?.provider && session.provider !== "email" ? (
                <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block", marginTop: 8 }} c={CHALK}>
                  {t("w.account.settings.signin-with")} {session.provider} {t("w.account.settings.manage-password-there")}
                </Mono>
              ) : (
                <div style={{ display: "flex", gap: space.sm, marginTop: 12 }}>
                  <input value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder={t("w.account.settings.new-password-ph")} type="password" style={{ ...editInput, flex: 1 }} />
                  <button onClick={changePassword} disabled={profileBusy || newPw.length < 8} style={editBtn(LIME)}>{t("w.account.settings.update")}</button>
                </div>
              )}
              {passwordMsg && <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 10 }} c={passwordMsg.startsWith("✓") ? LIME : ASH}>{passwordMsg}</Mono>}
            </div>
            <div style={{ marginTop: 16 }}>
              <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", display: "block" }} c={ASH}>{t("w.account.settings.active-sessions")}</Mono>
              <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block", marginTop: 8 }} c={CHALK}>{t("w.account.settings.active-sessions-desc")}</Mono>
              <button onClick={signOutEverywhere} style={{ ...editBtn(ASH), marginTop: 12 }}>{t("w.account.settings.sign-out-everywhere")}</button>
            </div>
          </>
        );
      case "subscription":
        return isClient ? (
          <>
            <Mono s={{ fontSize: fs.body, display: "block" }} c={CHALK}>{t("w.account.settings.mode-desc")}</Mono>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: space.sm, marginTop: 12 }}>
              <button onClick={() => setClientPersona("casual")} style={{ textAlign: "left", cursor: "pointer", borderRadius: rCard, padding: 12, border: `1px solid ${personaChoice === "casual" ? LIME : LINE}`, background: personaChoice === "casual" ? `color-mix(in srgb, var(--color-lime) 8%, transparent)` : "transparent" }}>
                <div style={{ ...disp, fontWeight: 700, fontSize: fs.note, color: txt(personaChoice === "casual" ? LIME : CHALK) }}>{t("w.account.settings.simple")}</div>
                <Mono s={{ fontSize: fs.micro }}>{t("w.account.settings.simple-tags")}</Mono>
              </button>
              <button onClick={() => (paid ? setClientPersona("athlete") : undefined)} aria-disabled={!paid} style={{ textAlign: "left", cursor: paid ? "pointer" : "default", borderRadius: rCard, padding: 12, border: `1px solid ${paid && personaChoice === "athlete" ? LIME : LINE}`, background: paid && personaChoice === "athlete" ? `color-mix(in srgb, var(--color-lime) 8%, transparent)` : "transparent", opacity: paid ? 1 : 0.7 }}>
                <div style={{ ...disp, fontWeight: 700, fontSize: fs.note, display: "flex", alignItems: "center", gap: space.xs, color: txt(paid && personaChoice === "athlete" ? LIME : CHALK) }}>
                  {t("w.account.settings.full")}
                  {!paid && (
                    <>
                      <span>🔒</span>
                      <span style={{ ...mono, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: txt(LIME), background: `color-mix(in srgb, var(--color-lime) 10%, transparent)`, border: `1px solid ${LIME}`, borderRadius: 6, padding: "1px 6px" }}>{t("w.account.settings.paid")}</span>
                    </>
                  )}
                </div>
                <Mono s={{ fontSize: fs.micro }}>{t("w.account.settings.full-tags")}</Mono>
              </button>
            </div>
            {!paid ? (
              <>
                <button onClick={upgrade} disabled={billingBusy} style={{ ...disp, fontWeight: 800, fontSize: fs.bodyLg, color: txt(LIME), background: `color-mix(in srgb, var(--color-lime) 10%, transparent)`, border: `1px solid ${LIME}`, borderRadius: r, padding: "10px 18px", marginTop: 14, cursor: billingBusy ? "not-allowed" : "pointer", opacity: billingBusy ? 0.6 : 1 }}>
                  {billingBusy ? t("w.account.settings.starting") : t("w.account.settings.upgrade-full")}
                </button>
                <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 10, lineHeight: 1.5 }} c={ASH}>
                  {billingUnconfigured ? t("w.account.settings.billing-unconfigured") : t("w.account.settings.unlocks")}
                </Mono>
                {billingMsg && <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 8 }} c={RED}>{billingMsg}</Mono>}
              </>
            ) : (
              <>
                <button onClick={manageSubscription} disabled={billingBusy} style={{ ...disp, fontWeight: 800, fontSize: fs.bodyLg, color: txt(CHALK), background: "transparent", border: `1px solid ${LINE}`, borderRadius: r, padding: "10px 18px", marginTop: 14, cursor: billingBusy ? "not-allowed" : "pointer", opacity: billingBusy ? 0.6 : 1 }}>
                  {billingBusy ? t("w.account.settings.opening") : t("w.account.settings.manage-subscription")}
                </button>
                {billingUnconfigured && <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 10, lineHeight: 1.5 }} c={ASH}>{t("w.account.settings.billing-unconfigured")}</Mono>}
                {billingMsg && <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 8 }} c={RED}>{billingMsg}</Mono>}
              </>
            )}
          </>
        ) : (
          <Mono s={{ fontSize: fs.body, display: "block", lineHeight: 1.6 }} c={CHALK}>
            {paid ? t("w.account.settings.full-paid") : t("w.account.settings.free")} — {t("w.account.settings.mode-desc")}
          </Mono>
        );
      case "data":
        return (
          <>
            <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block" }} c={CHALK}>{t("w.account.settings.export-data-desc")}</Mono>
            <button onClick={exportData} style={{ ...editBtn(LIME), marginTop: 12 }}>{t("w.account.settings.download-data")}</button>
          </>
        );
      case "danger":
        return (
          <div style={{ borderLeft: `3px solid ${RED}`, paddingLeft: 14 }}>
            <div style={{ ...disp, fontWeight: 700, fontSize: fs.title }}>{t("w.account.settings.erase-all")}</div>
            <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block", marginTop: 6 }} c={CHALK}>
              {t("w.account.settings.erase-warning")} <b style={{ color: txt(RED) }}>{t("w.account.settings.cannot-undo")}</b>
            </Mono>
            <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 16, marginBottom: 6 }} c={ASH}>
              {t("w.account.settings.type")} <b style={{ color: CHALK }}>RESET</b> {t("w.account.settings.to-confirm")}
            </Mono>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="RESET" autoCapitalize="characters" style={{ ...mono, fontSize: fs.note, width: "100%", maxWidth: 240, padding: "10px 12px", borderRadius: r, background: INK2, color: CHALK, border: `1px solid ${armed ? RED : LINE}`, outline: "none" }} />
            {msg && <div role="alert"><Mono s={{ fontSize: fs.caption, display: "block", marginTop: 10 }} c={RED}>{msg}</Mono></div>}
            <div style={{ display: "flex", gap: space.ms, marginTop: 16, alignItems: "center" }}>
              <button onClick={reset} disabled={!armed || busy} style={{ ...disp, fontWeight: 800, fontSize: fs.bodyLg, color: "#fff", background: armed && !busy ? RED : `${RED}55`, border: "none", borderRadius: r, padding: "11px 18px", cursor: armed && !busy ? "pointer" : "not-allowed" }}>
                {busy ? t("w.account.settings.erasing") : t("w.account.settings.erase-everything")}
              </button>
              <button onClick={() => void logout()} style={{ ...mono, fontSize: fs.body, color: txt(ASH), background: "none", border: "none", cursor: "pointer" }}>
                {t("w.account.settings.sign-out-instead")}
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  // A short current-value summary shown on the right of each category row
  // (Apple-style), so the value is visible without drilling in.
  const summary = (id: SettingsCategoryId): string => {
    switch (id) {
      case "account": return session?.name ?? "";
      case "preferences": return `${theme === "light" ? "Japandi" : "Aurora"} · ${lang.toUpperCase()} · ${prefs.units}`;
      case "logger": return prefs.detailed ? t("w.account.settings.logger-detailed") : t("w.account.settings.logger-simple");
      case "notifications": return `${Object.values(notif).filter(Boolean).length}/${Object.keys(notif).length}`;
      case "privacy": return `${Object.values(priv).filter(Boolean).length}/${Object.keys(priv).length}`;
      case "subscription": return paid ? t("w.account.settings.full-paid") : t("w.account.settings.free");
      case "security": return session?.provider ?? "";
      default: return "";
    }
  };
  const results = matchSettings(query);
  const active = cat ? SETTINGS_CATEGORIES[cat] : null;

  return (
    <div style={{ maxWidth: 640 }}>
      {active ? (
        /* ── SUB-PAGE ── a focused category with a back button. */
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <button onClick={() => setCat(null)} aria-label={t("w.account.settings.back")} style={{ width: 40, height: 40, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", background: INK2, border: `1px solid ${LINE}`, cursor: "pointer", color: CHALK }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <h2 style={{ ...disp, fontWeight: 900, fontSize: fs.title, margin: 0, color: active.danger ? txt(RED) : CHALK }}>{active.title}</h2>
          </div>
          <Card>{renderBody(cat!)}</Card>
        </>
      ) : (
        /* ── LIST ── search + grouped category rows. */
        <>
          <h2 style={{ ...disp, fontWeight: 900, fontSize: fs.display, marginBottom: 16 }}>{t("w.account.settings.title")}</h2>

          {/* Profile header — shared anatomy with mobile: a bordered row card with a
              rounded-square lime-gradient initial avatar, name + email, role/provider
              pills under the name, and the membership FREE/FULL pill pinned right. */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, padding: 16, background: INK2, border: `1px solid ${LINE}`, borderRadius: 20 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", ...disp, fontWeight: 800, fontSize: 22, color: ON_ACCENT, background: `linear-gradient(135deg, ${LIME}, #9bd400)` }}>
              {(session?.name || session?.email || "?").slice(0, 1).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: fs.title, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{session?.name || t("w.account.settings.your-account")}</div>
              <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} c={CHALK}>{session?.email}</Mono>
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <span style={{ ...mono, fontSize: fs.nano, letterSpacing: ".5px", textTransform: "uppercase", color: txt(VIOLET), background: `${VIOLET}1a`, border: `1px solid ${VIOLET}66`, borderRadius: 999, padding: "4px 12px" }}>{session?.role ?? "client"}</span>
                {session?.provider && <span style={{ ...mono, fontSize: fs.nano, letterSpacing: ".5px", color: txt(ASH), background: `${ASH}1a`, border: `1px solid ${ASH}66`, borderRadius: 999, padding: "4px 12px" }}>{t("w.account.settings.via")} {session.provider}</span>}
              </div>
            </div>
            <span style={{ ...mono, fontSize: fs.nano, letterSpacing: ".5px", flex: "none", color: txt(paid ? LIME_HEX : ASH), background: `${paid ? LIME_HEX : ASH}1a`, border: `1px solid ${paid ? LIME_HEX : ASH}66`, borderRadius: 999, padding: "4px 12px" }}>{paid ? t("w.account.settings.full-paid") : t("w.account.settings.free")}</span>
          </div>

          {/* Search */}
          <div style={{ position: "relative", marginBottom: 20 }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: ASH, display: "flex", pointerEvents: "none" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
            </span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("w.account.settings.search")} aria-label={t("w.account.settings.search")} style={{ ...mono, width: "100%", boxSizing: "border-box", fontSize: fs.body, background: INK2, color: CHALK, border: `1px solid ${LINE}`, borderRadius: 999, padding: "11px 16px 11px 38px", outline: "none" }} />
          </div>

          {query ? (
            results.length === 0 ? (
              <Card><Mono s={{ display: "block" }} c={ASH}>{t("w.account.settings.no-results")}</Mono></Card>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
                {results.map((c, i) => (
                  <Tile key={c.id} icon={c.icon} accent={TONE[c.id]} title={c.title} subtitle={summary(c.id) || c.subtitle} danger={c.danger} wide={results.length % 2 === 1 && i === results.length - 1} onOpen={() => { setCat(c.id); setQuery(""); }} />
                ))}
              </div>
            )
          ) : (
            SETTINGS_GROUPS.map((group) => (
              <div key={group.id} style={{ marginBottom: 22 }}>
                <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 8, marginLeft: 4 }} c={ASH}>{group.label}</Mono>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
                  {group.categories.map((c, i) => (
                    <Tile key={c.id} icon={c.icon} accent={TONE[c.id]} title={c.title} subtitle={summary(c.id) || c.subtitle} danger={c.danger} wide={group.categories.length % 2 === 1 && i === group.categories.length - 1} onOpen={() => setCat(c.id)} />
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}

/** A bento settings tile: tinted icon chip + title + one-line value/subtitle. A
 *  group with an odd number of categories gets a full-width `wide` trailing tile
 *  (icon left, text, chevron) so the grid never leaves a lonely half-tile. */
function Tile({ icon, accent, title, subtitle, danger, wide, onOpen }: {
  icon: AuroraIconName;
  accent: string;
  title: string;
  subtitle: string;
  danger?: boolean;
  wide?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      style={{
        gridColumn: wide ? "span 2" : "auto",
        display: "flex",
        flexDirection: wide ? "row" : "column",
        alignItems: wide ? "center" : "stretch",
        justifyContent: wide ? "flex-start" : "space-between",
        gap: wide ? 14 : 0,
        minHeight: wide ? 0 : 118,
        width: "100%",
        textAlign: "left",
        background: INK2,
        border: `1px solid ${danger ? `color-mix(in srgb, ${RED} 28%, transparent)` : LINE}`,
        borderRadius: 20,
        padding: 16,
        cursor: "pointer",
        color: CHALK,
      }}
    >
      <span style={{ width: 40, height: 40, borderRadius: 13, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: `color-mix(in srgb, ${danger ? RED : accent} 14%, transparent)`, color: danger ? txt(RED) : txt(accent) }}>
        <AuroraIcon name={icon} size={20} color="currentColor" strokeWidth={4} />
      </span>
      <span style={{ flex: wide ? 1 : "none", minWidth: 0 }}>
        <span style={{ ...disp, fontWeight: 700, fontSize: fs.bodyLg, color: danger ? txt(RED) : CHALK, display: "block" }}>{title}</span>
        <span style={{ ...mono, fontSize: fs.micro, color: txt(ASH), display: "block", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</span>
      </span>
      {wide ? (
        <span style={{ color: txt(ASH), flex: "none", display: "flex" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </span>
      ) : null}
    </button>
  );
}

/** A labelled preference row with an on/off pill — used by Notifications + Privacy. */
function PrefRow({ title, desc, on, onToggle, disabled }: { title: string; desc: string; on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 0", borderTop: `1px solid ${LINE}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ ...disp, fontWeight: 700, fontSize: fs.bodyLg }}>{title}</div>
        <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 2 }} c={ASH}>{desc}</Mono>
      </div>
      <button
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={on}
        style={{ flex: "none", width: 46, height: 26, borderRadius: 999, border: `1px solid ${on ? LIME : LINE}`, background: on ? LIME : "transparent", position: "relative", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, transition: "0.15s" }}
      >
        <span style={{ position: "absolute", top: 2, left: on ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: on ? ON_ACCENT : ASH, transition: "0.15s" }} />
      </button>
    </div>
  );
}
