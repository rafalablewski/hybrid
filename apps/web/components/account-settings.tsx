"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { useClientPersonaChoice, setClientPersona } from "@/lib/persona";
import { LINE, LIME, CHALK, ASH, RED, INK2, VIOLET, AMBER, disp, mono, Mono, Card, txt } from "@/lib/ui";
import MfaSettings from "./account/mfa";
import RequestAccess from "./request-access";

type CoachStatus = "pending" | "approved" | "denied";

export default function AccountSettings() {
  const { logout, session, entitlement } = useSession();
  const personaChoice = useClientPersonaChoice() ?? "casual";
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Mode toggle — Full (athlete) is a paid upgrade.
  const paid = entitlement === "paid";

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
      .then(async (r) => {
        if (r.status === 503) { if (live) setCoachUnavailable(true); return null; }
        return r.ok ? r.json() : null;
      })
      .then((d: { status?: CoachStatus } | null) => {
        if (live && d?.status) setCoachStatus(d.status);
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
        setCoachMsg(j.error ?? `Failed (HTTP ${res.status})`);
        setCoachBusy(false);
        return;
      }
      const j = (await res.json().catch(() => ({}))) as { status?: CoachStatus };
      setCoachStatus(j.status ?? "pending");
      setCredentials("");
    } catch {
      setCoachMsg("Network error — try again.");
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

      {/* Mode — a client flips between the lean tracker and the full athlete
          toolkit. Full is a paid upgrade. Coaches/admins get their surface
          from their role; a client applies to coach below. */}
      {isClient && (
        <Card style={{ marginBottom: 16 }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>Mode</Mono>
          <Mono s={{ fontSize: 13, display: "block", marginTop: 6 }} c={CHALK}>
            How much of the app you see. Switch anytime.
          </Mono>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
            {/* Simple (casual) — always selectable, free. */}
            <button
              onClick={() => setClientPersona("casual")}
              style={{ textAlign: "left", cursor: "pointer", borderRadius: 12, padding: 12, border: `1px solid ${personaChoice === "casual" ? LIME : LINE}`, background: personaChoice === "casual" ? `${LIME}14` : "transparent" }}
            >
              <div style={{ ...disp, fontWeight: 700, fontSize: 15, color: txt(personaChoice === "casual" ? LIME : CHALK) }}>Simple</div>
              <Mono s={{ fontSize: 11 }}>track · review · share</Mono>
            </button>

            {/* Full (athlete) — a PAID upgrade. Locked until entitled. */}
            <button
              onClick={() => (paid ? setClientPersona("athlete") : undefined)}
              aria-disabled={!paid}
              style={{ textAlign: "left", cursor: paid ? "pointer" : "default", borderRadius: 12, padding: 12, border: `1px solid ${paid && personaChoice === "athlete" ? LIME : LINE}`, background: paid && personaChoice === "athlete" ? `${LIME}14` : "transparent", opacity: paid ? 1 : 0.7 }}
            >
              <div style={{ ...disp, fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 6, color: txt(paid && personaChoice === "athlete" ? LIME : CHALK) }}>
                Full
                {!paid && (
                  <>
                    <span>🔒</span>
                    <span style={{ ...mono, fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: txt(AMBER), background: `${AMBER}1a`, border: `1px solid ${AMBER}`, borderRadius: 6, padding: "1px 6px" }}>Paid</span>
                  </>
                )}
              </div>
              <Mono s={{ fontSize: 11 }}>plans · sport · deep stats</Mono>
            </button>
          </div>
          {!paid && (
            <Mono s={{ fontSize: 11, display: "block", marginTop: 10, lineHeight: 1.5 }} c={ASH}>
              Full is a paid upgrade — billing coming soon.
            </Mono>
          )}
        </Card>
      )}

      {/* Become a coach — a client applies with credentials; an admin reviews
          it in the admin queue, granting the COACH role on approval. */}
      {isClient && (
        <Card style={{ marginBottom: 16 }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>Become a coach</Mono>
          {coachUnavailable ? (
            <Mono s={{ fontSize: 13, display: "block", marginTop: 8 }} c={ASH}>
              Coach applications aren&apos;t enabled yet.
            </Mono>
          ) : coachStatus ? (
            <Mono s={{ fontSize: 13, display: "block", marginTop: 8 }} c={CHALK}>
              Your application is <b style={{ color: txt(coachStatus === "approved" ? LIME : coachStatus === "denied" ? RED : AMBER) }}>{coachStatus}</b>.
            </Mono>
          ) : (
            <>
              <Mono s={{ fontSize: 13, display: "block", marginTop: 8 }} c={CHALK}>
                Tell us about your coaching background — an admin reviews each application.
              </Mono>
              <textarea
                value={credentials}
                onChange={(e) => setCredentials(e.target.value)}
                placeholder="Certifications, experience, who you coach…"
                rows={3}
                style={{ ...mono, fontSize: 13, width: "100%", marginTop: 10, padding: "10px 12px", borderRadius: 10, background: INK2, color: CHALK, border: `1px solid ${LINE}`, outline: "none", resize: "vertical" }}
              />
              {coachMsg && (
                <Mono s={{ fontSize: 12, display: "block", marginTop: 8 }} c={RED}>{coachMsg}</Mono>
              )}
              <button
                onClick={applyCoach}
                disabled={!credentials.trim() || coachBusy}
                style={{ ...disp, fontWeight: 800, fontSize: 14, color: txt(VIOLET), background: `${VIOLET}1a`, border: `1px solid ${VIOLET}`, borderRadius: 10, padding: "10px 18px", marginTop: 12, cursor: !credentials.trim() || coachBusy ? "not-allowed" : "pointer", opacity: !credentials.trim() || coachBusy ? 0.6 : 1 }}
              >
                {coachBusy ? "Applying…" : "Apply"}
              </button>
            </>
          )}
        </Card>
      )}

      <RequestAccess />

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
          fresh, empty account. <b style={{ color: txt(RED) }}>This cannot be undone.</b>
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
            style={{ ...mono, fontSize: 13, color: txt(ASH), background: "none", border: "none", cursor: "pointer" }}
          >
            Sign out instead
          </button>
        </div>
      </Card>
    </div>
  );
}
