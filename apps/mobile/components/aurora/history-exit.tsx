import { tracking } from "@hybrid/core";
import { useTheme } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { fs, F, PressScale as Pressable } from "../../lib/ui";
import { CtaLabel } from "./cta-label";

// ── AURORA History exit (mobile) ────────────────────────────────────────────
// The way out of the day card and into the full log. ONE component, because the
// two week rails drew it twice with two different arrangements — the plan rail
// gave it a hairline, 16px of padding and a 31px indent; the logbook rail gave
// it 18px of margin and the same indent — for the same six words pointing at
// the same screen. That is exactly the drift the shared tail components exist
// to stop.
//
// IT IS NOT A BUTTON, so it wears no box: no fill, no border, no radius (the
// house exit rule — a bordered box at the end of a thing reads as one more item
// of that thing, and this one carries no content at all). It is not ringed
// either: the ring is the 44px/32px arrow of a rail tail or a door row, and
// this is a quiet mono label at the card's foot, not a destination row.
//
// AND IT SITS AT THE FOOT'S RIGHT EDGE, which is the one thing about it that is
// not flush left. Everything else on the receipt now starts on the card's
// single content edge; an exit parked on that same edge, directly under the
// figures, reads as one more line OF the receipt — which is precisely how it
// failed before. The opposite edge says "this leaves" without a glyph having to
// say it, and on a logged day it shares its baseline with the day's action pill
// instead of costing the card a line of its own.
export default function HistoryExit({ onPress }: { onPress: () => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // The label is the whole target, so the touch area comes from hitSlop
      // rather than padding — padding here would break the shared baseline it
      // sits on beside the action pill.
      hitSlop={{ top: 14, bottom: 14, left: 16, right: 16 }}
      style={{ paddingVertical: 4 }}
    >
      <CtaLabel
        label={`${t("w.home.rail.viewHistory")} →`}
        color={C.ash}
        fontSize={fs.micro}
        font={F.mono}
        style={{ letterSpacing: tracking.caps, textTransform: "uppercase" }}
      />
    </Pressable>
  );
}
