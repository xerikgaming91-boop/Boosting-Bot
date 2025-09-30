import React, { useEffect, useMemo, useState } from 'react';
import { AuthAPI, LeadsAPI, RaidsAPI } from '../api.js';

const DIFFS = ['Normal', 'Heroic', 'Mythic'];
const LOOTS_BY_DIFF = {
  Normal: ['Unsaved', 'Saved', 'VIP'],
  Heroic: ['Unsaved', 'Saved', 'VIP'],
  Mythic: ['VIP'] // nur VIP bei Mythic
};

export default function Raids() {
  const [me, setMe] = useState(null);
  const [leads, setLeads] = useState([]);
  const [rows, setRows] = useState([]);

  const [difficulty, setDifficulty] = useState('Heroic');
  const [lootType, setLootType] = useState('Unsaved');
  const [bosses, setBosses] = useState(8);
  const [lead, setLead] = useState('');
  const [date, setDate] = useState(''); // ISO local input
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    AuthAPI.me().then(setMe).catch(() => setMe(null));
    LeadsAPI.list().then(setLeads).catch(() => setLeads([]));
    RaidsAPI.list().then((r) => setRows(r)).catch(() => setRows([]));
  }, []);

  useEffect(() => {
    // Loot-Type abhängig von difficulty
    const allowed = LOOTS_BY_DIFF[difficulty];
    if (!allowed.includes(lootType)) {
      setLootType(allowed[0]);
    }
  }, [difficulty]);

  const title = useMemo(() => {
    const bossPart = difficulty === 'Mythic' ? ` ${bosses} Bosses` : '';
    return `Manaforge ${difficulty} ${lootType}${bossPart}`.trim();
  }, [difficulty, lootType, bosses]);

  const canCreate = !!me && me.isRaidlead && !!lead && !!date;

  async function onCreate() {
    if (!canCreate) return;
    setBusy(true);
    try {
      const when = new Date(date);
      await RaidsAPI.create({
        title,
        difficulty,
        lootType,
        bosses: difficulty === 'Mythic' ? Number(bosses) : null,
        date: when.toISOString(),
        lead
      });
      const list = await RaidsAPI.list();
      setRows(list);
      alert('Raid erstellt ✅');
    } catch (e) {
      alert('Fehler beim Erstellen: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row">
        <div className="field">
          <label>Titel (automatisch)</label>
          <input className="input" value={title} readOnly />
          <div className="muted">Manaforge • Difficulty • Loot-Type. (Bosse nur bei Mythic wählbar)</div>
        </div>

        <div className="field">
          <label>Datum & Uhrzeit</label>
          <input className="input" type="datetime-local" value={date} onChange={(e)=>setDate(e.target.value)} />
        </div>

        <div className="field">
          <label>Difficulty</label>
          <select className="input" value={difficulty} onChange={(e)=>setDifficulty(e.target.value)}>
            {DIFFS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Loot-Type</label>
          <select className="input" value={lootType} onChange={(e)=>setLootType(e.target.value)}>
            {LOOTS_BY_DIFF[difficulty].map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {difficulty === 'Mythic' && <div className="muted">Bei Mythic ist nur VIP erlaubt.</div>}
        </div>

        {difficulty === 'Mythic' && (
          <div className="field">
            <label>Anzahl Bosse (1–8)</label>
            <input className="input" type="number" min="1" max="8" value={bosses} onChange={(e)=>setBosses(e.target.value)} />
          </div>
        )}

        <div className="field">
          <label>Raid Lead (aus Server)</label>
          <select className="input" value={lead} onChange={(e)=>setLead(e.target.value)}>
            <option value="">— wählen —</option>
            {leads.map(l => <option key={l.id} value={l.id}>{l.username}</option>)}
          </select>
          {leads.length === 0 && <div className="muted">Keine Leads geladen.</div>}
        </div>
      </div>

      <div style={{marginTop:12}}>
        <button className="btn" disabled={!canCreate || busy} onClick={onCreate}>Raid erstellen</button>
        {!me?.isRaidlead && <span className="bad" style={{marginLeft:8}}>Nur Raidleads dürfen Raids erstellen.</span>}
      </div>

      <div className="card" style={{marginTop:16}}>
        <div className="muted">Geplante Raids</div>
        <div className="list">
          {rows.length === 0 && <div className="item muted">Noch keine Raids.</div>}
          {rows.map(r => (
            <div key={r.id} className="item">
              <strong>{r.title}</strong>
              <div className="muted">
                {new Date(r.date).toLocaleString()} • Lead: {r.lead}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
