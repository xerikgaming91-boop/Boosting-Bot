import { Client, GatewayIntentBits, ChannelType, PermissionsBitField } from 'discord.js';
import { env } from '../config/env.js';

let client;
let ready = false;
let cachedGuild = null;
let cachedMembers = new Map();

/** start discord client once */
export async function startDiscord() {
  if (client) return;
  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers
    ]
  });

  client.once('ready', () => {
    ready = true;
    // eslint-disable-next-line no-console
    console.log(`[Discord] Client ready als ${client.user?.tag}`);
  });

  await client.login(env.DISCORD_BOT_TOKEN);
}

function assertReady() {
  if (!client || !ready) {
    throw new Error('[Discord] client not ready');
  }
}

export function getClient() {
  assertReady();
  return client;
}

export async function getGuild() {
  assertReady();
  if (cachedGuild?.id === env.DISCORD_GUILD_ID) return cachedGuild;
  cachedGuild = await client.guilds.fetch(env.DISCORD_GUILD_ID);
  return cachedGuild;
}

/** Ensure we fetched all members once and cached them */
export async function ensureGuildCache() {
  const guild = await getGuild();
  // fetch all members (requires privileged intent enabled)
  const fetched = await guild.members.fetch();
  cachedMembers = fetched;
  return cachedMembers;
}

/** Return raidleads from guild by role-id (or name 'raidlead') */
export async function listRaidleads() {
  assertReady();
  const guild = await getGuild();

  // Ensure members in cache
  if (!cachedMembers?.size) {
    await ensureGuildCache();
  }

  // resolve role
  let roleId = env.RAIDLEAD_ROLE_ID?.trim();
  let role =
    (roleId && guild.roles.cache.get(roleId)) ||
    guild.roles.cache.find((r) => r.name.toLowerCase() === 'raidlead');

  if (!role) {
    return []; // no role present on guild
  }

  const leads = [];
  for (const [, m] of cachedMembers) {
    if (m.roles.cache.has(role.id)) {
      leads.push({
        id: m.user.id,
        username: m.user.username,
        avatar: m.user.avatar
      });
    }
  }
  return leads.sort((a, b) => a.username.localeCompare(b.username));
}

/** Create text channel "Wed-1800-nhc-vip-syntax" in category if provided */
export async function createRaidTextChannel({ date, difficulty, lootType, leadUserId }) {
  assertReady();
  const guild = await getGuild();

  // Format name parts
  const day = date.toLocaleDateString('en-GB', { weekday: 'short' }); // Mon, Tue...
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');

  // diff map short
  const d = (difficulty ?? '').toLowerCase();
  const diffShort = d === 'mythic' ? 'myth' : d === 'heroic' ? 'hc' : 'nhc';

  const lt = (lootType ?? '').toLowerCase();
  const lootShort = lt === 'vip' ? 'vip' : lt === 'saved' ? 'saved' : 'unsaved';

  const leadMember =
    cachedMembers.get(leadUserId) || (await guild.members.fetch(leadUserId).catch(() => null));
  const leadName = (leadMember?.user?.username || 'lead').toLowerCase();

  const channelName = `${day}-${hh}${mm}-${diffShort}-${lootShort}-${leadName}`
    .replaceAll(' ', '-')
    .toLowerCase();

  const options = {
    name: channelName,
    type: ChannelType.GuildText
  };

  if (env.DISCORD_RAID_CATEGORY_ID) {
    options.parent = env.DISCORD_RAID_CATEGORY_ID;
  }

  // Permissions: allow lead to view / send
  const permissionOverwrites = [];
  if (leadMember) {
    permissionOverwrites.push({
      id: leadMember.id,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
    });
  }
  if (permissionOverwrites.length) options.permissionOverwrites = permissionOverwrites;

  const ch = await guild.channels.create(options);
  return ch;
}

/** Small health object for /api/leads/debug */
export function getDiscordStatus() {
  return {
    ready,
    user: client?.user?.tag || null,
    guildId: cachedGuild?.id || null
  };
}
