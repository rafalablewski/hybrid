import { useState } from "react";
import { View, Text, Modal } from "react-native";
import { leading, tracking, fs, F, space, PressScale as Pressable } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { CtaLabel } from "./aurora/cta-label";
import { ACard, RADIUS, withAlpha } from "./aurora/kit";
import { SCRIM, motion } from "@hybrid/core";

// ============================================================
//  Guided first-run tour (mobile) — the "how to use HYBRID"
//  walkthrough shown ONCE after onboarding for a fresh account
//  (and never while a guest workout is still being saved). A
//  stepped overlay that mirrors the web tour's copy/flow.
// ============================================================

export interface TourStep {
  title: string;
  body: string;
}

export const FIRST_RUN_TOUR: TourStep[] = [
  { title: "Your day, here", body: "Today is your home. When you follow a plan, your exact session for the day shows up here — tap Start to log it." },
  { title: "Follow a plan", body: "Open Plans to browse the library and enrol. Following a plan is free — HYBRID walks you through it session by session." },
  { title: "Your profile", body: "Your HPI, records and training history live in the You tab as you log. It builds from your real sessions — nothing is pre-filled." },
  { title: "Configure your account", body: "Set your name, language, notifications and privacy in More → Settings. You can switch to the full athlete toolkit anytime." },
];

export default function Tour({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const C = useTheme().palette;
  const [i, setI] = useState(0);
  const step = steps[i];
  if (!step) return null;
  const last = i === steps.length - 1;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDone}>
      <View style={{ flex: 1, backgroundColor: withAlpha(SCRIM, motion.scrimObscure), justifyContent: "flex-end", padding: 16 }}>
        {/* THE KIT'S CARD, not a hand-drawn copy of it. The radius triage moved
            this from a raw 24 onto RADIUS.card — a bottom-presented panel is a
            sheet — and that is what the card-surface guard is watching for: a
            card RADIUS plus a card FILL in one style object means the object IS
            a card, and a literal View can never gain the native glass ACard
            mounts on iOS. Padding is unchanged (CARD_PAD is 20, which is what
            was written here); the outer margin stays with the caller. */}
        <ACard style={{ marginBottom: 24 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking(fs.micro, "caps"), textTransform: "uppercase", color: txt(C, C.lime) }}>
            {`Step ${i + 1} / ${steps.length}`}
          </Text>
          <Text style={{ fontFamily: F.bold, fontSize: fs.headline, color: C.chalk, marginTop: 8 }}>{step.title}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, lineHeight: leading(fs.bodyLg, "relaxed"), marginTop: 8 }}>{step.body}</Text>

          {/* progress dots */}
          <View style={{ flexDirection: "row", gap: 6, marginTop: 16 }}>
            {steps.map((_, n) => (
              <View key={n} style={{ width: n === i ? 22 : 7, height: 7, borderRadius: 4, backgroundColor: n === i ? C.lime : C.line }} />
            ))}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20 }}>
            <Pressable onPress={onDone} hitSlop={10}>
              <Text style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.ash }}>Skip</Text>
            </Pressable>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              {i > 0 && (
                <Pressable onPress={() => setI((n) => n - 1)} style={{ backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingHorizontal: 16, paddingVertical: 11 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>Back</Text>
                </Pressable>
              )}
              <Pressable onPress={() => (last ? onDone() : setI((n) => n + 1))} style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 24, paddingVertical: 11 }}>
                <CtaLabel label={last ? "Got it" : "Next →"} color={txt(C, C.ink)} fontSize={fs.bodyLg} />
              </Pressable>
            </View>
          </View>
        </ACard>
      </View>
    </Modal>
  );
}
