// ESM-kompatibler Prisma Client – bietet Default UND Named Export an
import { PrismaClient } from '@prisma/client';

// Singleton, damit bei Hot-Reload nicht mehrere Verbindungen entstehen
const prisma = globalThis.__prisma ?? new PrismaClient();

if (!globalThis.__prisma) {
  globalThis.__prisma = prisma;
}

// => Beides exportieren, damit sowohl `import prisma from ...` als auch
//    `import { prisma } from ...` funktioniert.
export { prisma };
export default prisma;
