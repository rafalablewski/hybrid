import { NextResponse } from "next/server";
import { FEATURE_FLAGS } from "@hybrid/core";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";

const AUDIENCES = ["all", "coaches", "clients", "admins"];
const REGISTRY = new Map(FEATURE_FLAGS.map((f) => [f.key, f]));

// The full flag registry merged with any admin overrides: every known flag, its
// default, its effective config, and whether it's been overridden. Admin-only.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  let overrides: { key: string; enabled: boolean; audience: string; value: unknown; updatedByEmail: string | null; updatedAt: Date }[] = [];
  let unavailable = false;
  try {
    overrides = await prisma.featureFlag.findMany();
  } catch {
    unavailable = true;
  }
  const byKey = new Map(overrides.map((o) => [o.key, o]));

  const flags = FEATURE_FLAGS.map((def) => {
    const o = byKey.get(def.key);
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      defaultEnabled: def.defaultEnabled,
      defaultAudience: def.audience ?? "all",
      overridden: Boolean(o),
      enabled: o?.enabled ?? def.defaultEnabled,
      audience: o?.audience ?? def.audience ?? "all",
      value: o?.value ?? null,
      updatedByEmail: o?.updatedByEmail ?? null,
      updatedAt: o?.updatedAt ?? null,
    };
  });

  return NextResponse.json({ flags, unavailable });
}

// Upsert a flag override. Only registry keys are accepted (an admin can't invent
// a flag nothing reads). Audited.
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = rateLimit(request, { key: "admin-flag-post", limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited<{ key?: unknown; enabled?: unknown; audience?: unknown; value?: unknown }>(request, 16 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data;

  if (typeof b.key !== "string" || !REGISTRY.has(b.key))
    return NextResponse.json({ error: "unknown flag key" }, { status: 400 });
  if (b.enabled !== undefined && typeof b.enabled !== "boolean")
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  if (b.audience !== undefined && (typeof b.audience !== "string" || !AUDIENCES.includes(b.audience)))
    return NextResponse.json({ error: "invalid audience" }, { status: 400 });

  const def = REGISTRY.get(b.key)!;
  const enabled = typeof b.enabled === "boolean" ? b.enabled : def.defaultEnabled;
  const audience = typeof b.audience === "string" ? b.audience : def.audience ?? "all";
  // value: accept any JSON-serializable payload (already size-capped); null clears it.
  const value = b.value === undefined ? undefined : b.value;

  const saved = await prisma.featureFlag.upsert({
    where: { key: b.key },
    create: { key: b.key, enabled, audience, value: value as never, updatedById: gate.admin.id, updatedByEmail: gate.admin.email },
    update: { enabled, audience, ...(value === undefined ? {} : { value: value as never }), updatedById: gate.admin.id, updatedByEmail: gate.admin.email },
  });

  await audit({
    actor: gate.admin,
    action: "flag.upsert",
    targetType: "flag",
    targetId: saved.key,
    summary: `Set ${saved.key} → ${enabled ? "on" : "off"} (${audience})`,
    metadata: { enabled, audience },
    req: request,
  });

  return NextResponse.json({ flag: saved });
}
