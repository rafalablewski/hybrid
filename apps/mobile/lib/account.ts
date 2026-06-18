import { useEffect, useState } from "react";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  ACCOUNT_NOTIF_DEFAULTS,
  ACCOUNT_PRIVACY_DEFAULTS,
} from "@hybrid/core";
import { supabase, isSupabaseConfigured } from "./supabase";
import { useSession } from "./session";
import { exportAccountData } from "./api";

// The account-settings logic, shared by BOTH mobile Settings variants (classic
// app/settings.tsx + components/aurora/settings.tsx) so they stay in lockstep
// and match the web account area: editable profile (name/email), change
// password, notification + privacy preferences (persisted to Supabase auth
// user_metadata so they sync across devices, same keys as web), sign-out-
// everywhere, and a "download my data" JSON export. Profile/security edits use
// the user's OWN Supabase auth — no admin/backend route.

export function useAccountSettings() {
  const { session, name: sessionName, signOut } = useSession();
  const authOn = isSupabaseConfigured();
  const email = session?.user.email ?? null;
  // Supabase records the sign-in provider in app_metadata; "email" = password.
  const provider = (session?.user.app_metadata?.provider as string | undefined) ?? "email";

  const [name, setName] = useState(sessionName ?? "");
  const [newEmail, setNewEmail] = useState("");
  const [newPw, setNewPw] = useState("");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [notif, setNotif] = useState<Record<string, boolean>>(ACCOUNT_NOTIF_DEFAULTS);
  const [priv, setPriv] = useState<Record<string, boolean>>(ACCOUNT_PRIVACY_DEFAULTS);

  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  // Pull the live metadata once (name + saved preference maps).
  useEffect(() => {
    if (!authOn) return;
    let live = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!live || !data.user) return;
      const m = data.user.user_metadata ?? {};
      if (typeof m.name === "string") setName(m.name);
      setNotif({ ...ACCOUNT_NOTIF_DEFAULTS, ...(m.notifications ?? {}) });
      setPriv({ ...ACCOUNT_PRIVACY_DEFAULTS, ...(m.privacy ?? {}) });
    }).catch(() => {});
    return () => { live = false; };
  }, [authOn]);

  const runAuth = async (
    label: string,
    setMsg: (m: string | null) => void,
    op: () => Promise<{ error: { message: string } | null }>,
  ) => {
    if (!authOn) { setMsg("Sign in with a real account to edit your profile."); return; }
    setBusy(true);
    setMsg(null);
    try {
      const { error } = await op();
      setMsg(error ? error.message : label);
    } catch {
      setMsg("Network error — try again.");
    }
    setBusy(false);
  };

  const saveName = () =>
    runAuth("✓ Name saved.", setProfileMsg, () => supabase.auth.updateUser({ data: { name: name.trim() } }));
  const changeEmail = () =>
    runAuth("✓ Check your inbox to confirm the new email.", setProfileMsg, () => supabase.auth.updateUser({ email: newEmail.trim() }));
  const changePassword = () =>
    runAuth("✓ Password updated.", setPasswordMsg, () => supabase.auth.updateUser({ password: newPw }));

  // Persisted-on-toggle preference maps, mirrored into user_metadata.
  const toggleNotif = (k: string) => {
    const next = { ...notif, [k]: !notif[k] };
    setNotif(next);
    if (authOn) supabase.auth.updateUser({ data: { notifications: next } }).catch(() => {});
  };
  const togglePriv = (k: string) => {
    const next = { ...priv, [k]: !priv[k] };
    setPriv(next);
    if (authOn) supabase.auth.updateUser({ data: { privacy: next } }).catch(() => {});
  };

  const signOutEverywhere = async () => {
    if (authOn) await supabase.auth.signOut({ scope: "global" }).catch(() => {});
    void signOut();
  };

  // "Download my data": fetch the JSON the web export route serves, write it to
  // a cache file, and open the native share sheet so the user can save/send it.
  const exportData = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    setExportMsg(null);
    try {
      if (!authOn) { setExportMsg("Sign in with a real account to export your data."); setExportBusy(false); return; }
      const json = await exportAccountData();
      if (!json) { setExportMsg("Couldn't fetch your data — try again."); setExportBusy(false); return; }
      const file = new File(Paths.cache, `hybrid-export-${new Date().toISOString().slice(0, 10)}.json`);
      try { file.create({ overwrite: true }); } catch { /* already exists — write overwrites */ }
      file.write(json);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Your HYBRID data" });
      } else {
        setExportMsg("Saved, but sharing isn't available on this device.");
      }
    } catch {
      setExportMsg("Couldn't export your data — try again.");
    }
    setExportBusy(false);
  };

  return {
    authOn, email, provider,
    name, setName, newEmail, setNewEmail, newPw, setNewPw,
    profileMsg, passwordMsg, busy,
    saveName, changeEmail, changePassword,
    notif, priv, toggleNotif, togglePriv,
    signOutEverywhere,
    exportData, exportBusy, exportMsg,
  };
}
