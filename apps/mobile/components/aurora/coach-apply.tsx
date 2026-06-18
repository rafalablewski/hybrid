import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { applyForCoach, fetchCoachApplication, type CoachApplication } from "../../lib/api";
import { useSession } from "../../lib/session";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { F } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, RADIUS } from "./kit";

const STATUS_COPY: Record<CoachApplication["status"], string> = {
  pending: "Your application is in review — an admin will verify it shortly.",
  approved: "You're a verified coach. Your roster & squad tools are unlocked.",
  denied: "This application wasn't approved. You can revise and re-apply below.",
};

/** AURORA Become a coach — same verification-gated application flow (fetch,
 *  status card, form, submit) as the classic, in the rounded look. */
export default function AuroraCoachApply() {
  const { palette: C } = useTheme();
  const router = useRouter();
  const { t } = useLang();
  const { role } = useSession();
  const isCoach = role === "coach" || role === "admin";

  const [existing, setExisting] = useState<CoachApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [credentials, setCredentials] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetchCoachApplication()
      .then((a) => setExisting(a))
      .finally(() => setLoading(false));
  }, []);

  const canSubmit = credentials.trim().length > 0 && !busy;
  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    const res = await applyForCoach(credentials.trim());
    setBusy(false);
    if (res.ok) {
      setSent(true);
      setExisting({ id: "", status: "pending", credentials: credentials.trim(), createdAt: new Date().toISOString() });
    } else {
      setError(res.error ?? "Couldn't submit — try again.");
    }
  };

  const statusColor = (s: CoachApplication["status"]) =>
    s === "approved" ? C.lime : s === "denied" ? C.red : C.amber;

  return (
    <AuroraScreen>
      <Pressable onPress={() => router.back()} hitSlop={10}>
        <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>← {t("common.back")}</Text>
      </Pressable>

      <AHeading style={{ fontSize: 26, marginTop: 12 }}>Become a coach</AHeading>
      <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.chalk, marginTop: 8, lineHeight: 20 }}>
        Coaching others is verification-gated. Tell us who you are — certifications, experience,
        who you train — and an admin reviews it. Approval unlocks the roster, squad monitor and
        athlete assignment.
      </Text>

      {isCoach ? (
        <ACard style={{ borderLeftWidth: 3, borderLeftColor: C.lime, marginTop: 16 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>Already verified</Text>
          <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.chalk, marginTop: 8, lineHeight: 20 }}>
            You already have coach access — open the Coach tab to manage your athletes.
          </Text>
        </ACard>
      ) : loading ? (
        <View style={{ paddingVertical: 40, alignItems: "center" }}>
          <ActivityIndicator color={C.lime} />
        </View>
      ) : (
        <>
          {existing && (
            <ACard style={{ borderLeftWidth: 3, borderLeftColor: statusColor(existing.status), marginTop: 16 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, statusColor(existing.status)) }}>
                Application · {existing.status}
              </Text>
              <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.chalk, marginTop: 8, lineHeight: 20 }}>{STATUS_COPY[existing.status]}</Text>
            </ACard>
          )}

          {/* Hide the form while a fresh application is pending; show it for new
              applicants and for re-applying after a denial. */}
          {existing?.status !== "pending" && (
            <ACard style={{ marginTop: 16 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>Your background</Text>
              <TextInput
                value={credentials}
                onChangeText={setCredentials}
                placeholder="Certifications, years coaching, who you work with…"
                placeholderTextColor={C.ash}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                style={{ fontFamily: F.mono, fontSize: 14, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 14, marginTop: 12, minHeight: 120 }}
              />
              {!!error && <Text style={{ fontFamily: F.mono, fontSize: 12, color: txt(C, C.red), marginTop: 10 }}>{error}</Text>}
              <Pressable
                onPress={submit}
                disabled={!canSubmit}
                style={{ backgroundColor: canSubmit ? C.violet : `${C.violet}55`, borderRadius: RADIUS.pill, paddingVertical: 16, alignItems: "center", marginTop: 14 }}
              >
                {busy ? <ActivityIndicator color={C.onAccent} /> : <Text style={{ fontFamily: F.black, fontSize: 15, color: C.onAccent }}>Submit application</Text>}
              </Pressable>
            </ACard>
          )}

          {sent && existing?.status === "pending" && (
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: txt(C, C.lime), marginTop: 12, textAlign: "center" }}>Application submitted — thanks!</Text>
          )}
        </>
      )}
    </AuroraScreen>
  );
}
