import { useLocalSearchParams } from "expo-router";
import AuroraNutrition from "../../components/aurora/nutrition";

/**
 * Nutrition — a BOTTOM-NAV destination now (it took the Explore slot; see
 * @hybrid/core nav-bar.ts for why). `root` because a tab root has nothing to go
 * back to: the hub masthead drops its back button, the way Today's does.
 *
 * `?recipe=<id>` lands straight on a recipe. Cross-app search returns recipes,
 * and a result that only got you to the right SCREEN would be a broken promise.
 */
export default function Nutrition() {
  const { recipe } = useLocalSearchParams<{ recipe?: string }>();
  return <AuroraNutrition root openRecipe={typeof recipe === "string" ? recipe : undefined} />;
}
