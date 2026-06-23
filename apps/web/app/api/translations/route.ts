import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { getCachedTranslations } from "@/lib/cache";

// The admin-authored localization overrides, grouped by language, for any
// signed-in user. The clients layer these over the shipped strings via
// makeTWithOverrides. Empty/missing → the app runs on the baseline.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Global, rarely-changing — cached (short TTL, busted on admin edits).
  const overrides: Record<string, Record<string, string>> = {};
  for (const r of await getCachedTranslations()) {
    (overrides[r.lang] ??= {})[r.key] = r.value;
  }

  return NextResponse.json({ overrides });
}
