// src/backend/discord/modules/raidChannel.js
import { ensureBotReady } from "../bot.js";

const ENV = process.env;
const GUILD_ID = ENV.DISCORD_GUILD_ID || ENV.GUILD_ID || "";
const RAID_CATEGORY_ID =
  ENV.DISCORD_RAID_CATEGORY_ID || ENV.RAID_CATEGORY_ID || "";

/** Einfacher Helper um einen Text-Kanal in der gewünschten Kategorie zu erzeugen. */
export async function createRaidChannel(name) {
  const client = await ensureBotReady();
  if (!GUILD_ID) throw new Error("missing_guild_id");

  const guild = await client.guilds.fetch(GUILD_ID);
  const channel = await guild.channels.create({
    name,
    parent: RAID_CATEGORY_ID || null,
    type: 0, // GuildText
  });
  return channel;
}
