// src/frontend/app/pages/RaidDetail.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AuthAPI, LeadsAPI, PresetsAPI } from "../../api.js";

// ---- helpers / constants ----------------------------------------------------
const ROLES = ["TANK", "HEAL", "DPS", "LOOTBUDDY"];
const roleTitle = {
  TANK: "Tanks",
  HEAL: "Heals",
  DPS: "DPS",
  LOOTBUDDY: "Lootbuddies",
};
const LOOT_TYPES = ["Saved", "Unsaved", "VIP"];

const cx = (...a) => a.filter(Boolean).join(" ");

const fmtDateTime = (s) => {
  const d = new Date(s);
  return s && !isNaN(d) ? d.toLocaleString() : "-";
};
const toLocalDTValue = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(
    d.getMinutes()
  )}`;
};
const toIsoIfLocal = (v) =>
  typeof v === "string" && v.includes("T") && !v.endsWith("Z")
    ? new Date(v).toISOString()
    : v;

function groupByRole(rows) {
  const g = { TANK: [], HEAL: [], DPS: [], LOOTBUDDY: [] };
  (rows || []).forEach((s) => {
    const key = String(s.role || "").toUpperCase();
    (g[key] || g.DPS).push(s);
  });
  return g;
}

// ---- component --------------------------------------------------------------
export default function RaidDetail() {
  const { id } = useParams();
  const nav = useNavigate();

  const [me, setMe] = useState(null);
  const [leads, setLeads] = useState([]);
  const [presets, setPresets] = useState([]);

  const [raid, setRaid] = useState(null);
  const [roster, setRoster] = useState([]);
  const [signups, setSignups] = useState([]);
  const [loading, setLoading] = useState(true);

  // edit state
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    date: "",
    difficulty: "Heroic",
    lootType: "VIP",
    presetId: "",
    leadId: "",
  });
  const [titleTouched, setTitleTouched] = useState(false);

  const autoTitle = useMemo(
    () => `Manaforge ${form.difficulty} ${form.lootType}`,
    [form.difficulty, form.lootType]
  );
  useEffect(() => {
    if (!titleTouched) {
      setForm((f) => ({ ...f, title: autoTitle }));
    }
  }, [autoTitle, titleTouched]);

  const canPickLead = !!(me?.isOwner || me?.isAdmin);

  // ---- data load ------------------------------------------------------------
  async function load() {
    setLoading(true);
    try {
      const [meRes, leadsRes, presetsRes] = await Promise.allSettled([
        AuthAPI?.me ? AuthAPI.me() : fetch("/api/auth/me").then((r) => r.json()),
        LeadsAPI?.list ? LeadsAPI.list() : fetch("/api/leads").then((r) => r.json()),
        PresetsAPI?.list ? PresetsAPI.list() : fetch("/api/presets").then((r) => r.json()),
      ]);

      if (meRes.status === "fulfilled" && meRes.value) setMe(meRes.value.user || meRes.value);
      if (leadsRes.status === "fulfilled") setLeads(leadsRes.value?.leads || []);
      if (presetsRes.status === "fulfilled") {
        const arr = Array.isArray(presetsRes.value) ? presetsRes.value : (presetsRes.value?.presets || []);
        setPresets(arr);
      }

      const res = await fetch(`/api/raids/${id}/full`);
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.message || "load_failed");

      setRaid(j.raid);
      setRoster(j.roster || []);
      setSignups(j.signups || []);

      const lt = j.raid?.lootType || "VIP";
      const normalizedLoot =
        LOOT_TYPES.find((x) => x.toLowerCase() === String(lt).toLowerCase()) || "VIP";

      setForm({
        title: j.raid?.title || "",
        date: j.raid?.date || "",
        difficulty: j.raid?.difficulty || "Heroic",
        lootType: normalizedLoot,
        presetId: j.raid?.presetId || "",
        // wir nutzen die ID (falls Backend sie mitsendet); sonst leer
        leadId: j.raid?.leadId || "",
      });
      setTitleTouched(false);
    } catch (e) {
      console.error(e);
      alert("Raid konnte nicht geladen werden.");
      nav("/raids");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(); // eslint-disable-next-line
  }, [id]);

  // ---- derived --------------------------------------------------------------
  const rosterByRole = useMemo(() => groupByRole(roster), [roster]);
  const signupsByRole = useMemo(() => groupByRole(signups), [signups]);

  // ---- actions --------------------------------------------------------------
  async function doPick(signupId) {
    try {
      const res = await fetch(`/api/raids/${id}/signups/${signupId}/pick`, { method: "POST" });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.message || "pick_failed");
      await load();
    } catch (e) {
      console.error(e);
      alert("Pick fehlgeschlagen.");
    }
  }
  async function doUnpick(signupId) {
    try {
      const res = await fetch(`/api/raids/${id}/signups/${signupId}/unpick`, { method: "POST" });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.message || "unpick_failed");
      await load();
    } catch (e) {
      console.error(e);
      alert("Unpick fehlgeschlagen.");
    }
  }

  async function onSaveEdit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        date: toIsoIfLocal(form.date),
        difficulty: form.difficulty,
        lootType: form.lootType,
        presetId: form.presetId || null,
      };
      if (canPickLead && form.leadId) payload.leadId = String(form.leadId);

      const res = await fetch(`/api/raids/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.message || "update_failed");

      // UI sofort aktualisieren
      setRaid(j.raid);
      setEditOpen(false);
    } catch (e2) {
      console.error(e2);
      alert("Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  // ---- rendering helpers ----------------------------------------------------
  const Row = ({ children, right }) => (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">{children}</div>
      {right}
    </div>
  );

  function PersonLine(s, isRoster) {
    const rightBtn = isRoster ? (
      <button className="btn btn-danger" onClick={() => doUnpick(s.id)}>
        Unpick
      </button>
    ) : (
      <button className="btn btn-primary" onClick={() => doPick(s.id)}>
        Pick
      </button>
    );

    return (
      <li key={s.id} className="list-row">
        <Row
          right={rightBtn}
        >
          <div className="font-medium text-slate-200 truncate">
            {s.displayName || s.userId}
          </div>
          <div className="text-xs text-slate-400">
            {s.class || "-"}
            {s.charName ? ` • ${s.charName}` : ""}
            {typeof s.itemLevel === "number" ? ` • ${s.itemLevel} ilvl` : ""}
            {s.wclUrl ? (
              <>
                {" "}
                •{" "}
                <a
                  className="underline hover:text-slate-300"
                  target="_blank"
                  rel="noreferrer"
                  href={s.wclUrl}
                >
                  Logs
                </a>
              </>
            ) : null}
            {s.saved ? " • saved" : ""}
            {s.note ? ` • ${s.note}` : ""}
          </div>
        </Row>
      </li>
    );
  }

  function renderRosterColumn(role) {
    const items = rosterByRole[role] || [];
    return (
      <div key={`roster-${role}`} className="space-y-2">
        <div className="label">{roleTitle[role]}</div>
        <div className="list-col">
          <ul className="space-y-2">
            {items.length === 0 && <li className="text-xs text-slate-500 px-1">keine</li>}
            {items.map((s) => PersonLine(s, true))}
          </ul>
        </div>
      </div>
    );
  }
  function renderSignupColumn(role) {
    const items = signupsByRole[role] || [];
    return (
      <div key={`signup-${role}`} className="space-y-2">
        <div className="label">{roleTitle[role]}</div>
        <div className="list-col">
          <ul className="space-y-2">
            {items.length === 0 && <li className="text-xs text-slate-500 px-1">keine</li>}
            {items.map((s) => PersonLine(s, false))}
          </ul>
        </div>
      </div>
    );
  }

  // Dummy „Eingeplant (andere Raids)“ – falls du hier eine echte Liste hast, ersetze den Inhalt
  function renderPlannedElsewhere() {
    return (
      <div className="text-xs text-slate-400 p-4">
        Keine weiteren Einplanungen gefunden.
      </div>
    );
  }

  // kleine Checkliste aus Klassen im aktuellen Roster
  function renderChecklist() {
    const counts = {};
    roster.forEach((s) => {
      const c = String(s.class || "").trim();
      if (c) counts[c] = (counts[c] || 0) + 1;
    });

    const order = [
      "Priest",
      "Druid",
      "Shaman",
      "Mage",
      "Monk",
      "Evoker",
      "Warlock",
      "Demon Hunter",
      "Warrior",
    ];

    const item = (cls) => (
      <div key={cls} className="flex items-center justify-between text-slate-300">
        <span>{cls}</span>
        {counts[cls] > 0 ? (
          <span className="badge-ok">{counts[cls]}x</span>
        ) : (
          <span className="badge-warn">missing</span>
        )}
      </div>
    );

    return (
      <div className="list-col p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">{order.slice(0, 3).map(item)}</div>
          <div className="space-y-1">{order.slice(3, 6).map(item)}</div>
          <div className="space-y-1">{order.slice(6, 8).map(item)}</div>
          <div className="space-y-1">{order.slice(8, 9).map(item)}</div>
        </div>
      </div>
    );
  }

  // ---- render ---------------------------------------------------------------
  if (loading) return <div className="p-6">Lade…</div>;
  if (!raid) return <div className="p-6">Nicht gefunden.</div>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* TOP: Info + Edit in derselben Box */}
      <div className="card mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="card-title text-base truncate">{raid.title}</div>
            {!editOpen && (
              <div className="mt-1 text-sm text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
                <span>📅 {fmtDateTime(raid.date)}</span>
                <span>🛡️ {raid.difficulty}</span>
                <span>💎 {raid.lootType}</span>
                <span>👑 Lead: {raid.lead || raid.leadName || "-"}</span>
              </div>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {!editOpen && (
              <div className="text-xs text-slate-400 mr-1 text-right">
                <div>
                  Roster: <b className="text-slate-300">{roster.length}</b>
                </div>
                <div>
                  Signups: <b className="text-slate-300">{signups.length}</b>
                </div>
              </div>
            )}
            <button className="btn btn-ghost" onClick={() => (editOpen ? setEditOpen(false) : nav("/raids"))}>
              {editOpen ? "Abbrechen" : "Zurück"}
            </button>
            {!editOpen && (
              <button className="btn btn-primary" onClick={() => setEditOpen(true)}>
                Bearbeiten
              </button>
            )}
          </div>
        </div>

        {editOpen && (
          <form onSubmit={onSaveEdit} className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="label">Titel</label>
              <input
                className="input mt-1"
                value={form.title}
                onChange={(e) => {
                  setTitleTouched(true);
                  setForm((f) => ({ ...f, title: e.target.value }));
                }}
              />
              <p className="card-subtle mt-1">
                Wird automatisch aus Difficulty + Loot vorgeschlagen. Manuelle Änderung möglich.
              </p>
            </div>

            <div>
              <label className="label">Datum/Zeit</label>
              <input
                type="datetime-local"
                className="input mt-1"
                value={toLocalDTValue(form.date)}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>

            <div>
              <label className="label">Schwierigkeit</label>
              <select
                className="select mt-1"
                value={form.difficulty}
                onChange={(e) => {
                  setTitleTouched(false);
                  setForm((f) => ({ ...f, difficulty: e.target.value }));
                }}
              >
                <option>Normal</option>
                <option>Heroic</option>
                <option>Mythic</option>
              </select>
            </div>

            <div>
              <label className="label">Loot</label>
              <select
                className="select mt-1"
                value={form.lootType}
                onChange={(e) => {
                  setTitleTouched(false);
                  setForm((f) => ({ ...f, lootType: e.target.value }));
                }}
              >
                {LOOT_TYPES.map((lt) => (
                  <option key={lt} value={lt}>
                    {lt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Preset</label>
              <select
                className="select mt-1"
                value={form.presetId || ""}
                onChange={(e) => setForm((f) => ({ ...f, presetId: e.target.value }))}
              >
                <option value="">— Kein Preset —</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.title || `Preset ${p.id}`}
                  </option>
                ))}
              </select>
            </div>

            {canPickLead && (
              <div>
                <label className="label">Raid Lead</label>
                <select
                  className="select mt-1"
                  value={form.leadId || ""}
                  onChange={(e) => setForm((f) => ({ ...f, leadId: e.target.value }))}
                >
                  <option value="">— auswählen —</option>
                  {leads.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
                <p className="card-subtle mt-1">Nur Admin/Owner können den Lead ändern.</p>
              </div>
            )}

            <div className="md:col-span-2 pt-1 flex items-center gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={saving}
                onClick={() => setEditOpen(false)}
              >
                Abbrechen
              </button>
              <button type="submit" className={cx("btn", saving ? "btn-muted" : "btn-primary")} disabled={saving}>
                Speichern
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ===== Auftrennung in zwei Boxen ===== */}

      {/* Roster (geplant) */}
      <section className="card mb-6">
        <div className="card-title mb-3">Roster (geplant)</div>
        <div className="grid grid-cols-4 gap-3 p-4 md:grid-cols-2 sm:grid-cols-1">
          {ROLES.map((r) => renderRosterColumn(r))}
        </div>
      </section>

      {/* Signups (offen) */}
      <section className="card mb-6">
        <div className="card-title mb-3">Signups (offen)</div>
        <div className="grid grid-cols-4 gap-3 p-4 md:grid-cols-2 sm:grid-cols-1">
          {ROLES.map((r) => renderSignupColumn(r))}
        </div>
      </section>

      {/* Eingeplant (andere Raids) */}
      <section className="card mb-6">
        <div className="card-title mb-3">Eingeplant (andere Raids)</div>
        {renderPlannedElsewhere()}
      </section>

      {/* Checklist */}
      <section className="card">
        <div className="card-title mb-3">Checklist</div>
        {renderChecklist()}
      </section>
    </div>
  );
}
