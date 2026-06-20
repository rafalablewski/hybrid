import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { applyForCoach, fetchCoachApplication, type CoachApplication } from "../lib/api";
import { useSession } from "../lib/session";
import { useLang } from "../lib/i18n";
import { fs, Screen, Card, Kicker, Mono, F } from "../lib/ui";
import { useTheme } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraCoachApply from "../components/aurora/coach-apply";

const STATUS_COPY: Record<CoachApplication["status"], string> = {
  pending: "Your application is in review — an admin will verify it shortly.",
  approved: "You're a verified coach. Your roster & squad tools are unlocked.",
  denied: "This application wasn't approved. You can revise and re-apply below.",
};

export default function CoachApply() {
  if (useTemplate().template === "aurora") return <AuroraCoachApply />;
  return <ClassicCoachApply />;
}

function ClassicCoachApply() {
  const C = useTheme().palette;
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

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={10}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>← {t("common.back")}</Text>
      </Pressable>

      <Text style={{ fontFamily: F.black, fontSize: fs.display, color: C.chalk, marginTop: 10 }}>Become a coach</Text>
      <Mono color={C.chalk} style={{ marginTop: 6, lineHeight: 19 }}>
        Coaching others is verification-gated. Tell us who you are — certifications, experience,
        who you train — and an admin reviews it. Approval unlocks the roster, squad monitor and
        athlete assignment.
      </Mono>

      {isCoach ? (
        <Card style={{ borderLeftWidth: 3, borderLeftColor: C.lime, marginTop: 16 }}>
          <Kicker color={C.lime}>Already verified</Kicker>
          <Mono color={C.chalk} style={{ marginTop: 8, lineHeight: 19 }}>
            You already have coach access — open the Coach tab to manage your athletes.
          </Mono>
        </Card>
      ) : loading ? (
        <View style={{ paddingVertical: 40, alignItems: "center" }}>
          <ActivityIndicator color={C.lime} />
        </View>
      ) : (
        <>
          {existing && (
            <Card
              style={{
                borderLeftWidth: 3,
                borderLeftColor: existing.status === "approved" ? C.lime : existing.status === "denied" ? C.red : C.amber,
                marginTop: 16,
              }}
            >
              <Kicker color={existing.status === "approved" ? C.lime : existing.status === "denied" ? C.red : C.amber}>
                Application · {existing.status}
              </Kicker>
              <Mono color={C.chalk} style={{ marginTop: 8, lineHeight: 19 }}>{STATUS_COPY[existing.status]}</Mono>
            </Card>
          )}

          {/* Hide the form while a fresh application is pending; show it for new
              applicants and for re-applying after a denial. */}
          {existing?.status !== "pending" && (
            <Card style={{ marginTop: 16 }}>
              <Kicker>Your background</Kicker>
              <TextInput
                value={credentials}
                onChangeText={setCredentials}
                placeholder="Certifications, years coaching, who you work with…"
                placeholderTextColor={C.ash}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, marginTop: 12, minHeight: 120 }}
              />
              {!!error && <Mono color={C.red} style={{ marginTop: 10 }}>{error}</Mono>}
              <Pressable
                onPress={submit}
                disabled={!canSubmit}
                style={{ backgroundColor: canSubmit ? C.violet : `${C.violet}55`, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 14 }}
              >
                {busy ? <ActivityIndicator color={C.ink} /> : <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.ink }}>Submit application</Text>}
              </Pressable>
            </Card>
          )}

          {sent && existing?.status === "pending" && (
            <Mono color={C.lime} style={{ marginTop: 12, textAlign: "center" }}>Application submitted — thanks!</Mono>
          )}
        </>
      )}
    </Screen>
  );
}
