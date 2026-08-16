import { View, Text } from "react-native";
import { RECORD_BAND } from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { leading, tracking, fs, space, F } from "../../lib/ui";
import Sheet from "./sheet";

/**
 * WHAT COUNTS AS A RECORD — the door under the sport page's record ladder.
 *
 * A figure an athlete might quote out loud has to be able to say where it came
 * from, and this one has two properties that WILL be discovered eventually:
 *
 *  1. A 5.2 km run fills the 5 km rung. That looks like a bug until you know
 *     the rule, and then it is obviously the safe direction.
 *  2. A 5 km taken from INSIDE a long run fills it too — and is marked, so a
 *     rung the athlete raced is distinguishable from one found in a training
 *     run. Both are true; they are not the same story, and an athlete about to
 *     quote a figure out loud is entitled to know which they have.
 *
 * So both are stated here, plainly, in the athlete's own terms — the second one
 * including WHEN it applies, because it needs a recorded ROUTE (a bare summary
 * has no trace to look inside), and an athlete whose watch recorded no route
 * would otherwise be waiting for a rung that can never arrive.
 *
 * Copy lives in i18n (w.train.sportPage.rule*); the percentage comes from
 * RECORD_BAND itself, so the sentence cannot drift from the rule it describes.
 */
export default function SportRecordsSheet({ visible, onClose }: {
  visible: boolean;
  onClose: () => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const over = Math.round((RECORD_BAND - 1) * 100);

  const Rule = ({ head, body, first }: { head: string; body: string; first?: boolean }) => (
    <View style={{ paddingVertical: space.lg, ...(first ? null : { borderTopWidth: 1, borderTopColor: C.line }) }}>
      <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{head}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, marginTop: space.sm, lineHeight: leading(fs.body, "relaxed") }}>
        {body}
      </Text>
    </View>
  );

  return (
    <Sheet visible={visible} onClose={onClose} title={t("w.train.sportPage.rulesTitle")}>
      <Rule
        first
        head={t("w.train.sportPage.ruleBandHead").replace("{pct}", String(over))}
        body={t("w.train.sportPage.ruleBandBody").replace("{pct}", String(over))}
      />
      <Rule head={t("w.train.sportPage.ruleSplitHead")} body={t("w.train.sportPage.ruleSplitBody")} />
      <Rule head={t("w.train.sportPage.ruleTypedHead")} body={t("w.train.sportPage.ruleTypedBody")} />
      <Text
        style={{
          fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase",
          letterSpacing: tracking.label, marginTop: space.sm,
        }}
      >
        {t("w.train.sportPage.ruleFoot")}
      </Text>
    </Sheet>
  );
}
