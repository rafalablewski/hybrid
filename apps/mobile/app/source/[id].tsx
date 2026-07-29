import { useLocalSearchParams } from "expo-router";
import AuroraNutrition from "../../components/aurora/nutrition";

/** Deep link to a verified SOURCE page — `hybrid://source/<source-id>`. See
 *  app/food/[id].tsx; same contract, same single implementation. */
export default function VerifiedSourceRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <AuroraNutrition openSource={typeof id === "string" ? id : undefined} />;
}
