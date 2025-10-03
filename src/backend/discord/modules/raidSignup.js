import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ComponentType, InteractionType,
} from "discord.js";
import { prisma } from "../../prismaClient.js";
import { isRoleAllowedForClass, ROLE } from "./classRoleMatrix.js";
import { refreshRaidMessage } from "./raidAnnounceAdapter.js";

const PREFIX = "raid";

/* ---------- UI Komponenten ---------- */
export function getSignupComponents(raidId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}:signup:${raidId}`)
        .setLabel("Anmelden")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}:unsign:${raidId}`)
        .setLabel("Abmelden")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}:loot:${raidId}`)
        .setLabel("Lootbuddy")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

/* ---------- Helpers DB-safe (optionale Felder) ---------- */
async function createOrUpdateSignupSafe(dataWhereDelete, createData) {
  // erst löschen, dann neu erstellen (vereinfacht)
  try { await prisma.signup.deleteMany({ where: dataWhereDelete }); } catch {}
  const tryCreate = async (d) => prisma.signup.create({ data: d });

  // 1: Voll
  try { return await tryCreate(createData); } catch (e1) {}

  // 2: ohne class
  try {
    const { class: _c, ...rest } = createData;
    return await tryCreate(rest);
  } catch (e2) {}

  // 3: ohne status
  try {
    const { status: _s, ...rest } = createData;
    return await tryCreate(rest);
  } catch (e3) {}

  // 4: nur Minimal
  const { class: _c2, status: _s2, ...rest } = createData;
  return await tryCreate(rest);
}

/* ---------- Flow: Booster Signup in Steps ---------- */
async function startBoosterSignup(interaction, raidId) {
  await interaction.deferReply({ ephemeral: true });

  // 1) Char auswählen
  const chars = await prisma.boosterChar.findMany({
    where: { userId: interaction.user.id },
    orderBy: { updatedAt: "desc" },
    take: 25,
  });

  if (!chars.length) {
    return interaction.editReply("Du hast noch keine Chars hinterlegt. Importiere zuerst unter **/chars**.");
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${PREFIX}:step:char:${raidId}`)
    .setPlaceholder("Wähle deinen Char")
    .addOptions(
      chars.map((c) => ({
        label: `${c.name} (${c.realm})`,
        description: c.class || "—",
        value: String(c.id),
      }))
    );

  await interaction.editReply({
    content: "Schritt 1/3 – Char auswählen:",
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

async function continueWithRole(interaction, raidId, charId) {
  const char = await prisma.boosterChar.findUnique({ where: { id: Number(charId) } });
  if (!char) {
    return interaction.update({ content: "Char nicht gefunden.", components: [] });
  }

  const options = [
    { label: "Tank", value: ROLE.TANK, allow: isRoleAllowedForClass(char.class, ROLE.TANK) },
    { label: "Healer", value: ROLE.HEAL, allow: isRoleAllowedForClass(char.class, ROLE.HEAL) },
    { label: "DPS", value: ROLE.DPS, allow: isRoleAllowedForClass(char.class, ROLE.DPS) },
  ].filter(o => o.allow);

  const roleSelect = new StringSelectMenuBuilder()
    .setCustomId(`${PREFIX}:step:role:${raidId}:${char.id}`)
    .setPlaceholder("Rolle wählen")
    .addOptions(options.map(o => ({ label: o.label, value: o.value })));

  await interaction.update({
    content: `Schritt 2/3 – Rolle auswählen (Char: **${char.name}**):`,
    components: [new ActionRowBuilder().addComponents(roleSelect)],
  });
}

async function continueWithSavedNote(interaction, raidId, charId, role) {
  // Saved/Unsaved + Notiz via Modal
  const modal = new ModalBuilder()
    .setCustomId(`${PREFIX}:step:final:${raidId}:${charId}:${role}`)
    .setTitle("Anmeldung");

  const savedInput = new TextInputBuilder()
    .setCustomId("saved")
    .setLabel("Saved? (ja/nein)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const noteInput = new TextInputBuilder()
    .setCustomId("note")
    .setLabel("Notiz (optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(savedInput),
    new ActionRowBuilder().addComponents(noteInput),
  );

  await interaction.showModal(modal);
}

/* ---------- Flow: Lootbuddy ---------- */
async function startLootbuddySignup(interaction, raidId) {
  const modal = new ModalBuilder()
    .setCustomId(`${PREFIX}:loot:final:${raidId}`)
    .setTitle("Lootbuddy");

  const classInput = new TextInputBuilder()
    .setCustomId("class")
    .setLabel("Klasse (z. B. Druid)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const noteInput = new TextInputBuilder()
    .setCustomId("note")
    .setLabel("Notiz (optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(classInput),
    new ActionRowBuilder().addComponents(noteInput),
  );

  await interaction.showModal(modal);
}

/* ---------- Main: Interaction Handler registrieren ---------- */
export function registerSignupHandlers(client) {
  client.on("interactionCreate", async (interaction) => {
    try {
      // BUTTONS
      if (interaction.isButton()) {
        const [pfx, action, raidIdRaw] = interaction.customId.split(":");
        if (pfx !== PREFIX) return;
        const raidId = Number(raidIdRaw);

        if (action === "signup") {
          return startBoosterSignup(interaction, raidId);
        }
        if (action === "unsign") {
          await interaction.deferReply({ ephemeral: true });
          await prisma.signup.deleteMany({
            where: { raidId, userId: interaction.user.id },
          });
          await refreshRaidMessage(raidId);
          return interaction.editReply("Du wurdest abgemeldet.");
        }
        if (action === "loot") {
          return startLootbuddySignup(interaction, raidId);
        }
        return;
      }

      // SELECTS
      if (interaction.isStringSelectMenu()) {
        const parts = interaction.customId.split(":"); // raid:step:role:raidId:charId  |  raid:step:char:raidId
        if (parts[0] !== PREFIX) return;

        if (parts[1] === "step" && parts[2] === "char") {
          const raidId = Number(parts[3]);
          const charId = interaction.values?.[0];
          return continueWithRole(interaction, raidId, charId);
        }

        if (parts[1] === "step" && parts[2] === "role") {
          const raidId = Number(parts[3]);
          const charId = Number(parts[4]);
          const role = interaction.values?.[0];
          return continueWithSavedNote(interaction, raidId, charId, role);
        }
      }

      // MODALS
      if (interaction.type === InteractionType.ModalSubmit) {
        const parts = interaction.customId.split(":"); // raid:step:final:raidId:charId:role  |  raid:loot:final:raidId
        if (parts[0] !== PREFIX) return;

        // Booster final
        if (parts[1] === "step" && parts[2] === "final") {
          const raidId = Number(parts[3]);
          const charId = Number(parts[4]);
          const role = parts[5];

          const savedRaw = interaction.fields.getTextInputValue("saved") || "";
          const note = interaction.fields.getTextInputValue("note") || "";
          const saved = /^j/i.test(savedRaw.trim()); // „ja“ = true

          const char = await prisma.boosterChar.findUnique({ where: { id: charId } });

          const createData = {
            raidId,
            userId: interaction.user.id,
            type: role,            // Prisma-Enum TANK/HEAL/DPS/LOOTBUDDY
            charId,
            displayName: char ? `${char.name} (${char.realm})` : null,
            saved,
            note: note || null,
            class: char?.class || null, // optional
            status: "SIGNUPED",         // optional
          };

          await createOrUpdateSignupSafe({ raidId, userId: interaction.user.id }, createData);
          await refreshRaidMessage(raidId);

          return interaction.reply({ ephemeral: true, content: "Anmeldung gespeichert." });
        }

        // Lootbuddy final
        if (parts[1] === "loot" && parts[2] === "final") {
          const raidId = Number(parts[3]);
          const klass = interaction.fields.getTextInputValue("class")?.trim() || "—";
          const note = interaction.fields.getTextInputValue("note") || "";

          const createData = {
            raidId,
            userId: interaction.user.id,
            type: "LOOTBUDDY",
            charId: null,
            displayName: interaction.user.globalName || interaction.user.username,
            saved: false,
            note: note || null,
            class: klass,
            status: "SIGNUPED",
          };

          await createOrUpdateSignupSafe({ raidId, userId: interaction.user.id }, createData);
          await refreshRaidMessage(raidId);

          return interaction.reply({ ephemeral: true, content: "Lootbuddy-Anmeldung gespeichert." });
        }
      }
    } catch (e) {
      try {
        if (interaction.isRepliable()) {
          await interaction.reply({ ephemeral: true, content: `Fehler: ${e?.message || e}` }).catch(() => {});
        }
      } catch {}
      console.error("[SIGNUP] error:", e);
    }
  });
}
