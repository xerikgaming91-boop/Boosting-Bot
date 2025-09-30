// Zentrale In-Memory-Daten (Reset bei Neustart)
export const db = {
  raids: [],
  characters: [], // gespeicherte importierte Chars
  nextId: 1
};

export function newId(prefix = 'r') {
  return `${prefix}${db.nextId++}`;
}
