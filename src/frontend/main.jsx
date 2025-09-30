import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import "./index.css";                  // Tailwind entry
import App from "./app/App.jsx";       // Dein App-Layout
import Raids from "./app/pages/Raids.jsx";
import RaidDetail from "./app/pages/RaidDetail.jsx";
import Chars from "./app/pages/Chars.jsx";

const Root = () => (
  <BrowserRouter>
    <App>
      <Routes>
        <Route path="/" element={<Navigate to="/raids" replace />} />
        <Route path="/raids" element={<Raids />} />
        <Route path="/raids/:id" element={<RaidDetail />} />
        <Route path="/chars" element={<Chars />} />
        <Route path="*" element={<div className="p-6">404 – Not Found</div>} />
      </Routes>
    </App>
  </BrowserRouter>
);

createRoot(document.getElementById("root")).render(<Root />);
