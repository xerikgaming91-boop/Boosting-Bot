// src/frontend/app/pages/Presets.jsx
import React, { useEffect, useMemo, useState } from "react";
import "../ui.css";

// Wir benutzen vorhandenes API-Objekt, falls es existiert.
// Fallback auf fetch, wenn Methoden fehlen.
let API = null;
try {
  // eslint-disable-next-line import/no-unresolved
  const { PresetsAPI } = require("../../api.js");
  API = PresetsAPI || null;
} catch {
  API = null;
}

const presetsApi = {
  async list() {
    if (API?.list) return API.list();
    const r = await fetch("/api/presets", { credentials: "include" });
    if (!r.ok) throw new Error("load_failed");
    return r.json();
  },
  async create(data) {
    if (API?.create) return API.create(data);
    const r = await fetch("/api/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async update(id, data) {
    if (API?.update) return API.update(id, data);
    const r = await fetch(`/api/presets/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async remove(id) {
    if (API?.remove) return API.remove(id);
    const r = await fetch(`/api/presets/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
};

const clampInt = (v, min = 0, max = 40) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
};

export default function PresetsPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  // Create-Form
  const [name, setName] = useState("");
  const [tanks, setTanks] = useState(0);
  const [heals, setHeals] = useState(0);
  const [dps, setDps] = useState(0);
  const [lootbuddies, setLootbuddies] = useState(0);

  // Inline-Edit
  const [editId, setEditId] = useState(null);
  const editItem = useMemo(() => list.find((p) => p.id === editId) || null, [list, editId]);
  const [eName, setEName] = useState("");
  const [eTanks, setETanks] = useState(0);
  const [eHeals, setEHeals] = useState(0);
  const [eDps, setEDps] = useState(0);
  const [eLootbuddies, setELootbuddies] = useState(0);

  async function load() {
    setLoading(true);
    try {
      const data = await presetsApi.list();
      // API könnte entweder Array oder {presets:[...]} liefern
      const arr = Array.isArray(data) ? data : (Array.isArray(data?.presets) ? data.presets : []);
      setList(arr);
    } catch (e) {
      console.error(e);
      setMsg({ t: "err", m: "Konnte Presets nicht laden." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function resetCreateForm() {
    setName(""); setTanks(0); setHeals(0); setDps(0); setLootbuddies(0);
  }

  async function onCreate() {
    setMsg(null);
    if (!name.trim()) {
      setMsg({ t: "err", m: "Bitte Name angeben." });
      return;
    }
    setBusy(true);
    try {
      await presetsApi.create({
        name: name.trim(),
        tanks: clampInt(tanks),
        healers: clampInt(heals),
        dps: clampInt(dps),
        lootbuddies: clampInt(lootbuddies),
      });
      resetCreateForm();
      await load();
      setMsg({ t: "ok", m: "Preset erstellt." });
    } catch (e) {
      console.error(e);
      setMsg({ t: "err", m: "Erstellen fehlgeschlagen." });
    } finally {
      setBusy(false);
    }
  }

  function startEdit(p) {
    setEditId(p.id);
    setEName(p.name || "");
    setETanks(p.tanks ?? 0);
    setEHeals(p.healers ?? 0);
    setEDps(p.dps ?? 0);
    setELootbuddies(p.lootbuddies ?? 0);
    setMsg(null);
  }

  async function saveEdit() {
    setBusy(true);
    try {
      await presetsApi.update(editId, {
        name: eName.trim(),
        tanks: clampInt(eTanks),
        healers: clampInt(eHeals),
        dps: clampInt(eDps),
        lootbuddies: clampInt(eLootbuddies),
      });
      setEditId(null);
      await load();
      setMsg({ t: "ok", m: "Preset aktualisiert." });
    } catch (e) {
      console.error(e);
      setMsg({ t: "err", m: "Speichern fehlgeschlagen." });
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id) {
    if (!id || !window.confirm("Preset wirklich löschen?")) return;
    setBusy(true);
    try {
      await presetsApi.remove(id);
      await load();
      setMsg({ t: "ok", m: "Preset gelöscht." });
    } catch (e) {
      console.error(e);
      setMsg({ t: "err", m: "Löschen fehlgeschlagen." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Create */}
      <div className="card mb-6">
        <div className="card-title mb-3">Neues Preset</div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2">
            <label className="label">Name</label>
            <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. 1T/3H/6D + 2 Loot" />
          </div>
          <div>
            <label className="label">Tanks</label>
            <input type="number" className="input mt-1" value={tanks} min={0} max={40} onChange={(e) => setTanks(e.target.value)} />
          </div>
          <div>
            <label className="label">Heals</label>
            <input type="number" className="input mt-1" value={heals} min={0} max={40} onChange={(e) => setHeals(e.target.value)} />
          </div>
          <div>
            <label className="label">DPS</label>
            <input type="number" className="input mt-1" value={dps} min={0} max={40} onChange={(e) => setDps(e.target.value)} />
          </div>
          <div>
            <label className="label">Lootbuddies</label>
            <input type="number" className="input mt-1" value={lootbuddies} min={0} max={40} onChange={(e) => setLootbuddies(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button onClick={onCreate} disabled={busy} className={`btn ${busy ? "btn-muted" : "btn-primary"}`}>
            {busy ? "Speichere…" : "Preset erstellen"}
          </button>
          {msg && (
            <span className={`text-xs px-2 py-1 rounded-md ${msg.t === "ok" ? "bg-emerald-900/40 text-emerald-300" : "bg-rose-900/40 text-rose-300"}`}>
              {msg.m}
            </span>
          )}
        </div>
      </div>

      {/* Liste */}
      <div className="card">
        <div className="card-title mb-3">Presets</div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr className="text-left">
                <th className="py-2 pr-3">ID</th>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Tanks</th>
                <th className="py-2 pr-3">Heals</th>
                <th className="py-2 pr-3">DPS</th>
                <th className="py-2 pr-3">Lootbuddies</th>
                <th className="py-2 pr-3">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-6 text-slate-500">Lade…</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={7} className="py-6 text-slate-500">Noch keine Presets.</td></tr>
              ) : (
                list.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-3">{p.id}</td>

                    {/* Name / Inline-Edit */}
                    <td className="py-2 pr-3">
                      {editId === p.id ? (
                        <input className="input" value={eName} onChange={(e) => setEName(e.target.value)} />
                      ) : (
                        p.name
                      )}
                    </td>

                    <td className="py-2 pr-3 w-24">
                      {editId === p.id ? (
                        <input type="number" className="input" value={eTanks} min={0} max={40} onChange={(e) => setETanks(e.target.value)} />
                      ) : (p.tanks ?? 0)}
                    </td>
                    <td className="py-2 pr-3 w-24">
                      {editId === p.id ? (
                        <input type="number" className="input" value={eHeals} min={0} max={40} onChange={(e) => setEHeals(e.target.value)} />
                      ) : (p.healers ?? 0)}
                    </td>
                    <td className="py-2 pr-3 w-24">
                      {editId === p.id ? (
                        <input type="number" className="input" value={eDps} min={0} max={40} onChange={(e) => setEDps(e.target.value)} />
                      ) : (p.dps ?? 0)}
                    </td>
                    <td className="py-2 pr-3 w-28">
                      {editId === p.id ? (
                        <input type="number" className="input" value={eLootbuddies} min={0} max={40} onChange={(e) => setELootbuddies(e.target.value)} />
                      ) : (p.lootbuddies ?? 0)}
                    </td>

                    <td className="py-2 pr-3">
                      {editId === p.id ? (
                        <div className="flex items-center gap-2">
                          <button className={`btn ${busy ? "btn-muted" : "btn-primary"}`} disabled={busy} onClick={saveEdit}>
                            Speichern
                          </button>
                          <button className="btn btn-ghost" onClick={() => setEditId(null)}>
                            Abbrechen
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button className="btn btn-ghost" onClick={() => startEdit(p)}>Bearbeiten</button>
                          <button className={`btn ${busy ? "btn-muted" : "btn-danger"}`} disabled={busy} onClick={() => onDelete(p.id)}>
                            Löschen
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
