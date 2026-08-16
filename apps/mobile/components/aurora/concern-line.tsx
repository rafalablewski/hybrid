import { Text } from "react-native";
import { CONCERN_KEY, type ConcernReason } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { leading, F, fs } from "../../lib/ui";

/**
 * THE "ARE YOU SURE?" LINE — the softer half of the plausibility model.
 *
 * The hard half refuses a keystroke outright (lib/field-guard.ts). This half is
 * for the figures that are IMPROBABLE BUT REAL: a 300 kg squat, a 24-hour ride,
 * a 160 km week. Refusing those would be worse than the typos it catches,
 * because an app that cannot record an outlier is one the best athletes cannot
 * use — so it NEVER BLOCKS. It says what is odd, once, next to the number, and
 * gets out of the way.
 *
 * AMBER AND QUIET, not a dialog. A strong athlete would meet a modal every
 * session, and a warning that interrupts is one people learn to dismiss without
 * reading. A line under the figure they are already looking at is seen at the
 * moment it is cheap to fix and ignored at no cost when it is right.
 *
 * The sentence comes from core (`CONCERN_KEY`), so every surface says the same
 * thing and none of them invents its own wording — and a reason renders nothing
 * at all rather than a blank amber line if its copy is ever missing.
 */
export function ConcernLine({
  reason,
  align = "left",
}: {
  /** Null when there is nothing to say — the ordinary case, and the reason this
   *  takes a nullable rather than making every call site write a conditional. */
  reason: ConcernReason | null;
  align?: "left" | "center";
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  if (!reason) return null;
  return (
    <Text
      style={{
        fontFamily: F.mono,
        fontSize: fs.nano,
        color: txt(C, C.amber),
        marginTop: 8,
        textAlign: align,
        lineHeight: leading(fs.nano),
      }}
    >
      {t(CONCERN_KEY[reason])}
    </Text>
  );
}
