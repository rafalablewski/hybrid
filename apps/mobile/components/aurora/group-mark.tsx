import { Text } from "react-native";
import { useTheme } from "../../lib/theme";
import { F, serifIf } from "../../lib/ui";

/** GROUP MARKER — the HEADLINE TIER (cluster-marker study, direction 02).
 *  The hub's long scrolls (Today's daily loop, the Performance page) are
 *  organised into named clusters, and each opens with its name as a TRUE
 *  typographic tier — the display face at 23, between the masthead (34) and
 *  the block heads (18), serif in Kyoto Hour like the masthead — and nothing
 *  else. No rule, no mono, no chrome: the whitespace above does all the
 *  separating (36dp by default, deliberately larger than any gap inside a
 *  cluster, so the headline always sits closer to its own content than to
 *  what precedes it). The first cut was a mono-uppercase label with a
 *  trailing hairline; it read as the default divider every generated layout
 *  reaches for, and was retired for pure type. `mt` compensates containers
 *  that already contribute their own spacing, keeping the OPTICAL 36
 *  constant. Mirrors web (aurora/group-mark.tsx). */
export default function GroupMark({ label, mt = 36 }: { label: string; mt?: number }) {
  const { palette: C, scheme } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={{ marginTop: mt, marginHorizontal: 2, fontFamily: serifIf(scheme, F.black), fontSize: 23, letterSpacing: -0.5, lineHeight: 26, color: C.chalk }}
    >
      {label}
    </Text>
  );
}
