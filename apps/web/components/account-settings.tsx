"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useSession } from "@/lib/session";
import { useClientPersonaChoice, setClientPersona } from "@/lib/persona";
import { useTheme } from "@/lib/use-theme";
import { useTemplate } from "@/lib/use-template";
import { ACCOUNT_NOTIF_DEFAULTS, ACCOUNT_PRIVACY_DEFAULTS, ACCOUNT_NOTIF_ROWS, ACCOUNT_PRIVACY_ROWS, SETTINGS_GROUPS, SETTINGS_CATEGORIES, matchSettings, passwordStrength, profileCompleteness, FULL_BENEFITS, REST_SECONDS_CHOICES, type SettingsCategoryId, type AuroraIconName } from "@hybrid/core";
import { AuroraIcon } from "./aurora/icons";
import { MetaLine } from "./aurora/meta";
import { useLang } from "@/lib/i18n";
import { useLoggerPrefs, setLoggerPref } from "@/lib/logger-prefs";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { fs, space, LINE, LIME, LIME_HEX, BLUE, AMBER, CHALK, ASH, RED, INK2, ON_ACCENT, disp, mono, Mono, Card, txt } from "@/lib/ui";
import MfaSettings from "./account/mfa";
import { SocialProfileEdit } from "./social-profile";
import { useIsMobile } from "@/lib/use-media-query";

type CoachStatus = "pending" | "approved" | "denied";

