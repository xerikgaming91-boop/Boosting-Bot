// src/frontend/app/pages/RaidDetail.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AuthAPI, RaidsAPI } from "../../api.js";

export default function RaidDetail() {
  const { id } = useParams();
  const nav = useNavigate();

  const [raid, setRaid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const me = await AuthAPI.me();
        setUser(me?.user || null);
      } catch {}

      try {
        const data = await RaidsAPI.detail(id);
        if (!data) {
          // falls API bei 404 null zurückgibt
          setErr("not_found");
          setRaid(null);
        } else {
          setRaid(data);
        }
      } catch (e) {
        const m = String(e?.message || "load_failed").toLowerCase();
        if (m.includes("not_found") || m.includes("404")) setErr("not_found");
        else setErr(m || "load_failed");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const canDelete = useMemo(() => {
    if (!user) return false;
    return !!(user.isOwner || user.isAdmin || user.isRaidlead || user.raidlead);
  }, [user]);

  async function onDelete() {
    if (!raid?.id) return;
    if (!window.confirm("Diesen Raid wirklich löschen?")) return;
    setBusy(true);
    try {
      await RaidsAPI.remove(raid.id);
      nav("/raids", { replace: true });
    } catch (e) {
      alert("Löschen fehlgeschlagen: " + (e?.message || "unknown"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-6 text-slate-300">Lade…</div>;

  if (err === "not_found") {
    return (
      <div className="p-6 text-slate-300">
        <div className="rounded-lg bg-slate-900 border border-slate-800 p-4">
          <div className="text-rose-300 font-semibold mb-1">Raid nicht gefunden</div>
          <div className="text-slate-400 mb-4">Der Raid existiert nicht (evtl. gelöscht).</div>
          <Link to="/raids" className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700">
            Zurück zur Liste
          </Link>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="p-6 text-slate-300">
        <div className="rounded-lg bg-slate-900 border border-slate-800 p-4">
          <div className="text-rose-300 font-semibold mb-1">Fehler beim Laden</div>
          <div className="text-slate-400 mb-4">{String(err)}</div>
          <Link to="/raids" className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700">
            Zurück zur Liste
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-5 shadow">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold text-slate-100">{raid.title}</div>
            <div className="text-slate-400 text-sm mt-1">
              {raid.difficulty} • {raid.lootType} • {raid.bosses ?? "-"} Bosse
            </div>
            <div className="text-slate-400 text-sm mt-1">
              {raid.date ? new Date(raid.date).toLocaleString() : "-"}
            </div>
            <div className="text-slate-300 text-sm mt-2">
              Lead: <span className="font-medium">{raid.leadName || raid.lead || "-"}</span>
              {raid.leadId ? <span className="ml-2 text-slate-500">({raid.leadId})</span> : null}
            </div>
            {(raid.channelId || raid.messageId) && (
              <div className="text-slate-400 text-sm mt-1">
                Discord: Kanal {raid.channelId || "-"} {raid.messageId ? `• Nachricht ${raid.messageId}` : ""}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/raids"
              className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700"
            >
              Zurück
            </Link>
            {canDelete && (
              <button
                onClick={onDelete}
                disabled={busy}
                className={[
                  "px-3 py-2 rounded-md border text-slate-200",
                  busy
                    ? "bg-slate-700 border-slate-700 cursor-not-allowed"
                    : "bg-rose-900/50 border-rose-800 hover:bg-rose-800/60",
                ].join(" ")}
              >
                Löschen
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
