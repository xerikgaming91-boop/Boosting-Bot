// src/backend/discord/bot.js
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
} from "discord.js";
import { registerSignupHandlers } from "./modules/raidSignup.js";

const ENV = process.env;
const TOKEN =
  ENV.DISCORD_TOKEN ||
  ENV.BOT_TOKEN ||
  ENV.DISCORD_BOT_TOKEN ||
  "";

let client = null;
let readyPromise = null;
let handlersRegistered = false;

/** kleine Hilfe fürs Logging mit Uhrzeit */
function ts() {
  const t = new Date();
  return (
    t.toLocaleTimeString("de-DE", { hour12: false }) +
    "." +
    String(t.getMilliseconds()).padStart(3, "0")
  );
}

/** interner Bootstraper – erzeugt Client & loggt ein (einmalig) */
function createClientOnce() {
  if (client) return client;

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent, // falls du z.B. /ping o.ä. brauchst
    ],
    partials: [Partials.Channel, Partials.GuildMember, Partials.Message],
  });

  // "ready" -> in v15 heißt es "clientReady" (Warnung ist harmlos, v14: "ready" funktioniert)
  client.once(Events.ClientReady, (cli) => {
    console.log(`✅ Discord ready: ${cli.user.tag} (${cli.user.id})`);
  });

  client.on("error", (e) => {
    console.error("[DISCORD-ERR]", e);
  });

  return client;
}

/**
 * Stellt sicher, dass der Bot eingeloggt & bereit ist.
 * Gibt immer denselben Client zurück (idempotent).
 */
export async function ensureBotReady() {
  if (!TOKEN) {
    throw new Error("No DISCORD_TOKEN / BOT_TOKEN provided in environment.");
  }

  // Client erzeugen (falls noch nicht vorhanden)
  createClientOnce();

  // Bereits eingeloggt & ready?
  if (client.isReady?.()) {
    // Handler einmalig registrieren
    if (!handlersRegistered) {
      registerSignupHandlers(client);
      handlersRegistered = true;
      console.log(`[DISCORD-DBG ${ts()}] Signup-Handlers registriert (hot).`);
    }
    return client;
  }

  // Bereits ein Login-Versprechen?
  if (readyPromise) {
    await readyPromise;
    if (!handlersRegistered) {
      registerSignupHandlers(client);
      handlersRegistered = true;
      console.log(`[DISCORD-DBG ${ts()}] Signup-Handlers registriert (await).`);
    }
    return client;
  }

  // Login starten
  readyPromise = (async () => {
    try {
      await client.login(TOKEN);
    } catch (err) {
      // rückbauen, damit ein nächster Aufruf wieder versuchen kann
      readyPromise = null;
      client = null;
      throw err;
    }
  })();

  await readyPromise;

  // Handler einmalig registrieren
  if (!handlersRegistered) {
    registerSignupHandlers(client);
    handlersRegistered = true;
    console.log(`[DISCORD-DBG ${ts()}] Signup-Handlers registriert.`);
  }

  return client;
}

/** Kurzer Status fürs Backend (/api/discord/status o.ä.) */
export function discordStatus() {
  const loggedIn = !!client && !!client.user;
  return {
    loggedIn,
    userId: loggedIn ? client.user.id : null,
    tag: loggedIn ? client.user.tag : null,
  };
}

/** optionaler Helper, wenn du im Code schnell an eine Guild willst */
export async function getGuild(guildId) {
  const cli = await ensureBotReady();
  return cli.guilds.fetch(guildId);
}

/** optionaler Helper, um Nickname/Anzeigenamen (Nickname > globalName > username) zu bekommen */
export async function getMemberDisplay(guildId, userId) {
  const cli = await ensureBotReady();
  try {
    const g = await cli.guilds.fetch(guildId);
    const m = await g.members.fetch(userId);
    return m?.nickname || m?.user?.globalName || m?.user?.username || null;
  } catch {
    return null;
  }
}
