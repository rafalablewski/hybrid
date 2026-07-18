import { useLocalSearchParams } from "expo-router";
import AuroraConnectionPage from "../../components/aurora/connection-page";

export default function ConnectionDetail() {
  const { provider } = useLocalSearchParams<{ provider: string }>();
  return <AuroraConnectionPage provider={typeof provider === "string" ? provider : ""} />;
}
