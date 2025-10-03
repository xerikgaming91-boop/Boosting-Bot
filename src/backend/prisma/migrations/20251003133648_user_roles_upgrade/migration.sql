/*
  Warnings:

  - You are about to drop the `Chars` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `createdAt` on the `Preset` table. All the data in the column will be lost.
  - You are about to drop the column `createdBy` on the `Preset` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Preset` table. All the data in the column will be lost.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `avatar` on the `User` table. All the data in the column will be lost.
  - You are about to alter the column `id` on the `User` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - Added the required column `updatedAt` to the `Raid` table without a default value. This is not possible if the table is not empty.
  - Added the required column `discordId` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Chars_ownerId_name_realm_region_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Chars";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "BoosterChar" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "realm" TEXT NOT NULL,
    "class" TEXT,
    "spec" TEXT,
    "rioScore" REAL,
    "progress" TEXT,
    "itemLevel" INTEGER,
    "wclUrl" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BoosterChar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("discordId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Signup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "raidId" INTEGER NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "charId" INTEGER,
    "displayName" TEXT,
    "saved" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "class" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SIGNUPED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Signup_raidId_fkey" FOREIGN KEY ("raidId") REFERENCES "Raid" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Signup_charId_fkey" FOREIGN KEY ("charId") REFERENCES "BoosterChar" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Signup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("discordId") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Preset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "tanks" INTEGER NOT NULL DEFAULT 0,
    "healers" INTEGER NOT NULL DEFAULT 0,
    "dps" INTEGER NOT NULL DEFAULT 0,
    "lootbuddies" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_Preset" ("dps", "healers", "id", "lootbuddies", "name", "tanks") SELECT "dps", "healers", "id", "lootbuddies", "name", "tanks" FROM "Preset";
DROP TABLE "Preset";
ALTER TABLE "new_Preset" RENAME TO "Preset";
CREATE TABLE "new_Raid" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "lootType" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "lead" TEXT,
    "bosses" INTEGER NOT NULL,
    "tanks" INTEGER NOT NULL DEFAULT 0,
    "healers" INTEGER NOT NULL DEFAULT 0,
    "dps" INTEGER NOT NULL DEFAULT 0,
    "lootbuddies" INTEGER NOT NULL DEFAULT 0,
    "channelId" TEXT,
    "messageId" TEXT,
    "presetId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Raid_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "Preset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Raid" ("bosses", "channelId", "date", "difficulty", "dps", "healers", "id", "lead", "lootType", "lootbuddies", "presetId", "tanks", "title") SELECT "bosses", "channelId", "date", "difficulty", "dps", "healers", "id", "lead", "lootType", "lootbuddies", "presetId", "tanks", "title" FROM "Raid";
DROP TABLE "Raid";
ALTER TABLE "new_Raid" RENAME TO "Raid";
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "discordId" TEXT NOT NULL,
    "username" TEXT,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "rolesCsv" TEXT,
    "isRaidlead" BOOLEAN NOT NULL DEFAULT false,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "highestRole" TEXT,
    "roleLevel" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "id", "isRaidlead", "updatedAt", "username") SELECT "createdAt", "id", "isRaidlead", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Signup_raidId_idx" ON "Signup"("raidId");

-- CreateIndex
CREATE INDEX "Signup_userId_idx" ON "Signup"("userId");

-- CreateIndex
CREATE INDEX "Signup_charId_idx" ON "Signup"("charId");
