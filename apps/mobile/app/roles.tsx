import { View, Text } from "react-native";
import { Screen, Card, Kicker, Mono, H1, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";

/** Roles & access — how the three roles are scoped. Access is enforced
 *  server-side by RELATIONSHIP, not the role label. Mobile port (info). */
export default function Roles() {
  const C = useTheme().palette;
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
    <Screen>
      <Kicker>Roles & access</Kicker>
      <H1>Who can see what</H1>
      <Mono style={{ marginTop: 6, lineHeight: 18 }}>
        Three roles, each scoped. Access is enforced server-side by relationship, not the role label alone.
      </Mono>

      {ROLES.map((r) => (
        <Card key={r.name} style={{ borderLeftWidth: 3, borderLeftColor: r.color, marginTop: 12 }}>
          <Text style={{ fontFamily: F.black, fontSize: 18, color: txt(C, r.color) }}>{r.name}</Text>
          <Mono color={C.chalk} style={{ marginTop: 6, lineHeight: 18 }}>{r.desc}</Mono>
        </Card>
      ))}

      <Card style={{ marginTop: 14 }}>
        <Kicker>Permission matrix</Kicker>
        <View style={{ marginTop: 8 }}>
          {MATRIX.map(([cap, who]) => (
            <View key={cap} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
              <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.chalk }}>{cap}</Text>
              <Mono color={C.ash} style={{ fontSize: 11, marginTop: 2 }}>{who}</Mono>
            </View>
          ))}
        </View>
      </Card>
      <View style={{ height: 16 }} />
    </Screen>
  );
}
