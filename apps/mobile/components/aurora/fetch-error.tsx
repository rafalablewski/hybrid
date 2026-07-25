import { Text, type ViewStyle } from "react-native";
import { ACard, APill } from "./kit";
import { useTheme } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { F, fs } from "../../lib/ui";

/**
 * Distinct fetch-FAILURE card — separate from a genuine empty state so an
 * offline / 500 load never masquerades as "nothing here yet" (the reported
 * empty-state-on-failure bug). A soft Retry re-runs the query. Shared across the
 * Today/Home, Check-in, History and Nutrition screens so mobile speaks one
 * error voice; mirrors the web <FetchError> so both clients read the same.
 */
export default function FetchError({
  onRetry,
  style,
  compact,
}: {
  onRetry: () => void;
  style?: ViewStyle;
  compact?: boolean;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <ACard style={{ alignItems: "center", paddingVertical: compact ? 22 : 32, ...style }}>
      <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk }}>{t("common.loadError")}</Text>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, textAlign: "center" }}>
        {t("common.loadErrorHint")}
      </Text>
      <APill label={t("common.retry")} variant="soft" onPress={onRetry} style={{ marginTop: 16, paddingHorizontal: 28 }} />
    </ACard>
  );
}
