import { View, Text, Pressable } from "react-native";
import { fs, F } from "../lib/ui";

/** A labelled preference row with an on/off pill — shared by Notifications +
 *  Privacy on BOTH mobile Settings variants (classic + Aurora) so the toggle
 *  looks and behaves identically. */
export function ToggleRow({
  C, title, desc, on, onToggle, disabled,
}: {
  C: { chalk: string; ash: string; lime: string; line: string; onAccent: string };
  title: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.line }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{title}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2, lineHeight: 15 }}>{desc}</Text>
      </View>
      <Pressable
        onPress={onToggle}
        disabled={disabled}
        style={{ width: 46, height: 26, borderRadius: 999, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? C.lime : "transparent", opacity: disabled ? 0.5 : 1, justifyContent: "center" }}
      >
        <View style={{ width: 20, height: 20, borderRadius: 10, marginLeft: on ? 24 : 2, backgroundColor: on ? C.onAccent : C.ash }} />
      </Pressable>
    </View>
  );
}
