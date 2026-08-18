"use client";

import { useEffect, useState } from "react";
import { colors, fs, space } from "@hybrid/core";

import { useParams } from "next/navigation";

// Public landing for a coach invite (QR / link). The web client is retired, so
// this page no longer claims the invite itself — it verifies the token, names
// the coach, and sends the visitor to the mobile app. Signing up there with
// the email the coach used auto-links the pair (see /api/me); the app's Coach
// screen can also claim a pending invite directly.

// Reads the tokens rather than copying them. This page used to carry six
// literals of its own — a chalk one step off (#f3f5ef), an ash nine ΔE away
// (#a7ad9e), a third hairline grey (#2a2e28) and `ink2` under the name INK2 —
// which is audit/12 §2.6, and is what __tests__/fallback-palette.test.ts now
// catches. It is a public landing, not a crash boundary: nothing here has any
// reason to survive the stylesheet failing, so nothing here needs its own copy.
const INK = colors.ink;
const LIME = colors.lime;
const FG = colors.chalk;
const DIM = colors.ash;
const LINE = colors.line;
const INK2 = colors.ink2;

type Info = { valid?: boolean; coachName?: string; status?: string; expired?: boolean; unavailable?: boolean };

export default function InviteLandingPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token as string;
  const [info, setInfo] = useState<Info | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/coach/invite/${token}`).then((r) => r.json()).then(setInfo).catch(() => setInfo({ valid: false }));
  }, [token]);

  const coach = info?.coachName || "Your coach";

  return (
    <main style={{ minHeight: "100dvh", background: INK, color: FG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 460, border: `1px solid ${LINE}`, background: INK2, borderRadius: 20, padding: 32 }}>
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
        ) : (
          <>
            <h1 style={{ fontSize: fs.display, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.1 }}>
              <span style={{ color: LIME }}>{coach}</span> invited you to train on HYBRID
            </h1>
            <p style={{ color: DIM, marginTop: 12, lineHeight: 1.6 }}>
              HYBRID lives on your iPhone. Get the app, sign up with the email
              your coach used, and you&apos;ll be connected automatically — your
              plan, sessions and diet will be waiting on the Coach screen.
            </p>
            <p style={{ color: DIM, fontSize: fs.body, marginTop: 12, lineHeight: 1.6 }}>
              Signed up with a different email? Ask your coach to re-send the
              invite to the address on your account.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
