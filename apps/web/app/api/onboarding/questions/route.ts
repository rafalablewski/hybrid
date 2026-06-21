import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { effectiveOnboardingQuestions } from "@/lib/onboarding";

// The onboarding questionnaire the client renders — the enabled questions only,
// in display order. Defaults overlaid by any admin edits. Any signed-in user.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { questions } = await effectiveOnboardingQuestions();
  return NextResponse.json({ questions: questions.filter((q) => q.enabled) });
}
