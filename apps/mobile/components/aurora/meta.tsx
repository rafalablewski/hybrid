import { Fragment } from "react";
import { View, Text, type TextStyle } from "react-native";
import { useTheme } from "../../lib/theme";
import { F, fs } from "../../lib/ui";

/**
 * A meta line whose facts are separated by a thin vertical HAIRLINE rule
 * instead of a middot — the mobile twin of the web MetaLine, so both clients
 * divide inline facts the same way. Pass `parts` (falsy dropped) OR a `·`-joined
 * `text` string. `textStyle` sets the font/size/colour of each fact; the rule
 * matches the text colour at low opacity.
 */
export function MetaLine({ parts, text, textStyle }: { parts?: (string | null | undefined | false)[]; text?: string; textStyle?: TextStyle }) {
  const { palette: C } = useTheme();
  const items = (parts ?? (text ? text.split(" · ") : [])).filter(Boolean) as string[];
  const ts: TextStyle = { fontFamily: F.mono, fontSize: fs.micro, color: C.ash, ...textStyle };
  const ruleColor = ts.color ?? C.ash;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      {items.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <View style={{ width: 1, height: 11, backgroundColor: ruleColor as string, opacity: 0.35 }} />}
          <Text style={ts}>{p}</Text>
        </Fragment>
      ))}
    </View>
  );
}
