import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter, type Href } from "expo-router";
import { navVisibleTo, NAV_ITEMS } from "@hybrid/core";
import { useSession } from "../../lib/session";
import { usePersona, useClientPersonaChoice, setClientPersona } from "../../lib/persona";
import { useNavAccess } from "../../lib/access";
import { fetchMyAccessRequests, requestAccess } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { Screen, Kicker, Mono, H1, C, F } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";

// Features worth requesting (everything not casual-by-default).
const GRANTABLE = NAV_ITEMS.filter((i) => i.minPersona && i.minPersona !== "casual");

type Link = { id: string; labelKey: string; sub: string; href: Href; color: string };

const SECTIONS: { titleKey: string; links: Link[] }[] = [
  {
    titleKey: "more.plan",
    links: [
      { id: "plans", labelKey: "nav.plans", sub: "browse & enroll", href: "/(tabs)/plans", color: C.lime },
      { id: "sport", labelKey: "nav.sport", sub: "sport-specific S&C", href: "/(tabs)/sport", color: C.lime },
      { id: "calendar", labelKey: "nav.calendar", sub: "month view · load heat", href: "/calendar", color: C.blue },
      { id: "onboarding", labelKey: "nav.onboarding", sub: "4 questions → a plan", href: "/onboarding", color: C.violet },
    ],
  },
  {
    titleKey: "more.analyze",
    links: [
      { id: "velocity", labelKey: "nav.velocity", sub: "VBT · load–velocity", href: "/(tabs)/velocity", color: C.blue },
      { id: "running", labelKey: "nav.running", sub: "mileage · pace · easy/hard", href: "/(tabs)/running", color: C.blue },
      { id: "progress", labelKey: "nav.progress", sub: "body recomposition", href: "/progress", color: C.violet },
    ],
  },
  {
    titleKey: "more.routines",
    links: [
      { id: "nutrition", labelKey: "nav.nutrition", sub: "macros · adaptive targets", href: "/nutrition", color: C.lime },
      { id: "checkin", labelKey: "nav.checkin", sub: "weekly review · coach reply", href: "/checkin", color: C.blue },
      { id: "coach", labelKey: "nav.coach", sub: "roster · notes · clients", href: "/(tabs)/coach", color: C.violet },
    ],
  },
];

export default function More() {
  const C = useTheme().palette;
  const router = useRouter();
  const { t } = useLang();
  const { signOut, role } = useSession();
  const persona = usePersona();
  const choice = useClientPersonaChoice();
  const access = useNavAccess();
  const [reqStatus, setReqStatus] = useState<Record<string, string>>({});
  useEffect(() => {
    fetchMyAccessRequests().then((rs) => {
      const m: Record<string, string> = {};
      for (const r of rs) m[r.navId] = r.status;
      setReqStatus(m);
    });
  }, []);
  const askAccess = (navId: string) => {
    setReqStatus((s) => ({ ...s, [navId]: "pending" }));
    void requestAccess(navId);
  };
  // Features the user can't currently see — offer to request them.
  const hidden = GRANTABLE.filter((i) => !navVisibleTo(persona, i.id, access));

  // Shape the hub to the persona (honouring the admin's access override): a
  // casual retail user sees only the lean set, an athlete/coach sees the depth.
  // Sections with nothing visible drop out.
  const sections = SECTIONS.map((s) => ({
    ...s,
    links: s.links.filter((l) => navVisibleTo(persona, l.id, access)),
  })).filter((s) => s.links.length > 0);

  return (
    <Screen>
      <Kicker>{t("nav.more")}</Kicker>
      <H1>{t("more.title")}</H1>
      <Mono style={{ marginTop: 6 }}>{t("more.intro")}</Mono>

      {/* Mode toggle — a client flips between the lean tracker and the full
          athlete toolkit. Coaches/admins get their surface from their role. */}
      {role === "client" && (
        <View style={{ marginTop: 16 }}>
          <Kicker>Mode</Kicker>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            {([
              { id: "casual" as const, label: "Simple", sub: "track · share" },
              { id: "athlete" as const, label: "Full", sub: "plans · stats" },
              { id: "coach" as const, label: "Coach", sub: "athletes · squad" },
            ]).map((m) => {
              const active = (choice ?? "casual") === m.id;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setClientPersona(m.id)}
                  style={{ flex: 1, backgroundColor: active ? `${C.lime}1a` : C.card, borderWidth: 1, borderColor: active ? C.lime : C.line, borderRadius: 12, padding: 12 }}
                >
                  <Text style={{ fontFamily: F.bold, fontSize: 14, color: active ? txt(C, C.lime) : C.chalk }}>{m.label}</Text>
                  <Mono style={{ marginTop: 2, fontSize: 10 }}>{m.sub}</Mono>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Athlete cockpit — the organized depth hub (persona/access gated) */}
      {navVisibleTo(persona, "cockpit", access) && (
        <Pressable
          onPress={() => router.push("/cockpit")}
          style={{ marginTop: 18, backgroundColor: `${C.blue}14`, borderWidth: 1, borderColor: `${C.blue}55`, borderRadius: 14, padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 16, color: txt(C, C.blue) }}>◈ Athlete cockpit</Text>
            <Mono style={{ marginTop: 2, fontSize: 11 }}>goal · season · performance · sport · velocity · endurance</Mono>
          </View>
          <Text style={{ fontFamily: F.black, fontSize: 18, color: txt(C, C.blue) }}>→</Text>
        </Pressable>
      )}

      {sections.map((section) => (
        <View key={section.titleKey} style={{ marginTop: 18 }}>
          <Kicker>{t(section.titleKey)}</Kicker>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            {section.links.map((l) => (
              <Pressable
                key={l.labelKey}
                onPress={() => router.push(l.href)}
                style={{ width: "48%", flexGrow: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14 }}
              >
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: txt(C, l.color) }}>{t(l.labelKey)} →</Text>
                <Mono style={{ marginTop: 2, fontSize: 11 }}>{l.sub}</Mono>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      {/* Request a feature — ask an admin to unlock something beyond your persona */}
      {hidden.length > 0 && (
        <View style={{ marginTop: 22 }}>
          <Kicker>Request a feature</Kicker>
          <Mono style={{ marginTop: 4, fontSize: 11 }}>Want a tool you don&apos;t see? Ask an admin to unlock it.</Mono>
          <View style={{ marginTop: 10, gap: 8 }}>
            {hidden.map((item) => {
              const pending = reqStatus[item.id] === "pending";
              return (
                <View key={item.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.chalk }}>{item.icon} {item.label}</Text>
                  {pending ? (
                    <Mono style={{ fontSize: 11 }} color={C.ash}>requested · pending</Mono>
                  ) : (
                    <Pressable onPress={() => askAccess(item.id)} style={{ backgroundColor: `${C.lime}1f`, borderWidth: 1, borderColor: C.lime, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 6 }}>
                      <Text style={{ fontFamily: F.bold, fontSize: 12, color: txt(C, C.lime) }}>Request</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}

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
