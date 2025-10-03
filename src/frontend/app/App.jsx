import React from "react";                   // <— WICHTIG
import { Routes, Route, Navigate } from "react-router-dom";

import Layout from "./components/Layout.jsx";
import Raids from "./pages/Raids.jsx";
import RaidDetail from "./pages/RaidDetail.jsx";
import Chars from "./pages/Chars.jsx";
import Presets from "./pages/Presets.jsx";
import Users from "./pages/Users.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/raids" replace />} />
        <Route path="/raids" element={<Raids />} />
        <Route path="/raids/:id" element={<RaidDetail />} />
        <Route path="/chars" element={<Chars />} />
        <Route path="/presets" element={<Presets />} />
        <Route path="/users" element={<Users />} />
      </Route>
      <Route path="*" element={<Navigate to="/raids" replace />} />
    </Routes>
  );
}
