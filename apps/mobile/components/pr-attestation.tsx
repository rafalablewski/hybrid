import { useCallback, useEffect, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { prTier, prBadge, fmtWeight, type PrAttestation, type WeightUnit, FEEDBACK, STATE_OPACITY } from "@hybrid/core";
import { fetchAttestations, requestAttestation } from "../lib/api";
import { useTheme, txt } from "../lib/theme";
import { leading, tracking, fs, space, F, PressScale as Pressable } from "../lib/ui";
import { RADIUS } from "./aurora/kit";

// Verified Strength Record — the attestation panel on a session's PR list.
// A tier badge per PR (Claimed / Sensed / Witnessed) + the ask-a-witness flow.
// Grading and copy come from core/attestation.ts, so what a tier MEANS is
// decided in one tested place and this file only says it.

/** The witness's side: pending co-sign requests addressed to ME. Rendered at
 *  the top of the social feed — answering one is a social act, and every
 *  request is also an invite loop (you can only witness on HYBRID). */
export function CosignInbox({ units }: { units: WeightUnit }) {
  const { palette: C } = useTheme();
  const [inbox, setInbox] = useState<import("../lib/api").AttestInboxItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    fetchAttestations().then((j) => { if (on && j) setInbox(j.inbox); });
    return () => { on = false; };
  }, []);

  const respond = async (id: string, action: "cosign" | "decline") => {
    setBusyId(id);
    const { respondAttestation } = await import("../lib/api");
    await respondAttestation(id, action);
    setBusyId(null);
    setInbox((x) => x?.filter((i) => i.id !== id) ?? x);
  };

  if (!inbox?.length) return null;
  return (
    // marginBOTTOM, matching the web twin: this is the feed's first content
    // block, and the hub head above it emits the gap DOWN (HUB_MASTHEAD.gap.below).
    // A top margin here would sit the whole feed 16 lower than web's, since RN
    // does not collapse margins and CSS does.
    <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.lime, borderRadius: 20, padding: 16, marginBottom: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.caps, color: txt(C, C.lime) }}>Co-sign requests</Text>
      {inbox.map((i) => (
        <View key={i.id} style={{ marginTop: 10 }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: leading(fs.body) }}>
            <Text style={{ fontFamily: F.bold }}>{i.ownerName || (i.ownerHandle ? `@${i.ownerHandle}` : "Someone")}</Text> asks you to confirm you watched their{" "}
            <Text style={{ fontFamily: F.bold }}>{i.lift}</Text>
            {i.topLoad ? <> at <Text style={{ fontFamily: F.bold }}>{fmtWeight(i.topLoad, units)}</Text></> : null}.
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <Pressable onPress={() => respond(i.id, "cosign")} disabled={busyId === i.id} style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 13, paddingVertical: 7 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.onAccent }}>I watched it</Text>
            </Pressable>
            <Pressable onPress={() => respond(i.id, "decline")} disabled={busyId === i.id} style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingHorizontal: 13, paddingVertical: 7 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>Decline</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 10, lineHeight: leading(fs.micro, "snug") }}>
        Your co-sign goes on the record under your name. Only confirm a lift you actually saw.
      </Text>
    </View>
  );
}

export default function PrAttestationPanel({ sessionId, lifts, hasDevice, units }: {
  sessionId: string;
  lifts: { lift: string; topLoad: number }[];
  hasDevice: boolean;
  units: WeightUnit;
}) {
  const { palette: C } = useTheme();
  const [atts, setAtts] = useState<PrAttestation[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchAttestations(sessionId).then((j) => {
      if (!j) return;
      setAtts(j.attestations);
      setUnavailable(!!j.unavailable);
    });
  }, [sessionId]);
  useEffect(() => { load(); }, [load]);

  if (lifts.length === 0) return null;

  const ask = async (lift: string) => {
    if (!handle.trim() || busy) return;
    setBusy(true);
    setErrorMsg(null);
    const r = await requestAttestation(sessionId, lift, handle.trim());
    setBusy(false);
    if (!r.ok) {
      setErrorMsg(r.error ?? "failed");
      return;
    }
    setAsking(null);
    setHandle("");
    load();
  };

  return (
    <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 16, marginTop: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.caps, color: C.ash }}>Verified record</Text>
      {lifts.map(({ lift, topLoad }) => {
        const forLift = (atts ?? []).filter((a) => a.lift === lift);
        const tier = prTier({ session: { device: hasDevice ? ({} as never) : null }, attestations: forLift });
        const pending = tier < 2 && forLift.some((a) => a.status === "pending");
        const badge = prBadge(tier, { pending });
        const signer = forLift.find((a) => a.status === "cosigned");
        return (
          <View key={lift} style={{ marginTop: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
              <Text style={{ flex: 1, minWidth: 120, fontFamily: F.semi, fontSize: fs.body, color: C.chalk }}>
                {lift} <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{fmtWeight(topLoad, units)}</Text>
              </Text>
              <View style={{ borderRadius: RADIUS.pill, borderWidth: 1, borderColor: tier === 2 ? C.lime : C.line, paddingHorizontal: 10, paddingVertical: 2, opacity: pending ? STATE_OPACITY.busy : 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: tier === 2 ? txt(C, C.lime) : tier === 1 ? C.chalk : C.ash }}>
                  {pending ? `${badge.label} — witness asked` : badge.label}
                  {tier === 2 && signer?.witnessHandle ? ` by @${signer.witnessHandle}` : ""}
                </Text>
              </View>
              {tier < 2 && !pending && !unavailable && (
                <Pressable onPress={() => { setAsking(asking === lift ? null : lift); setHandle(""); setErrorMsg(null); }} hitSlop={8}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>Ask a witness</Text>
                </Pressable>
              )}
            </View>
            {asking === lift && (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" }}>
                <TextInput
                  value={handle}
                  onChangeText={setHandle}
                  placeholder="@handle of who was there"
                  placeholderTextColor={C.ash}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Witness handle"
                  style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}
                />
                <Pressable onPress={() => ask(lift)} disabled={busy} style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 8 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.onAccent }}>{busy ? "Sending" : "Send"}</Text>
                </Pressable>
              </View>
            )}
            {asking === lift && errorMsg && (
              <Text accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.caption, color: FEEDBACK.error, marginTop: 6 }}>{errorMsg}</Text>
            )}
          </View>
        );
      })}
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 10, lineHeight: leading(fs.micro, "snug") }}>
        {unavailable
          ? "Witness co-signing isn't switched on for this deployment yet."
          : "A witness co-signs under their own name — that's the whole point. Only ask someone who was actually there."}
      </Text>
    </View>
  );
}
