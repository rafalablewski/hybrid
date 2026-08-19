import { useLocalSearchParams } from "expo-router";
import AuroraNutrition from "../../components/aurora/nutrition";

/**
 * Nutrition — a BOTTOM-NAV destination now (it took the Explore slot; see
 * @hybrid/core nav-bar.ts for why). `root` because a tab root has nothing to go
 * back to: the hub masthead drops its back button, the way Today's does.
 *
 * `?recipe=<id>` lands straight on a recipe. Cross-app search returns recipes,
 * and a result that only got you to the right SCREEN would be a broken promise.
 *
 * `?recipes=1` lands on the LIBRARY — the address a shared library link carries
 * (@hybrid/core recipes.ts `recipeLibraryShareLink`). A link that opened the
 * Nutrition hub instead would be a link to the wrong screen, which is the same
 * broken promise one level up.
 */
export default function Nutrition() {
  const { recipe, recipes } = useLocalSearchParams<{ recipe?: string; recipes?: string }>();
  return (
    <AuroraNutrition
      root
      openRecipe={typeof recipe === "string" ? recipe : undefined}
      openRecipes={recipes != null}
    />
  );
}
