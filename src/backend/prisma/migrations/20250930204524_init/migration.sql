/*
  Warnings:

  - The primary key for the `Raid` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `bosses` on the `Raid` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `id` on the `Raid` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `User` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - Made the column `date` on table `Raid` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Raid" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "lootType" TEXT NOT NULL,
    "bosses" INTEGER,
    "date" DATETIME NOT NULL,
    "lead" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Raid" ("bosses", "createdAt", "date", "difficulty", "id", "lead", "lootType", "title") SELECT "bosses", "createdAt", "date", "difficulty", "id", "lead", "lootType", "title" FROM "Raid";
DROP TABLE "Raid";
ALTER TABLE "new_Raid" RENAME TO "Raid";
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatar" TEXT,
    "isRaidlead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("avatar", "createdAt", "discordId", "id", "isRaidlead", "username") SELECT "avatar", "createdAt", "discordId", "id", "isRaidlead", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
