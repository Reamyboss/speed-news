import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * Next dev-mode hot reload re-evaluates modules, so without caching on
 * globalThis every reload would open a new connection pool and eventually
 * exhaust the database's connection limit.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Wraps a database read so a transient outage renders an empty or fallback state
 * instead of a 500. Read paths on public pages should always use this.
 */
export async function safeQuery<T>(
  operation: () => Promise<T>,
  fallback: T,
  label = "query",
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error(`[db] ${label} failed:`, error instanceof Error ? error.message : error);
    return fallback;
  }
}
