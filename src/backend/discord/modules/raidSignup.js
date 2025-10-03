// src/backend/discord/modules/raidSignup.js
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
} from "discord.js";
import { prisma } from "../../prismaClient.js";
import { refreshRaidMessage } from "./raidAnnounceAdapter.js";
import {
  CLASS_OPTIONS,
  ROLE_OPTIONS,
  CLASS_ROLE_MATRIX,
  ROLE_LABELS,
} from "./classRoleMatrix.js";

/* ========= kleine Utils ========= */
const ts = () => {
  const d = new Date();
  return d.toLocaleTimeString("de-DE", { hour12: false }) + "." + String(d.getMilliseconds()).padStart(3,"0");
};
const dbg = (...a) => console.log("[SIGNUP-DBG " + ts() + "]", ...a);
const perr = (...a) => console.log("[SIGNUP-ERR " + ts() + "]", ...a);

// Compact CustomId Encoder (max 100 chars)
function enc(parts) {
  // su|<type>|<raidId>|<charId>|<role>|<saved>
  return [
    "su",
    parts.t || "",
    parts.raidId ?? "",
    parts.charId ?? "",
    parts.role ?? "",
    parts.saved ? "1" : "0",
  ].join("|");
}
function dec(id) {
  const p = String(id || "").split("|");
  if (p[0] !== "su") return null;
  return {
    t: p[1] || "",
    raidId: p[2] ? Number(p[2]) : null,
    charId: p[3] ? Number(p[3]) : null,
    role: p[4] || "",
    saved: p[5] === "1",
  };
}

/* ========= Public: Buttons/Row ========= */
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

/* ========= Interaktions-Flow ========= */
// Schritt 1: Booster – Char wählen
async function stepPickChar(i, raidId) {
  const userId = String(i.user.id);

  const chars = await prisma.boosterChar.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  if (!chars.length) {
    return i.reply({
      ephemeral: true,
      content: "Du hast noch keine Chars importiert. Bitte zuerst unter **/chars** anlegen.",
    });
  }

  const options = chars.slice(0, 25).map((c) => ({
    label: `${c.name}-${c.realm}${c.class ? ` (${c.class})` : ""}`,
    value: String(c.id),
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(enc({ t: "pick_char", raidId }))
    .setPlaceholder("Wähle deinen Charakter")
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(menu);
  await i.reply({ ephemeral: true, content: "Charakter auswählen:", components: [row] });
}

// Schritt 2: Rolle wählen (gefiltert nach Klassenmatrix)
async function stepPickRole(i, raidId, charId) {
  const char = await prisma.boosterChar.findUnique({ where: { id: charId } });
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
  await i.update({ content: "Saved-Status wählen:", components: [row] });
}

// Schritt 4: Notiz (Modal)
async function stepNoteModal(i, raidId, charId, role, saved) {
  const modal = new ModalBuilder()
    .setCustomId(enc({ t: "final_modal", raidId, charId, role, saved }))
    .setTitle("Anmeldung – Notiz");

  const note = new TextInputBuilder()
    .setCustomId("note")
    .setLabel("Optionale Notiz (z.B. Keys, Specs, Wünsche)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500);

  modal.addComponents(new ActionRowBuilder().addComponents(note));
  await i.showModal(modal);
}

/* ========= DB-Aktionen ========= */
async function createBoosterSignup({ raidId, userId, charId, role, saved, note }) {
  // Mehrfach-Anmeldungen erlaubt — nur DUP pro (raidId,charId) blocken
  const existing = await prisma.signup.findFirst({
    where: { raidId, charId },
    select: { id: true },
  });
  if (existing) {
    // Überschreiben/Update statt Fehler?
    await prisma.signup.delete({ where: { id: existing.id } });
  }

  const char = await prisma.boosterChar.findUnique({ where: { id: charId } });

  await prisma.signup.create({
    data: {
      raidId,
      userId,
      type: role,                        // "TANK" | "HEAL" | "DPS"
      charId,
      displayName: null,
      saved: !!saved,
      note: note || null,
      class: char?.class || null,        // Snapshot
      status: "SIGNUPED",                // Schema-Enum
    },
  });

  // Embed aktualisieren
  await refreshRaidMessage(raidId).catch(() => {});
}

async function createLootbuddySignup({ raidId, userId, pickedClass, note }) {
  await prisma.signup.create({
    data: {
      raidId,
      userId,
      type: "LOOTBUDDY",
      charId: null,
      displayName: null,
      saved: false,
      note: note || null,
      class: pickedClass || null,        // Snapshot der gewählten Klasse
      status: "SIGNUPED",
    },
  });

  await refreshRaidMessage(raidId).catch(() => {});
}

async function deleteOwnSignup({ raidId, userId }) {
  // Entfernt alle eigenen Signups (Booster & Lootbuddy) für diesen Raid
  const rows = await prisma.signup.findMany({ where: { raidId, userId } });
  for (const r of rows) {
    await prisma.signup.delete({ where: { id: r.id } });
  }
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
          // direkt Klassen-Dropdown für Lootbuddy
          const menu = new StringSelectMenuBuilder()
            .setCustomId(enc({ t: "pick_lootclass", raidId: p.raidId }))
            .setPlaceholder("Wähle Lootbuddy-Klasse")
            .addOptions(CLASS_OPTIONS.slice(0, 25));

          const row = new ActionRowBuilder().addComponents(menu);
          return i.reply({ ephemeral: true, content: "Lootbuddy-Klasse wählen:", components: [row] });
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
          const role = String(i.values[0]); // TANK/HEAL/DPS
          return stepPickSaved(i, p.raidId, p.charId, role);
        }
        if (p.t === "pick_saved") {
          const saved = i.values[0] === "saved";
          return stepNoteModal(i, p.raidId, p.charId, p.role, saved);
        }
        if (p.t === "pick_lootclass") {
          const pickedClass = i.values[0];
          // danach Notiz-Modal
          const modal = new ModalBuilder()
            .setCustomId(enc({ t: "final_loot_modal", raidId: p.raidId, charId: 0, role: "LOOTBUDDY", saved: false }) + ":lc:" + pickedClass)
            .setTitle("Lootbuddy – Notiz");

          const note = new TextInputBuilder()
            .setCustomId("note")
            .setLabel("Optionale Notiz")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(300);

          modal.addComponents(new ActionRowBuilder().addComponents(note));
          return i.showModal(modal);
        }
      }

      // MODALS
      if (i.isModalSubmit()) {
        const cid = String(i.customId);
        if (cid.startsWith("su|final_modal|")) {
          const p = dec(cid);
          const note = i.fields.getTextInputValue("note")?.trim() || "";
          await createBoosterSignup({
            raidId: p.raidId,
            userId: String(i.user.id),
            charId: p.charId,
            role: p.role,
            saved: p.saved,
            note,
          });
          return i.reply({ ephemeral: true, content: "✅ Anmeldung gespeichert." });
        }
        if (cid.startsWith("su|final_loot_modal|")) {
          // Klasse hängt hinter ":lc:" dran (damit CustomId < 100 bleibt)
          const [idPart, cls] = cid.split(":lc:");
          const p = dec(idPart);
          const note = i.fields.getTextInputValue("note")?.trim() || "";
          await createLootbuddySignup({
            raidId: p.raidId,
            userId: String(i.user.id),
            pickedClass: cls || null,
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
