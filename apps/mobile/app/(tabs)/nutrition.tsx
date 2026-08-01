import AuroraNutrition from "../../components/aurora/nutrition";

/**
 * Nutrition — a BOTTOM-NAV destination now (it took the Explore slot; see
 * @hybrid/core nav-bar.ts for why). `root` because a tab root has nothing to go
 * back to: the hub masthead drops its back button, the way Today's does.
 */
export default function Nutrition() {
  return <AuroraNutrition root />;
}
