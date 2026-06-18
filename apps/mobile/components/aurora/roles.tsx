import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useTheme, txt } from "../../lib/theme";
import { F } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, ASub } from "./kit";
import { AuroraIcon } from "./icons";

/** AURORA Roles & access — the same scoped-role explainer + permission matrix
 *  as the classic, in the rounded Aurora style. */
export default function AuroraRoles() {
  const { palette: C } = useTheme();
  const router = useRouter();
  const ROLES = [
    { name: "Client", color: C.lime, desc: "Owns their own data. Sees only themselves. Private coach notes stay hidden." },
    { name: "Coach", color: C.violet, desc: "Sees only athletes who accepted them (mutual consent). Can leave private notes. Also a client." },
    { name: "Admin", color: C.amber, desc: "Platform aggregates & content. No silent access to private training data; support access is audited." },
  ] as const;
  const MATRIX: [string, string][] = [
    ["Own training data", "Client · Coach (consented) · Admin (no)"],
    ["Another athlete's data", "Coach via ACTIVE link only"],
    ["Private coach notes", "Coach only — never the client"],
    ["Platform aggregates", "Admin only"],
    ["Change roles", "Admin only · audited"],
  ];

  return (
    <AuroraScreen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="back" size={20} color={C.chalk} />
        </Pressable>
        <AHeading style={{ fontSize: 26 }}>Roles &amp; access</AHeading>
      </View>
      <ASub style={{ marginTop: 10 }}>Three roles, each scoped. Access is enforced server-side by relationship, not the role label alone.</ASub>

      {ROLES.map((r) => (
        <ACard key={r.name} style={{ marginTop: 14, flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
          <AuroraIcon name="user" size={24} color={txt(C, r.color)} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.black, fontSize: 18, color: txt(C, r.color) }}>{r.name}</Text>
            <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.chalk, marginTop: 6, lineHeight: 18 }}>{r.desc}</Text>
          </View>
        </ACard>
      ))}

      <ACard style={{ marginTop: 14 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>Permission matrix</Text>
        <View style={{ marginTop: 8 }}>
          {MATRIX.map(([cap, who]) => (
            <View key={cap} style={{ paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line }}>
              <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.chalk }}>{cap}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginTop: 2 }}>{who}</Text>
            </View>
          ))}
        </View>
      </ACard>
    </AuroraScreen>
  );
}
