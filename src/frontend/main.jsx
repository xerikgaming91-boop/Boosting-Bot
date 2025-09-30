import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./app/App.jsx";
import Raids from "./app/pages/Raids.jsx";
import "./index.css";

// robust gegen zu frühes Laden
function mount() {
  const container = document.getElementById("root");
  if (!container) {
    throw new Error('Fehlendes <div id="root"></div> in src/frontend/index.html');
  }
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <App>
          <Routes>
            <Route path="/" element={<Navigate to="/raids" replace />} />
            <Route path="/raids" element={<Raids />} />
          </Routes>
        </App>
      </BrowserRouter>
    </React.StrictMode>
  );
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
