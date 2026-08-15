import { useLocalSearchParams } from "expo-router";
import AuroraPlans from "../components/aurora/plans";

/** Contain a crash to THIS screen — the tab bar and the back gesture stay live
 *  underneath, and the failure names itself in place instead of blanking the
 *  app. See components/error-boundary.tsx. */
export { RouteErrorBoundary as ErrorBoundary } from "../components/error-boundary";

export default function Plans() {
  const { goal, plan } = useLocalSearchParams<{ goal?: string; plan?: string }>();
  return <AuroraPlans openGoal={typeof goal === "string" ? goal : undefined} openPlan={typeof plan === "string" ? plan : undefined} />;
}
