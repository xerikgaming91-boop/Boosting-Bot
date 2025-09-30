export function buildTitle({ difficulty, bosses, lootType }) {
  const parts = ['Manaforge', difficulty];
  if (difficulty === 'Mythic' && bosses) parts.push(bosses);
  parts.push(lootType);
  return parts.join(' ');
}
