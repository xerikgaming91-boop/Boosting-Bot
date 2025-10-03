// src/frontend/app/pages/Raids.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AuthAPI, LeadsAPI, PresetsAPI, RaidsAPI } from "../../api.js";

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

// Defaults pro Diff – passe an, wenn ihr andere Instanzen/Anzahlen habt
const BOSS_COUNT_BY_DIFF = { Normal: 8, Heroic: 8, Mythic: 8 };

function cls(...a) { return a.filter(Boolean).join(" "); }

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
    const parts = ["Manaforge", diff, loot];
    setTitle(parts.filter(Boolean).join(" "));
  }, [diff, loot]);

  // NOTE: Nur Admin/Owner dürfen den Lead frei wählen
  const canPickLead = useMemo(() => {
    return !!(user?.isOwner || user?.isAdmin);
  }, [user]);

  // NOTE: Für Admin/Owner: wenn Liste da und nichts gewählt, erstes Element vorauswählen
  useEffect(() => {
    if (canPickLead && leads.length > 0 && !leadId) {
      setLeadId(String(leads[0].id));
    }
  }, [canPickLead, leads, leadId]);

  const canCreate = useMemo(() => {
    if (!user) return false;
    const hasCreateRight = (user.isRaidlead || user.raidlead || user.isAdmin || user.isOwner);
    if (!hasCreateRight) return false;
    // NOTE: Nur Admin/Owner brauchen eine Lead-Auswahl; normale RL nicht
    if (canPickLead) {
      return !!leadId;
    }
    return true;
  }, [user, leadId, canPickLead]);

  async function onCreate() {
    setMsg(null);
    setBusy(true);
    try {
      const when = new Date(`${date}T${time}:00`);
      const payload = {
        title,
        difficulty: diff,
        lootType: loot,
        presetId: presetId || null,
        date: when.toISOString(),
        bosses: BOSS_COUNT_BY_DIFF[diff] ?? 8, // <-- wichtig für Prisma
      };

      // NOTE: leadId NUR mitsenden, wenn Admin/Owner
      if (canPickLead && leadId) {
        payload.leadId = String(leadId);
      }

      await RaidsAPI.create(payload);
      setMsg({ t: "ok", m: "Raid erstellt." });

      const r = await RaidsAPI.list();
      setRaids(Array.isArray(r) ? r : []);
    } catch (e) {
      setMsg({ t: "err", m: e?.message || "failed_create" });
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(raidId) {
    if (!raidId) return;
    const sure = window.confirm("Diesen Raid wirklich löschen?");
    if (!sure) return;

    setMsg(null);
    setBusy(true);
    try {
      if (typeof RaidsAPI.remove === "function") {
        await RaidsAPI.remove(raidId);
      } else {
        const resp = await fetch(`/api/raids/${raidId}`, {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (!resp.ok) {
          const tx = await resp.text().catch(() => "");
          throw new Error(tx || "delete_failed");
        }
      }
      setMsg({ t: "ok", m: "Raid gelöscht." });
      const r = await RaidsAPI.list();
      setRaids(Array.isArray(r) ? r : []);
    } catch (e) {
      setMsg({ t: "err", m: e?.message || "delete_failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="rounded-xl bg-slate-900 border border-slate-800 shadow-xl p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400">Titel (automatisch)</label>
            <input className="w-full mt-1 rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-200"
              value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titel" />
            <p className="text-xs text-slate-500 mt-1">Wird aus Manaforge + (Diff/Mythic + Bosse) + Loot gebaut.</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-400">Datum</label>
              <input type="date" className="w-full mt-1 rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-200"
                value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400">Uhrzeit</label>
              <input type="time" className="w-full mt-1 rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-200"
                value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400">Loot-Type</label>
            <select className="w-full mt-1 rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-200"
              value={loot} onChange={(e) => setLoot(e.target.value)}>
              {lootOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400">Difficulty</label>
            <select className="w-full mt-1 rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-200"
              value={diff} onChange={(e) => setDiff(e.target.value)}>
              {diffOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* NOTE: Raidlead-Select nur für Admin/Owner sichtbar */}
          {canPickLead && (
            <div>
              <label className="text-xs text-slate-400">Raid Lead (aus Server)</label>
              <select className={cls("w-full mt-1 rounded-md bg-slate-800 border px-3 py-2 text-slate-200", "border-slate-700")}
                value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                <option value="">— auswählen —</option>
                {leads.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
              </select>
              <p className="text-xs text-slate-500 mt-1">Nur Nutzer mit Raidlead- oder Admin-Rechten werden hier angezeigt.</p>
            </div>
          )}

          <div>
            <label className="text-xs text-slate-400">Preset</label>
            <select className="w-full mt-1 rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-200"
              value={presetId} onChange={(e) => setPresetId(e.target.value)}>
              <option value="">— Kein Preset —</option>
              {presets.map((p) => <option key={p.id} value={p.id}>{p.name || p.title || `Preset ${p.id}`}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={onCreate}
            disabled={!canCreate || busy}
            className={cls(
              "px-4 py-2 rounded-md text-sm font-medium",
              canCreate && !busy ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                                 : "bg-slate-700 text-slate-400 cursor-not-allowed"
            )}
          >
            {busy ? "Erstelle…" : "Raid erstellen"}
          </button>
          {msg && (
            <span className={cls("text-xs px-2 py-1 rounded-md",
                                 msg.t === "ok" ? "bg-emerald-900/40 text-emerald-300"
                                                : "bg-rose-900/40 text-rose-300")}>
              {msg.m}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-slate-900 border border-slate-800 shadow-xl p-5">
        <div className="text-slate-300 font-semibold mb-3">Geplante Raids</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-slate-400">
              <tr className="text-left">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">TITEL</th>
                <th className="py-2 pr-3">DIFF</th>
                <th className="py-2 pr-3">LOOT</th>
                <th className="py-2 pr-3">DATUM</th>
                <th className="py-2 pr-3">LEAD</th>
                <th className="py-2 pr-3">AKTION</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {(!raids || raids.length === 0) ? (
                <tr><td colSpan={7} className="py-6 text-slate-500">Noch keine Raids.</td></tr>
              ) : (
                raids.map((r, i) => (
                  <tr key={r.id || i} className="border-t border-slate-800">
                    <td className="py-2 pr-3">{i + 1}</td>
                    <td className="py-2 pr-3">
                      {r.id ? (
                        <Link
                          to={`/raids/${r.id}`}
                          className="text-emerald-400 hover:text-emerald-300 hover:underline"
                          title="Details anzeigen"
                        >
                          {r.title}
                        </Link>
                      ) : r.title}
                    </td>
                    <td className="py-2 pr-3">{r.difficulty || r.diff}</td>
                    <td className="py-2 pr-3">{r.lootType || r.loot}</td>
                    <td className="py-2 pr-3">{r.date ? new Date(r.date).toLocaleString() : "-"}</td>
                    <td className="py-2 pr-3">{r.leadName || r.lead || "-"}</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        {r.id && (
                          <Link
                            to={`/raids/${r.id}`}
                            className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200"
                            title="Details"
                          >
                            Details
                          </Link>
                        )}
                        {r.id && (
                          <button
                            onClick={() => onDelete(r.id)}
                            disabled={busy}
                            className={cls(
                              "px-2 py-1 rounded-md border text-slate-200",
                              busy ? "bg-slate-700 border-slate-700 cursor-not-allowed"
                                   : "bg-rose-900/50 border-rose-800 hover:bg-rose-800/60"
                            )}
                            title="Raid löschen"
                          >
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
