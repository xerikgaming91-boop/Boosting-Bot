import React, { useEffect, useMemo, useState } from "react";
import { LeadsAPI, RaidsAPI } from "../../api.js"; // belassen wie in deinem Projekt

/** Konstanten */
const BASE_TITLE = "Manaforge";
const DIFFS = ["Normal", "Heroic", "Mythic"];
const LOOT_BY_DIFF = {
  Normal: ["Saved", "Unsaved", "VIP"],
  Heroic: ["Saved", "Unsaved", "VIP"],
  Mythic: ["VIP"],
};
const MYTHIC_BOSSES = Array.from({ length: 8 }, (_, i) => i + 1); // 1..8

export default function Raids() {
  const [auth, setAuth] = useState({
    loading: true,
    loggedIn: false,
    isRaidlead: false,
    user: null,
  });

  const [leads, setLeads] = useState([]);
  const [raids, setRaids] = useState([]);

  // Formular-State (ohne Base-Titel)
  const [difficulty, setDifficulty] = useState("Heroic");
  const [lootType, setLootType] = useState("Saved");
  const [lead, setLead] = useState("");
  const [dateStr, setDateStr] = useState(() => todayISO());
  const [timeStr, setTimeStr] = useState("18:00");
  const [bosses, setBosses] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Abhängige Optionen
  const allowedLoot = useMemo(() => LOOT_BY_DIFF[difficulty] || [], [difficulty]);

  // Titel automatisch generieren
  // - Normal/Heroic: "Manaforge Heroic VIP"
  // - Mythic:       "Manaforge Mythic 3/8 VIP"
  const autoTitle = useMemo(() => {
    const parts =
      difficulty === "Mythic"
        ? [BASE_TITLE, "Mythic", `${bosses}/8`, lootType]
        : [BASE_TITLE, difficulty, lootType];
    return parts.filter(Boolean).join(" ").trim();
  }, [difficulty, lootType, bosses]);

  // Auth laden
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/me", { credentials: "include" });
        const j = await r.json();
        if (j?.ok && j.user) {
          setAuth({
            loading: false,
            loggedIn: true,
            isRaidlead: !!j.user.isRaidlead,
            user: j.user,
          });
        } else {
          setAuth({ loading: false, loggedIn: false, isRaidlead: false, user: null });
        }
      } catch {
        setAuth({ loading: false, loggedIn: false, isRaidlead: false, user: null });
      }
    })();
  }, []);

  // Raids immer laden (Liste ist öffentlich sichtbar)
  useEffect(() => {
    refreshRaids();
  }, []);

  async function refreshRaids() {
    try {
      const r = await RaidsAPI.list();
      setRaids(r.raids ?? []);
    } catch {
      setRaids([]);
    }
  }

  // Leads nur laden, wenn Raidlead (und eingeloggt)
  useEffect(() => {
    if (!auth.loggedIn || !auth.isRaidlead) return;
    (async () => {
      try {
        const l = await LeadsAPI.list(); // ruft /api/leads (erfordert Auth)
        const arr = l.leads ?? [];
        setLeads(arr);
        if (arr.length > 0 && !lead) setLead(arr[0].id);
      } catch {
        setLeads([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.loggedIn, auth.isRaidlead]);

  // Difficulty-Wechsel: Loot validieren/resetten; Boss-UI justieren
  useEffect(() => {
    const allowed = LOOT_BY_DIFF[difficulty] || [];
    if (!allowed.includes(lootType)) setLootType(allowed[0] ?? "Saved");
    if (difficulty === "Mythic") setBosses((b) => (b >= 1 && b <= 8 ? b : 8));
  }, [difficulty]); // eslint-disable-line

  // Submit (guarded)
  async function onCreateRaid(e) {
    e.preventDefault();
    if (!auth.isRaidlead) return; // doppelte Absicherung
    setBusy(true);
    setError("");

    try {
      const when = combineDateTime(dateStr, timeStr); // ISO string
      const payload = {
        title: autoTitle,
        difficulty,
        lootType,
        lead: lead || auth.user?.id, // fallback auf eingeloggten User
        date: when,
        ...(difficulty === "Mythic" ? { bosses } : {}),
      };

      await RaidsAPI.create(payload);
      await refreshRaids();
    } catch (err) {
      setError(err?.message || "Fehler beim Erstellen");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id) {
    if (!auth.isRaidlead) return; // nur Raidlead darf löschen (UI + Backend-Guard)
    if (!confirm("Diesen Raid wirklich löschen?")) return;
    try {
      await RaidsAPI.remove(id);
      await refreshRaids();
    } catch (err) {
      alert(err?.message || "Löschen fehlgeschlagen");
    }
  }

  const showForm = auth.loggedIn && auth.isRaidlead;

  return (
    <div className="p-6 space-y-6">
      {/* Banner: nicht eingeloggt */}
      {!auth.loading && !auth.loggedIn && (
        <div className="max-w-5xl mx-auto panel">
          <div className="panel-body flex items-center justify-between gap-4">
            <div>
              <div className="text-slate-200 font-semibold">Nicht angemeldet</div>
              <div className="text-slate-400 text-sm">
                Melde dich mit Discord an, um Raids zu erstellen.
              </div>
            </div>
            <a href="/api/auth/discord" className="btn btn-primary">Mit Discord anmelden</a>
          </div>
        </div>
      )}

      {/* Banner: eingeloggt aber keine Raidlead-Rolle */}
      {auth.loggedIn && !auth.isRaidlead && (
        <div className="max-w-5xl mx-auto panel">
          <div className="panel-body">
            <div className="text-slate-200 font-semibold mb-1">Keine Berechtigung</div>
            <div className="text-slate-400 text-sm">
              Du benötigst die <span className="font-medium">Raidlead</span>-Rolle, um Raids zu erstellen.
            </div>
          </div>
        </div>
      )}

      {/* Formular-Panel – nur für Raidleads */}
      {showForm && (
        <div className="max-w-5xl mx-auto panel">
          <div className="panel-body">
            <form onSubmit={onCreateRaid} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Auto-Titel (read-only) */}
              <div className="field md:col-span-1">
                <div className="label-row">
                  <label>Titel (automatisch)</label>
                </div>
                <input type="text" className="input" value={autoTitle} readOnly />
                <p className="help">
                  Wird live aus <span className="font-medium">{BASE_TITLE}</span> +{" "}
                  {difficulty === "Mythic" ? "Mythic + X/8 + " : "Difficulty + "}Loot gebaut.
                </p>
              </div>

              {/* Datum & Uhrzeit */}
              <div className="field md:col-span-1">
                <div className="label-row"><label>Datum & Uhrzeit</label></div>
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" value={dateStr} onChange={(e)=>setDateStr(e.target.value)} className="input" required />
                  <input type="time" value={timeStr} onChange={(e)=>setTimeStr(e.target.value)} className="input" required />
                </div>
              </div>

              {/* Loot-Type */}
              <div className="field">
                <div className="label-row"><label>Loot-Type</label></div>
                <select value={lootType} onChange={(e)=>setLootType(e.target.value)} className="select">
                  {allowedLoot.map((lt)=>(<option key={lt} value={lt}>{lt}</option>))}
                </select>
              </div>

              {/* Difficulty */}
              <div className="field">
                <div className="label-row"><label>Difficulty</label></div>
                <select value={difficulty} onChange={(e)=>setDifficulty(e.target.value)} className="select">
                  {DIFFS.map((d)=>(<option key={d} value={d}>{d}</option>))}
                </select>
              </div>

              {/* Raid Lead – aus Discord (nur wenn Raidlead) */}
              <div className="field">
                <div className="label-row"><label>Raid Lead (aus Server)</label></div>
                <select
                  value={lead}
                  onChange={(e)=>setLead(e.target.value)}
                  className="select"
                  required
                >
                  {leads.map((l)=>(
                    <option key={l.id} value={l.id}>
                      {(l.displayName || l.username || l.id)}
                    </option>
                  ))}
                </select>
                <p className="help">Nur Nutzer mit Raidlead-Rolle werden hier angezeigt.</p>
              </div>

              {/* Bosse – nur bei Mythic sichtbar */}
              {difficulty === "Mythic" && (
                <div className="field">
                  <div className="label-row"><label>Bosse (Mythic)</label></div>
                  <select value={bosses} onChange={(e)=>setBosses(parseInt(e.target.value,10))} className="select">
                    {MYTHIC_BOSSES.map((n)=>(<option key={n} value={n}>{n}/8</option>))}
                  </select>
                </div>
              )}

              {/* Submit */}
              <div className="md:col-span-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={busy}
                  className="btn btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
                  title="Raid erstellen"
                >
                  {busy ? "Erstelle..." : "Raid erstellen"}
                </button>
                {error && <span className="text-sm text-red-400">{error}</span>}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Geplante Raids – für alle sichtbar */}
      <div className="max-w-5xl mx-auto panel">
        <div className="panel-head">Geplante Raids</div>
        <div className="panel-body overflow-x-auto">
          <table className="table">
            <thead>
              <tr className="text-left text-slate-400">
                <th>#</th>
                <th>Titel</th>
                <th>Diff</th>
                <th>Loot</th>
                <th>Bosse</th>
                <th>Datum</th>
                <th>Lead</th>
                {auth.isRaidlead && <th></th>}
              </tr>
            </thead>
            <tbody>
              {raids.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-400" colSpan={auth.isRaidlead ? 8 : 7}>
                    Noch keine Raids.
                  </td>
                </tr>
              ) : (
                raids.map((r) => (
                  <tr key={r.id} className="border-b border-slate-900 hover:bg-slate-800/40">
                    <td className="px-4 py-3">{r.id}</td>
                    <td className="px-4 py-3">{r.title}</td>
                    <td className="px-4 py-3">{r.difficulty}</td>
                    <td className="px-4 py-3">{r.lootType}</td>
                    <td className="px-4 py-3">{r.bosses ?? "-"}</td>
                    <td className="px-4 py-3">{formatDateTime(r.date)}</td>
                    <td className="px-4 py-3">{r.lead}</td>
                    {auth.isRaidlead && (
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onDelete(r.id)}
                          className="btn btn-danger"
                          title="Raid löschen"
                        >
                          Löschen
                        </button>
                      </td>
                    )}
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

/** Utils */
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function combineDateTime(dateStr, timeStr) {
  const [h = "00", min = "00"] = (timeStr || "00:00").split(":");
  const d = new Date(dateStr || todayISO());
  d.setHours(parseInt(h, 10), parseInt(min, 10), 0, 0);
  return d.toISOString();
}

function formatDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}
