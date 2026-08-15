import { useState } from "react";
import { View, Text, TextInput, ActivityIndicator } from "react-native";
import { leavePlan } from "../../lib/api";
import { useRevalidate } from "../../lib/queries";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { leading, tracking, fs, F, PressScale as Pressable } from "../../lib/ui";
import { ACard, RADIUS } from "./kit";
import { withAlpha } from "./field";
import { ALPHA } from "@hybrid/core";

/** The active enrolled season, as the leave flow needs it (from fetchMacrocycle). */
export type EnrolledSeason = { macroId: string; planId: string | null; goal: string; startedAt: string | null };

/** The leave-plan flow: a quiet text link that expands into the explicit
 *  keep-vs-delete choice for the workouts logged during the plan, with a
 *  typed-DELETE confirm arming the destructive branch (same pattern as the
 *  settings danger zone). Deliberately NOT a persistent button — an
 *  ever-visible exit reads as an invitation to quit. Mirrors the web.
 *
 *  The PARENT decides when it renders: the Plans detail page shows it only on
 *  the enrolled named plan; Periodize shows it only for goal-only seasons
 *  (planId null — no plan page exists to host the link). */
export function LeavePlanSection({ enrolled, onLeft }: { enrolled: EnrolledSeason; onLeft: () => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [wipe, setWipe] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const armed = !wipe || confirmText.trim().toUpperCase() === "DELETE";
  const revalidate = useRevalidate();

  const leave = async () => {
    if (!armed || busy) return;
    setBusy(true);
    setError(false);
    const ok = await leavePlan(enrolled.macroId, wipe);
    setBusy(false);
    if (!ok) { setError(true); return; }
    // Left the plan (and possibly wiped history) — drop both, or the app keeps
    // showing a season the athlete just cancelled.
    revalidate.macrocycle();
    if (wipe) revalidate.sessions();
    onLeft();
  };

  const option = (selected: boolean, tone: string, title: string, sub: string, pick: () => void) => (
    <Pressable
      accessibilityRole="radio" accessibilityState={{ selected }} onPress={pick}
      style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", padding: 12, borderRadius: RADIUS.field, backgroundColor: selected ? withAlpha(tone, ALPHA.fill) : C.ink, borderWidth: 1, borderColor: selected ? tone : C.line, marginTop: 8 }}
    >
      <Text style={{ fontFamily: F.bold, color: txt(C, tone), width: 16 }}>{selected ? "✓" : ""}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: C.chalk }}>{title}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 2, lineHeight: leading(fs.caption, "snug") }}>{sub}</Text>
      </View>
    </Pressable>
  );

  if (!open)
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={{ alignSelf: "flex-start", marginTop: 20, marginBottom: 8 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, textDecorationLine: "underline" }}>{t("w.train.plans.leavePlan")}…</Text>
      </Pressable>
    );

  return (
    <ACard style={{ marginTop: 20 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.caps, color: txt(C, C.red) }}>{t("w.train.plans.leavePlan")}</Text>
      <View style={{ marginTop: 10 }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: leading(fs.body) }}>{t("w.train.plans.leaveExplain")}</Text>
          {option(!wipe, C.lime, t("w.train.plans.leaveKeep"), t("w.train.plans.leaveKeepSub"), () => setWipe(false))}
          {option(wipe, C.red, t("w.train.plans.leaveWipe"), t("w.train.plans.leaveWipeSub"), () => setWipe(true))}
          {wipe && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{t("w.train.plans.leaveTypeDelete")}</Text>
              <TextInput
                value={confirmText} onChangeText={setConfirmText} placeholder="DELETE" placeholderTextColor={C.ash}
                autoCapitalize="characters" autoCorrect={false}
                style={{ fontFamily: F.mono, fontSize: fs.note, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: armed ? C.red : C.line, borderRadius: RADIUS.field, paddingHorizontal: 16, paddingVertical: 12, marginTop: 8 }}
              />
            </View>
          )}
          {error && <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.red), marginTop: 10 }}>{t("w.train.plans.leaveError")}</Text>}
          <Pressable onPress={leave} disabled={!armed || busy} accessibilityRole="button" style={{ backgroundColor: armed && !busy ? C.red : withAlpha(C.red, ALPHA.line), borderRadius: RADIUS.pill, paddingVertical: 12, alignItems: "center", marginTop: 16 }}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: "#fff" }}>{wipe ? t("w.train.plans.leaveWipeCta") : t("w.train.plans.leaveCta")}</Text>}
          </Pressable>
          <Pressable onPress={() => { setOpen(false); setWipe(false); setConfirmText(""); setError(false); }} accessibilityRole="button" style={{ alignItems: "center", paddingVertical: 12 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.train.plans.leaveCancel")}</Text>
          </Pressable>
      </View>
    </ACard>
  );
}
