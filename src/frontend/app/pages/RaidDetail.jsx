// src/frontend/app/pages/RaidDetail.jsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { RaidsAPI } from "../api.js";

export default function RaidDetail() {
  const { id } = useParams();
  const [raid, setRaid] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await RaidsAPI.detail(id);
      setRaid(data?.raid || null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  if (loading) return <div className="text-slate-400 text-sm">lädt…</div>;
  if (!raid) return <div className="text-slate-400 text-sm">Raid nicht gefunden.</div>;

  return (
    <div className="space-y-4">
      <Link to="/raids" className="text-sm text-indigo-400 hover:underline">← zurück</Link>
      <h1 className="text-2xl font-semibold">{raid.title}</h1>
      <div className="text-slate-300">
        {new Date(raid.date).toLocaleString()} • {raid.difficulty} • {raid.lootType} • Bosse: {raid.bosses ?? 8}
      </div>
      {/* TODO: Anmeldungen/Roster hier darstellen */}
    </div>
  );
}
