// Process-wide PrismaClient singleton. Next.js dev-mode hot-reload
// re-evaluates modules on every change; without caching on `global`, each
// reload would open a fresh DB connection pool and eventually exhaust
// Postgres' connection limit. Route handlers should call getPrismaClient()
// (mirrors src/lib/auth.ts's cachedVerifier pattern) and accept an optional
// client param so tests can inject a mock instead of hitting a real DB.
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export function getPrismaClient(): PrismaClient {
  if (!global.__prisma) {
    global.__prisma = new PrismaClient();
  }
  return global.__prisma;
}

export type { PrismaClient };
