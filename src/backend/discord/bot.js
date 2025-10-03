import { Client, GatewayIntentBits, Partials } from "discord.js";
import { registerSignupHandlers } from "./modules/raidSignup.js";

const ENV = process.env;
let client = null;
let ready = false;

export function discordStatus() {
  return {
    ready,
    user: client?.user ? `${client.user.username}#${client.user.discriminator}` : null,
    id: client?.user?.id || null,
  };
}

export async function ensureBotReady() {
  if (client && ready) return client;

  if (!client) {
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
    });

    client.once("ready", () => {
      ready = true;
      console.log(`✅ Discord ready: ${client.user?.username}#${client.user?.discriminator} (${client.user?.id})`);
      // Interaction-Handler
      registerSignupHandlers(client);
      console.log("[DISCORD-DBG] Signup-Handlers registriert.");
    });

    const token = ENV.DISCORD_TOKEN || ENV.BOT_TOKEN;
    if (!token) throw new Error("DISCORD_TOKEN missing");
    await client.login(token);
  }

  // warten bis ready
  if (!ready) {
    await new Promise((r) => {
      const chk = setInterval(() => {
        if (ready) { clearInterval(chk); r(); }
      }, 50);
    });
  }

  return client;
}
