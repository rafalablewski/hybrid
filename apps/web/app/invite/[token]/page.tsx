"use client";

import { useCallback, useEffect, useState } from "react";
import { fs, space } from "@hybrid/core";

import { useParams, useRouter } from "next/navigation";

// Public claim landing for a coach invite (QR / link). If the visitor is signed
// in we claim immediately (claim = consent → ACTIVE coach link); otherwise we
// stash the token and send them to sign up / log in — the app shell finishes the
// claim on return, and an email match auto-links too (see /api/me).

const INK = "#0c0d0c";
const LIME = "#c6f84f";
const FG = "#f3f5ef";
const DIM = "#a7ad9e";
const LINE = "#2a2e28";
const CARD = "#141614";

type Info = { valid?: boolean; coachName?: string; status?: string; expired?: boolean; unavailable?: boolean };

export default function InviteClaimPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token as string;
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [state, setState] = useState<"idle" | "claiming" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!token) return;
    try { localStorage.setItem("hybrid.coachInviteToken", token); } catch { /* ignore */ }
    fetch(`/api/coach/invite/${token}`).then((r) => r.json()).then(setInfo).catch(() => setInfo({ valid: false }));
    fetch("/api/me").then((r) => setSignedIn(r.ok)).catch(() => setSignedIn(false));
  }, [token]);

  const claim = useCallback(async () => {
    setState("claiming");
    try {
      const r = await fetch(`/api/coach/invite/${token}/claim`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        try { localStorage.removeItem("hybrid.coachInviteToken"); } catch { /* ignore */ }
        setState("done");
      } else {
        setState("error");
        setMsg(d.error || "Couldn't accept the invite.");
      }
    } catch {
      setState("error");
      setMsg("Couldn't accept the invite — try again.");
    }
  }, [token, router]);

  // Auto-claim once we know the visitor is signed in and the invite is valid.
  useEffect(() => {
    if (signedIn && info?.valid && state === "idle") void claim();
  }, [signedIn, info, state, claim]);

  // Navigate into the app shortly after a successful claim; clear on unmount.
  useEffect(() => {
    if (state !== "done") return;
    const timer = setTimeout(() => router.push("/app"), 1200);
    return () => clearTimeout(timer);
  }, [state, router]);

  const coach = info?.coachName || "Your coach";

  return (
    <main style={{ minHeight: "100dvh", background: INK, color: FG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 460, border: `1px solid ${LINE}`, background: CARD, borderRadius: 20, padding: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: space.ms, marginBottom: 22 }}>
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: LIME, boxShadow: `0 0 14px ${LIME}` }} />
          <b style={{ fontSize: fs.title, letterSpacing: "-.02em" }}>HYBRID</b>
        </div>

        {info === null ? (
          <p style={{ color: DIM }}>Loading invite…</p>
        ) : info.unavailable ? (
          <p style={{ color: DIM }}>Invites aren&apos;t enabled yet. Ask your coach to try again shortly.</p>
        ) : info.valid === false ? (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.02em" }}>This invite isn&apos;t valid</h1>
            <p style={{ color: DIM, marginTop: 10 }}>
              {info.expired ? "It has expired." : info.status === "CLAIMED" ? "It has already been used." : "It may have been revoked."} Ask your coach for a fresh link.
            </p>
          </>
        ) : state === "done" ? (
          <>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.02em" }}>You&apos;re connected to {coach} ✓</h1>
            <p style={{ color: DIM, marginTop: 10 }}>Opening HYBRID…</p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: fs.display, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.1 }}>
              <span style={{ color: LIME }}>{coach}</span> invited you to train on HYBRID
            </h1>
            <p style={{ color: DIM, marginTop: 12, lineHeight: 1.6 }}>
              You&apos;ll get the free app and can see everything your coach assigns — your plan, sessions and diet. (Editing &amp; the adaptive engine are a paid upgrade whenever you want them.)
            </p>

            {signedIn ? (
              <button
                onClick={() => void claim()}
                disabled={state === "claiming"}
                style={btn(state === "claiming")}
              >
                {state === "claiming" ? "Connecting…" : `Accept & connect to ${coach}`}
              </button>
            ) : signedIn === false ? (
              <>
                <a href="/login" style={btn(false)}>Create your free account / Sign in</a>
                <p style={{ color: DIM, fontSize: fs.body, marginTop: 12, lineHeight: 1.6 }}>
                  Sign up with the email your coach used and you&apos;ll be connected automatically. Otherwise, reopen this link after signing in.
                </p>
              </>
            ) : (
              <p style={{ color: DIM, marginTop: 18 }}>Checking your session…</p>
            )}

            {state === "error" && <p role="alert" style={{ color: "#f0795e", marginTop: 14 }}>{msg}</p>}
          </>
        )}
      </div>
    </main>
  );
}

function btn(disabled: boolean): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "center",
    marginTop: 22,
    padding: "14px 20px",
    borderRadius: 12,
    background: LIME,
    color: INK,
    fontWeight: 800,
    fontSize: fs.note,
    border: "none",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}
