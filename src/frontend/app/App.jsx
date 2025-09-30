// src/frontend/app/App.jsx
import React, { useEffect, useState } from "react";
import { AuthAPI } from "../api.js";

export default function App({ children }) {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const m = await AuthAPI.me();
      setMe(m?.user ?? null);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="font-semibold">Boosting Bot</div>
          <div className="flex items-center gap-3">
            {loading ? (
              <span className="text-sm opacity-70">lädt…</span>
            ) : me ? (
              <>
                <span className="text-sm opacity-80">
                  Eingeloggt als <b>{me.username}</b>
                </span>
                <button
                  onClick={async () => {
                    await AuthAPI.logout();
                    await refresh();
                  }}
                  className="text-sm px-3 py-1.5 rounded-md border border-red-500 hover:bg-red-600/20"
                >
                  Logout
                </button>
              </>
            ) : (
              <a
                href={AuthAPI.loginUrl()}
                className="text-sm px-3 py-1.5 rounded-md border border-indigo-600 bg-indigo-600 hover:bg-indigo-500"
              >
                Login mit Discord
              </a>
            )}
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
