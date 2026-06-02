import { PrismaClient } from "@prisma/client";

// Prisma client singleton. In dev, Next's hot-reload would otherwise spawn a new
// client on every change and exhaust the connection pool. Server-only — never
// import this from a client component.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
