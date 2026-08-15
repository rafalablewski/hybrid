import type { ReactNode } from "react";
import { View, Text } from "react-native";
import { useTheme } from "../../lib/theme";
import { F, tracking } from "../../lib/ui";

/** GROUP MARKER — the HEADLINE TIER (cluster-marker study, direction 02).
 *  The hub's long scrolls (Today's daily loop, the Performance page) are
 *  organised into named clusters, and each opens with its name as a TRUE
 *  typographic tier — the display face at 23, between the masthead (34) and
 *  the block heads (18) — and nothing else. No rule, no mono, no chrome: the whitespace above does all the
 *  separating (36dp by default, deliberately larger than any gap inside a
 *  cluster, so the headline always sits closer to its own content than to
 *  what precedes it). The first cut was a mono-uppercase label with a
 *  trailing hairline; it read as the default divider every generated layout
 *  reaches for, and was retired for pure type. `mt` compensates containers
 *  that already contribute their own spacing, keeping the OPTICAL 36
 *  constant. Mirrors web (aurora/group-mark.tsx).
 *
 *  `right` is the cluster's HEAD-LEVEL CONTROL, and it is the one thing allowed
 *  on this row besides the name — the Explore SectionHead grammar, which puts a
 *  meta or a control (a count, a filter) on the right of the same row as the
 *  title. Today's period filter lives there: a filter scopes the whole cluster,
 *  so it belongs beside the cluster's name rather than under one block inside
 *  it, where it read as that block's own control. Absent by default, and the
 *  headline is then exactly the bare type it has always been. */
export default function GroupMark({ label, mt = 36, right }: { label: string; mt?: number; right?: ReactNode }) {
  const { palette: C } = useTheme();
  const heading = (
    <Text
      accessibilityRole="header"
      style={{ fontFamily: F.black, fontSize: 23, letterSpacing: tracking.display, lineHeight: 26, color: C.chalk }}
    >
      {label}
    </Text>
  );
  if (!right) return <View style={{ marginTop: mt, marginHorizontal: 2 }}>{heading}</View>;
  return (
    <View style={{ marginTop: mt, marginHorizontal: 2, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      {heading}
      {right}
    </View>
  );
}
