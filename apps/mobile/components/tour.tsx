import { useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { fs, F, space } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";

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
  { title: "Your profile", body: "Your HPI, records and training history live in the You tab as you log. It builds from your real workouts — nothing is pre-filled." },
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
      <View style={{ flex: 1, backgroundColor: "rgba(8,9,11,.82)", justifyContent: "flex-end", padding: 18 }}>
        <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 24, padding: 22, marginBottom: 24 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.4, textTransform: "uppercase", color: txt(C, C.lime) }}>
            {`Step ${i + 1} / ${steps.length}`}
          </Text>
          <Text style={{ fontFamily: F.bold, fontSize: fs.heading, color: C.chalk, marginTop: 8 }}>{step.title}</Text>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, lineHeight: 22, marginTop: 8 }}>{step.body}</Text>

          {/* progress dots */}
          <View style={{ flexDirection: "row", gap: 6, marginTop: 18 }}>
            {steps.map((_, n) => (
              <View key={n} style={{ width: n === i ? 22 : 7, height: 7, borderRadius: 4, backgroundColor: n === i ? C.lime : C.line }} />
            ))}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20 }}>
            <Pressable onPress={onDone} hitSlop={10}>
              <Text style={{ fontFamily: F.semi, fontSize: fs.note, color: C.ash }}>Skip</Text>
            </Pressable>
            <View style={{ flexDirection: "row", gap: space.sm }}>
              {i > 0 && (
                <Pressable onPress={() => setI((n) => n - 1)} style={{ backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>Back</Text>
                </Pressable>
              )}
              <Pressable onPress={() => (last ? onDone() : setI((n) => n + 1))} style={{ backgroundColor: C.lime, borderRadius: 999, paddingHorizontal: 24, paddingVertical: 11 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: txt(C, C.ink) }}>{last ? "Got it" : "Next →"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
