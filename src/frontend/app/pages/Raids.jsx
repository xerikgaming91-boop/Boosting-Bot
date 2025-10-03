// src/frontend/app/pages/Raids.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AuthAPI, LeadsAPI, PresetsAPI, RaidsAPI } from "../../api.js";
import "../ui.css";

const diffOptions = [
  { value: "Normal", label: "Normal" },
  { value: "Heroic", label: "Heroic" },
  { value: "Mythic", label: "Mythic" },
];
const lootOptions = [
  { value: "Saved", label: "Saved" },
  { value: "VIP", label: "VIP" },
  { value: "Unsaved", label: "Unsaved" },
];
const BOSS_COUNT_BY_DIFF = { Normal: 8, Heroic: 8, Mythic: 8 };
const cx = (...a) => a.filter(Boolean).join(" ");

export default function RaidsPage() {
  const [user, setUser] = useState(null);
  const [leads, setLeads] = useState([]);
  const [presets, setPresets] = useState([]);
  const [raids, setRaids] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date(); d.setHours(18, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  });
  const [time, setTime] = useState("18:00");
  const [diff, setDiff] = useState("Heroic");
  const [loot, setLoot] = useState("VIP");
  const [leadId, setLeadId] = useState("");
  const [presetId, setPresetId] = useState("");

  useEffect(() => {
    (async () => {
      try { const me = await AuthAPI.me(); setUser(me?.user || null); } catch {}
      try { const l = await LeadsAPI.list(); setLeads(Array.isArray(l?.leads) ? l.leads : []); } catch {}
      try { const p = await PresetsAPI.list(); setPresets(Array.isArray(p) ? p : []); } catch {}
      try { const r = await RaidsAPI.list(); setRaids(Array.isArray(r) ? r : []); } catch {}
    })();
  }, []);

  useEffect(() => {
    setTitle(["Manaforge", diff, loot].filter(Boolean).join(" "));
  }, [diff, loot]);

  const canPickLead = useMemo(() => !!(user?.isOwner || user?.isAdmin), [user]);

  useEffect(() => {
    if (canPickLead && leads.length > 0 && !leadId) setLeadId(String(leads[0].id));
  }, [canPickLead, leads, leadId]);

  const canCreate = useMemo(() => {
    if (!user) return false;
    const hasPerm = !!(user.isOwner || user.isAdmin || user.isRaidlead || user.raidlead);
    if (!hasPerm) return false;
    if (canPickLead && !leadId) return false;
    return true;
  }, [user, canPickLead, leadId]);

  async function onCreate() {
    setMsg(null); setBusy(true);
    try {
      const when = new Date(`${date}T${time}:00`);
      const payload = {
        title, difficulty: diff, lootType: loot,
        presetId: presetId || null,
        date: when.toISOString(),
        bosses: BOSS_COUNT_BY_DIFF[diff] ?? 8,
      };
      if (canPickLead && leadId) payload.leadId = leadId;
      await RaidsAPI.create(payload);
      setMsg({ t: "ok", m: "Raid erstellt." });
      const r = await RaidsAPI.list(); setRaids(Array.isArray(r) ? r : []);
    } catch (e) {
      setMsg({ t: "err", m: e?.message || "failed_create" });
    } finally { setBusy(false); }
  }

  async function onDelete(raidId) {
    if (!raidId || !window.confirm("Diesen Raid wirklich löschen?")) return;
    setMsg(null); setBusy(true);
    try {
      if (typeof RaidsAPI.remove === "function") await RaidsAPI.remove(raidId);
      else await fetch(`/api/raids/${raidId}`, { method: "DELETE", credentials: "include" });
      setMsg({ t: "ok", m: "Raid gelöscht." });
      const r = await RaidsAPI.list(); setRaids(Array.isArray(r) ? r : []);
    } catch (e) {
      setMsg({ t: "err", m: e?.message || "delete_failed" });
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Create */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Titel (automatisch)</label>
            <input className="input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titel" />
            <p className="card-subtle mt-1">Aus Manaforge + Diff + Loot gebaut.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Datum</label>
              <input type="date" className="input mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Uhrzeit</label>
              <input type="time" className="input mt-1" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Loot-Type</label>
            <select className="select mt-1" value={loot} onChange={(e) => setLoot(e.target.value)}>
              {lootOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Difficulty</label>
            <select className="select mt-1" value={diff} onChange={(e) => setDiff(e.target.value)}>
              {diffOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {canPickLead && (
            <div>
              <label className="label">Raid Lead</label>
              <select className="select mt-1" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                <option value="">— auswählen —</option>
                {leads.map(u => <option key={u.id} value={u.id}>{u.displayName}</option>)}
              </select>
              <p className="card-subtle mt-1">Nur Admin/Owner sehen dieses Dropdown.</p>
            </div>
          )}
          <div>
            <label className="label">Preset</label>
            <select className="select mt-1" value={presetId} onChange={(e) => setPresetId(e.target.value)}>
              <option value="">— Kein Preset —</option>
              {presets.map(p => <option key={p.id} value={p.id}>{p.name || p.title || `Preset ${p.id}`}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={onCreate}
            disabled={!canCreate || busy}
            className={cx("btn", (!canCreate || busy) ? "btn-muted" : "btn-primary")}
          >
            {busy ? "Erstelle…" : "Raid erstellen"}
          </button>
          {msg && (
            <span className={cx("text-xs px-2 py-1 rounded-md",
              msg.t === "ok" ? "bg-emerald-900/40 text-emerald-300" : "bg-rose-900/40 text-rose-300")}>
              {msg.m}
            </span>
          )}
        </div>
      </div>

      {/* Liste */}
      <div className="card">
        <div className="card-title mb-3">Geplante Raids</div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr className="text-left">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Titel</th>
                <th className="py-2 pr-3">Diff</th>
                <th className="py-2 pr-3">Loot</th>
                <th className="py-2 pr-3">Datum</th>
                <th className="py-2 pr-3">Lead</th>
                <th className="py-2 pr-3">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {(!raids || raids.length === 0) ? (
                <tr><td colSpan={7} className="py-6 text-slate-500">Noch keine Raids.</td></tr>
              ) : (
                raids.map((r, i) => (
                  <tr key={r.id || i}>
                    <td className="py-2 pr-3">{i + 1}</td>
                    <td className="py-2 pr-3">
                      {r.id
                        ? <Link to={`/raids/${r.id}`} className="text-emerald-400 hover:text-emerald-300 hover:underline" title="Details">{r.title}</Link>
                        : r.title}
                    </td>
                    <td className="py-2 pr-3">{r.difficulty || r.diff}</td>
                    <td className="py-2 pr-3">{r.lootType || r.loot}</td>
                    <td className="py-2 pr-3">{r.date ? new Date(r.date).toLocaleString() : "-"}</td>
                    <td className="py-2 pr-3">{r.leadName || r.lead || "-"}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        {r.id && <Link to={`/raids/${r.id}`} className="btn btn-ghost" title="Details">Details</Link>}
                        {r.id && (
                          <button onClick={() => onDelete(r.id)} disabled={busy} className={cx("btn", busy ? "btn-muted" : "btn-danger")} title="Raid löschen">
                            Löschen
                          </button>
                        )}
                      </div>
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
