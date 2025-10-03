/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Raid` table. All the data in the column will be lost.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `discordId` on the `User` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Chars" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "realm" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "class" TEXT,
    "spec" TEXT,
    "rioScore" REAL,
    "rioJson" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Preset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "tanks" INTEGER NOT NULL DEFAULT 0,
    "healers" INTEGER NOT NULL DEFAULT 0,
    "dps" INTEGER NOT NULL DEFAULT 0,
    "lootbuddies" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Raid" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "lootType" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "lead" TEXT,
    "bosses" INTEGER NOT NULL DEFAULT 8,
    "channelId" TEXT,
    "tanks" INTEGER NOT NULL DEFAULT 0,
    "healers" INTEGER NOT NULL DEFAULT 0,
    "dps" INTEGER NOT NULL DEFAULT 0,
    "lootbuddies" INTEGER NOT NULL DEFAULT 0,
    "presetId" INTEGER,
    CONSTRAINT "Raid_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "Preset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Raid" ("bosses", "date", "difficulty", "id", "lead", "lootType", "title") SELECT coalesce("bosses", 8) AS "bosses", "date", "difficulty", "id", "lead", "lootType", "title" FROM "Raid";
DROP TABLE "Raid";
ALTER TABLE "new_Raid" RENAME TO "Raid";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT,
    "avatar" TEXT,
    "isRaidlead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("avatar", "createdAt", "id", "isRaidlead", "username") SELECT "avatar", "createdAt", "id", "isRaidlead", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Chars_ownerId_name_realm_region_key" ON "Chars"("ownerId", "name", "realm", "region");
