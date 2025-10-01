import React from "react";
import { Outlet } from "react-router-dom";
import Navigation from "./Navigation.jsx";

export default function Layout() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navigation />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
