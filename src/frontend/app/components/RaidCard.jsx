import { Link } from 'react-router-dom';

export default function RaidCard({ raid, onDelete }) {
  return (
    <div className="rounded-2xl border border-slate-800 p-4 flex items-center justify-between">
      <div>
        <div className="font-semibold">{raid.title}</div>
        <div className="text-sm text-slate-400">
          {new Date(raid.date).toLocaleString()} • {raid.difficulty || '—'}
          {raid.difficulty === 'Mythic' && raid.bosses ? ` • ${raid.bosses}` : ''} • {raid.lootType || '—'}
        </div>
        <div className="text-sm text-slate-400">Lead: {raid.lead}</div>
      </div>
      <div className="flex gap-2">
        <Link to={`/raids/${raid.id}`} className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700">Details</Link>
        {onDelete && (
          <button onClick={() => onDelete(raid.id)} className="px-3 py-2 rounded-xl bg-red-700/70 hover:bg-red-700">
            Löschen
          </button>
        )}
      </div>
    </div>
  );
}
