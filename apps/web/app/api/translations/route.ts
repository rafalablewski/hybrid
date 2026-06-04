import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";

// The admin-authored localization overrides, grouped by language, for any
// signed-in user. The clients layer these over the shipped strings via
// makeTWithOverrides. Empty/missing → the app runs on the baseline.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const overrides: Record<string, Record<string, string>> = {};
  try {
    const rows = await prisma.translation.findMany({ select: { lang: true, key: true, value: true } });
    for (const r of rows) {
      (overrides[r.lang] ??= {})[r.key] = r.value;
    }
  } catch {
    // table not created yet — serve the baseline (empty overrides).
  }

  return NextResponse.json({ overrides });
}
