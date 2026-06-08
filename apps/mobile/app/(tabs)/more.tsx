import { View, Text, Pressable } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useSession } from "../../lib/session";
import { useLang } from "../../lib/i18n";
import { Screen, Kicker, Mono, H1, C, F } from "../../lib/ui";

type Link = { labelKey: string; sub: string; href: Href; color: string };

const SECTIONS: { titleKey: string; links: Link[] }[] = [
  {
    titleKey: "more.plan",
    links: [
      { labelKey: "nav.plans", sub: "browse & enroll", href: "/(tabs)/plans", color: C.lime },
      { labelKey: "nav.sport", sub: "sport-specific S&C", href: "/(tabs)/sport", color: C.lime },
      { labelKey: "nav.calendar", sub: "month view · load heat", href: "/calendar", color: C.blue },
      { labelKey: "nav.onboarding", sub: "4 questions → a plan", href: "/onboarding", color: C.violet },
    ],
  },
  {
    titleKey: "more.analyze",
    links: [
      { labelKey: "nav.velocity", sub: "VBT · load–velocity", href: "/(tabs)/velocity", color: C.blue },
      { labelKey: "nav.running", sub: "mileage · pace · easy/hard", href: "/(tabs)/running", color: C.blue },
      { labelKey: "nav.progress", sub: "body recomposition", href: "/progress", color: C.violet },
    ],
  },
  {
    titleKey: "more.routines",
    links: [
      { labelKey: "nav.nutrition", sub: "macros · adaptive targets", href: "/nutrition", color: C.lime },
      { labelKey: "nav.checkin", sub: "weekly review · coach reply", href: "/checkin", color: C.blue },
      { labelKey: "nav.coach", sub: "roster · notes · clients", href: "/(tabs)/coach", color: C.violet },
    ],
  },
];

export default function More() {
  const router = useRouter();
  const { t } = useLang();
  const { signOut } = useSession();

  return (
    <Screen>
      <Kicker>{t("nav.more")}</Kicker>
      <H1>{t("more.title")}</H1>
      <Mono style={{ marginTop: 6 }}>{t("more.intro")}</Mono>

      {SECTIONS.map((section) => (
        <View key={section.titleKey} style={{ marginTop: 18 }}>
          <Kicker>{t(section.titleKey)}</Kicker>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            {section.links.map((l) => (
              <Pressable
                key={l.labelKey}
                onPress={() => router.push(l.href)}
                style={{ width: "48%", flexGrow: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14 }}
              >
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: l.color }}>{t(l.labelKey)} →</Text>
                <Mono style={{ marginTop: 2, fontSize: 11 }}>{l.sub}</Mono>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <Pressable
        onPress={() => router.push("/settings")}
        style={{ marginTop: 22, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
      >
        <View>
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{t("settings.title")}</Text>
          <Mono style={{ marginTop: 2, fontSize: 11 }}>{t("settings.sub")}</Mono>
        </View>
        <Text style={{ fontFamily: F.black, fontSize: 18, color: C.ash }}>→</Text>
      </Pressable>

      <Pressable onPress={signOut} style={{ marginTop: 18, alignItems: "center" }}>
        <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>{t("common.signout")}</Text>
      </Pressable>
    </Screen>
  );
}
