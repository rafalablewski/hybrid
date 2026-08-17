import { type ColorValue, type StyleProp, type ViewStyle } from "react-native";
import type { Mark as MarkValue } from "@hybrid/core";
import { Glyph, SportMark } from "./icons";

/**
 * Draws a core `Mark` — the one way a data row puts a picture on the glass.
 *
 * Every field that used to hold an emoji (`icon: string`, `emoji: string`) now
 * holds a `Mark`, and this is what renders it. See core theme/mark.ts for why
 * the fix is a type change rather than a sweep of call sites.
 */
export function Mark({
  mark,
  size = 22,
  color,
  label,
  style,
}: {
  mark: MarkValue;
  size?: number;
  color: ColorValue;
  /** See `Glyph.label` — an accessible name for a mark that carries meaning on
   *  its own. Omitted = decorative, hidden from the accessibility tree. */
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return mark.kind === "sport"
    ? <SportMark sport={mark.sport} size={size} color={color} label={label} style={style} />
    : <Glyph name={mark.name} size={size} color={color} label={label} style={style} />;
}
