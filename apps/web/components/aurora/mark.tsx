import type { Mark as MarkValue } from "@hybrid/core";
import { Glyph, SportMark } from "./icons";

/** Draws a core `Mark`. Twin of apps/mobile/components/aurora/mark.tsx. */
export function Mark({
  mark,
  size = 22,
  color = "currentColor",
  strokeWidth,
  style,
}: {
  mark: MarkValue;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}) {
  return mark.kind === "sport"
    ? <SportMark sport={mark.sport} size={size} color={color} strokeWidth={strokeWidth} style={style} />
    : <Glyph name={mark.name} size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}
