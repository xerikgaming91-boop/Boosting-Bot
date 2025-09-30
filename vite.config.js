import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/frontend",
  envDir: process.cwd(),
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
    // Proxy nur für /api/... aber NICHT für "/api.js"
    proxy: {
      // raw RegExp: alles was mit /api beginnt, aber nicht exakt /api.js ist
      "^/api(?!\\.js$)": {
        target: "http://localhost:4000",
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
