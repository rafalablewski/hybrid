import type { ReactNode } from "react";
import { View, Text } from "react-native";
import { emptyDayCopy, type EmptyDayCopy } from "@hybrid/core";
import { useTheme } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { leading, fs, F, FIXED_FONT_SCALE } from "../../lib/ui";
import { AuroraIcon } from "./icons";

// ── AURORA Empty day (mobile) ───────────────────────────────────────────────
// THE one drawing for a day with nothing on it. There used to be three, all
// inside the same card: today's chalk headline with a mono sub-line, a past
// day's ash headline with a different sub-line, and the dashed ＋ tile with its
// whispered caption underneath. Three sets of type for one state, which is how
// a card ends up with five headings before it reaches a fact.
//
// The grammar is SwiftUI's `ContentUnavailableView` — symbol, title, ONE
// description line, then the actions — and the grammar is all we take. The
// native view is not mounted here on purpose: it styles its own type, so it
// would put SF Pro in the middle of a card set in Archivo, and it has no slot
// for our buttons (its props are title/systemImage/description and nothing
// else), which would split one block across two renderers for no gain. Where a
// system view IS the right call is a system CONTROL — see `NativeDateField` and
// `NativeStepper` in swiftui.tsx, both mounted for real.
//
// Copy comes from core `emptyDayCopy` so the tense logic can't fork per client:
// ONE title key in all three tenses, only the sentence under it changes.
//
// The actions are the caller's, passed as children, because which ones are
// honest depends on the day: today offers the live logger AND the sport log; a
// past day offers the sport log alone, dated to that day (you cannot start a
// session in a day that has already happened).

/** The glyph, in the app's own mark set — the RN floor for the SF Symbol name
 *  core hands back. A past day gets the rest-day moon the plan rail uses; a
 *  today gets the check ring, which is the shape the day is waiting to fill. */
function EmptyGlyph({ copy, color }: { copy: EmptyDayCopy; color: string }) {
  if (copy.tense === "past") {
    return <Text style={{ fontSize: 30, lineHeight: leading(30, "tight"), color }}>☾</Text>;
  }
  return <AuroraIcon name="check-circle" size={34} color={color} />;
}

export default function AEmptyDay({
  isToday,
  hasHistory,
  children,
}: {
  isToday: boolean;
  /** The account holds at least one logged session, anywhere. Separates a first
   *  run ("your first session lands here") from an ordinary open day. */
  hasHistory: boolean;
  /** The actions. Rendered under the block, always — an empty day that offers
   *  nothing is a dead end, and every one of these days can still take a sport. */
  children?: ReactNode;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const copy = emptyDayCopy({ isToday, hasHistory });

  return (
    <View>
      <View style={{ alignItems: "center", gap: 7, paddingTop: 14, paddingBottom: 2, paddingHorizontal: 6 }}>
        <EmptyGlyph copy={copy} color={copy.quiet ? `${C.ash}80` : `${C.ash}b3`} />
        <Text
          maxFontSizeMultiplier={FIXED_FONT_SCALE}
          style={{ fontFamily: F.black, fontSize: 17, letterSpacing: -0.3, color: copy.quiet ? C.ash : C.chalk, textAlign: "center" }}
        >
          {t(copy.titleKey)}
        </Text>
        <Text
          style={{ fontFamily: F.reg, fontSize: fs.caption, lineHeight: leading(fs.caption, "relaxed"), color: C.ash, textAlign: "center", maxWidth: 260 }}
        >
          {t(copy.bodyKey)}
        </Text>
      </View>
      {children}
    </View>
  );
}
