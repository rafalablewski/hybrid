import { Suspense } from "react";
import AppShell from "@/components/app-shell";

export default function AppPage() {
  // AppShell reads useSearchParams (?screen= deep-link from the Aurora pill nav),
  // which Next requires to sit under a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <AppShell />
    </Suspense>
  );
}
