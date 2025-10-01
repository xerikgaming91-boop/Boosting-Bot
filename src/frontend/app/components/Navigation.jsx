import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

const cn = (...xs) => xs.filter(Boolean).join(" ");

export default function Navigation({ items }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [auth, setAuth] = useState({ loading: true, loggedIn: false, user: null, isRaidlead: false });

  const navItems = items ?? [
    { to: "/raids", label: "Raids" },
    { to: "/chars", label: "Chars" },
    { to: "/presets", label: "Presets" },
    { to: "/users", label: "Users" },
  ];

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/auth/me", { credentials: "include" });
        const j = await r.json();
        if (!alive) return;
        if (j?.ok && j.user) setAuth({ loading: false, loggedIn: true, user: j.user, isRaidlead: !!j.user.isRaidlead });
        else setAuth({ loading: false, loggedIn: false, user: null, isRaidlead: false });
      } catch {
        if (!alive) return;
        setAuth({ loading: false, loggedIn: false, user: null, isRaidlead: false });
      }
    })();
    return () => { alive = false; };
  }, []);

  function login()  { window.location.href = "/api/auth/discord"; }
  async function logout() {
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
    navigate(0);
  }

  const avatarUrl = auth.loggedIn && auth.user?.avatar && auth.user?.id
    ? `https://cdn.discordapp.com/avatars/${auth.user.id}/${auth.user.avatar}.png`
    : null;

  return (
    <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur border-b border-slate-800">
      <div className="mx-auto max-w-6xl px-4">
        <div className="h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              className="md:hidden inline-flex items-center justify-center rounded-lg border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800"
              onClick={() => setOpen(!open)}
              aria-label="Menü"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
            </button>
            <NavLink to="/" className="font-semibold text-slate-100 tracking-wide">Manaforge</NavLink>
          </div>

          <nav className="hidden md:flex items-center gap-2">
            {navItems.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                className={({ isActive }) =>
                  cn("px-3 py-2 rounded-lg text-sm", isActive ? "bg-slate-800 text-white" : "text-slate-300 hover:text-white hover:bg-slate-800")
                }
              >
                {it.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {auth.loading ? (
              <div className="text-slate-400 text-sm">lädt…</div>
            ) : auth.loggedIn ? (
              <>
                {auth.isRaidlead && (
                  <span className="hidden sm:inline-flex items-center rounded-full bg-emerald-600/20 text-emerald-300 text-xs px-2 py-1 border border-emerald-700/40">
                    Raidlead
                  </span>
                )}
                <div className="hidden sm:flex items-center gap-2 text-slate-300 text-sm">
                  {avatarUrl
                    ? <img src={avatarUrl} alt="Avatar" className="h-7 w-7 rounded-full border border-slate-700" />
                    : <div className="h-7 w-7 rounded-full bg-slate-700" />}
                  <span className="truncate max-w-[160px]">{auth.user?.username}</span>
                </div>
                <button onClick={logout} className="btn btn-secondary">Logout</button>
              </>
            ) : (
              <button onClick={login} className="btn btn-primary">Mit Discord anmelden</button>
            )}
          </div>
        </div>

        {open && (
          <div className="md:hidden pb-3">
            <nav className="flex flex-col gap-1">
              {navItems.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn("px-3 py-2 rounded-lg text-sm", isActive ? "bg-slate-800 text-white" : "text-slate-300 hover:text-white hover:bg-slate-800")
                  }
                >
                  {it.label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
