// src/backend/prismaClient.js
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Verhindert mehrere Prisma-Instanzen bei Hot-Reload (Vite/DEV),
 * und aktiviert sinnvolle Logs.
 */
const logLevels =
  (process.env.PRISMA_LOG || "error,warn")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const prisma =
  globalThis.__PRISMA__ ??
  new PrismaClient({
    log: logLevels,
  });

if (!globalThis.__PRISMA__) {
  globalThis.__PRISMA__ = prisma;

  prisma.$on("error", (e) => {
    console.error("[prisma:error]", e);
  });
  prisma.$on("warn", (e) => {
    console.warn("[prisma:warn]", e);
  });

  // Optional: DB-Zusammenfassung nach dem ersten Connect
  (async () => {
    try {
      await prisma.$queryRaw`SELECT 1;`;
      const dbUrl = process.env.DATABASE_URL || "(not set)";
      console.log("[prisma] ready. DATABASE_URL:", dbUrl);
    } catch (err) {
      console.error("[prisma] initial connect failed:", err?.message || err);
    }
  })();
}

export { prisma };
