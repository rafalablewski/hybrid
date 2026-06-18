import { useCallback, useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { askAiCoach, type CoachNote } from "../../lib/api";
import { useTheme, txt } from "../../lib/theme";
import { F } from "../../lib/ui";
import { AuroraScreen, ACard, APill, AHeading, RADIUS } from "./kit";

/** AURORA AI coach — same /api/ai-coach call (server-side Claude, engine
 *  fallback) and rendered note as the classic, in the rounded look. */
export default function AuroraAiCoach() {
  const { palette: C } = useTheme();
  const router = useRouter();
  const [note, setNote] = useState<CoachNote | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = useCallback(async () => {
    setBusy(true);
    setNote(await askAiCoach());
    setBusy(false);
  }, []);

  // Generate today's note on open; the athlete can re-ask any time.
  useEffect(() => {
    ask();
  }, [ask]);

  const chip = (label: string, color: string) => (
    <View style={{ backgroundColor: `${color}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 11, color: txt(C, color) }}>{label}</Text>
    </View>
  );

  return (
    <AuroraScreen>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <AHeading style={{ fontSize: 26 }}>AI coach</AHeading>
        <Text onPress={() => router.back()} style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>← back</Text>
      </View>

      <ACard style={{ marginTop: 14, borderLeftWidth: 3, borderLeftColor: C.violet }}>
        <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk }}>Today&apos;s coaching note</Text>
        <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.chalk, marginTop: 8, lineHeight: 20 }}>
          Claude reads your real readiness, fatigue, velocity and goal and writes you a personalized note —
          what to push and what to hold back.
        </Text>

        {busy ? (
          <View style={{ marginTop: 18, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator color={C.violet} />
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>Reading your training…</Text>
          </View>
        ) : note?.text ? (
          <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line }}>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {note.source ? chip(note.source === "ai" ? "Claude" : "Engine", note.source === "ai" ? C.lime : C.ash) : null}
              {note.readiness != null ? chip(`readiness ${note.readiness}/100`, C.blue) : null}
              {note.hpi != null ? chip(`HPI ${note.hpi}`, C.violet) : null}
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: 15, lineHeight: 24, color: txt(C, C.chalk) }}>{note.text}</Text>
          </View>
        ) : null}

        <View style={{ marginTop: 16 }}>
          <APill label={busy ? "Thinking…" : "Ask again →"} variant="soft" onPress={ask} disabled={busy} style={{ paddingVertical: 14 }} />
        </View>
      </ACard>
    </AuroraScreen>
  );
}
