import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { type OrgRole } from "@hybrid/core";

// Organizations the signed-in user belongs to, with their role in each.
export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { org: true },
    orderBy: { createdAt: "asc" },
  });
  const orgs = memberships.map((m) => ({ id: m.orgId, name: m.org.name, role: m.role as OrgRole }));
  return NextResponse.json({ orgs });
}

// Create an organization; the creator becomes its OWNER.
export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const name = (await request.json().catch(() => ({})) as { name?: unknown }).name;
  if (typeof name !== "string" || !name.trim())
    return NextResponse.json({ error: "name required" }, { status: 400 });

  const org = await prisma.organization.create({
    data: {
      name: name.trim(),
      memberships: { create: { userId: user.id, role: "OWNER" satisfies OrgRole } },
    },
  });
  return NextResponse.json({ org: { id: org.id, name: org.name, role: "OWNER" } }, { status: 201 });
}
