// src/backend/utils/roles.js
import "dotenv/config";
import { prisma } from "../prismaClient.js";

const ENV = process.env;

const GUILD_ID = ENV.DISCORD_GUILD_ID || ENV.GUILD_ID || "";
const ROLE_ADMIN_ID =
  ENV.DISCORD_ROLE_ADMIN_ID || ENV.ADMIN_ROLE_ID || "";
const ROLE_RAIDLEAD_ID =
  ENV.RAIDLEAD_ROLE_ID ||
  ENV.DISCORD_ROLE_RAIDLEAD_ID ||
  ENV.DISCORD_ROLE_RAIDLEAD ||
  "";
const ROLE_BOOSTER_ID = ENV.DISCORD_ROLE_BOOSTER_ID || "";
const ROLE_LOOTBUDDYS_ID = ENV.DISCORD_ROLE_LOOTBUDDYS_ID || "";

/** kleine Helper-Logs */
function dbg(...a) {
  if (ENV.DEBUG_AUTH === "true") {
    console.log("[AUTH-DBG]", ...a);
  }
}

/**
 * Build Role-Flags aus einer Guild-Member-Response.
 * @param {object} memberJson Discord /users/@me/guilds/{guild.id}/member
 * @returns {object} flags
 */
export function flagsFromMember(memberJson) {
  const roles = Array.isArray(memberJson?.roles) ? memberJson.roles : [];
  const isOwner = memberJson?.user?.id
    ? (memberJson?.guild_owner ?? false) // (nicht immer vorhanden)
    : false;

  const isAdmin = !!(ROLE_ADMIN_ID && roles.includes(ROLE_ADMIN_ID));
  const raidlead = !!(ROLE_RAIDLEAD_ID && roles.includes(ROLE_RAIDLEAD_ID));
  const booster = !!(ROLE_BOOSTER_ID && roles.includes(ROLE_BOOSTER_ID));
  const lootbuddy = !!(ROLE_LOOTBUDDYS_ID && roles.includes(ROLE_LOOTBUDDYS_ID));

  // höchster Rang („owner“ > admin > raidlead > booster > lootbuddy > user)
  let highestRole = "user";
  if (isOwner) highestRole = "owner";
  else if (isAdmin) highestRole = "admin";
  else if (raidlead) highestRole = "raidlead";
  else if (booster) highestRole = "booster";
  else if (lootbuddy) highestRole = "lootbuddy";

  return {
    roles,
    isOwner,
    isAdmin,
    raidlead,
    booster,
    lootbuddy,
    inGuild: !!memberJson,
    highestRole,
  };
}

/**
 * Live-Rollen vom Discord API holen (mit User-Access-Token) und Flags ableiten
 */
export async function getLiveRoleFlags(accessToken) {
  if (!GUILD_ID) {
    dbg("missing guild id");
    return {
      roles: [],
      isOwner: false,
      isAdmin: false,
      raidlead: false,
      booster: false,
      lootbuddy: false,
      inGuild: false,
      highestRole: "user",
    };
  }
  const r = await fetch(`https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (r.status === 404 || r.status === 403) {
    dbg("member not in guild");
    return {
      roles: [],
      isOwner: false,
      isAdmin: false,
      raidlead: false,
      booster: false,
      lootbuddy: false,
      inGuild: false,
      highestRole: "user",
    };
  }
  if (!r.ok) {
    const tx = await r.text().catch(() => "");
    dbg("member fetch failed", r.status, tx);
    return {
      roles: [],
      isOwner: false,
      isAdmin: false,
      raidlead: false,
      booster: false,
      lootbuddy: false,
      inGuild: false,
      highestRole: "user",
    };
  }
  const memberJson = await r.json();
  return flagsFromMember(memberJson);
}

/** Policies */
export function canCreateRaid(flags) {
  return !!(flags?.isOwner || flags?.isAdmin || flags?.raidlead);
}
export function canSetRaidLead(flags) {
  // NUR Admin/Owner dürfen LEAD frei wählen
  return !!(flags?.isOwner || flags?.isAdmin);
}
export function isAdminLevel(flags) {
  return !!(flags?.isOwner || flags?.isAdmin);
}

/**
 * User in DB speichern/aktualisieren
 * @param {{discordId:string, username?:string, displayName?:string, avatarUrl?:string, rolesCsv?:string, isRaidlead?:boolean}} data
 */
export async function upsertUser(data) {
  try {
    const { discordId, ...rest } = data;
    return await prisma.user.upsert({
      where: { discordId },
      update: { ...rest },
      create: { discordId, ...rest },
    });
  } catch (e) {
    dbg("upsertUser failed", e?.message || e);
    return null;
  }
}
