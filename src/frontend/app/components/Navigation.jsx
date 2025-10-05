import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AuthAPI } from "../../api.js";

export default function Navigation() {
  const [auth, setAuth] = useState({ loading: true, user: null });
  const loc = useLocation();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const j = await AuthAPI.me();
        if (!mounted) return;
        setAuth({ loading: false, user: j?.user || null });
      } catch {
        if (!mounted) return;
        setAuth({ loading: false, user: null });
      }
    })();
    return () => { mounted = false; };
  }, [loc.pathname]);

  const displayName = useMemo(() => {
    const u = auth.user;
    if (!u) return "Nicht angemeldet";
    // Server-Nickname (Guild) > global/display > username
    return u.serverDisplay || u.display || u.username || u.id;
  }, [auth.user]);

  const badge = useMemo(() => {
    const u = auth.user;
    if (!u) return { ring: "ring-slate-700", dot: "bg-slate-500", label: "Guest" };

    // Backend liefert Flags direkt (isOwner/isAdmin/...)
    const f = {
      isOwner: !!u.isOwner,
      isAdmin: !!u.isAdmin,
      isRaidlead: !!u.isRaidlead || !!u.raidlead,
      isBooster: !!u.isBooster,
      isLootbuddy: !!u.isLootbuddy,
    };

    // Owner > Admin > Raidlead > Booster > LootBuddy > Member
    if (f.isOwner)    return { ring: "ring-yellow-400",  dot: "bg-yellow-400",  label: "Owner" };
    if (f.isAdmin)    return { ring: "ring-red-500",     dot: "bg-red-500",     label: "Admin" };
    if (f.isRaidlead) return { ring: "ring-amber-400",   dot: "bg-amber-400",   label: "Raidlead" };
    if (f.isBooster)  return { ring: "ring-emerald-500", dot: "bg-emerald-500", label: "Booster" };
    if (f.isLootbuddy)return { ring: "ring-violet-500",  dot: "bg-violet-500",  label: "LootBuddy" };
    return { ring: "ring-slate-600", dot: "bg-slate-500", label: "Member" };
  }, [auth.user]);

  return (
    <nav className="w-full border-b border-slate-800 bg-slate-900/60 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/raids" className="text-slate-200 font-semibold hover:text-white">Boosting Bot</Link>
          <Link to="/raids" className="text-slate-400 hover:text-slate-200">Raids</Link>
          <Link to="/presets" className="text-slate-400 hover:text-slate-200">Presets</Link>
          <Link to="/chars" className="text-slate-400 hover:text-slate-200">Chars</Link>
          <Link to="/users" className="text-slate-400 hover:text-slate-200">Users</Link>
          <Link to="/myRaids" className="text-slate-400 hover:text-slate-200">myRaids</Link>
        </div>

        <div className="flex items-center gap-3">
          {auth.loading ? (
            <div className="h-9 w-40 rounded-md bg-slate-800 animate-pulse" />
          ) : auth.user ? (
            <div className="flex items-center gap-3">
              <div className="text-right leading-tight hidden sm:block">
                <div className="text-slate-200 text-sm font-semibold">{displayName}</div>
                <div className="text-slate-400 text-xs">{badge.label}</div>
              </div>

              <div className="relative">
                <img
                  src={auth.user.avatarUrl}
                  alt={displayName}
                  className={`h-9 w-9 rounded-full ring-2 ${badge.ring} ring-offset-2 ring-offset-slate-900`}
                  referrerPolicy="no-referrer"
                />
                <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full ${badge.dot} ring-2 ring-slate-900`} />
              </div>

              <form action="/api/auth/logout" method="post">
                <button className="px-3 py-1.5 text-xs rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200">
                  Logout
                </button>
              </form>
            </div>
          ) : (
            <a
              href="/api/auth/discord?redirect=/raids"
              className="px-3 py-1.5 text-xs rounded-md bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              Mit Discord anmelden
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}
