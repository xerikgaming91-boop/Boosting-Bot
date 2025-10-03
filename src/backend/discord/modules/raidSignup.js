// src/backend/discord/modules/raidSignup.js
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { prisma } from "../../prismaClient.js";
import { refreshRaidMessage } from "./raidAnnounceAdapter.js";
import {
  CLASS_OPTIONS,
  ROLE_OPTIONS,
  CLASS_ROLE_MATRIX,
} from "./classRoleMatrix.js";

/* ===== logging ===== */
const ENV = process.env;
const IS_DEV = (ENV.MODE || ENV.NODE_ENV) !== "production";
const ts = () => {
  const d = new Date();
  return d.toLocaleTimeString("de-DE", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3, "0");
};
const dbg  = (...a) => { if (IS_DEV) console.log("[SIGNUP-DBG " + ts() + "]", ...a); };
const perr = (...a) => console.warn("[SIGNUP-ERR " + ts() + "]", ...a);

/* ===== utils (customId payload) ===== */
function enc(o){ return JSON.stringify(o); }
function dec(s){ try { return JSON.parse(s); } catch { return null; } }

/* ===== UI Components ===== */
export function getSignupComponents(raidId) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(enc({ t: "start_booster", raidId }))
      .setStyle(ButtonStyle.Success)
      .setLabel("✅ Anmelden"),
    new ButtonBuilder()
      .setCustomId(enc({ t: "start_loot", raidId }))
      .setStyle(ButtonStyle.Primary)
      .setLabel("💰 Lootbuddy"),
    new ButtonBuilder()
      .setCustomId(enc({ t: "start_unsub", raidId }))
      .setStyle(ButtonStyle.Danger)
      .setLabel("❌ Abmelden"),
  );
  return [row];
}

/* ===== helpers ===== */
async function safeFindCharsByUser(userId) {
  // robust sort: updatedAt -> id -> unsorted
  try {
    return await prisma.boosterChar.findMany({
      where: { userId: String(userId) },
      orderBy: [{ updatedAt: "asc" }],
    });
  } catch {
    try {
      return await prisma.boosterChar.findMany({
        where: { userId: String(userId) },
        orderBy: [{ id: "asc" }],
      });
    } catch {
      return await prisma.boosterChar.findMany({
        where: { userId: String(userId) },
      });
    }
  }
}

function buildNoteModal(customId, title = "Notiz (optional)") {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title);

  const noteInput = new TextInputBuilder()
    .setCustomId("note")
    .setLabel("Notiz (optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(200);

  const row = new ActionRowBuilder().addComponents(noteInput);
  modal.addComponents(row);
  return modal;
}

/* ========= Interaktions-Flow ========= */
// Schritt 1: Booster – Char wählen
async function stepPickChar(i, raidId) {
  const chars = await safeFindCharsByUser(i.user.id);
  if (!chars.length) {
    return i.reply({ ephemeral: true, content: "Du hast noch keinen Charakter angelegt." });
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(enc({ t: "pick_char", raidId }))
    .setPlaceholder("Charakter wählen")
    .addOptions(chars.slice(0, 25).map(c => ({ label: c.name || `#${c.id}`, value: String(c.id) })));

  const row = new ActionRowBuilder().addComponents(menu);
  await i.reply({ ephemeral: true, content: "Wähle deinen Charakter:", components: [row] });
}

// Schritt 2: Rolle wählen
async function stepPickRole(i, raidId, charId) {
  const char = await prisma.boosterChar.findUnique({ where: { id: Number(charId) } });
  if (!char) return i.update({ content: "Unbekannter Charakter.", components: [] });

  const allowedRoles = (CLASS_ROLE_MATRIX[char.class] || ["DPS"]).filter(Boolean);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(enc({ t: "pick_role", raidId, charId }))
    .setPlaceholder("Rolle wählen")
    .addOptions(
      ROLE_OPTIONS.filter(o => allowedRoles.includes(o.value))
    );

  const row = new ActionRowBuilder().addComponents(menu);
  await i.update({
    content: `Klasse: **${char.class ?? "?"}** – Rolle wählen:`,
    components: [row],
  });
}

// Schritt 3: Saved/Unsaved
async function stepPickSaved(i, raidId, charId, role) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(enc({ t: "pick_saved", raidId, charId, role }))
    .setPlaceholder("Saved/Unsaved?")
    .addOptions([
      { label: "Unsaved", value: "unsaved" },
      { label: "Saved", value: "saved" },
    ]);

  const row = new ActionRowBuilder().addComponents(menu);
  await i.update({
    content: `Rolle: **${role}** – Saved/Unsaved?`,
    components: [row],
  });
}

