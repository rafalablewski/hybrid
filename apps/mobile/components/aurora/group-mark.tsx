import type { ReactNode } from "react";
import { View, Text } from "react-native";
import type { AccentKey } from "@hybrid/core";
import { accentColor, txt, useTheme } from "../../lib/theme";
import { leading, F, tracking } from "../../lib/ui";

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
 *  headline is then exactly the bare type it has always been.
 *
 *  `hue` IS THE CLUSTER'S DOMAIN, and it is the only colour on this tier. The
 *  palette already assigns a meaning to each of its four accents — lime is the
 *  bar and action, blue is conditioning and feel, amber is sport and plan, red
 *  is alert and connection — and Today's four clusters ARE those four domains.
 *  Spending the assignment here rather than on the cards under it is deliberate:
 *  the headline is the wayfinding tier, it is what the eye lands on when a
 *  thumb stops mid-scroll, and it is one object per cluster rather than the
 *  nine that would each have to agree about an alpha. Four tinted cards in one
 *  scroll read as four warnings the moment those alphas drift; four coloured
 *  names cannot. Absent, the headline stays chalk — which is what the Train
 *  cluster would take anyway, since it is the one cluster with no mark at all
 *  and its colour is already the day field standing directly above it. */
export default function GroupMark({ label, mt = 36, right, hue }: { label: string; mt?: number; right?: ReactNode; hue?: AccentKey }) {
  const { palette: C } = useTheme();
  const heading = (
    <Text
      accessibilityRole="header"
      style={{ fontFamily: F.black, fontSize: 23, letterSpacing: tracking.display, lineHeight: leading(23, "tight"), color: hue ? txt(C, accentColor(C, hue)) : C.chalk }}
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
