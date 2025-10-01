import 'dotenv/config';
import {
  Client, GatewayIntentBits, Partials,
} from 'discord.js';

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,   // für Rollen & displayName
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.GuildMember, Partials.User, Partials.Channel, Partials.Message],
});

client.on('ready', () => {
  console.log(`✅ Discord ready: ${client.user?.tag} (${client.user?.id})`);
});
client.on('error', e => console.error('❌ [discord] error:', e?.message || e));
client.on('warn',  m => console.warn('⚠️ [discord] warn:', m));

let loginPromise = null;
export async function ensureBotReady() {
  if (client.readyAt) return client;
  if (!loginPromise) {
    const token = process.env.DISCORD_TOKEN;
    if (!token) throw new Error('DISCORD_TOKEN fehlt in .env');
    console.log('🤖 Discord-Bot: login()…');
    loginPromise = client.login(token);
  }
  await loginPromise;
  return client;
}

export function discordStatus() {
  return {
    ready: !!client.readyAt,
    user: client.user ? { id: client.user.id, tag: client.user.tag } : null,
    guilds: [...client.guilds.cache.keys()],
    guildIdExpected: process.env.DISCORD_GUILD_ID || null,
    categoryId: process.env.DISCORD_RAID_CATEGORY_ID || null,
  };
}