/* ====== DB Writes ====== */
async function createBoosterSignup({ raidId, userId, charId, role, saved, note }) {
  // Doppelte (raidId,charId) ersetzen
  const existing = await prisma.signup.findFirst({
    where: { raidId, charId },
    select: { id: true },
  });
  if (existing) {
    await prisma.signup.delete({ where: { id: existing.id } });
  }

  const char = await prisma.boosterChar.findUnique({ where: { id: charId } });
  const user = await prisma.user.findUnique({
    where: { discordId: String(userId) },
    select: { displayName: true, username: true },
  });
  const displayName = user?.displayName || user?.username || null;

  // Achtung: kein charName-Feld im Schema -> weglassen
  await prisma.signup.create({
    data: {
      raidId,
      userId,
      type: role,                  // "TANK" | "HEAL" | "DPS"
      charId,
      displayName,
      saved: !!saved,
      note: note || null,
      class: char?.class || null,  // Snapshot
      status: "SIGNUPED",
    },
  });

  // Embed aktualisieren (Adapter kann ID direkt verarbeiten)
  await refreshRaidMessage(raidId).catch(() => {});
}

async function createLootbuddySignup({ raidId, userId, pickedClass, note }) {
  const user = await prisma.user.findUnique({
    where: { discordId: String(userId) },
    select: { displayName: true, username: true },
  });
  const displayName = user?.displayName || user?.username || null;

  await prisma.signup.create({
    data: {
      raidId,
      userId,
      type: "LOOTBUDDY",
      charId: null,
      displayName,
      saved: false,
      note: note || null,
      class: pickedClass || null,   // Snapshot
      status: "SIGNUPED",
    },
  });

  await refreshRaidMessage(raidId).catch(() => {});
}

async function deleteOwnSignup({ raidId, userId }) {
  await prisma.signup.deleteMany({
    where: { raidId, userId },
  });
  await refreshRaidMessage(raidId).catch(() => {});
}

/* ========= Interaction Handler ========= */
export function registerSignupHandlers(client) {
  client.on("interactionCreate", async (i) => {
    try {
      // BUTTONS
      if (i.isButton()) {
        const p = dec(i.customId);
        if (!p) return;

        if (p.t === "start_booster") {
          return stepPickChar(i, p.raidId);
        }
        if (p.t === "start_loot") {
          // Klassen-Dropdown für Lootbuddy
          const menu = new StringSelectMenuBuilder()
            .setCustomId(enc({ t: "pick_lootclass", raidId: p.raidId }))
            .setPlaceholder("Wähle Lootbuddy-Klasse")
            .addOptions(CLASS_OPTIONS.slice(0, 25));
          const row = new ActionRowBuilder().addComponents(menu);
          return i.reply({ ephemeral: true, content: "Wähle die Lootbuddy-Klasse:", components: [row] });
        }
        if (p.t === "start_unsub") {
          await deleteOwnSignup({ raidId: p.raidId, userId: String(i.user.id) });
          return i.reply({ ephemeral: true, content: "Deine Anmeldungen für diesen Raid wurden entfernt." });
        }
      }

      // SELECT MENUS
      if (i.isStringSelectMenu()) {
        const p = dec(i.customId);
        if (!p) return;

        if (p.t === "pick_char") {
          const charId = Number(i.values[0]);
          return stepPickRole(i, p.raidId, charId);
        }

        if (p.t === "pick_role") {
          const charId = Number(p.charId);
          const role = String(i.values[0]);
          return stepPickSaved(i, p.raidId, charId, role);
        }

        if (p.t === "pick_saved") {
          const charId = Number(p.charId);
          const role = String(p.role);
          const saved = String(i.values[0]) === "saved";

          // >>> NEU: Notiz-Modal anzeigen (statt direkt speichern)
          const modal = buildNoteModal(
            enc({ t: "note_booster", raidId: p.raidId, charId, role, saved }),
            "Anmeldung – Notiz (optional)"
          );
          return i.showModal(modal);
        }

        if (p.t === "pick_lootclass") {
          const pickedClass = String(i.values[0]);
          // >>> NEU: Notiz-Modal für Lootbuddy
          const modal = buildNoteModal(
            enc({ t: "note_loot", raidId: p.raidId, pickedClass }),
            "Lootbuddy – Notiz (optional)"
          );
          return i.showModal(modal);
        }
      }

      // MODALS
      if (i.isModalSubmit()) {
        const p = dec(i.customId);
        if (!p) return;

        if (p.t === "note_booster") {
          const note = (i.fields.getTextInputValue("note") || "").trim() || null;
          await createBoosterSignup({
            raidId: p.raidId,
            userId: String(i.user.id),
            charId: Number(p.charId),
            role: String(p.role),
            saved: !!p.saved,
            note,
          });
          return i.reply({ ephemeral: true, content: "✅ Anmeldung gespeichert." });
        }

        if (p.t === "note_loot") {
          const note = (i.fields.getTextInputValue("note") || "").trim() || null;
          await createLootbuddySignup({
            raidId: p.raidId,
            userId: String(i.user.id),
            pickedClass: String(p.pickedClass),
            note,
          });
          return i.reply({ ephemeral: true, content: "✅ Lootbuddy-Anmeldung gespeichert." });
        }
      }
    } catch (e) {
      perr(e);
      try {
        if (i.deferred || i.replied) await i.followUp({ ephemeral: true, content: "Es ist ein Fehler aufgetreten." });
        else await i.reply({ ephemeral: true, content: "Es ist ein Fehler aufgetreten." });
      } catch {}
    }
  });

  dbg("Signup-Handlers registriert.");
}
