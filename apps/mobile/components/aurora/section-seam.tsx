import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../lib/theme";
import { GUTTER } from "./kit";

/**
 * THE SEAM — the page turning between two clusters. The TWIN of
 * components/aurora/section-seam.tsx on web.
 *
 * Today's clusters have always separated by whitespace alone: a GroupMark sits
 * 36dp below whatever precedes it, which is more air than anything inside a
 * cluster gets, and that is enough while the clusters are short. PROGRESS and
 * ENDURANCE are not short — each is a headed card, a filter, breakdowns and
 * rails — and after a screen of scrolling through one, the extra air reads as a
 * gap in the list rather than as the end of a chapter. The next headline has to
 * carry the whole burden of saying "that was a different thing".
 *
 * So this is one rule, and it is deliberately NOT the divider the GroupMark
 * study retired. That one was a hairline ATTACHED to a label — the
 * label-plus-rule that reads as the default heading treatment every generated
 * layout reaches for. This one has no label. It belongs to neither section, it
 * carries nothing, and it is the only rule on the screen that runs FULL-BLEED:
 * the same negative margins the rails use, so it crosses the whole device and
 * reads as the sheet ending rather than as a box being drawn around something.
 *
 * IT FADES AT BOTH ENDS. A hairline that hits the screen edge square looks like
 * the top border of a container that failed to render. A gradient that dissolves
 * into the ground is a horizon: strongest where the eye is (the middle of the
 * column), gone by the time it reaches anywhere it could be mistaken for chrome.
 *
 * A StyleSheet.hairlineWidth line would be crisper, but it cannot fade — hence
 * the 1dp gradient, which is what the web twin draws too.
 */
export default function SectionSeam({ mt = 32 }: { mt?: number }) {
  const { palette: C } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ marginTop: mt, marginHorizontal: -GUTTER, height: 1 }}
    >
      <LinearGradient
        colors={["transparent", C.line, C.line, "transparent"]}
        locations={[0, 0.22, 0.78, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ flex: 1 }}
      />
    </View>
  );
}
