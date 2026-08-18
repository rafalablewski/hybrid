import { useEffect, useState } from "react";
import { View, Text, TextInput, ActivityIndicator, AccessibilityInfo } from "react-native";
import { useRouter } from "expo-router";
import { applyForCoach, fetchCoachApplication, type CoachApplication } from "../../lib/api";
import { useSession } from "../../lib/session";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { Loading, leading, tracking, fs, F, PressScale as Pressable } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, RADIUS } from "./kit";
import { withAlpha } from "./field";
import { ALPHA, FEEDBACK } from "@hybrid/core";

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
      const m = res.error ?? t("w.account.settings.coach-submit-error");
      setError(m);
      AccessibilityInfo.announceForAccessibility(m);
    }
  };

  const statusColor = (s: CoachApplication["status"]) =>
    s === "approved" ? C.lime : s === "denied" ? C.red : C.ash;

  return (
    <AuroraScreen hero={{ rank: "title", title: t("w.account.settings.become-coach") }}>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, marginTop: 8, lineHeight: leading(fs.bodyLg) }}>
        {t("w.account.settings.coach-apply-intro")}
      </Text>

      {isCoach ? (
        <ACard style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.caps, color: txt(C, C.lime) }}>{t("w.account.settings.coach-already-verified")}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, marginTop: 8, lineHeight: leading(fs.bodyLg) }}>
            {t("w.account.settings.coach-already-verified-body")}
          </Text>
        </ACard>
      ) : loading ? (
        <Loading />
      ) : (
        <>
          {existing && (
            <ACard style={{ marginTop: 16 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.caps, color: txt(C, statusColor(existing.status)) }}>
                {t("w.account.settings.coach-app-label")} {t(`w.account.settings.coach-st-${existing.status}`)}
              </Text>
              <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, marginTop: 8, lineHeight: leading(fs.bodyLg) }}>{t(`w.account.settings.coach-status-${existing.status}`)}</Text>
            </ACard>
          )}

          {/* Hide the form while a fresh application is pending; show it for new
              applicants and for re-applying after a denial. */}
          {existing?.status !== "pending" && (
            <ACard style={{ marginTop: 16 }}>
              {/* How it works — the same 3 steps as the web coaching tab. */}
              <View style={{ marginBottom: 16 }}>
                {[1, 2, 3].map((n) => (
                  <View key={n} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: C.lime, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontFamily: F.black, fontSize: fs.micro, color: C.onAccent }}>{n}</Text>
                    </View>
                    <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk }}>{t(`w.account.settings.coach-step-${n}`)}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.caps, color: C.ash }}>{t("w.account.settings.coach-your-background")}</Text>
              <TextInput
                value={credentials}
                onChangeText={setCredentials}
                placeholder={t("w.account.settings.coach-bg-ph")}
                placeholderTextColor={C.ash}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 16, marginTop: 12, minHeight: 120 }}
              />
              {!!error && <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.caption, color: FEEDBACK.error, marginTop: 10 }}>{error}</Text>}
              <Pressable
                onPress={submit}
                disabled={!canSubmit}
                style={{ backgroundColor: canSubmit ? C.lime : withAlpha(C.lime, ALPHA.line), borderRadius: RADIUS.pill, paddingVertical: 16, alignItems: "center", marginTop: 16 }}
              >
                {busy ? <ActivityIndicator color={C.onAccent} /> : <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.onAccent }}>{t("w.account.settings.coach-submit")}</Text>}
              </Pressable>
            </ACard>
          )}

          {sent && existing?.status === "pending" && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime), marginTop: 12, textAlign: "center" }}>{t("w.account.settings.coach-submitted")}</Text>
          )}
        </>
      )}
    </AuroraScreen>
  );
}