// Per-category icon-tile tint, mirroring mobile's TONE exactly so the two
// clients share the same hues. Unified to a single neutral (ASH) so the list
// reads as one system instead of a rainbow — the hue no longer encodes anything
// (category order already does). RED is kept ONLY for the destructive `danger`
// section, where it is a real semantic warning (matches the delete/RESET flow).
// Raw hex (not a CSS var) so the `${accent}24` chip tint + txt(accent) resolve.
const TONE: Record<SettingsCategoryId, string> = {
  account: ASH, preferences: ASH, logger: ASH, notifications: ASH,
  privacy: ASH, coaching: ASH, security: ASH, subscription: ASH,
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
// Theme picker swatches — a mini colour preview per template, shared shape with
// mobile so the two Preferences screens read the same. Aurora = dark/lime,
// Kyoto Hour = washi-light/pine.
const THEME_SWATCHES: { id: "dark" | "light"; label: string; colors: [string, string, string] }[] = [
  { id: "dark", label: "Aurora", colors: ["#0c0d0c", "#c6f84f", "#8b8f86"] },
  { id: "light", label: "Kyoto Hour", colors: ["#f6f3ea", "#44584c", "#a3442f"] },
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
  const editInput = { ...mono, fontSize: fs.bodyLg, background: INK2, color: CHALK, border: `1px solid ${LINE}`, borderRadius: r, padding: "8px 12px", outline: "none" } as const;
  const editBtn = (c: string) => ({ ...mono, fontSize: fs.body, color: txt(c), background: `${c}1a`, border: `1px solid ${c}`, borderRadius: r, padding: "8px 16px", cursor: "pointer", whiteSpace: "nowrap" as const });
  const { lang, setLang, t } = useLang();
  const prefs = useLoggerPrefs();
  // Drill-in navigation: null = the category list; a category id = its sub-page.
  const [cat, setCat] = useState<SettingsCategoryId | null>(null);
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [delConfirm, setDelConfirm] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delMsg, setDelMsg] = useState<string | null>(null);
  // Public profile — loaded for the header completeness ring + Share action.
  const [socialProfile, setSocialProfile] = useState<{ handle?: string; displayName?: string | null; bio?: string | null; avatarUrl?: string | null } | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/social/profile").then((r) => (r.ok ? r.json() : null)).then((d: { profile?: typeof socialProfile }) => { if (live && d?.profile) setSocialProfile(d.profile); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const shareProfile = async () => {
    const h = socialProfile?.handle;
    if (!h) return;
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/@${h}`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) { await navigator.share({ title: "HYBRID", text: `Follow @${h} on HYBRID`, url }); }
      else { await navigator.clipboard.writeText(url); setShareMsg(`✓ ${t("w.account.settings.share-profile")}: @${h}`); setTimeout(() => setShareMsg(null), 1800); }
    } catch { /* user dismissed the share sheet */ }
  };

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

  const armedDelete = delConfirm.trim().toUpperCase() === "DELETE";

  const del = async () => {
    if (!armedDelete) return;
    setDelBusy(true);
    setDelMsg(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setDelMsg(j.error ?? `${t("w.account.settings.failed")} (HTTP ${res.status})`);
        setDelBusy(false);
        return;
      }
      // Account (incl. login) is gone — sign the dead session out and leave.
      if (authOn) await createClient().auth.signOut().catch(() => {});
      window.location.assign("/login");
    } catch {
      setDelMsg(t("w.account.settings.network-error"));
      setDelBusy(false);
    }
  };

  // The expand body for each category. Closures over the handlers above.
  const renderBody = (id: SettingsCategoryId): ReactNode => {
    switch (id) {
      case "account":
        // Unified Edit-profile screen: a live preview, avatar + presets, then a
        // tap-a-row list (name, username, bio, email, visibility) — each row
        // opens a focused field editor. One surface; the old separate "Public
        // profile" category is gone. name/email persist via Supabase auth (passed
        // in), the rest via the social API.
        return (
          <>
            <SocialProfileEdit
              embedded
              account={{ name, setName, saveName, email: session?.email, newEmail, setNewEmail, changeEmail, busy: profileBusy, msg: profileMsg }}
              onProfileUpdate={(p) => setSocialProfile(p)}
            />
            {!authOn && <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 10 }} c={ASH}>{t("w.account.settings.profile-needs-account")}</Mono>}
          </>
        );
      case "preferences":
        return (
          <>
            <Section label={t("w.account.settings.appearance")}>
              <div style={{ display: "flex", gap: space.sm }}>
                {THEME_SWATCHES.map((s) => (
                  <button key={s.id} onClick={() => setTheme(s.id)} className="pressable" title={s.id === "dark" ? t("w.account.settings.theme-dark") : t("w.account.settings.theme-light")} style={{ flex: 1, textAlign: "left", padding: 12, borderRadius: rCard, cursor: "pointer", background: theme === s.id ? `color-mix(in srgb, var(--color-lime) 8%, transparent)` : "transparent", border: `1px solid ${theme === s.id ? LIME : LINE}` }}>
                    <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                      {s.colors.map((c, i) => <span key={i} style={{ width: 18, height: 18, borderRadius: 6, background: c, border: `1px solid ${LINE}` }} />)}
                    </div>
                    <div style={{ ...disp, fontWeight: 700, fontSize: fs.note, color: theme === s.id ? txt(LIME) : txt(CHALK) }}>{s.label}</div>
                  </button>
                ))}
              </div>
            </Section>
            <Section label={t("w.account.settings.language")}>
              <div style={{ display: "flex", gap: space.sm }}>
                {LANGS.map((l) => (
                  <button key={l.id} onClick={() => setLang(l.id)} className="pressable" style={{ ...mono, fontSize: fs.body, padding: "8px 16px", borderRadius: r, cursor: "pointer", color: lang === l.id ? txt(LIME) : txt(ASH), background: lang === l.id ? `color-mix(in srgb, var(--color-lime) 10%, transparent)` : "transparent", border: `1px solid ${lang === l.id ? LIME : LINE}` }}>
                    {l.label}
                  </button>
                ))}
              </div>
            </Section>
          </>
        );
      case "logger":
        return (
          <>
            <Section label={t("w.account.settings.workout-logger")}>
              <PrefRow first title={t("w.account.settings.logger-detailed-t")} desc={t("w.account.settings.logger-detailed-help")} on={prefs.detailed} onToggle={() => setLoggerPref("detailed", !prefs.detailed)} />
              <PrefRow title={t("loggerPrefs.velocity")} desc={t("loggerPrefs.velocityDesc")} on={prefs.velocity} onToggle={() => setLoggerPref("velocity", !prefs.velocity)} />
              <PrefRow title={t("w.account.settings.logger-warmups-t")} desc={t("w.account.settings.volume-counting-help")} on={prefs.countWarmupsInVolume} onToggle={() => setLoggerPref("countWarmupsInVolume", !prefs.countWarmupsInVolume)} />
              <PrefRow title={t("w.account.settings.logger-fractional-t")} desc={t("w.account.settings.fractional-help")} on={prefs.fractionalVolume} onToggle={() => setLoggerPref("fractionalVolume", !prefs.fractionalVolume)} />
              <PrefRow title={t("loggerPrefs.plateCalc")} desc={t("loggerPrefs.plateCalcDesc")} on={prefs.plateCalc} onToggle={() => setLoggerPref("plateCalc", !prefs.plateCalc)} />
              <PrefRow title={t("loggerPrefs.autoAdvance")} desc={t("loggerPrefs.autoAdvanceDesc")} on={prefs.autoAdvance} onToggle={() => setLoggerPref("autoAdvance", !prefs.autoAdvance)} />
              <PrefRow title={t("loggerPrefs.rpeAsRir")} desc={t("loggerPrefs.rpeAsRirDesc")} on={prefs.rpeAsRir} onToggle={() => setLoggerPref("rpeAsRir", !prefs.rpeAsRir)} />
              <PrefRow title={t("loggerPrefs.countIn")} desc={t("loggerPrefs.countInDesc")} on={prefs.countIn} onToggle={() => setLoggerPref("countIn", !prefs.countIn)} />
              <PrefRow title={t("loggerPrefs.restTimer")} desc={t("loggerPrefs.restTimerDesc")} on={prefs.restTimer} onToggle={() => setLoggerPref("restTimer", !prefs.restTimer)} />
              <PrefRow title={t("loggerPrefs.carryOver")} desc={t("loggerPrefs.carryOverDesc")} on={prefs.carryOver} onToggle={() => setLoggerPref("carryOver", !prefs.carryOver)} />
              <PrefRow title={t("loggerPrefs.keepAwake")} desc={t("loggerPrefs.keepAwakeDesc")} on={prefs.keepAwake} onToggle={() => setLoggerPref("keepAwake", !prefs.keepAwake)} />
              <PrefRow title={t("loggerPrefs.haptics")} desc={t("loggerPrefs.hapticsDesc")} on={prefs.haptics} onToggle={() => setLoggerPref("haptics", !prefs.haptics)} />
              {/* The read is phone-only (a health store is native), but the
                  switch belongs on both clients — see components/device-import. */}
              <PrefRow title={t("device.import.autoTitle")} desc={t("device.import.autoDesc")} on={prefs.deviceAutoImport} onToggle={() => setLoggerPref("deviceAutoImport", !prefs.deviceAutoImport)} />
            </Section>
            {prefs.restTimer && (
              <Section label={t("loggerPrefs.restDefault")}>
                <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
                  {REST_SECONDS_CHOICES.map((sec) => (
                    <button key={sec} onClick={() => setLoggerPref("restSeconds", sec)} style={{ ...mono, fontSize: fs.body, padding: "8px 16px", borderRadius: r, cursor: "pointer", color: prefs.restSeconds === sec ? txt(LIME) : txt(ASH), background: prefs.restSeconds === sec ? `color-mix(in srgb, var(--color-lime) 10%, transparent)` : "transparent", border: `1px solid ${prefs.restSeconds === sec ? LIME : LINE}` }}>
                      {sec}s
                    </button>
                  ))}
                </div>
              </Section>
            )}
            <Section label={t("w.account.settings.units")}>
              <div style={{ display: "flex", gap: space.sm }}>
                {(["kg", "lb"] as const).map((u) => (
                  <button key={u} onClick={() => setLoggerPref("units", u)} style={{ ...mono, fontSize: fs.body, padding: "8px 16px", borderRadius: r, cursor: "pointer", textTransform: "uppercase", color: prefs.units === u ? txt(LIME) : txt(ASH), background: prefs.units === u ? `color-mix(in srgb, var(--color-lime) 10%, transparent)` : "transparent", border: `1px solid ${prefs.units === u ? LIME : LINE}` }}>
                    {u}
                  </button>
                ))}
              </div>
            </Section>
            <Section label={t("loggerPrefs.quickIncrement")}>
              <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
                {(prefs.units === "lb" ? [0, 5, 10] : [0, 2.5, 5]).map((inc) => (
                  <button key={inc} onClick={() => setLoggerPref("quickIncrement", inc)} style={{ ...mono, fontSize: fs.body, padding: "8px 16px", borderRadius: r, cursor: "pointer", color: prefs.quickIncrement === inc ? txt(LIME) : txt(ASH), background: prefs.quickIncrement === inc ? `color-mix(in srgb, var(--color-lime) 10%, transparent)` : "transparent", border: `1px solid ${prefs.quickIncrement === inc ? LIME : LINE}` }}>
                    {inc === 0 ? t("common.off") : `±${inc}`}
                  </button>
                ))}
              </div>
            </Section>
            <Section label={t("loggerPrefs.defaultStart")}>
              <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
                {([{ id: "empty", label: "Empty" }, { id: "ai", label: "AI" }, { id: "last", label: "Repeat last" }] as const).map((o) => (
                  <button key={o.id} onClick={() => setLoggerPref("defaultStart", o.id)} style={{ ...mono, fontSize: fs.body, padding: "8px 16px", borderRadius: r, cursor: "pointer", color: prefs.defaultStart === o.id ? txt(LIME) : txt(ASH), background: prefs.defaultStart === o.id ? `color-mix(in srgb, var(--color-lime) 10%, transparent)` : "transparent", border: `1px solid ${prefs.defaultStart === o.id ? LIME : LINE}` }}>
                    {o.label}
                  </button>
                ))}
              </div>
            </Section>
          </>
        );
      case "notifications":
        return (
          <>
            <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 12, marginLeft: 2 }} c={ASH}>{t("w.account.settings.notifications-desc")}</Mono>
            {groupRows(ACCOUNT_NOTIF_ROWS).map((g) => (
              <Section key={g.group} label={g.group}>
                {g.items.map((row, i) => (
                  <PrefRow key={row.key} first={i === 0} title={row.title} desc={row.desc} on={!!notif[row.key]} onToggle={() => toggleNotif(row.key)} disabled={!authOn} />
                ))}
              </Section>
            ))}
            {!authOn && <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 10, marginLeft: 2 }} c={ASH}>{t("w.account.settings.signin-to-change")}</Mono>}
          </>
        );
      case "privacy":
        return (
          <>
            <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 12, marginLeft: 2 }} c={ASH}>{t("w.account.settings.privacy-desc")}</Mono>
            {groupRows(ACCOUNT_PRIVACY_ROWS).map((g) => (
              <Section key={g.group} label={g.group}>
                {g.items.map((row, i) => (
                  <PrefRow key={row.key} first={i === 0} title={row.title} desc={row.desc} on={!!priv[row.key]} onToggle={() => togglePriv(row.key)} disabled={!authOn} />
                ))}
              </Section>
            ))}
            {!authOn && <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 10, marginLeft: 2 }} c={ASH}>{t("w.account.settings.signin-to-change")}</Mono>}
          </>
        );
      case "coaching":
        return isClient ? (
          <Section label={t("w.account.settings.become-coach")}>
            {coachUnavailable ? (
              <Mono s={{ fontSize: fs.body, display: "block" }} c={ASH}>{t("w.account.settings.coach-not-enabled")}</Mono>
            ) : coachStatus ? (
              <Mono s={{ fontSize: fs.body, display: "block" }} c={CHALK}>
                {t("w.account.settings.application-is")} <b style={{ color: txt(coachStatus === "approved" ? LIME : coachStatus === "denied" ? RED : ASH) }}>{coachStatus}</b>.
              </Mono>
            ) : (
              <>
                <Mono s={{ fontSize: fs.body, display: "block" }} c={CHALK}>{t("w.account.settings.coach-intro")}</Mono>
                <div style={{ marginTop: 12 }}>
                  {[1, 2, 3].map((n) => (
                    <div key={n} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                      <span style={{ ...mono, fontSize: fs.micro, fontWeight: 800, width: 20, height: 20, flex: "none", borderRadius: 6, display: "grid", placeItems: "center", color: ON_ACCENT, background: LIME }}>{n}</span>
                      <Mono s={{ fontSize: fs.body }} c={CHALK}>{t(`w.account.settings.coach-step-${n}`)}</Mono>
                    </div>
                  ))}
                </div>
                <textarea value={credentials} onChange={(e) => setCredentials(e.target.value)} placeholder={t("w.account.settings.coach-credentials-ph")} rows={3} style={{ ...mono, fontSize: fs.body, width: "100%", marginTop: 12, padding: "10px 12px", borderRadius: r, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none", resize: "vertical" }} />
                {coachMsg && <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 8 }} c={RED}>{coachMsg}</Mono>}
                <button onClick={applyCoach} disabled={!credentials.trim() || coachBusy} style={{ ...disp, fontWeight: 800, fontSize: fs.bodyLg, color: txt(LIME), background: `color-mix(in srgb, var(--color-lime) 10%, transparent)`, border: `1px solid ${LIME}`, borderRadius: r, padding: "10px 18px", marginTop: 12, cursor: !credentials.trim() || coachBusy ? "not-allowed" : "pointer", opacity: !credentials.trim() || coachBusy ? 0.6 : 1 }}>
                  {coachBusy ? t("w.account.settings.applying") : t("w.account.settings.apply")}
                </button>
              </>
            )}
          </Section>
        ) : null;
      case "security": {
        const emailProvider = !session?.provider || session.provider === "email";
        const pw = passwordStrength(newPw);
        const pwColor = pw.score >= 4 ? LIME_HEX : pw.score === 3 ? BLUE : pw.score === 2 ? AMBER : RED;
        return (
          <>
            <Section label={t("w.account.settings.sec-login-recovery")}>
              <MfaSettings />
              <div style={{ marginTop: 16 }}>
                <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", display: "block" }} c={ASH}>{t("w.account.settings.change-password")}</Mono>
                {!emailProvider ? (
                  <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block", marginTop: 8 }} c={CHALK}>
                    {t("w.account.settings.signin-with")} {session!.provider} {t("w.account.settings.manage-password-there")}
                  </Mono>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: space.sm, marginTop: 12 }}>
                      <input value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder={t("w.account.settings.new-password-ph")} type="password" style={{ ...editInput, flex: 1 }} />
                      <button onClick={changePassword} disabled={profileBusy || newPw.length < 8} style={editBtn(LIME)}>{t("w.account.settings.update")}</button>
                    </div>
                    {newPw.length > 0 && (
                      <div style={{ marginTop: 10 }} aria-live="polite">
                        <div style={{ display: "flex", gap: 4 }}>
                          {[1, 2, 3, 4].map((i) => (
                            <span key={i} style={{ flex: 1, height: 5, borderRadius: 3, background: i <= pw.score ? pwColor : LINE, transition: "background .15s" }} />
                          ))}
                        </div>
                        <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 6 }} c={pwColor}>
                          {t("w.account.settings.pw-strength")}: {t(`w.account.settings.pw-${pw.label}`)}
                        </Mono>
                      </div>
                    )}
                  </>
                )}
                {passwordMsg && <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 10 }} c={passwordMsg.startsWith("✓") ? LIME : ASH}>{passwordMsg}</Mono>}
              </div>
              <div style={{ marginTop: 16 }}>
                <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", display: "block" }} c={ASH}>{t("w.account.settings.connected-account")}</Mono>
                <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block", marginTop: 8 }} c={CHALK}>
                  {!emailProvider ? session!.provider : (session?.email || t("w.account.settings.new-password-ph"))}
                </Mono>
              </div>
            </Section>
            <Section label={t("w.account.settings.sec-checks")}>
              <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", display: "block" }} c={ASH}>{t("w.account.settings.where-logged-in")}</Mono>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: LIME, flex: "none" }} />
                <Mono s={{ fontSize: fs.body }} c={CHALK}>{t("w.account.settings.this-device")}</Mono>
              </div>
              <Mono s={{ fontSize: fs.micro, lineHeight: 1.6, display: "block", marginTop: 10 }} c={ASH}>{t("w.account.settings.active-sessions-desc")}</Mono>
              <button onClick={signOutEverywhere} style={{ ...editBtn(ASH), marginTop: 12 }}>{t("w.account.settings.sign-out-everywhere")}</button>
            </Section>
          </>
        );
      }
      case "subscription":
        return isClient ? (
          <Section label={t("w.account.settings.mode")}>
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
                      <AuroraIcon name="lock" size={fs.micro + 2} color={txt(ASH)} />
                      <span style={{ ...mono, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: txt(LIME), background: `color-mix(in srgb, var(--color-lime) 10%, transparent)`, border: `1px solid ${LIME}`, borderRadius: 6, padding: "1px 6px" }}>{t("w.account.settings.paid")}</span>
                    </>
                  )}
                </div>
                <Mono s={{ fontSize: fs.micro }}>{t("w.account.settings.full-tags")}</Mono>
              </button>
            </div>
            {!paid ? (
              <>
                <div style={{ marginTop: 16 }}>
                  <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 8 }} c={ASH}>{t("w.account.settings.full")}</Mono>
                  {FULL_BENEFITS.map((b, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0" }}>
                      <span style={{ color: txt(LIME_HEX), fontWeight: 800, marginTop: 1 }}>✓</span>
                      <div>
                        <div style={{ ...disp, fontWeight: 700, fontSize: fs.note, color: CHALK }}>{b.title}</div>
                        <Mono s={{ fontSize: fs.micro, display: "block" }} c={ASH}>{b.desc}</Mono>
                      </div>
                    </div>
                  ))}
                </div>
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
          </Section>
        ) : (
          <Section label={t("w.account.settings.mode")}>
            <Mono s={{ fontSize: fs.body, display: "block", lineHeight: 1.6 }} c={CHALK}>
              {paid ? t("w.account.settings.full-paid") : t("w.account.settings.free")} — {t("w.account.settings.mode-desc")}
            </Mono>
          </Section>
        );
      case "data":
        return (
          <Section label={t("w.account.settings.export")}>
            <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block" }} c={CHALK}>{t("w.account.settings.export-data-desc")}</Mono>
            <div style={{ marginTop: 14 }}>
              <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 8 }} c={ASH}>{t("w.account.settings.data-included")}</Mono>
              {[1, 2, 3].map((n) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                  <span style={{ color: txt(LIME_HEX), fontWeight: 800 }}>✓</span>
                  <Mono s={{ fontSize: fs.body }} c={CHALK}>{t(`w.account.settings.data-incl-${n}`)}</Mono>
                </div>
              ))}
            </div>
            <button onClick={exportData} style={{ ...editBtn(LIME), marginTop: 12 }}>{t("w.account.settings.download-data")}</button>
          </Section>
        );
      case "danger":
        return (
          <Section label={t("w.account.settings.erase-all")} tone={txt(RED)}>
            <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block" }} c={CHALK}>
              {t("w.account.settings.erase-warning")} <b style={{ color: txt(RED) }}>{t("w.account.settings.cannot-undo")}</b>
            </Mono>
            <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 16, marginBottom: 6 }} c={ASH}>
              {t("w.account.settings.type")} <b style={{ color: CHALK }}>RESET</b> {t("w.account.settings.to-confirm")}
            </Mono>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="RESET" autoCapitalize="characters" style={{ ...mono, fontSize: fs.note, width: "100%", maxWidth: 240, padding: "10px 12px", borderRadius: r, background: INK2, color: CHALK, border: `1px solid ${armed ? RED : LINE}`, outline: "none" }} />
            {msg && <div role="alert"><Mono s={{ fontSize: fs.caption, display: "block", marginTop: 10 }} c={RED}>{msg}</Mono></div>}
            <div style={{ display: "flex", gap: space.ms, marginTop: 16, alignItems: "center" }}>
              <button onClick={reset} disabled={!armed || busy} className="pressable" style={{ ...disp, fontWeight: 800, fontSize: fs.bodyLg, color: "#fff", background: armed && !busy ? RED : `${RED}55`, border: "none", borderRadius: r, padding: "12px 18px", cursor: armed && !busy ? "pointer" : "not-allowed" }}>
                {busy ? t("w.account.settings.erasing") : t("w.account.settings.erase-everything")}
              </button>
              <button onClick={() => void logout()} style={{ ...mono, fontSize: fs.body, color: txt(ASH), background: "none", border: "none", cursor: "pointer" }}>
                {t("w.account.settings.sign-out-instead")}
              </button>
            </div>

            {/* Permanent account deletion (App Store 5.1.1(v) + GDPR erasure) —
                distinct from reset: removes the login itself, not just the data. */}
            <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${LINE}` }}>
              <Mono s={{ fontSize: fs.bodyLg, fontWeight: 800, display: "block", color: txt(RED) }} c={RED}>{t("settings.deleteTitle")}</Mono>
              <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block", marginTop: 8 }} c={CHALK}>{t("settings.deleteBody")}</Mono>
              <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 16, marginBottom: 6 }} c={ASH}>
                {t("settings.typeDelete")}
              </Mono>
              <input value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)} placeholder="DELETE" autoCapitalize="characters" style={{ ...mono, fontSize: fs.note, width: "100%", maxWidth: 240, padding: "10px 12px", borderRadius: r, background: INK2, color: CHALK, border: `1px solid ${armedDelete ? RED : LINE}`, outline: "none" }} />
              {delMsg && <div role="alert"><Mono s={{ fontSize: fs.caption, display: "block", marginTop: 10 }} c={RED}>{delMsg}</Mono></div>}
              <div style={{ marginTop: 16 }}>
                <button onClick={del} disabled={!armedDelete || delBusy} className="pressable" style={{ ...disp, fontWeight: 800, fontSize: fs.bodyLg, color: "#fff", background: armedDelete && !delBusy ? RED : `${RED}55`, border: "none", borderRadius: r, padding: "12px 18px", cursor: armedDelete && !delBusy ? "pointer" : "not-allowed" }}>
                  {delBusy ? t("settings.deleting") : t("settings.deleteAccount")}
                </button>
              </div>
            </div>

            <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${LINE}` }}>
              <a href="/privacy" style={{ ...mono, fontSize: fs.caption, color: txt(ASH), textDecoration: "underline" }}>{t("legal.privacy")}</a>
              <span style={{ ...mono, fontSize: fs.caption, color: txt(ASH), margin: "0 8px" }}>{t("legal.and")}</span>
              <a href="/terms" style={{ ...mono, fontSize: fs.caption, color: txt(ASH), textDecoration: "underline" }}>{t("legal.terms")}</a>
            </div>
          </Section>
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
      case "preferences": return `${theme === "light" ? "Kyoto Hour" : "Aurora"} – ${lang.toUpperCase()} – ${prefs.units}`;
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

  const completeness = profileCompleteness({ name: name || session?.name, handle: socialProfile?.handle, displayName: socialProfile?.displayName, bio: socialProfile?.bio, avatarUrl: socialProfile?.avatarUrl });
  const nudge = completeness.complete
    ? `${t("w.account.settings.cmpl-done")} ✓`
    : `${t("w.account.settings.cmpl-add")} ${completeness.missing.slice(0, 2).map((m) => t(`w.account.settings.cmpl-${m}`)).join(" & ")}`;
  const ringCirc = 2 * Math.PI * 27;

  return (
    <div style={{ maxWidth: 640 }}>
      {active ? (
        /* ── SUB-PAGE ── a focused category with a back button. */
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <button onClick={() => setCat(null)} aria-label={t("w.account.settings.back")} className="pressable" style={{ width: 40, height: 40, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", background: INK2, border: `1px solid ${LINE}`, cursor: "pointer", color: CHALK }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <h2 style={{ ...disp, fontWeight: 900, fontSize: fs.title, margin: 0, color: active.danger ? txt(RED) : CHALK }}>{active.title}</h2>
          </div>
          {renderBody(cat!)}
        </>
      ) : (
        /* ── LIST ── search + grouped category rows. */
        <>
          <h2 style={{ ...disp, fontWeight: 900, fontSize: fs.display, marginBottom: 16 }}>{t("w.account.settings.title")}</h2>

          {/* Profile header — shared anatomy with mobile: a bordered row card with a
              rounded-square accent-gradient initial avatar, name + email, role/provider
              pills under the name, and the membership FREE/FULL pill pinned right. */}
          <div style={{ marginBottom: 20, padding: 16, background: INK2, border: `1px solid ${LINE}`, borderRadius: 28 }}>
            {/* Tappable identity row → opens Edit profile. The avatar is wrapped
                in a completeness ring; the nudge says what's left to fill. */}
            <button onClick={() => setCat("account")} aria-label={t("w.account.settings.edit-profile")} style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", color: CHALK }}>
              <span style={{ position: "relative", width: 60, height: 60, flex: "none", display: "grid", placeItems: "center" }}>
                <svg width="60" height="60" viewBox="0 0 60 60" style={{ position: "absolute", inset: 0 }} aria-hidden="true">
                  <circle cx="30" cy="30" r="27" fill="none" stroke={LINE} strokeWidth="3" />
                  <circle cx="30" cy="30" r="27" fill="none" strokeWidth="3" strokeLinecap="round" strokeDasharray={ringCirc} strokeDashoffset={ringCirc * (1 - completeness.percent / 100)} transform="rotate(-90 30 30)" style={{ stroke: "var(--color-lime)", transition: "stroke-dashoffset .4s" }} />
                </svg>
                {socialProfile?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={socialProfile.avatarUrl} alt="" style={{ width: 46, height: 46, borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <span style={{ width: 46, height: 46, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", ...disp, fontWeight: 800, fontSize: 20, color: ON_ACCENT, background: `linear-gradient(135deg, ${LIME}, ${BLUE})` }}>{(session?.name || session?.email || "?").slice(0, 1).toUpperCase()}</span>
                )}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ ...disp, fontWeight: 800, fontSize: fs.title, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{session?.name || t("w.account.settings.your-account")}</span>
                <MetaLine text={`${completeness.percent}% · ${nudge}`} style={{ ...mono, fontSize: fs.micro, color: completeness.complete ? txt(LIME_HEX) : txt(ASH), marginTop: 3 }} />
              </span>
              <span style={{ ...mono, fontSize: fs.nano, letterSpacing: ".5px", flex: "none", color: txt(paid ? LIME_HEX : ASH), background: `${paid ? LIME_HEX : ASH}1a`, border: `1px solid ${paid ? LIME_HEX : ASH}66`, borderRadius: 999, padding: "4px 12px" }}>{paid ? t("w.account.settings.full-paid") : t("w.account.settings.free")}</span>
            </button>
            {/* Quick actions */}
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
              <button onClick={() => setCat("account")} style={{ ...mono, fontSize: fs.caption, color: txt(LIME_HEX), background: "color-mix(in srgb, var(--color-lime) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--color-lime) 40%, transparent)", borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}>{t("w.account.settings.edit-profile")}</button>
              {socialProfile?.handle && <button onClick={shareProfile} style={{ ...mono, fontSize: fs.caption, color: txt(CHALK), background: "transparent", border: `1px solid ${LINE}`, borderRadius: 999, padding: "8px 14px", cursor: "pointer" }}>↗ {t("w.account.settings.share-profile")}</button>}
              {shareMsg && <Mono s={{ fontSize: fs.micro }} c={LIME}>{shareMsg}</Mono>}
            </div>
          </div>

          {/* Search */}
          <div style={{ position: "relative", marginBottom: 20 }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: ASH, display: "flex", pointerEvents: "none" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
            </span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("w.account.settings.search")} aria-label={t("w.account.settings.search")} style={{ ...mono, width: "100%", boxSizing: "border-box", fontSize: fs.body, background: INK2, color: CHALK, border: `1px solid ${LINE}`, borderRadius: 999, padding: "12px 16px 12px 38px", outline: "none" }} />
          </div>

          {query ? (
            results.length === 0 ? (
              <Card><Mono s={{ display: "block" }} c={ASH}>{t("w.account.settings.no-results")}</Mono></Card>
            ) : (
              <Card>
                {results.map((c, i) => (
                  <Row key={c.id} icon={c.icon} accent={TONE[c.id]} title={c.title} subtitle={summary(c.id) || c.subtitle} danger={c.danger} first={i === 0} onOpen={() => { setCat(c.id); setQuery(""); }} />
                ))}
              </Card>
            )
          ) : (
            SETTINGS_GROUPS.map((group) => (
              <Section key={group.id} label={group.label}>
                {group.categories.map((c, i) => (
                  <Row key={c.id} icon={c.icon} accent={TONE[c.id]} title={c.title} subtitle={summary(c.id) || c.subtitle} danger={c.danger} first={i === 0} onOpen={() => setCat(c.id)} />
                ))}
              </Section>
            ))
          )}
        </>
      )}
    </div>
  );
}

/** A settings list row inside its group's Section card: tinted icon chip +
 *  title + one-line value/subtitle + chevron. A hairline separates rows within
 *  the card (the first row draws none). */
function Row({ icon, accent, title, subtitle, danger, first, onOpen }: {
  icon: AuroraIconName;
  accent: string;
  title: string;
  subtitle: string;
  danger?: boolean;
  first?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="pressable"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        textAlign: "left",
        background: "none",
        border: "none",
        borderTop: first ? "none" : `1px solid ${LINE}`,
        padding: "12px 0",
        cursor: "pointer",
        color: CHALK,
      }}
    >
      <span style={{ width: 40, height: 40, borderRadius: 12, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: `color-mix(in srgb, ${danger ? RED : accent} 14%, transparent)`, color: danger ? txt(RED) : txt(accent) }}>
        <AuroraIcon name={icon} size={20} color="currentColor" strokeWidth={4} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ ...disp, fontWeight: 700, fontSize: fs.bodyLg, color: danger ? txt(RED) : CHALK, display: "block" }}>{title}</span>
        <MetaLine text={subtitle} style={{ ...mono, fontSize: fs.micro, color: txt(ASH), marginTop: 3 }} />
      </span>
      <span style={{ color: txt(ASH), flex: "none", display: "flex" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
      </span>
    </button>
  );
}

/** A labelled section — an uppercase header above its own card. Every Settings
 *  sub-page is built from these so the whole surface reads as consistent
 *  sections (matching the Sectioned edit-profile screen). */
function Section({ label, tone, children }: { label: string; tone?: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ ...mono, fontSize: fs.caption, textTransform: "uppercase", letterSpacing: ".14em", color: tone ?? txt(ASH), marginBottom: 10, marginLeft: 2 }}>{label}</div>
      <Card>{children}</Card>
    </div>
  );
}

/** Collapse a flat, group-tagged row list into contiguous [group → items] runs
 *  so each group can render as its own Section. */
function groupRows<T extends { group: string }>(rows: readonly T[]): { group: string; items: T[] }[] {
  const out: { group: string; items: T[] }[] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (last && last.group === row.group) last.items.push(row);
    else out.push({ group: row.group, items: [row] });
  }
  return out;
}

/** A labelled preference row with an on/off pill — used by Notifications + Privacy. */
function PrefRow({ title, desc, on, onToggle, disabled, first }: { title: string; desc: string; on: boolean; onToggle: () => void; disabled?: boolean; first?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: first ? "none" : `1px solid ${LINE}` }}>
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
