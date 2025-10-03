import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// WICHTIG: root zeigt auf dein Frontend-Ordner (src/frontend)
export default defineConfig({
  root: "src/frontend",
  plugins: [
    react({
      // sorgt dafür, dass kein "import React from 'react'" nötig ist
      jsxRuntime: "automatic",
    }),
  ],
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
});
