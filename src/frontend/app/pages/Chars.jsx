import React, { useEffect, useState } from "react";
import { AuthAPI } from "../../api.js";

export default function Chars() {
  const [auth, setAuth] = useState({ loading: true, loggedIn: false, user: null });
  const [list, setList] = useState([]);

  const [name, setName] = useState("");
  const [realm, setRealm] = useState("");
  const [region, setRegion] = useState("EU");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const j = await AuthAPI.me();
      if (j?.ok && j.user) setAuth({ loading: false, loggedIn: true, user: j.user });
      else setAuth({ loading: false, loggedIn: false, user: null });
    })();
  }, []);

  async function loadMine() {
    try {
      const r = await fetch(`http://localhost:4000/api/chars/mine`, { credentials: "include" });
      const j = await r.json();
      setList(j?.chars ?? []);
    } catch {
      setList([]);
    }
  }

  useEffect(() => { if (auth.loggedIn) loadMine(); }, [auth.loggedIn]); // eslint-disable-line

  async function onImport(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch(`http://localhost:4000/api/chars/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, realm, region }),
      });
      const j = await r.json();
      if (!r.ok || j?.error) throw new Error(j?.detail || j?.error || "Import fehlgeschlagen");
      setName(""); setRealm("");
      await loadMine();
    } catch (e2) {
      setErr(e2?.message || "Import fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id) {
    if (!confirm("Char wirklich löschen?")) return;
    try {
      await fetch(`http://localhost:4000/api/chars/${id}`, { method: "DELETE", credentials: "include" });
      await loadMine();
    } catch {}
  }

  if (auth.loading) return <div className="p-6 text-slate-300">Lade…</div>;
  if (!auth.loggedIn) {
    return (
      <div className="p-6">
        <div className="panel max-w-5xl mx-auto">{/* <-- auf 5xl */}
          <div className="panel-body flex items-center justify-between">
            <div>
              <div className="text-slate-200 font-semibold">Nicht angemeldet</div>
              <div className="text-slate-400 text-sm">Melde dich an, um Booster-Chars zu importieren.</div>
            </div>
            <a className="btn btn-primary" href={AuthAPI.loginUrl()}>Login</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Import-Box — jetzt gleiche Breite wie die Tabelle */}
      <div className="panel max-w-5xl mx-auto">{/* <-- vorher max-w-3xl */}
        <div className="panel-head">Booster-Char importieren</div>
        <div className="panel-body">
          <form onSubmit={onImport} className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              className="input md:col-span-2"
              placeholder="Char-Name (z. B. Thrall)"
              value={name}
              onChange={(e)=>setName(e.target.value)}
              required
            />
            <input
              className="input"
              placeholder="Realm (z. B. Silvermoon)"
              value={realm}
              onChange={(e)=>setRealm(e.target.value)}
              required
            />
            <select className="select" value={region} onChange={(e)=>setRegion(e.target.value)}>
              {["EU","US","KR","TW","CN"].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <div className="md:col-span-4 flex items-center gap-3">
              <button className="btn btn-primary" disabled={busy}>
                {busy ? "Importiere…" : "Importieren"}
              </button>
              {err && <span className="text-sm text-red-400">{err}</span>}
              <p className="help">Daten kommen live von Raider.IO.</p>
            </div>
          </form>
        </div>
      </div>

      {/* Liste – unverändert max-w-5xl */}
      <div className="panel max-w-5xl mx-auto">
        <div className="panel-head">Meine Booster-Chars</div>
        <div className="panel-body overflow-x-auto">
          <table className="table">
            <thead>
              <tr className="text-left text-slate-400">
                <th>#</th><th>Name</th><th>Realm</th><th>Region</th>
                <th>Class/Spec</th><th>RIO</th><th>Aktualisiert</th><th></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={8} className="py-3 text-slate-400">Keine Chars importiert.</td></tr>
              ) : list.map(c => (
                <tr key={c.id} className="border-b border-slate-900">
                  <td className="px-3 py-2">{c.id}</td>
                  <td className="px-3 py-2">{c.name}</td>
                  <td className="px-3 py-2">{c.realm}</td>
                  <td className="px-3 py-2">{c.region}</td>
                  <td className="px-3 py-2">{c.class || "-"} {c.spec ? `(${c.spec})` : ""}</td>
                  <td className="px-3 py-2">{c.rioScore ?? "-"}</td>
                  <td className="px-3 py-2">{c.updatedAt ? new Date(c.updatedAt).toLocaleString() : "-"}</td>
                  <td className="px-3 py-2">
                    <button className="btn btn-danger" onClick={()=>onDelete(c.id)}>Löschen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-xs text-slate-500 mt-3">
            Hinweis: Der Realm wird intern als Slug gespeichert (z. B. <code>silvermoon</code>).
          </div>
        </div>
      </div>
    </div>
  );
}
