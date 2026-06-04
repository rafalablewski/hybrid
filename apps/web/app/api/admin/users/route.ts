import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

// Paginated, searchable user directory. Admin-only. Returns management metadata
// + activity COUNTS per user — never the raw private training rows themselves.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const role = url.searchParams.get("role"); // CLIENT | COACH | ADMIN | null
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") ?? "25") || 25));

  const where: Prisma.UserWhereInput = {
    ...(q
      ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }
      : {}),
    ...(role === "CLIENT" || role === "COACH" || role === "ADMIN" ? { role } : {}),
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
      createdAt: u.createdAt,
      sessions: u._count.sessions,
      clientsCoached: u._count.clientLinks,
      coaches: u._count.coachLinks,
      orgs: u._count.memberships,
      checkins: u._count.checkins,
    })),
  });
}
