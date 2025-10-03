// src/backend/discord/modules/classRoleMatrix.js

// Labels für Rollen
export const ROLE_LABELS = {
  TANK: "Tank",
  HEAL: "Heal",
  DPS: "DPS",
  LOOTBUDDY: "Lootbuddy",
};

// Optionen für Rollen-Select
export const ROLE_OPTIONS = [
  { label: ROLE_LABELS.TANK, value: "TANK" },
  { label: ROLE_LABELS.HEAL, value: "HEAL" },
  { label: ROLE_LABELS.DPS, value: "DPS" },
];

// Klassen → erlaubte Rollen
export const CLASS_ROLE_MATRIX = {
  Warrior: ["TANK", "DPS"],
  Paladin: ["TANK", "HEAL", "DPS"],
  Hunter: ["DPS"],
  Rogue: ["DPS"],
  Priest: ["HEAL", "DPS"],
  Shaman: ["HEAL", "DPS"],
  Mage: ["DPS"],
  Warlock: ["DPS"],
  Monk: ["TANK", "HEAL", "DPS"],
  Druid: ["TANK", "HEAL", "DPS"],
  DemonHunter: ["TANK", "DPS"],
  Evoker: ["HEAL", "DPS"],
};

// Klassen-Optionen (für Lootbuddy)
export const CLASS_OPTIONS = Object.keys(CLASS_ROLE_MATRIX).map((c) => ({
  label: c,
  value: c,
}));
