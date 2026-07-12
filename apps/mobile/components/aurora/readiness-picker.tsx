import { useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { createCheckin } from "../../lib/api";
import { useRevalidate } from "../../lib/queries";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, F } from "../../lib/ui";

type P = ReturnType<typeof useTheme>["palette"];

// Four readiness levels → a representative 1–5 rating written to the SAME daily
// check-in the full form logs (energy/sleep/soreness/mood), so a quick tap still
// lands in check-in history + weekly compliance and reaches a linked coach. Each
// level shows a minimal face (eyes + mouth, no ring) whose expression reads the
// feeling — grin → smile → flat → frown — in the semantic accent colour
// (green→blue→amber→terracotta).
type Mouth = "grin" | "smile" | "flat" | "frown";
const LEVELS: { key: string; dot: (C: P) => string; rating: number; mouth: Mouth }[] = [
  { key: "primed", dot: (C) => C.lime, rating: 5, mouth: "grin" },
  { key: "good", dot: (C) => C.blue, rating: 4, mouth: "smile" },
  { key: "flat", dot: (C) => C.amber, rating: 3, mouth: "flat" },
  { key: "wrecked", dot: (C) => C.red, rating: 2, mouth: "frown" },
];

/** The mood-shaped mouth, built from plain Views (no react-native-svg dep). The
 *  curves are a CLIPPED RING — a bordered circle inside an overflow:hidden box
 *  that reveals only its bottom arc (smile) or top arc (frown). That renders a
 *  real, reliable curve on iOS + Android; a single-side border + radius collapses
 *  to a flat line on device. Mirrors the web <Face> SVG mouth paths. */
function Mouth({ color, mouth }: { color: string; mouth: Mouth }) {
  if (mouth === "flat") {
    return <View style={{ width: 14, height: 2.6, backgroundColor: color, borderRadius: 1.3 }} />;
  }
  const D = 16; // ring diameter; the visible slice is the arc of a circle this big.
  // Kept narrower than the eyes' span (matching the web face) so the mouth reads
  // in proportion.
  const bw = 2.6; // stroke weight (matches the eyes / web stroke)
  const h = mouth === "grin" ? 7 : mouth === "frown" ? 6 : 5; // slice height = curve depth
  // smile shows the ring's BOTTOM arc (push the circle up so only its base peeks);
  // frown shows the TOP arc (align the circle's top with the clip box).
  const marginTop = mouth === "frown" ? 0 : -(D - h);
  return (
    <View style={{ width: D, height: h, overflow: "hidden", alignItems: "center" }}>
      <View style={{ width: D, height: D, borderRadius: D / 2, borderWidth: bw, borderColor: color, marginTop }} />
    </View>
  );
}

/** Minimal readiness face — two eyes + a mood-shaped mouth (no ring). Mirrors the
 *  web <Face> SVG. */
function Face({ color, mouth }: { color: string; mouth: Mouth }) {
  const eye = { width: 4.5, height: 4.5, borderRadius: 2.25, backgroundColor: color } as const;
  return (
    <View style={{ width: 34, height: 34, alignItems: "center", justifyContent: "center", gap: 5 }}>
      <View style={{ flexDirection: "row", gap: 9 }}>
        <View style={eye} />
        <View style={eye} />
      </View>
      <Mouth color={color} mouth={mouth} />
    </View>
  );
}

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
          <Face color={txt(C, l.dot(C))} mouth={l.mouth} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.chalk }}>{t(`w.recovery.readiness.${l.key}`)}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: 1, marginTop: 3 }}>{t(`w.recovery.readiness.${l.key}Sub`)}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}
