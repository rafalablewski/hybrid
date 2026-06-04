import { NextResponse } from "next/server";
import { SECURITY_CONTROLS, securityPosture } from "@hybrid/core";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

// Security posture for the admin /security tab: the canonical control registry
// (whose `pass` items are proven by the test suite) plus a few LIVE runtime
// probes evaluated against this request/deployment. Admin-only; leaks nothing.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  // Live, request-scoped checks.
  const proto = request.headers.get("x-forwarded-proto");
  const https = proto ? proto.split(",")[0]!.trim() === "https" : null;

  let dbOk = false;
  let auditTable = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
    try {
      await prisma.adminAudit.count();
      auditTable = true;
    } catch {
      auditTable = false;
    }
  } catch {
    dbOk = false;
  }

  const runtime = [
    { id: "rt-https", label: "Request served over HTTPS", ok: https === null ? null : https },
    { id: "rt-db", label: "Database reachable", ok: dbOk },
    { id: "rt-audit-table", label: "Audit table present (RLS-locked)", ok: auditTable },
    { id: "rt-auth-env", label: "Auth provider configured", ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) },
  ];

  return NextResponse.json({
    posture: securityPosture(),
    controls: SECURITY_CONTROLS,
    runtime,
    generatedAt: new Date().toISOString(),
  });
}
