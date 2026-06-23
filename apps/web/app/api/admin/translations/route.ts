import { NextResponse } from "next/server";
import { isValidLanguage } from "@hybrid/core";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

// Every authored override (lang, key, value), for the localization manager.
// Admin-only. The Translation table is created by reference/sql-translation.sql
// — if it's missing we flag it rather than 500.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  try {
    const translations = await prisma.translation.findMany({ orderBy: [{ key: "asc" }, { lang: "asc" }] });
    return NextResponse.json({ translations });
  } catch {
    return NextResponse.json({ translations: [], unavailable: true });
  }
}

// Upsert one override by (lang, key). An empty/whitespace value REVERTS to the
// shipped baseline (deletes the row). Audited.
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = await rateLimit(request, { key: "admin-translation-post", limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited<{ lang?: unknown; key?: unknown; value?: unknown }>(request, 16 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data;

  if (typeof b.lang !== "string" || !isValidLanguage(b.lang))
    return NextResponse.json({ error: "valid lang required (en|pl|de)" }, { status: 400 });
  if (typeof b.key !== "string" || !b.key.trim())
    return NextResponse.json({ error: "key required" }, { status: 400 });

  const lang = b.lang;
  const key = b.key.trim().slice(0, 200);
  const value = typeof b.value === "string" ? b.value : "";

  // Empty value → revert (remove the override so the baseline shows through).
  if (!value.trim()) {
    const existing = await prisma.translation.findUnique({ where: { lang_key: { lang, key } } });
    if (existing) {
      await prisma.translation.delete({ where: { id: existing.id } });
      await audit({
        actor: gate.admin,
        action: "translation.revert",
        targetType: "translation",
        targetId: existing.id,
        summary: `Reverted ${lang}:${key} to baseline`,
        req: request,
      });
    }
    return NextResponse.json({ reverted: true });
  }

  const saved = await prisma.translation.upsert({
    where: { lang_key: { lang, key } },
    create: { lang, key, value: value.slice(0, 4000), updatedById: gate.admin.id, updatedByEmail: gate.admin.email },
    update: { value: value.slice(0, 4000), updatedById: gate.admin.id, updatedByEmail: gate.admin.email },
  });

  await audit({
    actor: gate.admin,
    action: "translation.upsert",
    targetType: "translation",
    targetId: saved.id,
    summary: `Set ${lang}:${key}`,
    metadata: { lang, key },
    req: request,
  });

  return NextResponse.json({ translation: saved });
}
