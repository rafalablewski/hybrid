import { View, Text } from "react-native";
import { useTheme, txt } from "../../lib/theme";
import { fs, F, startGlow, PressScale as Pressable, FIXED_FONT_SCALE , tracking} from "../../lib/ui";
import { RADIUS } from "./kit";
import { withAlpha } from "./field";
import { ALPHA, STATE_OPACITY } from "@hybrid/core";

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

// NO TRAILING SLOT. One shipped here for a day: the day card's "View in
// history" exit rode this row's far edge, to spare the card a line of its own.
// It didn't fit — a 187px pill and a 133px label do not share a 311px measure,
// so the row wrapped and handed the exit back the orphan line the slot existed
// to remove. The exit is gone now (the Today screen already carries ONE door
// into History, in the door-row anatomy, after the retrospective), and this
// component is back to the one job it is named for. If a row ever genuinely
// needs a trailing element, measure the two labels at 320pt first.
export default function AActionPair({ actions, align = "center" }: {
  actions: PairAction[];
  /** Centred under an empty block; leading under a receipt, where the column
   *  edge is already established by the figures above. */
  align?: "center" | "leading";
}) {
  const { palette: C } = useTheme();
  const live = actions.filter(Boolean);
  if (live.length === 0) return null;

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
            backgroundColor: a.prominent ? C.lime : withAlpha(C.chalk, ALPHA.wash),
            ...(a.prominent ? {} : { borderWidth: 1, borderColor: withAlpha(C.chalk, ALPHA.solid) }),
            ...(a.prominent ? startGlow(C.lime, pressed) : { opacity: pressed ? STATE_OPACITY.disabled : 1 }),
          })}
        >
          <Text
            maxFontSizeMultiplier={FIXED_FONT_SCALE}
            numberOfLines={1}
            style={{ fontFamily: F.black, fontSize: fs.bodyLg, letterSpacing: tracking(fs.bodyLg), color: a.prominent ? C.onAccent : txt(C, C.chalk) }}
          >
            {a.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
