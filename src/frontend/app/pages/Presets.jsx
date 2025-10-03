import React, { useEffect, useState } from "react";
import { AuthAPI, PresetsAPI } from "../../api.js";

const empty = { name: "", tanks: 0, healers: 0, dps: 0, lootbuddies: 0 };

export default function Presets() {
  const [auth, setAuth] = useState({ loading: true, loggedIn: false, isRaidlead: false });
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ ...empty });
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const j = await AuthAPI.me();
      if (j?.ok && j.user) setAuth({ loading: false, loggedIn: true, isRaidlead: !!j.user.isRaidlead });
      else setAuth({ loading: false, loggedIn: false, isRaidlead: false });
    })();
  }, []);

  async function load() {
    const j = await PresetsAPI.list();
    setList(j?.presets ?? []);
  }
  useEffect(() => { load(); }, []);

  function setField(k, v) {
    setForm(s => ({ ...s, [k]: k === "name" ? v : Math.max(0, parseInt(v || 0, 10)) }));
  }

  async function onSubmit(e) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      if (!auth.isRaidlead) throw new Error("no_permission");
      if (editing) await PresetsAPI.update(editing.id, form);
      else        await PresetsAPI.create(form);
      setForm({ ...empty }); setEditing(null);
      await load();
    } catch (e2) { setErr(e2?.message || "Fehlgeschlagen"); }
    finally { setBusy(false); }
  }

  function onEdit(p) {
    setEditing(p);
    setForm({ name: p.name, tanks: p.tanks, healers: p.healers, dps: p.dps, lootbuddies: p.lootbuddies });
  }

  async function onDelete(id) {
    if (!auth.isRaidlead) return;
    if (!confirm("Preset wirklich löschen?")) return;
    await PresetsAPI.remove(id);
    await load();
    if (editing?.id === id) { setEditing(null); setForm({ ...empty }); }
  }

  if (!auth.loggedIn) {
    return (
      <div className="p-6">
        <div className="panel max-w-5xl mx-auto">
          <div className="panel-body flex items-center justify-between">
            <div>
              <div className="text-slate-200 font-semibold">Nicht angemeldet</div>
              <div className="text-slate-400 text-sm">Melde dich an, um Presets zu verwalten.</div>
            </div>
            <a className="btn btn-primary" href="http://localhost:4000/api/auth/discord">Login</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="panel max-w-5xl mx-auto">
        <div className="panel-head">{editing ? "Preset bearbeiten" : "Preset erstellen"}</div>
        <div className="panel-body">
          <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3">
            {/* Name */}
            <div className="md:col-span-4">
              <div className="label-row"><label htmlFor="preset-name">Name</label></div>
              <input
                id="preset-name"
                className="input w-full"
                placeholder="z. B. 2T/3H/10D/0LB"
                value={form.name}
                onChange={(e)=>setField('name', e.target.value)}
                required
              />
            </div>
            {/* Tanks */}
            <div className="md:col-span-2">
              <div className="label-row"><label htmlFor="preset-tanks">Tanks</label></div>
              <input
                id="preset-tanks"
                className="input w-full"
                type="number" min="0"
                value={form.tanks}
                onChange={(e)=>setField('tanks', e.target.value)}
              />
            </div>
            {/* Healer */}
            <div className="md:col-span-2">
              <div className="label-row"><label htmlFor="preset-healers">Healer</label></div>
              <input
                id="preset-healers"
                className="input w-full"
                type="number" min="0"
                value={form.healers}
                onChange={(e)=>setField('healers', e.target.value)}
              />
            </div>
            {/* DPS */}
            <div className="md:col-span-2">
              <div className="label-row"><label htmlFor="preset-dps">DPS</label></div>
              <input
                id="preset-dps"
                className="input w-full"
                type="number" min="0"
                value={form.dps}
                onChange={(e)=>setField('dps', e.target.value)}
              />
            </div>
            {/* Lootbuddies */}
            <div className="md:col-span-2">
              <div className="label-row"><label htmlFor="preset-lb">Lootbuddies</label></div>
              <input
                id="preset-lb"
                className="input w-full"
                type="number" min="0"
                value={form.lootbuddies}
                onChange={(e)=>setField('lootbuddies', e.target.value)}
              />
            </div>

            <div className="md:col-span-12 flex items-center gap-3">
              <button className="btn btn-primary" disabled={busy}>
                {busy ? "Speichere…" : (editing ? "Aktualisieren" : "Erstellen")}
              </button>
              {editing && (
                <button type="button" className="btn" onClick={()=>{ setEditing(null); setForm({...empty}); }}>
                  Abbrechen
                </button>
              )}
              {err && <span className="text-sm text-red-400">{err}</span>}
            </div>
          </form>
        </div>
      </div>

      <div className="panel max-w-5xl mx-auto">
        <div className="panel-head">Presets</div>
        <div className="panel-body overflow-x-auto">
          <table className="table">
            <thead>
              <tr className="text-left text-slate-400">
                <th>#</th><th>Name</th><th>Tanks</th><th>Healer</th><th>DPS</th><th>Lootbuddies</th><th></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={7} className="py-3 text-slate-400">Keine Presets vorhanden.</td></tr>
              ) : list.map(p => (
                <tr key={p.id} className="border-b border-slate-900">
                  <td className="px-3 py-2">{p.id}</td>
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2">{p.tanks}</td>
                  <td className="px-3 py-2">{p.healers}</td>
                  <td className="px-3 py-2">{p.dps}</td>
                  <td className="px-3 py-2">{p.lootbuddies}</td>
                  <td className="px-3 py-2 flex gap-2">
                    <button className="btn" onClick={()=>onEdit(p)}>Bearbeiten</button>
                    {auth.isRaidlead && (
                      <button className="btn btn-danger" onClick={()=>onDelete(p.id)}>Löschen</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
