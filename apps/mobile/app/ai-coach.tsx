import { useCallback, useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { askAiCoach, type CoachNote } from "../lib/api";
import { Screen, Card, Kicker, Mono, Button, Chip, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";

// The native AI coach — the mobile counterpart to the web AskCoach. POSTs to the
// same /api/ai-coach (server-side Claude, engine fallback) and renders the note.
// Reached from the Home dashboard's "AI coach" card.
export default function AiCoach() {
  const C = useTheme().palette;
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

  return (
    <Screen>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Kicker color={C.violet}>AI coach</Kicker>
        <Text onPress={() => router.back()} style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>← back</Text>
      </View>

      <Card style={{ marginTop: 10, borderLeftWidth: 3, borderLeftColor: C.violet }}>
        <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk }}>Today&apos;s coaching note</Text>
        <Mono color={C.chalk} style={{ marginTop: 6, lineHeight: 20 }}>
          Claude reads your real readiness, fatigue, velocity and goal and writes you a personalized note —
          what to push and what to hold back.
        </Mono>

        {busy ? (
          <View style={{ marginTop: 18, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator color={C.violet} />
            <Mono color={C.ash}>Reading your training…</Mono>
          </View>
        ) : note?.text ? (
          <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line }}>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              {note.source ? (
                <Chip color={note.source === "ai" ? C.lime : C.ash}>{note.source === "ai" ? "Claude" : "Engine"}</Chip>
              ) : null}
              {note.readiness != null ? <Chip color={C.blue}>readiness {note.readiness}/100</Chip> : null}
              {note.hpi != null ? <Chip color={C.violet}>HPI {note.hpi}</Chip> : null}
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: 15, lineHeight: 24, color: txt(C, C.chalk) }}>{note.text}</Text>
          </View>
        ) : null}

        <View style={{ marginTop: 16 }}>
          <Button label={busy ? "Thinking…" : "Ask again →"} color={C.violet} onPress={ask} disabled={busy} />
        </View>
      </Card>
    </Screen>
  );
}
