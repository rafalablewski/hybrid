import { View, Text, Pressable } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useSession } from "../../lib/session";
import { Screen, Kicker, Mono, H1, C, F } from "../../lib/ui";

type Link = { label: string; sub: string; href: Href; color: string };

const SECTIONS: { title: string; links: Link[] }[] = [
  {
    title: "Plan",
    links: [
      { label: "Plans", sub: "browse & enroll", href: "/(tabs)/plans", color: C.lime },
      { label: "Sport", sub: "sport-specific S&C", href: "/(tabs)/sport", color: C.lime },
      { label: "Calendar", sub: "month view · load heat", href: "/calendar", color: C.blue },
      { label: "Onboarding", sub: "4 questions → a plan", href: "/onboarding", color: C.violet },
    ],
  },
  {
    title: "Analyze",
    links: [
      { label: "Velocity", sub: "VBT · load–velocity", href: "/(tabs)/velocity", color: C.blue },
      { label: "Progress photos", sub: "body recomposition", href: "/progress", color: C.violet },
    ],
  },
  {
    title: "Routines & coaching",
    links: [
      { label: "Nutrition", sub: "macros · adaptive targets", href: "/nutrition", color: C.lime },
      { label: "Check-in", sub: "weekly review · coach reply", href: "/checkin", color: C.blue },
      { label: "Coach", sub: "roster · notes · clients", href: "/(tabs)/coach", color: C.violet },
    ],
  },
];

export default function More() {
  const router = useRouter();
  const { signOut } = useSession();

  return (
    <Screen>
      <Kicker>More</Kicker>
      <H1>Everything else</H1>
      <Mono style={{ marginTop: 6 }}>Training lives in Today, Train and History. The rest is here.</Mono>

      {SECTIONS.map((section) => (
        <View key={section.title} style={{ marginTop: 18 }}>
          <Kicker>{section.title}</Kicker>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            {section.links.map((l) => (
              <Pressable
                key={l.label}
                onPress={() => router.push(l.href)}
                style={{ width: "48%", flexGrow: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14 }}
              >
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: l.color }}>{l.label} →</Text>
                <Mono style={{ marginTop: 2, fontSize: 11 }}>{l.sub}</Mono>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <Pressable onPress={signOut} style={{ marginTop: 26, alignItems: "center" }}>
        <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}
