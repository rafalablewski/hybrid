import { View, Text } from "react-native";
import { fs, F } from "../lib/ui";
import { GlassToggle } from "./glass-toggle";

/** A labelled preference row with an on/off toggle — shared by Notifications +
 *  Privacy on BOTH mobile Settings variants (classic + Aurora) so the toggle
 *  looks and behaves identically. Uses the shared GlassToggle (the native
 *  Liquid-Glass switch from Logger settings) so every settings row matches. */
export function ToggleRow({
  C, title, desc, on, onToggle, disabled, noBorder,
}: {
  C: { chalk: string; ash: string; lime: string; line: string; onAccent: string };
  title: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Drop the top divider — for a row that sits alone in its own card. */
  noBorder?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 11, borderTopWidth: noBorder ? 0 : 1, borderTopColor: C.line }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{title}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2, lineHeight: 15 }}>{desc}</Text>
      </View>
      <GlassToggle value={on} onValueChange={onToggle} disabled={disabled} accessibilityLabel={title} accessibilityHint={desc} />
    </View>
  );
}
