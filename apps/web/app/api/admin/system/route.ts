import { NextResponse } from "next/server";
import { CORE_VERSION } from "@hybrid/core";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

// Operational health for the admin System panel. Reports versions, deployment
// metadata, environment-variable PRESENCE (never the values), and a live DB
// round-trip. Admin-only. Reveals no secrets.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  // Env presence — booleans only.
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    DIRECT_URL: Boolean(process.env.DIRECT_URL),
    OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
    WHOOP_CLIENT_ID: Boolean(process.env.WHOOP_CLIENT_ID),
    OURA_CLIENT_ID: Boolean(process.env.OURA_CLIENT_ID),
    NEXT_PUBLIC_SITE_URL: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
  };

  // Live DB round-trip + audit-table presence probe.
  let db: { ok: boolean; latencyMs: number | null; auditTable: boolean } = {
    ok: false,
    latencyMs: null,
    auditTable: false,
  };
  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    db.ok = true;
    db.latencyMs = Date.now() - t0;
    try {
      await prisma.adminAudit.count();
      db.auditTable = true;
    } catch {
      db.auditTable = false;
    }
  } catch {
    db = { ok: false, latencyMs: null, auditTable: false };
  }

  return NextResponse.json({
    versions: {
      core: CORE_VERSION,
      node: process.version,
      nextPublicAppVersion: process.env.npm_package_version ?? null,
    },
    deployment: {
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      region: process.env.VERCEL_REGION ?? null,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    },
    env,
    db,
    serverTime: new Date().toISOString(),
  });
}
