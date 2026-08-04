"use client";

import { accentText } from "@/lib/ui";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { fs, space, prTier, prBadge, fmtWeight, type PrAttestation, type WeightUnit } from "@hybrid/core";

// Verified Strength Record — the attestation panel on a session's PR list.
// Each PR carries its tier badge (Claimed / Sensed / Witnessed), and the owner
// can ask a witness by @handle to co-sign a specific lift (tier 2). Mirrored
// by apps/mobile/components/pr-attestation.tsx; grading + copy come from
// core/attestation.ts so the tiers can never drift between clients.

const C = (v: string) => `var(--color-${v})`;

/** The witness's side: pending co-sign requests addressed to ME. Rendered at
 *  the top of the social feed — answering one is a social act, and every
 *  request is also an invite loop (you can only witness on HYBRID). */
export function CosignInbox({ units }: { units: WeightUnit }) {
  const [inbox, setInbox] = useState<
    { id: string; lift: string; topLoad: number | null; e1rm: number | null; ownerHandle: string | null; ownerName: string | null }[] | null
  >(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/records/attest")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { inbox?: typeof inbox } | null) => { if (j?.inbox) setInbox(j.inbox); })
      .catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const respond = async (id: string, action: "cosign" | "decline") => {
    setBusyId(id);
    await fetch("/api/records/attest/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    }).catch(() => {});
    setBusyId(null);
    setInbox((x) => x?.filter((i) => i.id !== id) ?? x);
  };

  if (!inbox?.length) return null;
  const mono: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: fs.caption };
  return (
    <div style={{ background: C("ink2"), border: `1px solid ${C("lime")}`, borderRadius: 18, padding: 16, marginBottom: 16 }}>
      <div style={{ ...mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: accentText("lime") }}>Co-sign requests</div>
      {inbox.map((i) => (
        <div key={i.id} style={{ display: "flex", alignItems: "center", gap: space.sm, marginTop: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: fs.body, color: C("chalk"), flex: 1, minWidth: 180 }}>
            <b>{i.ownerName || (i.ownerHandle ? `@${i.ownerHandle}` : "Someone")}</b> asks you to confirm you watched their{" "}
            <b>{i.lift}</b>{i.topLoad ? <> at <b>{fmtWeight(i.topLoad, units)}</b></> : null}.
          </span>
          <button className="pressable" onClick={() => respond(i.id, "cosign")} disabled={busyId === i.id} style={{ ...mono, background: C("lime"), color: "#0c0d0c", border: "none", borderRadius: 999, padding: "7px 13px", cursor: "pointer", fontWeight: 700 }}>I watched it</button>
          <button className="pressable" onClick={() => respond(i.id, "decline")} disabled={busyId === i.id} style={{ ...mono, background: "none", color: C("ash"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: "7px 13px", cursor: "pointer" }}>Decline</button>
        </div>
      ))}
      <p style={{ ...mono, color: C("ash"), margin: "10px 0 0", lineHeight: 1.5 }}>
        Your co-sign goes on the record under your name. Only confirm a lift you actually saw.
      </p>
    </div>
  );
}

export default function PrAttestationPanel({ sessionId, lifts, hasDevice, canRequest, units }: {
  sessionId: string;
  /** The lifts that PR'd in this session, in display order. */
  lifts: { lift: string; topLoad: number }[];
  /** Session carries a matched device recording → tier 1 floor. */
  hasDevice: boolean;
  /** Owner-only controls (ask a witness). */
  canRequest: boolean;
  units: WeightUnit;
}) {
  const [atts, setAtts] = useState<PrAttestation[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [asking, setAsking] = useState<string | null>(null); // lift with the open input
  const [handle, setHandle] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/records/attest?sessionId=${encodeURIComponent(sessionId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { attestations?: PrAttestation[]; unavailable?: boolean } | null) => {
        if (!j) return;
        setAtts(j.attestations ?? []);
        setUnavailable(!!j.unavailable);
      })
      .catch(() => {});
  }, [sessionId]);
  useEffect(() => { load(); }, [load]);

  if (lifts.length === 0) return null;

  const ask = async (lift: string) => {
    if (!handle.trim()) return;
    setState("busy");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/records/attest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, lift, witnessHandle: handle }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setErrorMsg(j?.error ?? "failed");
        setState("error");
        return;
      }
      setState("idle");
      setAsking(null);
      setHandle("");
      load();
    } catch {
      setState("error");
    }
  };

  const mono: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: fs.caption };

  return (
    <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 18, padding: 16 }}>
      <div style={{ ...mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>Verified record</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
        {lifts.map(({ lift, topLoad }) => {
          const forLift = (atts ?? []).filter((a) => a.lift === lift);
          const tier = prTier({ session: { device: hasDevice ? ({} as never) : null }, attestations: forLift });
          const pending = tier < 2 && forLift.some((a) => a.status === "pending");
          const badge = prBadge(tier, { pending });
          const signer = forLift.find((a) => a.status === "cosigned");
          return (
            <div key={lift}>
              <div style={{ display: "flex", alignItems: "baseline", gap: space.sm, flexWrap: "wrap" }}>
                <span style={{ fontSize: fs.body, fontWeight: 600, color: C("chalk"), flex: 1, minWidth: 120 }}>
                  {lift} <span style={{ ...mono, color: C("ash") }}>{fmtWeight(topLoad, units)}</span>
                </span>
                <span
                  title={badge.explain}
                  style={{
                    ...mono,
                    borderRadius: 999,
                    padding: "2px 10px",
                    border: `1px solid ${tier === 2 ? C("lime") : C("line")}`,
                    color: tier === 2 ? C("lime") : tier === 1 ? C("chalk") : C("ash"),
                    opacity: pending ? 0.75 : 1,
                  }}
                >
                  {pending ? `${badge.label} — witness asked` : badge.label}
                  {tier === 2 && signer?.witnessHandle ? ` by @${signer.witnessHandle}` : ""}
                </span>
                {canRequest && tier < 2 && !pending && !unavailable && (
                  <button className="pressable"
                    onClick={() => { setAsking(asking === lift ? null : lift); setHandle(""); setErrorMsg(null); }}
                    style={{ ...mono, background: "none", border: "none", cursor: "pointer", color: accentText("lime"), padding: 0 }}
                  >
                    Ask a witness
                  </button>
                )}
              </div>
              {asking === lift && (
                <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="@handle of who was there"
                    aria-label="Witness handle"
                    style={{ ...mono, flex: 1, minWidth: 160, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 10, padding: "8px 10px" }}
                  />
                  <button className="pressable"
                    onClick={() => ask(lift)}
                    disabled={state === "busy"}
                    style={{ ...mono, background: C("lime"), color: "#0c0d0c", border: "none", borderRadius: 999, padding: "8px 14px", cursor: "pointer", fontWeight: 700 }}
                  >
                    {state === "busy" ? "Sending" : "Send"}
                  </button>
                  {errorMsg && <span style={{ ...mono, color: accentText("red") }} role="alert">{errorMsg}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p style={{ ...mono, color: C("ash"), margin: "10px 0 0", lineHeight: 1.5 }}>
        {unavailable
          ? "Witness co-signing isn't switched on for this deployment yet."
          : "A witness co-signs under their own name — that's the whole point. Only ask someone who was actually there."}
      </p>
    </div>
  );
}
