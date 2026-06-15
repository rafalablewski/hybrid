import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useLang } from "../lib/i18n";
import { Screen, Card, Kicker, Mono, F } from "../lib/ui";
import { useTheme } from "../lib/theme";

// What the Full (athlete) upgrade unlocks — the depth gated behind a paid plan.
const INCLUDED = [
  "Periodized plans & your season",
  "Sport-specific S&C transfer",
  "Velocity (VBT) & load–velocity",
  "Performance State — your Athlete Twin (HPI)",
  "Technique video & asymmetry",
  "Future Self projections & longevity",
];

export default function Upgrade() {
  const C = useTheme().palette;
  const router = useRouter();
  const { t } = useLang();

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={10}>
        <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>← {t("common.back")}</Text>
      </Pressable>

      <Text style={{ fontFamily: F.black, fontSize: 26, color: C.chalk, marginTop: 10 }}>Go Full</Text>
      <Mono color={C.chalk} style={{ marginTop: 6, lineHeight: 19 }}>
        Simple keeps your training tracked and shareable — free, forever. Full unlocks the
        whole athlete toolkit.
      </Mono>

      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.lime, marginTop: 16 }}>
        <Kicker color={C.lime}>What Full adds</Kicker>
        <View style={{ marginTop: 10, gap: 8 }}>
          {INCLUDED.map((line) => (
            <View key={line} style={{ flexDirection: "row", gap: 8 }}>
              <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.lime }}>✓</Text>
              <Text style={{ flex: 1, fontFamily: F.semi, fontSize: 14, color: C.chalk }}>{line}</Text>
            </View>
          ))}
        </View>
      </Card>

      {/* Billing isn't wired yet — be honest rather than dangle a dead button. */}
      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.amber, marginTop: 16 }}>
        <Kicker color={C.amber}>Coming soon</Kicker>
        <Mono color={C.chalk} style={{ marginTop: 8, lineHeight: 19 }}>
          In-app purchase isn&apos;t live yet. Full will be a simple subscription — we&apos;ll
          let you know the moment it opens. Nothing about your tracked training changes in the
          meantime.
        </Mono>
      </Card>

      <Pressable onPress={() => router.back()} style={{ alignItems: "center", paddingVertical: 18 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>Maybe later</Text>
      </Pressable>
    </Screen>
  );
}
