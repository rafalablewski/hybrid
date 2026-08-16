import { Text } from "react-native";
import { CONCERN_KEY, type Concern } from "@hybrid/core";
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
 * IT ALSO CARRIES THE REFUSALS THE KEYSTROKE GUARD CANNOT SEE, and that is the
 * hole it was built with. `allowFieldValue` judges ONE field, so a pair that is
 * impossible only together — 10 km against 5 minutes, each an ordinary figure —
 * sails past it, and the athlete saw nothing at all before the server quietly
 * dropped the distance on save. A refusal reads in the FAILURE voice (red) and
 * says the value will not be kept, because "we silently deleted your distance"
 * is the one outcome an athlete must never discover afterwards.
 *
 * The sentence comes from core (`CONCERN_KEY`), so every surface says the same
 * thing and none of them invents its own wording — and a verdict of `ok`
 * renders nothing rather than an empty line.
 */
export function ConcernLine({
  concern,
  align = "left",
}: {
  /** The verdict AND its reason, straight from `inspectSet` / `inspectEffort` —
   *  passed whole so no call site has to decide which verdicts are worth
   *  showing. That decision was the bug: every one of them showed `check` and
   *  silently swallowed `refuse`. */
  concern: Concern;
  align?: "left" | "center";
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  if (concern.verdict === "ok" || !concern.reason) return null;
  const bad = concern.verdict === "refuse";
  return (
    <Text
      style={{
        fontFamily: F.mono,
        fontSize: fs.nano,
        color: txt(C, bad ? C.red : C.amber),
        marginTop: 8,
        textAlign: align,
        lineHeight: leading(fs.nano),
      }}
    >
      {t(CONCERN_KEY[concern.reason])}
      {bad ? ` — ${t("w.train.blocks.notSaved")}` : ""}
    </Text>
  );
}
