import { useLocalSearchParams } from "expo-router";
import AuroraNutrition from "../../components/aurora/nutrition";

/**
 * Deep link to a HYBRID Verified product page — `hybrid://food/<catalog-id>`,
 * and the https twin once the universal-link entitlement ships with a build.
 *
 * The Nutrition screen owns the page itself; this route only tells it where to
 * land, so there is one implementation of a product page rather than two. An id
 * that no longer exists in the catalog falls through to the hub inside the
 * component — a link from an older build must never dead-end.
 */
export default function VerifiedFoodRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <AuroraNutrition openFood={typeof id === "string" ? id : undefined} />;
}
