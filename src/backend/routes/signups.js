// src/backend/routes/signups.js
import express from "express";
import { allowedRolesForClass, isRoleAllowedForClass } from "../utils/wow.js";
import { prisma } from "../prismaClient.js";
import { getUserFromReq } from "../utils/jwt.js";

export function makeSignupsRouter({ prisma: prismaArg } = {}) {
  const router = express.Router();
  const db = prismaArg || prisma;

  // Booster-Signup: charId, role(Tank/Healer/DPS), saved(boolean), note
  router.post("/signups/booster", async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: "unauthorized" });

      const { raidId, charId, role, saved, note } = req.body || {};
      if (!raidId || !charId || !role) {
        return res.status(400).json({ ok: false, error: "missing_fields" });
      }

      const raid = await db.raid.findUnique({ where: { id: Number(raidId) } });
      if (!raid) return res.status(404).json({ ok: false, error: "raid_not_found" });

      const char = await db.boosterChar.findUnique({ where: { id: Number(charId) } });
      if (!char) return res.status(404).json({ ok: false, error: "char_not_found" });

      // Rollenprüfung anhand Klasse
      const allowed = allowedRolesForClass(char.className || char.class || char.wowClass);
      if (!allowed.includes(role)) {
        return res.status(400).json({
          ok: false,
          error: "role_not_allowed_for_class",
          className: char.className || char.class || char.wowClass,
          allowed,
        });
      }

      const entry = await db.signup.create({
        data: {
          raidId: raid.id,
          userId: user.id, // bei uns == discordId (siehe auth)
          charId: char.id,
          asRole: role,
          isSaved: !!saved,
          note: note || null,
          kind: "BOOSTER", // wenn du enum hast, anpassen
        },
      });

      return res.json({ ok: true, signup: entry });
    } catch (e) {
      console.error("POST /signups/booster failed:", e);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  // Lootbuddy-Signup: className, note
  router.post("/signups/lootbuddy", async (req, res) => {
    try {
      const user = await getUserFromReq(req);
      if (!user) return res.status(401).json({ ok: false, error: "unauthorized" });

      const { raidId, className, note } = req.body || {};
      if (!raidId || !className) {
        return res.status(400).json({ ok: false, error: "missing_fields" });
      }

      const raid = await db.raid.findUnique({ where: { id: Number(raidId) } });
      if (!raid) return res.status(404).json({ ok: false, error: "raid_not_found" });

      const entry = await db.signup.create({
        data: {
          raidId: raid.id,
          userId: user.id,
          asRole: "LOOTBUDDY",
          lbClass: className,
          note: note || null,
          kind: "LOOTBUDDY",
        },
      });

      return res.json({ ok: true, signup: entry });
    } catch (e) {
      console.error("POST /signups/lootbuddy failed:", e);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  return router;
}
