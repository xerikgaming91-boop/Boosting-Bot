// src/backend/utils/roles.js
import { ensureBotReady } from "../discord/bot.js";

const ENV = process.env;
const ADMIN_ROLE_ID    = ENV.DISCORD_ROLE_ADMIN_ID || ENV.ADMIN_ROLE_ID || "";
const RAIDLEAD_ROLE_ID = ENV.RAIDLEAD_ROLE_ID || ENV.DISCORD_ROLE_RAIDLEAD_ID || ENV.DISCORD_ROLE_RAIDLEAD || "";

/* ---------- helpers ---------- */
function toRoleArray(input) {
  if (!input) return [];
  if (Array.isArray(input)) return Array.from(new Set(input.map(String))).filter(Boolean);
  if (typeof input === "string") return Array.from(new Set(input.split(",").map(s => s.trim()).filter(Boolean)));
  return [];
}

/* ---------- flag checks ---------- */
export function isOwnerFromFlags(flags = {}) {
  if (flags.isOwner === true) return true;
  if (flags.ownerId && flags.userId && String(flags.ownerId) === String(flags.userId)) return true;
  if (flags.guildOwnerId && flags.userId && String(flags.guildOwnerId) === String(flags.userId)) return true;
  return false;
}

export function isAdminFromFlags(flags = {}) {
  if (isOwnerFromFlags(flags)) return true;
  if (flags.isAdmin === true) return true;
  const roles = toRoleArray(flags.roles ?? flags.rolesCsv);
  if (ADMIN_ROLE_ID && roles.includes(String(ADMIN_ROLE_ID))) return true;
  return false;
}

/** Alias, weil manche Routen `isAdminLevel` importieren. */
export const isAdminLevel = isAdminFromFlags;

export function isRaidleadFromFlags(flags = {}) {
  if (isAdminFromFlags(flags)) return true;
  if (flags.isRaidlead === true || flags.raidlead === true) return true;
  const roles = toRoleArray(flags.roles ?? flags.rolesCsv);
  if (RAIDLEAD_ROLE_ID && roles.includes(String(RAIDLEAD_ROLE_ID))) return true;
  return false;
}

/** Priorität: highestRole > Admin > Raidlead > erste Rolle > null */
export function highestRoleFromFlags(flagsOrRoles) {
  let flags = {};
  if (Array.isArray(flagsOrRoles) || typeof flagsOrRoles === "string") {
    flags.roles = toRoleArray(flagsOrRoles);
  } else if (flagsOrRoles && typeof flagsOrRoles === "object") {
    flags = { ...flagsOrRoles };
  }
  if (flags.highestRole) return String(flags.highestRole);

  const roles = toRoleArray(flags.roles ?? flags.rolesCsv);
  if (ADMIN_ROLE_ID && roles.includes(String(ADMIN_ROLE_ID))) return String(ADMIN_ROLE_ID);
  if (RAIDLEAD_ROLE_ID && roles.includes(String(RAIDLEAD_ROLE_ID))) return String(RAIDLEAD_ROLE_ID);
  if (roles.length > 0) return String(roles[0]);
  return null;
}

/* ---------- aus GuildMember bauen ---------- */
export function buildFlagsFromMember(member, { guildOwnerId } = {}) {
  if (!member) return {
    isOwner: false, isAdmin: false, isRaidlead: false,
    roles: [], rolesCsv: "", highestRole: null,
  };

  const roleIds = Array.from(member.roles?.cache?.keys?.() || []).map(String);
  const rolesCsv = roleIds.join(",");

  const flags = {
    userId: member.user?.id ? String(member.user.id) : null,
    guildOwnerId: guildOwnerId ? String(guildOwnerId) : undefined,
    roles: roleIds,
    rolesCsv,
    highestRole: member.roles?.highest?.id ? String(member.roles.highest.id) : null,
    isOwner: guildOwnerId && member.user?.id && String(guildOwnerId) === String(member.user.id),
  };

  flags.isAdmin = isAdminFromFlags(flags);
  flags.isRaidlead = isRaidleadFromFlags(flags);

  return flags;
}

/* ---------- live aus Discord ziehen (für /api/users) ---------- */
export async function getLiveRoleFlags(clientOrNull, guildId, userId) {
  try {
    const client = clientOrNull && clientOrNull.guilds ? clientOrNull : await ensureBotReady();
    const guild = await client.guilds.fetch(String(guildId));
    const member = await guild.members.fetch(String(userId));
    const flags = buildFlagsFromMember(member, { guildOwnerId: guild.ownerId });
    return {
      ...flags,
      displayName: member?.nickname || member?.user?.globalName || member?.user?.username || null,
      username: member?.user?.username || null,
      avatarUrl: member?.displayAvatarURL ? member.displayAvatarURL() : null,
    };
  } catch {
    return {
      isOwner: false, isAdmin: false, isRaidlead: false,
      roles: [], rolesCsv: "", highestRole: null,
      displayName: null, username: null, avatarUrl: null,
    };
  }
}

/* ---------- Frontend-Flags ---------- */
export function buildFrontendFlags(input = {}) {
  const roles = toRoleArray(input.roles ?? input.rolesCsv);
  const owner = !!input.isOwner;
  const admin = owner || (!!input.isAdmin || (ADMIN_ROLE_ID && roles.includes(String(ADMIN_ROLE_ID))));
  const raidlead = admin || (!!input.isRaidlead || (RAIDLEAD_ROLE_ID && roles.includes(String(RAIDLEAD_ROLE_ID))));
  return {
    isOwner: owner,
    isAdmin: admin,
    isRaidlead: raidlead,
    highestRole: input.highestRole || highestRoleFromFlags({ roles }),
    roles,
  };
}

export default {
  isOwnerFromFlags,
  isAdminFromFlags,
  isAdminLevel,
  isRaidleadFromFlags,
  highestRoleFromFlags,
  buildFlagsFromMember,
  getLiveRoleFlags,
  buildFrontendFlags,
};
