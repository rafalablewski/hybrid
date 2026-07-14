import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { normalizeRole, clampPage, clampPageSize, isValidLanguage } from "@hybrid/core";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendAccountVerification, enrollInTrigger } from "@/lib/email";

// Paginated, searchable user directory. Admin-only. Returns management metadata
// + activity COUNTS per user — never the raw private training rows themselves.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const role = normalizeRole(url.searchParams.get("role")); // CLIENT | COACH | ADMIN | null
  const page = clampPage(url.searchParams.get("page"));
  const pageSize = clampPageSize(url.searchParams.get("pageSize"));

  const where: Prisma.UserWhereInput = {
    ...(q
      ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }
      : {}),
    ...(role ? { role } : {}),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        language: true,
        entitlement: true,
        coachVerified: true,
        createdAt: true,
        _count: {
          select: { sessions: true, clientLinks: true, coachLinks: true, memberships: true, checkins: true },
        },
      },
    }),
  ]);

  return NextResponse.json({
    total,
    page,
    pageSize,
    pages: Math.ceil(total / pageSize),
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      language: u.language,
      entitlement: u.entitlement,
      coachVerified: u.coachVerified,
      createdAt: u.createdAt,
      sessions: u._count.sessions,
      clientsCoached: u._count.clientLinks,
      coaches: u._count.coachLinks,
      orgs: u._count.memberships,
      checkins: u._count.checkins,
    })),
  });
}

// Provision a new account from the admin console. Creates a REAL, loginable
// Supabase auth user via the service-role admin API (so the person can sign in),
// then mirrors it into our User row. Optionally sets a password and/or sends a
// verification/welcome email. Degrades to a clear 503 when the service-role key
// isn't configured — the same posture as billing (no key → "not configured").
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = await rateLimit(request, { key: "admin-user-create", limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited<{
    email?: string;
    name?: string | null;
    role?: string;
    language?: string;
    entitlement?: string;
    password?: string;
    sendVerification?: boolean;
  }>(request, 8 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data;

  const email = String(b.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });

  const role = normalizeRole(b.role) ?? "CLIENT";
  const entitlement = String(b.entitlement ?? "free").toLowerCase() === "paid" ? "paid" : "free";
  const language = b.language && isValidLanguage(b.language) ? b.language : "en";
  const name = b.name ? String(b.name).slice(0, 120) : null;
  const password = typeof b.password === "string" && b.password.length >= 8 ? b.password : undefined;

  // Reject a duplicate up front (the User.email unique would also catch it, but
  // a friendly message beats a 500).
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "A user with that email already exists." }, { status: 409 });

  const admin = createAdminClient();
  if (!admin)
    return NextResponse.json(
      { error: "Account creation needs SUPABASE_SERVICE_ROLE_KEY in the server env (not configured)." },
      { status: 503 },
    );

  // Create the auth user. email_confirm:true when we set a password (the admin
  // vouches for them); otherwise leave unconfirmed and send a verification link.
  let authId: string;
  try {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      ...(password ? { password } : {}),
      email_confirm: Boolean(password),
      user_metadata: { name: name ?? undefined, role: role.toLowerCase() },
      // entitlement is trust-bearing (paywall) → app_metadata (service-role-only),
      // never user_metadata, which the end user can rewrite to self-grant 'paid'.
      app_metadata: { entitlement },
    });
    if (error || !data?.user) {
      return NextResponse.json({ error: error?.message ?? "Could not create the auth user." }, { status: 502 });
    }
    authId = data.user.id;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Auth provider error." }, { status: 502 });
  }

  // Mirror into our DB row. If this fails after the auth user was created, clean
  // up the orphan so a retry can succeed.
  let created;
  try {
    created = await prisma.user.create({
      data: { authId, email, name, role, language, entitlement },
    });
  } catch (e) {
    try {
      await admin.auth.admin.deleteUser(authId);
    } catch {
      /* best-effort orphan cleanup */
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save the user row." }, { status: 500 });
  }

  // Welcome / verification email + lifecycle signup sequence (both best-effort,
  // both no-op gracefully until Resend is configured).
  let verification: "sent" | "skipped" | "off" = "off";
  if (b.sendVerification) {
    const res = await sendAccountVerification(created);
    verification = res.ok ? "sent" : "skipped";
  }
  await enrollInTrigger("signup", { id: created.id, email: created.email, role: created.role, entitlement });

  await audit({
    actor: gate.admin,
    action: "user.create",
    targetType: "user",
    targetId: created.id,
    summary: `Created ${created.email}`,
    metadata: { email: created.email, role: created.role, entitlement, withPassword: Boolean(password), verification },
    req: request,
  });

  return NextResponse.json(
    {
      id: created.id,
      email: created.email,
      name: created.name,
      role: created.role,
      entitlement: created.entitlement,
      verification,
    },
    { status: 201 },
  );
}
