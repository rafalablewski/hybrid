import { type ReactNode } from "react";
import { View, Text } from "react-native";
import { useTheme, txt } from "../../lib/theme";
import { fs, F, startGlow, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { RADIUS } from "./kit";

// ── AURORA Action pair (mobile) ─────────────────────────────────────────────
// A PRIMARY AND A SECONDARY ON ONE BASELINE — SwiftUI's `.borderedProminent`
// beside `.bordered`, drawn in the app's own paint because the primary carries
// the brand fill and no system button style does.
//
// It replaces the arrangement that put a full-bleed glowing chartreuse pill at
// the top of the empty state and, forty pixels and a hairline below it, a
// dashed square with a lime word — two actions at the same weight in two
// different vocabularies. Both belonged there; only one can be first.
//
// The hierarchy is a FILL, never a layout: an open day fills the primary, a day
// that already holds training fills neither and both actions go neutral. So the
// card stops asking the moment the work is real without anything moving, and
// there are never two accent surfaces on one screen.
//
// A dashed border is a web affordance that appears nowhere in iOS, which is why
// the secondary is a solid neutral capsule. It is an ACTION, so it wears a
// capsule — the no-bordered-box rule governs EXITS (an end-of-thing affordance
// carrying no content), not controls.

export type PairAction = {
  label: string;
  onPress: () => void;
  /** Wears the brand fill. At most one in a pair, and only when the day is
   *  genuinely waiting on something. */
  prominent?: boolean;
  a11y?: string;
};

export default function AActionPair({ actions, align = "center", trailing }: {
  actions: PairAction[];
  /** Centred under an empty block; leading under a receipt, where the column
   *  edge is already established by the figures above. */
  align?: "center" | "leading";
  /** THE WAY OUT, on the same baseline as the way in. A card's exit (History,
   *  a fuller list) is not an action and never wears a capsule, but it does
   *  belong on the card's LAST line — so it rides this row, pinned to the far
   *  edge, instead of costing a line of its own underneath. With no actions at
   *  all the row is still drawn for it (the plan rail's finished day offers
   *  nothing to do, and still has to be leavable). Pairs with `align="leading"`;
   *  a centred pair has no far edge to pin to. */
  trailing?: ReactNode;
}) {
  const { palette: C } = useTheme();
  const live = actions.filter(Boolean);
  if (live.length === 0 && !trailing) return null;

  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: align === "center" ? "center" : "flex-start",
        gap: 9,
        marginTop: 14,
      }}
    >
      {live.map((a) => (
        <Pressable
          key={a.label}
          onPress={a.onPress}
          accessibilityRole="button"
          accessibilityLabel={a.a11y ?? a.label}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 11,
            paddingHorizontal: a.prominent ? 20 : 17,
            borderRadius: RADIUS.pill,
            backgroundColor: a.prominent ? C.lime : `${C.chalk}17`,
            ...(a.prominent ? {} : { borderWidth: 1, borderColor: `${C.chalk}26` }),
            ...(a.prominent ? startGlow(C.lime, pressed) : { opacity: pressed ? 0.7 : 1 }),
          })}
        >
          <Text
            maxFontSizeMultiplier={FIXED_FONT_SCALE}
            numberOfLines={1}
            style={{ fontFamily: F.black, fontSize: fs.note, letterSpacing: -0.2, color: a.prominent ? C.onAccent : txt(C, C.chalk) }}
          >
            {a.label}
          </Text>
        </Pressable>
      ))}
      {/* `marginLeft: auto` rather than space-between, so a single action still
          sits on the leading edge and the exit still lands on the trailing one
          — and when the pills wrap, the exit stays on the last line's far end
          instead of stranding itself above them. */}
      {trailing ? <View style={{ marginLeft: "auto" }}>{trailing}</View> : null}
    </View>
  );
}
