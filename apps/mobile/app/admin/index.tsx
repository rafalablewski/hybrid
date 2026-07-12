import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Kicker, Mono, H1, F } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { useSession } from "../../lib/session";
import { AuroraIcon } from "../../components/aurora/icons";
import { ADMIN_SECTIONS, ADMIN_GROUPS } from "../../components/admin/sections";

// The mobile admin console home — a grouped springboard of every admin section
// (parity with the web sidebar). Tapping a tile opens app/admin/[section].
export default function AdminHome() {
  const router = useRouter();
  const { palette } = useTheme();
  const { name } = useSession();

  return (
    <Screen>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <Kicker color={palette.amber}>admin.hybrid.app</Kicker>
        <Pressable onPress={() => router.replace("/(tabs)")} hitSlop={8}>
          <Mono color={palette.ash}>← App</Mono>
        </Pressable>
      </View>
      <H1>Admin console</H1>
      <Mono color={palette.ash} style={{ marginTop: 4, marginBottom: 18 }}>
        Signed in as {name} – restricted to admins
      </Mono>

      {ADMIN_GROUPS.map((group) => (
        <View key={group} style={{ marginBottom: 18 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.6, textTransform: "uppercase", color: palette.ash, marginBottom: 8 }}>
            {group}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 }}>
            {ADMIN_SECTIONS.filter((s) => s.group === group).map((s) => (
              <Pressable
                key={s.id}
                onPress={() => router.push(`/admin/${s.id}`)}
                style={{ width: "33.333%", padding: 4 }}
              >
                <View
                  style={{
                    backgroundColor: palette.ink2,
                    borderWidth: 1,
                    borderColor: palette.line,
                    borderRadius: 16,
                    paddingVertical: 16,
                    paddingHorizontal: 8,
                    alignItems: "center",
                    gap: 8,
                    minHeight: 92,
                    justifyContent: "center",
                  }}
                >
                  <AuroraIcon name={s.icon} size={22} color={palette.amber} />
                  <Text numberOfLines={2} style={{ fontFamily: F.semi, fontSize: 11.5, color: palette.chalk, textAlign: "center" }}>
                    {s.label}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}
