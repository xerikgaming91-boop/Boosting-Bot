// src/frontend/app/pages/Raids.jsx
import React, { useEffect, useMemo, useState } from "react";
import { LeadsAPI, RaidsAPI } from "../../api.js";

const DIFFS = ["Normal", "Heroic", "Mythic"];
const LOOT_BY_DIFF = {
  Normal: ["Unsaved", "VIP", "Saved"],
  Heroic: ["Unsaved", "VIP", "Saved"],
  Mythic: ["VIP"] // nur VIP bei Mythic
};

export default function Raids() {
  const [leads, setLeads] = useState([]);
  const [raids, setRaids] = useState([]);
  const [form, setForm] = useState({
    title: "",
    difficulty: "Heroic",
    lootType: "VIP",
    bosses: 8,
    date: "",
    lead: ""
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await LeadsAPI.list();
        // Erwartetes Format vom Backend: { leads: [ { id, username, displayName, avatar } ] }
        const mapped = (data?.leads ?? []).map((u) => ({
          id: u.id,
          label: u.displayName || u.username || u.id
        }));
        setLeads(mapped);
        if (mapped.length && !form.lead) {
          setForm((f) => ({ ...f, lead: mapped[0].id }));
        }
      } catch (e) {
        console.error("Leads load failed", e);
      }
      try {
        setRaids(await RaidsAPI.list());
      } catch (e) {
        console.error("Raids load failed", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lootOptions = useMemo(
    () => LOOT_BY_DIFF[form.difficulty] || [],
    [form.difficulty]
  );

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const payload = {
        title: form.title?.trim() || `${form.difficulty} ${form.lootType}`,
        difficulty: form.difficulty,
        lootType: form.lootType,
        bosses: Number(form.bosses) || null,
        date: form.date ? new Date(form.date).toISOString() : null,
        lead: form.lead
      };
      await RaidsAPI.create(payload);
      setRaids(await RaidsAPI.list());
      alert("Raid erstellt.");
    } catch (err) {
      console.error(err);
      setErr(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <form onSubmit={submit} className="grid gap-4 border border-neutral-800 rounded-lg p-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="grid gap-1">
            <span className="text-sm opacity-80">Titel</span>
            <input
              className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Manaforge Heroic VIP"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm opacity-80">Raidlead</span>
            <select
              className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
              value={form.lead}
              onChange={(e) => setForm({ ...form, lead: e.target.value })}
            >
              {leads.length === 0 ? (
                <option value="" disabled>
                  (keine Leads geladen)
                </option>
              ) : null}
              {leads.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-sm opacity-80">Schwierigkeit</span>
            <select
              className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
              value={form.difficulty}
              onChange={(e) => {
                const difficulty = e.target.value;
                const lootType = (LOOT_BY_DIFF[difficulty] || [])[0] || "VIP";
                setForm({ ...form, difficulty, lootType });
              }}
            >
              {DIFFS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1">
            <span className="text-sm opacity-80">Loot</span>
            <select
              className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
              value={form.lootType}
              onChange={(e) => setForm({ ...form, lootType: e.target.value })}
            >
              {lootOptions.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>

          {form.difficulty === "Mythic" && (
            <label className="grid gap-1">
              <span className="text-sm opacity-80">Bosse</span>
              <input
                type="number"
                min={1}
                max={10}
                className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
                value={form.bosses}
                onChange={(e) =>
                  setForm({ ...form, bosses: Number(e.target.value) || 0 })
                }
              />
            </label>
          )}

          <label className="grid gap-1">
            <span className="text-sm opacity-80">Datum/Zeit</span>
            <input
              type="datetime-local"
              className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </label>
        </div>

        {err && (
          <div className="text-sm text-red-400 border border-red-800 bg-red-950/30 rounded px-3 py-2">
            {err}
          </div>
        )}

        <div>
          <button
            disabled={busy || !form.lead}
            className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? "Erstelle…" : "Raid erstellen"}
          </button>
        </div>
      </form>

      <section className="grid gap-2">
        <h2 className="font-semibold">Raids</h2>
        <div className="grid gap-2">
          {raids.map((r) => (
            <div
              key={r.id}
              className="border border-neutral-800 rounded px-3 py-2"
            >
              <div className="text-sm opacity-80">{r.title}</div>
              <div className="text-xs opacity-60">
                {r.difficulty} · {r.lootType} · {r.bosses ?? "-"} Bosse ·{" "}
                {r.date ? new Date(r.date).toLocaleString() : "-"}
              </div>
            </div>
          ))}
          {raids.length === 0 && (
            <div className="text-sm opacity-60">(keine Raids)</div>
          )}
        </div>
      </section>
    </div>
  );
}
