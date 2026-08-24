import { useLocalSearchParams } from "expo-router";
import AuroraWeekSummary from "../../components/aurora/week-summary";

/** THE WEEK SUMMARY — `/week/2026-08-17`, keyed by the week's MONDAY as a local
 *  day key (the same key History's chapters carry, so the door and the screen
 *  behind it can never name different weeks). */
export default function Week() {
  const { start } = useLocalSearchParams<{ start: string }>();
  return <AuroraWeekSummary startKey={typeof start === "string" ? start : ""} />;
}
