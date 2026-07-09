import { useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { createCheckin } from "../../lib/api";
import { useRevalidate } from "../../lib/queries";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { fs, F } from "../../lib/ui";

type P = ReturnType<typeof useTheme>["palette"];

// Four readiness levels → a representative 1–5 rating written to the SAME daily
// check-in the full form logs (energy/sleep/soreness/mood), so a quick tap still
// lands in check-in history + weekly compliance and reaches a linked coach. The
// dot colour follows the semantic spectrum (green→blue→amber→terracotta).
const LEVELS: { key: string; dot: (C: P) => string; rating: number }[] = [
  { key: "primed", dot: (C) => C.lime, rating: 5 },
  { key: "good", dot: (C) => C.blue, rating: 4 },
  { key: "flat", dot: (C) => C.amber, rating: 3 },
  { key: "wrecked", dot: (C) => C.red, rating: 2 },
];

/**
 * AURORA Readiness picker — the compact "How ready do you feel?" quick action
 * (the Today Readiness sheet). One tap logs today's readiness; the full weekly
 * check-in (weight, note, share-with-coach, history) still lives on its own
 * screen. Mirrors the web ReadinessPicker.
 */
export default function ReadinessPicker({ onDone }: { onDone?: () => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const revalidate = useRevalidate();
  const [busy, setBusy] = useState<string | null>(null);

  const pick = async (key: string, rating: number) => {
    if (busy) return;
    setBusy(key);
    const ok = await createCheckin({
      weekOf: new Date().toISOString(),
      bodyMassKg: null,
      energy: rating, sleep: rating, soreness: rating, mood: rating,
      adherencePct: null, note: null, sharedWithCoach: false,
    });
    setBusy(null);
    if (!ok) { Alert.alert(t("w.recovery.checkins.errSubmit"), t("w.recovery.checkins.errSaveBody")); return; }
    revalidate.recovery();
    onDone?.();
  };

  return (
    <View style={{ gap: 10, marginTop: 14 }}>
      {LEVELS.map((l) => (
        <Pressable
          key={l.key}
          onPress={() => pick(l.key, l.rating)}
          disabled={!!busy}
          accessibilityRole="button"
          accessibilityLabel={`${t(`w.recovery.readiness.${l.key}`)} — ${t(`w.recovery.readiness.${l.key}Sub`)}`}
          style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16, opacity: busy && busy !== l.key ? 0.5 : 1 }}
        >
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: l.dot(C) }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.chalk }}>{t(`w.recovery.readiness.${l.key}`)}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: 1, marginTop: 3 }}>{t(`w.recovery.readiness.${l.key}Sub`)}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
