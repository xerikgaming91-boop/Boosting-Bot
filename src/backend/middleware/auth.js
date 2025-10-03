import { getUserFromReq } from "../utils/jwt.js";
import { prisma } from "../prismaClient.js";
import { ensureBotReady } from "../discord/index.js";

const GUILD_ID = process.env.DISCORD_GUILD_ID;
const RAIDLEAD_ROLE_ID = process.env.RAIDLEAD_ROLE_ID; // optional; Fallback: Rollenname "raidlead"

export async function requireAuth(req, res, next) {
  try {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    req.user = user;
    next();
  } catch (e) {
    console.error("[AUTH] requireAuth error:", e?.message || e);
    res.status(401).json({ error: "unauthorized" });
  }
}

export async function requireRaidLead(req, res, next) {
  try {
    const jwtUser = await getUserFromReq(req);
    if (!jwtUser) return res.status(401).json({ error: "unauthorized" });
    req.user = jwtUser;

    // 1) DB-Cache
    let dbUser = await prisma.user.findUnique({ where: { discordId: jwtUser.id } });
    if (dbUser?.isRaidlead) {
      req.user.isRaidlead = true;
      return next();
    }

    // 2) Live bei Discord
    if (!GUILD_ID) return res.status(500).json({ error: "guild_not_configured" });

    const client = await ensureBotReady();
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(String(jwtUser.id)).catch(() => null);
    if (!member) return res.status(403).json({ error: "not_in_guild" });

    let isLead = false;
    if (RAIDLEAD_ROLE_ID) isLead = member.roles.cache.has(RAIDLEAD_ROLE_ID);
    if (!isLead) {
      isLead = member.roles.cache.some((r) => r.name && r.name.toLowerCase() === "raidlead");
    }

    const rolesCsv = member.roles.cache.map((r) => r.name).join(",");
    const avatarUrl = member.user?.displayAvatarURL?.({ size: 128, extension: "png" }) || null;

    dbUser = await prisma.user.upsert({
      where: { discordId: jwtUser.id },
      update: {
        username: member.user?.username ?? dbUser?.username ?? null,
        displayName:
          member.nickname || member.user?.globalName || member.user?.username || dbUser?.displayName || null,
        avatarUrl,
        rolesCsv,
        isRaidlead: isLead,
      },
      create: {
        discordId: jwtUser.id,
        username: member.user?.username || null,
        displayName: member.nickname || member.user?.globalName || member.user?.username || null,
        avatarUrl,
        rolesCsv,
        isRaidlead: isLead,
      },
    });

    if (!isLead) return res.status(403).json({ error: "forbidden_not_raidlead" });

    req.user.isRaidlead = true;
    next();
  } catch (e) {
    console.error("[AUTH] requireRaidLead error:", e?.message || e);
    res.status(500).json({ error: "auth_check_failed" });
  }
}
