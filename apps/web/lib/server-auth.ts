import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

type DbRole = "CLIENT" | "COACH" | "ADMIN";

function toDbRole(r: unknown): DbRole {
  const s = String(r ?? "").toUpperCase();
  return s === "ADMIN" ? "ADMIN" : s === "COACH" ? "COACH" : "CLIENT";
}

/**
 * Resolve the signed-in Supabase user to our app `User` row, creating it on
 * first sight (keyed by the Supabase auth id). Role is taken from auth metadata
 * only at creation — after that the DB row is the source of truth. Returns null
 * when there is no authenticated user.
 */
export async function getOrCreateDbUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const meta = user.user_metadata ?? {};
  return prisma.user.upsert({
    where: { authId: user.id },
    update: { email: user.email ?? "" },
    create: {
      authId: user.id,
      email: user.email ?? "",
      name: (meta.name as string | undefined) ?? null,
      role: toDbRole(meta.role),
    },
  });
}
