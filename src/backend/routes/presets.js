// src/backend/routes/presets.js
import express from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../prismaClient.js";

const router = express.Router();
const { JWT_Secret = "change_me_dev" } = process.env;

function getUserFromReq(req) {
  const raw = req.cookies?.auth;
  if (!raw) return null;
  try { return jwt.verify(raw, JWT_Secret); } catch { return null; }
}
function requireRaidLead(req, res, next) {
  const u = getUserFromReq(req);
  if (!u) return res.status(401).json({ error: "unauthorized" });
  if (!u.isRaidlead) return res.status(403).json({ error: "forbidden" });
  req.user = u;
  next();
}

// GET /api/presets
router.get("/", async (_req, res) => {
  try {
    const presets = await prisma.preset.findMany({
      orderBy: [{ name: "asc" }],
    });
    res.json({ presets });
  } catch (e) {
    console.error("❌ /api/presets:", e);
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/presets (Raidlead)
router.post("/", requireRaidLead, async (req, res) => {
  try {
    const { name, tanks = 0, healers = 0, dps = 0, lootbuddies = 0 } = req.body;
    if (!name) return res.status(400).json({ error: "missing_name" });
    const created = await prisma.preset.create({
      data: { name, tanks: +tanks, healers: +healers, dps: +dps, lootbuddies: +lootbuddies },
    });
    res.json({ preset: created });
  } catch (e) {
    console.error("❌ POST /api/presets:", e);
    res.status(500).json({ error: "server_error" });
  }
});

// PUT /api/presets/:id (Raidlead)
router.put("/:id", requireRaidLead, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_id" });
  try {
    const { name, tanks, healers, dps, lootbuddies } = req.body;
    const updated = await prisma.preset.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(Number.isFinite(+tanks) ? { tanks: +tanks } : {}),
        ...(Number.isFinite(+healers) ? { healers: +healers } : {}),
        ...(Number.isFinite(+dps) ? { dps: +dps } : {}),
        ...(Number.isFinite(+lootbuddies) ? { lootbuddies: +lootbuddies } : {}),
      },
    });
    res.json({ preset: updated });
  } catch (e) {
    console.error("❌ PUT /api/presets/:id:", e);
    res.status(500).json({ error: "server_error" });
  }
});

// DELETE /api/presets/:id (Raidlead)
router.delete("/:id", requireRaidLead, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "bad_id" });
  try {
    await prisma.preset.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    console.error("❌ DELETE /api/presets/:id:", e);
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
