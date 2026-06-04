"use client";

import { useState } from "react";
import { useSession } from "@/lib/session";
import { LINE, LIME, CHALK, ASH, RED, INK2, disp, mono, Mono, Card } from "@/lib/ui";
import MfaSettings from "./account/mfa";

export default function AccountSettings() {
  const { logout } = useSession();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
        setMsg(j.error ?? `Failed (HTTP ${res.status})`);
        setBusy(false);
        return;
      }
      // Wiped — drop all client state by reloading into the now-empty account.
      window.location.assign("/app");
    } catch {
      setMsg("Network error — try again.");
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ ...disp, fontWeight: 900, fontSize: 26, marginBottom: 4 }}>Settings</h2>
      <Mono s={{ fontSize: 13, display: "block", marginBottom: 20 }}>Account, security &amp; data.</Mono>

      <MfaSettings />

      <Card style={{ borderLeft: `3px solid ${RED}` }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={RED}>
          Danger zone — reset account
        </Mono>
        <div style={{ ...disp, fontWeight: 700, fontSize: 18, marginTop: 8 }}>Erase all my data</div>
        <Mono s={{ fontSize: 13, lineHeight: 1.6, display: "block", marginTop: 6 }} c={CHALK}>
          Permanently deletes everything tied to your account — logged sessions, signals &amp;
          biometrics, check-ins, plans &amp; macrocycles, templates &amp; assignments, connected
          devices, coaching links, and progress photos. Your login stays; you&apos;ll land in a
          fresh, empty account. <b style={{ color: RED }}>This cannot be undone.</b>
        </Mono>

        <Mono s={{ fontSize: 12, display: "block", marginTop: 16, marginBottom: 6 }} c={ASH}>
          Type <b style={{ color: CHALK }}>RESET</b> to confirm
        </Mono>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="RESET"
          autoCapitalize="characters"
          style={{
            ...mono,
            fontSize: 15,
            width: "100%",
            maxWidth: 240,
            padding: "10px 12px",
            borderRadius: 10,
            background: INK2,
            color: CHALK,
            border: `1px solid ${armed ? RED : LINE}`,
            outline: "none",
          }}
        />

        {msg && (
          <Mono s={{ fontSize: 12, display: "block", marginTop: 10 }} c={RED}>
            {msg}
          </Mono>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
          <button
            onClick={reset}
            disabled={!armed || busy}
            style={{
              ...disp,
              fontWeight: 800,
              fontSize: 14,
              color: "#fff",
              background: armed && !busy ? RED : `${RED}55`,
              border: "none",
              borderRadius: 10,
              padding: "11px 18px",
              cursor: armed && !busy ? "pointer" : "not-allowed",
            }}
          >
            {busy ? "Erasing…" : "Erase everything"}
          </button>
          <button
            onClick={() => void logout()}
            style={{ ...mono, fontSize: 13, color: ASH, background: "none", border: "none", cursor: "pointer" }}
          >
            Sign out instead
          </button>
        </div>
      </Card>
    </div>
  );
}
