import React from "react";
import { Outlet } from "react-router-dom";
import Navigation from "./Navigation.jsx";

export default function Layout() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <Navigation />
      <main className="py-6">
        <Outlet />
      </main>
    </div>
  );
}
